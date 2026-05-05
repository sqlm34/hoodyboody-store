const { createLogger } = require("../services/loggerService");
const { createShippoService } = require("../services/shippoService");
const { createStripeService } = require("../services/stripeService");
const {
  ORDER_STATUS,
  attachShippingLabel,
  ensureInternalTrackingId,
  findOrderByPaymentIntent,
  findOrderByPendingId,
  findOrderByStripeSession,
  findPendingStripeOrder,
  listPaidOrders,
  markOrderPaid,
  publicAdminOrder,
  recordShippingError,
  removePendingStripeOrder,
  updateOrderStatus
} = require("../models/orderModel");

function stripeObjectId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.id || "");
}

function getMetadata(value) {
  return value?.metadata || {};
}

function getCheckoutLineItems(session) {
  const lineItems = session?.line_items;
  if (Array.isArray(lineItems?.data)) return lineItems.data;
  if (Array.isArray(lineItems)) return lineItems;
  return [];
}

function centsFromLineItem(lineItem) {
  const quantity = Math.max(1, Number(lineItem.quantity) || 1);
  return Math.max(
    0,
    Math.round(Number(lineItem.amount_subtotal ?? lineItem.amount_total ?? lineItem.price?.unit_amount ?? 0) / quantity)
  );
}

function getLineTitle(lineItem, index) {
  return String(lineItem.description || lineItem.price?.product?.name || lineItem.price?.nickname || `Stripe item ${index + 1}`).trim();
}

function isDeliveryLine(lineItem) {
  return /delivery|shipping/i.test(getLineTitle(lineItem, 0));
}

function buildFallbackPayloadFromStripe({ stripeSession, paymentIntent }) {
  const metadata = {
    ...getMetadata(paymentIntent),
    ...getMetadata(stripeSession)
  };
  const details = stripeSession?.customer_details || paymentIntent?.shipping || {};
  const address = details.address || paymentIntent?.shipping?.address || {};
  const lines = getCheckoutLineItems(stripeSession);
  const deliveryLines = lines.filter(isDeliveryLine);
  const itemLines = lines.filter((lineItem) => !isDeliveryLine(lineItem));
  const items = itemLines.map((lineItem, index) => {
    const quantity = Math.max(1, Number(lineItem.quantity) || 1);

    return {
      id: String(lineItem.id || `stripe-${index + 1}`),
      title: getLineTitle(lineItem, index),
      price: centsFromLineItem(lineItem),
      quantity,
      description: "Imported from Stripe Checkout"
    };
  });
  const deliveryPrice = deliveryLines.reduce((sum, lineItem) => sum + Math.max(0, Math.round(Number(lineItem.amount_total || 0))), 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = Math.max(0, Math.round(Number(stripeSession?.amount_total ?? paymentIntent?.amount_received ?? subtotal + deliveryPrice) || 0));
  const hasAddress = Boolean(address.line1 || address.city || address.state || address.postal_code);

  return {
    customer: {
      name: details.name || paymentIntent?.shipping?.name || metadata.customer_name || "",
      email: details.email || metadata.customer_email || "",
      phone: details.phone || metadata.customer_phone || ""
    },
    delivery: {
      type: metadata.delivery_type || (hasAddress ? "shipping" : "pickup"),
      address: address.line1 || metadata.delivery_address || "",
      apartment: address.line2 || "",
      city: address.city || metadata.delivery_city || "",
      state: address.state || metadata.delivery_state || "",
      zip: address.postal_code || metadata.delivery_zip || "",
      price: Number(metadata.shipping_price || "") || deliveryPrice,
      shippoShipmentId: metadata.shippo_shipment_id || "",
      shippoRateId: metadata.shippo_rate_id || "",
      carrier: metadata.shippo_carrier || "",
      service: metadata.shippo_service || ""
    },
    payment: { type: "card", provider: "stripe" },
    items,
    totals: {
      subtotal,
      delivery: Number(metadata.shipping_price || "") || deliveryPrice,
      total
    }
  };
}

function extractStripeIds(event) {
  const object = event.data?.object || {};
  const metadata = getMetadata(object);

  if (event.type === "checkout.session.completed") {
    return {
      sessionId: object.id || "",
      paymentIntentId: stripeObjectId(object.payment_intent),
      pendingId: metadata.pending_id || ""
    };
  }

  if (event.type === "payment_intent.succeeded") {
    return {
      sessionId: metadata.checkout_session_id || metadata.stripe_session_id || "",
      paymentIntentId: object.id || "",
      pendingId: metadata.pending_id || ""
    };
  }

  return { sessionId: "", paymentIntentId: "", pendingId: "" };
}

function createOrderController(context) {
  const {
    createOrderFromPayload,
    getSessionUser,
    isAdmin,
    readDbAsync,
    shippoApiKey,
    shippingOrigin,
    stripeSecretKey,
    stripeWebhookSecret,
    writeDbAsync
  } = context;
  const logger = createLogger("orders");
  const stripeService = createStripeService({ secretKey: stripeSecretKey, webhookSecret: stripeWebhookSecret, logger });
  const shippoService = createShippoService({ apiKey: shippoApiKey, shippingOrigin, logger });

  function requireAdmin(req, db) {
    const user = getSessionUser(req, db);

    if (!user) {
      const error = new Error("You must be logged in as the store owner.");
      error.status = 401;
      throw error;
    }

    if (!isAdmin(user)) {
      const error = new Error("This page is only available to the store owner.");
      error.status = 403;
      throw error;
    }

    return user;
  }

  async function loadStripeObjects(event, ids, pending) {
    let stripeSession = event.type === "checkout.session.completed" ? event.data.object : null;
    let paymentIntent = event.type === "payment_intent.succeeded" ? event.data.object : null;

    if (stripeSession && !getCheckoutLineItems(stripeSession).length) {
      stripeSession = (await stripeService.retrieveCheckoutSession(stripeSession.id)) || stripeSession;
    }

    if (!stripeSession && (ids.sessionId || pending?.sessionId)) {
      stripeSession = await stripeService.retrieveCheckoutSession(ids.sessionId || pending.sessionId);
    }

    if (!stripeSession && ids.paymentIntentId) {
      stripeSession = await stripeService.retrieveCheckoutSessionByPaymentIntent(ids.paymentIntentId);
    }

    if (!paymentIntent && (ids.paymentIntentId || stripeSession?.payment_intent)) {
      paymentIntent =
        (await stripeService.retrievePaymentIntent(ids.paymentIntentId || stripeObjectId(stripeSession.payment_intent))) ||
        paymentIntent;
    }

    return { paymentIntent, stripeSession };
  }

  function ensurePaidOrderForStripe(db, ids, pending, stripeSession, paymentIntent, eventId) {
    const metadata = {
      ...getMetadata(paymentIntent),
      ...getMetadata(stripeSession)
    };
    const resolvedIds = {
      sessionId: ids.sessionId || stripeSession?.id || pending?.sessionId || "",
      paymentIntentId: ids.paymentIntentId || stripeObjectId(stripeSession?.payment_intent) || paymentIntent?.id || pending?.paymentIntentId || "",
      pendingId: ids.pendingId || metadata.pending_id || pending?.id || ""
    };
    let order =
      findOrderByStripeSession(db, resolvedIds.sessionId) ||
      findOrderByPaymentIntent(db, resolvedIds.paymentIntentId) ||
      findOrderByPendingId(db, resolvedIds.pendingId);
    const paidAt = new Date().toISOString();
    const amountPaid = Math.max(
      0,
      Math.round(Number(stripeSession?.amount_total ?? paymentIntent?.amount_received ?? pending?.payload?.totals?.total ?? 0) || 0)
    );
    const payment = {
      provider: "stripe",
      type: "card",
      stripeSessionId: resolvedIds.sessionId,
      stripePaymentIntentId: resolvedIds.paymentIntentId,
      stripePendingId: resolvedIds.pendingId,
      stripeEventId: eventId,
      amountPaid,
      paidAt
    };

    if (order) {
      markOrderPaid(order, payment);
      removePendingStripeOrder(db, resolvedIds);
      return order;
    }

    const payload = pending?.payload || buildFallbackPayloadFromStripe({ stripeSession, paymentIntent });
    if (!Array.isArray(payload.items) || !payload.items.length) {
      throw new Error("Stripe payment is paid, but the order payload could not be rebuilt.");
    }

    const user = pending?.userId ? db.users.find((item) => item.id === pending.userId) || null : null;
    const result = createOrderFromPayload(db, user, payload, {
      status: ORDER_STATUS.PAID,
      paidAt,
      payment
    });

    if (!result.order) {
      throw new Error(result.message || "Could not create paid order.");
    }

    order = result.order;
    markOrderPaid(order, payment);
    removePendingStripeOrder(db, resolvedIds);
    ensureInternalTrackingId(order);

    return order;
  }

  async function ensureShippingLabel(order) {
    if (String(order.delivery?.type || "").toLowerCase() !== "shipping") {
      return { skipped: true, reason: "Order does not require shipping." };
    }

    if (order.shipping?.labelUrl || order.shipping?.labelPdfUrl) {
      return { skipped: true, reason: "Shipping label already exists." };
    }

    order.status = ORDER_STATUS.PROCESSING;
    ensureInternalTrackingId(order);

    try {
      const label = await shippoService.createLabelForOrder(order);
      attachShippingLabel(order, label);
      logger.info("Shippo label created.", { orderId: order.id, trackingNumber: label.trackingNumber });
      return { label };
    } catch (error) {
      recordShippingError(order, error);
      logger.error("Shippo label creation failed.", { orderId: order.id, message: error.message });
      throw error;
    }
  }

  async function processStripeEvent(event) {
    if (!["checkout.session.completed", "payment_intent.succeeded"].includes(event.type)) {
      logger.info("Ignoring Stripe event.", { type: event.type, eventId: event.id });
      return { skipped: true };
    }

    const stripeObject = event.data?.object || {};
    if (event.type === "checkout.session.completed" && stripeObject.payment_status !== "paid") {
      logger.info("Checkout session is not paid yet.", { sessionId: stripeObject.id, status: stripeObject.payment_status });
      return { skipped: true };
    }

    const db = await readDbAsync();
    const ids = extractStripeIds(event);
    let pending = findPendingStripeOrder(db, ids);
    const { stripeSession, paymentIntent } = await loadStripeObjects(event, ids, pending);
    const resolvedIds = {
      sessionId: ids.sessionId || stripeSession?.id || pending?.sessionId || "",
      paymentIntentId: ids.paymentIntentId || stripeObjectId(stripeSession?.payment_intent) || paymentIntent?.id || pending?.paymentIntentId || "",
      pendingId: ids.pendingId || getMetadata(stripeSession).pending_id || getMetadata(paymentIntent).pending_id || pending?.id || ""
    };
    pending ||= findPendingStripeOrder(db, resolvedIds);
    const order = ensurePaidOrderForStripe(db, resolvedIds, pending, stripeSession, paymentIntent, event.id);

    await writeDbAsync(db);

    try {
      await ensureShippingLabel(order);
      await writeDbAsync(db);
      return { order };
    } catch (error) {
      await writeDbAsync(db);
      throw error;
    }
  }

  async function handleStripeWebhook(req, res) {
    let event;

    try {
      event = stripeService.verifyWebhook(req.body, req.headers["stripe-signature"]);
    } catch (error) {
      logger.warn("Stripe webhook signature verification failed.", { message: error.message });
      res.status(400).json({ message: `Webhook Error: ${error.message}` });
      return;
    }

    try {
      await processStripeEvent(event);
      res.status(200).json({ received: true });
    } catch (error) {
      logger.error("Stripe webhook processing failed.", { eventId: event.id, type: event.type, message: error.message });
      res.status(500).json({ message: error.message || "Webhook processing failed." });
    }
  }

  async function listAdminOrders(req, res) {
    try {
      const db = await readDbAsync();
      const user = requireAdmin(req, db);
      const orders = listPaidOrders(db.orders).map(publicAdminOrder);
      res.status(200).json({ orders, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      res.status(error.status || 400).json({ message: error.message || "Request error." });
    }
  }

  async function retryOrderLabel(req, res) {
    try {
      const db = await readDbAsync();
      requireAdmin(req, db);
      const order = db.orders.find((item) => item.id === req.params.orderId || item.number === req.params.orderId);

      if (!order) {
        res.status(404).json({ message: "Order not found." });
        return;
      }

      await ensureShippingLabel(order);
      await writeDbAsync(db);
      res.status(200).json({ order: publicAdminOrder(order) });
    } catch (error) {
      res.status(error.status || 400).json({ message: error.message || "Request error." });
    }
  }

  async function patchOrderStatus(req, res) {
    try {
      const db = await readDbAsync();
      requireAdmin(req, db);
      const order = db.orders.find((item) => item.id === req.params.orderId || item.number === req.params.orderId);

      if (!order) {
        res.status(404).json({ message: "Order not found." });
        return;
      }

      updateOrderStatus(order, req.body?.status);
      await writeDbAsync(db);
      res.status(200).json({ order: publicAdminOrder(order) });
    } catch (error) {
      res.status(error.status || 400).json({ message: error.message || "Request error." });
    }
  }

  return {
    handleStripeWebhook,
    listAdminOrders,
    patchOrderStatus,
    processStripeEvent,
    retryOrderLabel
  };
}

module.exports = { createOrderController };

const crypto = require("crypto");

const ORDER_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  PROCESSING: "processing",
  LABEL_CREATED: "label_created",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REFUNDED: "refunded"
};

const paidStatuses = new Set([
  ORDER_STATUS.PAID,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.LABEL_CREATED,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REFUNDED
]);

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();

  if (value === "paid") return ORDER_STATUS.PAID;
  if (value === "processing") return ORDER_STATUS.PROCESSING;
  if (value === "label_created" || value === "ready_to_ship") return ORDER_STATUS.LABEL_CREATED;
  if (value === "shipped") return ORDER_STATUS.SHIPPED;
  if (value === "delivered") return ORDER_STATUS.DELIVERED;
  if (value === "cancelled" || value === "canceled") return ORDER_STATUS.CANCELLED;
  if (value === "refunded") return ORDER_STATUS.REFUNDED;
  if (value === "awaiting payment" || value === "pending") return ORDER_STATUS.PENDING;

  return value || ORDER_STATUS.PENDING;
}

function findOrderByStripeSession(db, sessionId) {
  if (!sessionId) return null;
  return (db.orders || []).find((order) => order.payment?.stripeSessionId === sessionId) || null;
}

function findOrderByPaymentIntent(db, paymentIntentId) {
  if (!paymentIntentId) return null;
  return (db.orders || []).find((order) => order.payment?.stripePaymentIntentId === paymentIntentId) || null;
}

function findOrderByPendingId(db, pendingId) {
  if (!pendingId) return null;
  return (db.orders || []).find((order) => order.payment?.stripePendingId === pendingId) || null;
}

function findPendingStripeOrder(db, ids = {}) {
  const pendingOrders = db.pendingStripeOrders || [];
  return (
    pendingOrders.find((item) => ids.pendingId && item.id === ids.pendingId) ||
    pendingOrders.find((item) => ids.sessionId && item.sessionId === ids.sessionId) ||
    pendingOrders.find((item) => ids.paymentIntentId && item.paymentIntentId === ids.paymentIntentId) ||
    null
  );
}

function removePendingStripeOrder(db, ids = {}) {
  db.pendingStripeOrders = (db.pendingStripeOrders || []).filter((item) => {
    if (ids.pendingId && item.id === ids.pendingId) return false;
    if (ids.sessionId && item.sessionId === ids.sessionId) return false;
    if (ids.paymentIntentId && item.paymentIntentId === ids.paymentIntentId) return false;
    return true;
  });
}

function ensureInternalTrackingId(order) {
  order.shipping ||= {};

  if (!order.internalTrackingId) {
    const datePart = new Date(order.createdAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, "");
    order.internalTrackingId = `HB-${datePart}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  }

  order.shipping.internalTrackingId = order.internalTrackingId;
  return order.internalTrackingId;
}

function markOrderPaid(order, payment = {}) {
  const paidAt = payment.paidAt || order.payment?.paidAt || new Date().toISOString();
  const status = normalizeStatus(order.status);

  order.payment = {
    ...(order.payment || {}),
    ...payment,
    status: ORDER_STATUS.PAID,
    paidAt
  };
  order.status = paidStatuses.has(status) && status !== ORDER_STATUS.CANCELLED && status !== ORDER_STATUS.REFUNDED ? status : ORDER_STATUS.PAID;
  order.paidAt ||= paidAt;
  ensureInternalTrackingId(order);

  return order;
}

function attachShippingLabel(order, label = {}) {
  const now = new Date().toISOString();
  const internalTrackingId = ensureInternalTrackingId(order);

  order.shipping = {
    ...(order.shipping || {}),
    internalTrackingId,
    labelUrl: label.labelUrl || "",
    labelPdfUrl: label.labelUrl || "",
    shippoTransactionId: label.shippoTransactionId || "",
    shippoRateId: label.shippoRateId || "",
    shippoShipmentId: label.shippoShipmentId || "",
    shippoTrackingNumber: label.trackingNumber || "",
    trackingNumber: label.trackingNumber || "",
    trackingUrl: label.trackingUrl || "",
    carrier: label.carrier || "",
    service: label.service || "",
    realShippingCost: Math.max(0, Math.round(Number(label.realShippingCost || label.realShippoCost || order.delivery?.realShippoCost || order.delivery?.real_shippo_cost || 0) || 0)),
    customerShippingPrice: getCustomerShippingPrice(order),
    shippingDiscount: getShippingDiscount(order),
    freeShippingApplied: Boolean(order.delivery?.freeShippingApplied || order.delivery?.free_shipping_applied || getShippingDiscount(order) > 0),
    labelPurchaseMode: getLabelPurchaseMode(order),
    status: "label_created",
    createdAt: order.shipping?.createdAt || now,
    updatedAt: now,
    lastError: ""
  };

  order.delivery = {
    ...(order.delivery || {}),
    shippoTransactionId: label.shippoTransactionId || order.delivery?.shippoTransactionId || "",
    shippoShipmentId: label.shippoShipmentId || order.delivery?.shippoShipmentId || "",
    shippoRateId: label.shippoRateId || order.delivery?.shippoRateId || "",
    carrier: label.carrier || order.delivery?.carrier || "",
    service: label.service || order.delivery?.service || "",
    realShippoCost: Math.max(0, Math.round(Number(label.realShippingCost || label.realShippoCost || order.delivery?.realShippoCost || order.delivery?.real_shippo_cost || 0) || 0)),
    real_shippo_cost: Math.max(0, Math.round(Number(label.realShippingCost || label.realShippoCost || order.delivery?.realShippoCost || order.delivery?.real_shippo_cost || 0) || 0)),
    tracking: {
      company: label.carrier || "Shippo",
      number: label.trackingNumber || "",
      url: label.trackingUrl || "",
      status: "Label created"
    }
  };

  order.status = ORDER_STATUS.LABEL_CREATED;
  order.payment = {
    ...(order.payment || {}),
    status: ORDER_STATUS.PAID
  };

  return order;
}

function recordShippingError(order, error) {
  order.shipping ||= {};
  order.shipping.lastError = error?.message || String(error || "Shippo label error");
  order.shipping.failedAt = new Date().toISOString();
  order.shipping.status = "label_error";
  order.status = normalizeStatus(order.status) === ORDER_STATUS.PENDING ? ORDER_STATUS.PAID : normalizeStatus(order.status);
  order.payment = {
    ...(order.payment || {}),
    status: ORDER_STATUS.PAID
  };
}

function getOrderAmount(order) {
  return Math.max(0, Math.round(Number(order.totals?.total ?? order.payment?.amountPaid ?? 0) || 0));
}

function getOrderSubtotal(order) {
  return Math.max(0, Math.round(Number(order.totals?.subtotal || 0) || 0));
}

function getCustomerShippingPrice(order) {
  const delivery = order.delivery || {};
  return Math.max(0, Math.round(Number(delivery.customerShippingPrice || delivery.customer_shipping_price || order.totals?.delivery || delivery.price || 0) || 0));
}

function getRealShippingCost(order) {
  const shipping = order.shipping || {};
  const delivery = order.delivery || {};
  return Math.max(0, Math.round(Number(shipping.realShippingCost || delivery.realShippoCost || delivery.real_shippo_cost || 0) || 0));
}

function getShippingDiscount(order) {
  const delivery = order.delivery || {};
  const shipping = order.shipping || {};
  return Math.max(0, Math.round(Number(shipping.shippingDiscount || delivery.shippingDiscount || delivery.shipping_discount || Math.max(0, getRealShippingCost(order) - getCustomerShippingPrice(order))) || 0));
}

function getLabelPurchaseMode(order) {
  const delivery = order.delivery || {};
  const shipping = order.shipping || {};
  return String(shipping.labelPurchaseMode || delivery.labelPurchaseMode || delivery.label_purchase_mode || (getOrderSubtotal(order) >= 10000 ? "manual" : "automatic")).trim();
}

function isPaid(order) {
  const status = normalizeStatus(order.status);
  return (
    normalizeStatus(order.payment?.status || order.status) === ORDER_STATUS.PAID &&
    ![ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED].includes(status)
  );
}

function shouldBuyLabelManually(order) {
  return getLabelPurchaseMode(order) === "manual";
}

function canBuyLabel(order) {
  const shipping = order.shipping || {};
  const delivery = order.delivery || {};
  return (
    shouldBuyLabelManually(order) &&
    isPaid(order) &&
    String(delivery.type || "").toLowerCase() === "shipping" &&
    !(shipping.labelUrl || shipping.labelPdfUrl) &&
    Boolean(delivery.shippoRateId || delivery.shippo_rate_id)
  );
}

function isCustomerPaidShipping(order) {
  return getOrderSubtotal(order) < 10000 && getRealShippingCost(order) > 0 && getCustomerShippingPrice(order) >= getRealShippingCost(order);
}

function publicAdminOrder(order) {
  const shipping = order.shipping || {};
  const delivery = order.delivery || {};
  const tracking = delivery.tracking || {};
  const customer = order.customer || {};

  return {
    id: order.id,
    orderId: order.id,
    orderNumber: order.number || order.id,
    createdAt: order.createdAt || "",
    paidAt: order.paidAt || order.payment?.paidAt || "",
    customer: {
      name: customer.name || delivery.name || "Customer",
      email: customer.email || delivery.email || "",
      phone: customer.phone || delivery.phone || ""
    },
    items: Array.isArray(order.items) ? order.items : [],
    amount: getOrderAmount(order),
    subtotal: getOrderSubtotal(order),
    shippingType: delivery.shippingType || delivery.shippingOptionType || "",
    shippingAmount: getCustomerShippingPrice(order),
    customerShippingPrice: getCustomerShippingPrice(order),
    status: normalizeStatus(order.status),
    paymentStatus: normalizeStatus(order.payment?.status),
    internalTrackingId: order.internalTrackingId || shipping.internalTrackingId || "",
    trackingId: order.internalTrackingId || shipping.internalTrackingId || "",
    shippoTrackingNumber: shipping.shippoTrackingNumber || shipping.trackingNumber || tracking.number || "",
    carrier: shipping.carrier || delivery.carrier || tracking.company || "",
    service: shipping.service || delivery.service || "",
    realShippingCost: getRealShippingCost(order),
    shippingDiscount: getShippingDiscount(order),
    freeShippingApplied: Boolean(shipping.freeShippingApplied || delivery.freeShippingApplied || delivery.free_shipping_applied || getShippingDiscount(order) > 0),
    labelPurchaseMode: getLabelPurchaseMode(order),
    canBuyLabel: canBuyLabel(order),
    shippingPaidByCustomer: isCustomerPaidShipping(order),
    labelUrl: shipping.labelUrl || shipping.labelPdfUrl || "",
    trackingUrl: shipping.trackingUrl || tracking.url || "",
    deliveryType: delivery.type || "",
    shippingStatus: shipping.status || "",
    shippingError: shipping.lastError || ""
  };
}

function listPaidOrders(orders = []) {
  return orders
    .filter((order) => paidStatuses.has(normalizeStatus(order.status)) || normalizeStatus(order.payment?.status) === ORDER_STATUS.PAID)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function updateOrderStatus(order, status) {
  const next = normalizeStatus(status);

  if (!paidStatuses.has(next)) {
    throw new Error("Order status must be paid, processing, label_created, shipped, delivered, cancelled, or refunded.");
  }

  order.status = next;
  order.payment = {
    ...(order.payment || {}),
    status: ORDER_STATUS.PAID
  };
  order.shipping = {
    ...(order.shipping || {}),
    status:
      next === ORDER_STATUS.LABEL_CREATED
        ? "label_created"
        : next === ORDER_STATUS.SHIPPED
          ? "shipped"
          : next === ORDER_STATUS.DELIVERED
            ? "delivered"
            : order.shipping?.status || ""
  };
  order.updatedAt = new Date().toISOString();

  return order;
}

module.exports = {
  ORDER_STATUS,
  attachShippingLabel,
  canBuyLabel,
  ensureInternalTrackingId,
  findOrderByPaymentIntent,
  findOrderByPendingId,
  findOrderByStripeSession,
  findPendingStripeOrder,
  listPaidOrders,
  markOrderPaid,
  normalizeStatus,
  publicAdminOrder,
  recordShippingError,
  removePendingStripeOrder,
  shouldBuyLabelManually,
  updateOrderStatus
};

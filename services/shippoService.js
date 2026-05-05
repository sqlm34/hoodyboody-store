const https = require("https");

function cents(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function normalizeRates(data = {}) {
  const rates = data.results || data.rates || [];

  return rates
    .filter((rate) => String(rate.currency || "").toUpperCase() === "USD")
    .map((rate) => ({
      id: rate.object_id || rate.id || "",
      shipmentId: data.object_id || rate.shipment || "",
      carrier: rate.provider || "",
      service: rate.servicelevel?.name || rate.servicelevel?.token || "Shipping",
      price: cents(rate.amount),
      currency: rate.currency || "USD",
      deliveryDays: rate.estimated_days || null,
      attributes: Array.isArray(rate.attributes) ? rate.attributes : []
    }))
    .filter((rate) => rate.id && rate.price >= 0)
    .sort((a, b) => a.price - b.price);
}

function getParcelForOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const quantity = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const ounces = items.reduce((sum, item) => {
    const productId = String(item.productId || item.baseProductId || item.id || "");
    const baseWeight = productId.includes("canvas-tote") ? 10 : 18;
    return sum + baseWeight * Math.max(1, Number(item.quantity) || 1);
  }, 0);

  return {
    length: "15",
    width: "12",
    height: String(Math.min(12, Math.max(3, 2 + quantity))),
    distance_unit: "in",
    weight: String(Math.max(1, Math.ceil(ounces / 16))),
    mass_unit: "lb"
  };
}

function getAddressTo(order) {
  const delivery = order.delivery || {};
  const customer = order.customer || {};

  return {
    name: String(customer.name || delivery.name || "Customer").trim(),
    street1: String(delivery.address || "").trim(),
    street2: String(delivery.apartment || delivery.entrance || "").trim(),
    city: String(delivery.city || "").trim(),
    state: String(delivery.state || "").trim().toUpperCase(),
    zip: String(delivery.zip || "").trim(),
    country: "US",
    phone: String(customer.phone || delivery.phone || "").trim(),
    email: String(customer.email || delivery.email || "").trim()
  };
}

function getAddressFrom(shippingOrigin) {
  return {
    name: shippingOrigin.name,
    street1: shippingOrigin.street1,
    street2: shippingOrigin.street2 || "",
    city: shippingOrigin.city,
    state: shippingOrigin.state,
    zip: shippingOrigin.zip,
    country: shippingOrigin.country || "US",
    phone: shippingOrigin.phone,
    email: shippingOrigin.email
  };
}

function isRetryableStatus(statusCode) {
  return statusCode === 429 || statusCode >= 500;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createShippoService({ apiKey, shippingOrigin, logger }) {
  function requestOnce(method, apiPath, payload = null) {
    const body = payload ? JSON.stringify(payload) : "";

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.goshippo.com",
          path: apiPath,
          method,
          headers: {
            Authorization: `ShippoToken ${apiKey}`,
            "Content-Type": "application/json",
            "SHIPPO-API-VERSION": "2018-02-08",
            ...(body ? { "Content-Length": Buffer.byteLength(body) } : {})
          }
        },
        (res) => {
          let responseBody = "";

          res.on("data", (chunk) => {
            responseBody += chunk;
          });

          res.on("end", () => {
            let data = {};

            try {
              data = JSON.parse(responseBody || "{}");
            } catch {
              data = { detail: responseBody };
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
              return;
            }

            const error = new Error(data.detail || data.message || data.error?.message || "Shippo request failed.");
            error.statusCode = res.statusCode;
            reject(error);
          });
        }
      );

      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async function request(method, apiPath, payload = null) {
    if (!apiKey) {
      throw new Error("Shippo is not configured. Set SHIPPO_API_KEY before starting the server.");
    }

    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await requestOnce(method, apiPath, payload);
      } catch (error) {
        lastError = error;
        const retryable = isRetryableStatus(error.statusCode || 0) || !error.statusCode;

        if (!retryable || attempt === 3) break;

        logger?.warn("Retrying Shippo request.", { method, apiPath, attempt, message: error.message });
        await wait(350 * attempt);
      }
    }

    logger?.error("Shippo request failed.", { method, apiPath, message: lastError?.message });
    throw lastError;
  }

  async function createShipmentForOrder(order) {
    const addressTo = getAddressTo(order);

    if (!addressTo.street1 || !addressTo.city || !addressTo.state || !addressTo.zip) {
      throw new Error("Order does not have a complete US shipping address.");
    }

    return request("POST", "/shipments/", {
      address_from: getAddressFrom(shippingOrigin),
      address_to: addressTo,
      parcels: [getParcelForOrder(order)],
      async: false,
      metadata: String(order.number || order.id || "").slice(0, 100)
    });
  }

  function selectRate(rates, preferredRateId = "") {
    if (!rates.length) throw new Error("Shippo did not return shipping rates for this order.");

    const preferred = preferredRateId ? rates.find((rate) => rate.id === preferredRateId) : null;
    if (preferred) return preferred;

    // BESTVALUE keeps Shippo's carrier recommendation when available; otherwise the cheapest rate keeps customer cost predictable.
    return rates.find((rate) => rate.attributes.includes("BESTVALUE")) || rates[0];
  }

  async function createLabelForOrder(order) {
    const delivery = order.delivery || {};
    let selectedRate = {
      id: String(delivery.shippoRateId || "").trim(),
      shipmentId: String(delivery.shippoShipmentId || "").trim(),
      carrier: delivery.carrier || "",
      service: delivery.service || ""
    };

    if (!selectedRate.id) {
      const shipment = await createShipmentForOrder(order);
      selectedRate = selectRate(normalizeRates(shipment));
    }

    const transaction = await request("POST", "/transactions/", {
      rate: selectedRate.id,
      async: false,
      label_file_type: "PDF",
      metadata: String(order.number || order.id || "").slice(0, 100)
    });

    if (String(transaction.status || "").toUpperCase() !== "SUCCESS") {
      const message = transaction.messages?.[0]?.text || transaction.messages?.[0]?.message || "Shippo did not create a label.";
      throw new Error(message);
    }

    return {
      labelUrl: transaction.label_url || "",
      trackingNumber: transaction.tracking_number || "",
      trackingUrl: transaction.tracking_url_provider || "",
      carrier: selectedRate.carrier || transaction.rate?.provider || "",
      service: selectedRate.service || transaction.rate?.servicelevel?.name || "",
      shippoTransactionId: transaction.object_id || "",
      shippoRateId: selectedRate.id,
      shippoShipmentId: selectedRate.shipmentId || transaction.shipment || "",
      raw: transaction
    };
  }

  return {
    createLabelForOrder,
    createShipmentForOrder,
    normalizeRates,
    request,
    selectRate
  };
}

module.exports = { createShippoService, normalizeRates };

const https = require("https");

const PACKAGE_TYPES = ["parcel", "soft_pack", "padded_envelope", "box", "tube", "custom"];
const WEIGHT_UNITS = ["oz", "lb", "g", "kg"];
const DIMENSION_UNITS = ["in", "cm"];
const STANDARD_SERVICE_PATTERN = /(ground|economy|standard|parcel\s*select|retail\s*ground|advantage|surepost|smartpost|first[-\s]*class)/i;
const EXPRESS_SERVICE_PATTERN = /(express|priority|2[-\s]*day|two[-\s]*day|next[-\s]*day|overnight|air|expedited|same[-\s]*day|second[-\s]*day)/i;

function cents(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function asPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeRates(data = {}) {
  const rates = Array.isArray(data) ? data : data.results || data.rates || [];

  return rates
    .filter((rate) => String(rate.currency || "").toUpperCase() === "USD")
    .map((rate) => ({
      id: rate.object_id || rate.id || "",
      shipmentId: data.object_id || data.id || rate.shipment || "",
      carrier: rate.provider || "",
      service: rate.servicelevel?.name || rate.servicelevel?.token || "Shipping",
      serviceToken: rate.servicelevel?.token || "",
      price: cents(rate.amount),
      currency: rate.currency || "USD",
      deliveryDays: rate.estimated_days || null,
      attributes: Array.isArray(rate.attributes) ? rate.attributes : []
    }))
    .filter((rate) => rate.id && rate.price >= 0)
    .sort((a, b) => a.price - b.price);
}

function isDigitalProduct(product = {}) {
  return product.isDigital === true || product.digital === true || String(product.type || "").toLowerCase() === "digital";
}

function normalizeProductShippingFields(product = {}) {
  const source = product.shipping || product;
  const packageType = PACKAGE_TYPES.includes(String(source.package_type || source.packageType || "").trim())
    ? String(source.package_type || source.packageType).trim()
    : "parcel";
  const weightUnit = WEIGHT_UNITS.includes(String(source.weight_unit || source.weightUnit || "").trim())
    ? String(source.weight_unit || source.weightUnit).trim()
    : "oz";
  const dimensionUnit = DIMENSION_UNITS.includes(String(source.dimension_unit || source.dimensionUnit || "").trim())
    ? String(source.dimension_unit || source.dimensionUnit).trim()
    : "in";

  return {
    weight_value: asPositiveNumber(source.weight_value ?? source.weightValue),
    weight_unit: weightUnit,
    length: asPositiveNumber(source.length),
    width: asPositiveNumber(source.width),
    height: asPositiveNumber(source.height),
    dimension_unit: dimensionUnit,
    package_type: packageType
  };
}

function validateProductShippingFields(product = {}) {
  if (isDigitalProduct(product)) {
    return {
      isDigital: true,
      shipping: {
        ...normalizeProductShippingFields(product),
        required: false
      }
    };
  }

  const shipping = normalizeProductShippingFields(product);
  const missing = [];

  if (!shipping.weight_value) missing.push("weight");
  if (!shipping.length) missing.push("length");
  if (!shipping.width) missing.push("width");
  if (!shipping.height) missing.push("height");
  if (!WEIGHT_UNITS.includes(shipping.weight_unit)) missing.push("weight unit");
  if (!DIMENSION_UNITS.includes(shipping.dimension_unit)) missing.push("dimension unit");
  if (!PACKAGE_TYPES.includes(shipping.package_type)) missing.push("package type");

  if (missing.length) {
    throw new Error(`Shipping fields are required for physical products: ${missing.join(", ")}.`);
  }

  return {
    isDigital: false,
    shipping: {
      ...shipping,
      required: true
    }
  };
}

function convertWeightToLb(value, unit) {
  const weight = asPositiveNumber(value);
  if (unit === "lb") return weight;
  if (unit === "g") return weight / 453.59237;
  if (unit === "kg") return weight * 2.2046226218;
  return weight / 16;
}

function convertDimensionToIn(value, unit) {
  const dimension = asPositiveNumber(value);
  return unit === "cm" ? dimension / 2.54 : dimension;
}

function formatPositive(value) {
  return Math.max(0.1, Number(value) || 0.1).toFixed(2);
}

function getCartProductId(item, productLookup) {
  if (item.productId && productLookup[item.productId]) return item.productId;
  if (item.baseProductId && productLookup[item.baseProductId]) return item.baseProductId;
  if (item.id && productLookup[item.id]) return item.id;

  return Object.keys(productLookup)
    .sort((a, b) => b.length - a.length)
    .find((productId) => String(item.id || "").startsWith(`${productId}-`));
}

function buildProductLookup(products = []) {
  return Object.fromEntries((Array.isArray(products) ? products : []).map((product) => [product.id, product]));
}

function buildShippoParcelsFromCart(items = [], products = []) {
  const productLookup = buildProductLookup(products);
  const parcels = [];

  for (const item of items) {
    const productId = getCartProductId(item, productLookup);
    const product = productLookup[productId] || item;

    if (isDigitalProduct(product) || isDigitalProduct(item)) continue;

    let validated;
    try {
      validated = validateProductShippingFields(product);
    } catch (error) {
      throw new Error(`${product?.title || item.title || productId || "Product"}: ${error.message}`);
    }

    const shipping = validated.shipping;
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const parcel = {
      length: formatPositive(convertDimensionToIn(shipping.length, shipping.dimension_unit)),
      width: formatPositive(convertDimensionToIn(shipping.width, shipping.dimension_unit)),
      height: formatPositive(convertDimensionToIn(shipping.height, shipping.dimension_unit)),
      distance_unit: "in",
      weight: formatPositive(convertWeightToLb(shipping.weight_value, shipping.weight_unit)),
      mass_unit: "lb",
      metadata: shipping.package_type
    };

    for (let index = 0; index < quantity; index += 1) {
      parcels.push({ ...parcel });
    }
  }

  if (!parcels.length) {
    throw new Error("No shippable products with valid shipping fields were found in the cart.");
  }

  return parcels;
}

function getAddressTo(destination = {}) {
  return {
    name: String(destination.name || "Customer").trim(),
    street1: String(destination.address || destination.street1 || "").trim(),
    street2: String(destination.apartment || destination.street2 || destination.entrance || "").trim(),
    city: String(destination.city || "").trim(),
    state: String(destination.state || "").trim().toUpperCase(),
    zip: String(destination.zip || destination.postal_code || "").trim(),
    country: "US",
    phone: String(destination.phone || "").trim(),
    email: String(destination.email || "").trim()
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

function getOrderDestination(order) {
  return {
    ...(order.delivery || {}),
    name: order.customer?.name || order.delivery?.name || "Customer",
    phone: order.customer?.phone || order.delivery?.phone || "",
    email: order.customer?.email || order.delivery?.email || ""
  };
}

function isRetryableStatus(statusCode) {
  return statusCode === 429 || statusCode >= 500;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectShippoErrorMessages(value, path = "", messages = [], seen = new Set()) {
  if (value == null) return messages;

  if (typeof value === "string") {
    const text = value.trim();
    if (text) messages.push(path ? `${path}: ${text}` : text);
    return messages;
  }

  if (typeof value === "number") {
    messages.push(path ? `${path}: ${value}` : String(value));
    return messages;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectShippoErrorMessages(item, path, messages, seen));
    return messages;
  }

  if (typeof value !== "object" || seen.has(value)) return messages;
  seen.add(value);

  const priorityKeys = ["detail", "message", "messages", "errors", "error", "text", "__all__", "non_field_errors"];
  const skipKeys = new Set(["object_id", "object_created", "object_updated", "id", "status", "was_test"]);

  for (const key of priorityKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      collectShippoErrorMessages(value[key], path, messages, seen);
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (priorityKeys.includes(key) || skipKeys.has(key)) continue;
    const nextPath = path ? `${path}.${key}` : key;
    collectShippoErrorMessages(nestedValue, nextPath, messages, seen);
  }

  return messages;
}

function getShippoErrorMessage(data, fallback = "Shippo request failed.") {
  const messages = collectShippoErrorMessages(data)
    .map((message) => message.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const uniqueMessages = [...new Set(messages)];

  return uniqueMessages.join("; ") || fallback;
}

function rateSearchText(rate) {
  return `${rate.carrier || ""} ${rate.service || ""} ${rate.serviceToken || ""} ${(rate.attributes || []).join(" ")}`;
}

function selectStandardRate(rates = []) {
  return rates.filter((rate) => STANDARD_SERVICE_PATTERN.test(rateSearchText(rate))).sort((a, b) => a.price - b.price)[0] || null;
}

function selectExpressRate(rates = []) {
  return rates.filter((rate) => EXPRESS_SERVICE_PATTERN.test(rateSearchText(rate))).sort((a, b) => a.price - b.price)[0] || null;
}

function selectRateForShippingType(rates = [], optionType = "") {
  const type = String(optionType || "").trim().toLowerCase();

  if (type === "express") return selectExpressRate(rates);
  if (type === "standard") return selectStandardRate(rates);

  return null;
}

function findRateByCarrierService(rates = [], savedRate = {}) {
  const savedCarrier = String(savedRate.carrier || "").trim().toLowerCase();
  const savedService = String(savedRate.service || "").trim().toLowerCase();

  if (!savedCarrier && !savedService) return null;

  return (
    rates.find((rate) => {
      const carrier = String(rate.carrier || "").trim().toLowerCase();
      const service = String(rate.service || "").trim().toLowerCase();
      return (!savedCarrier || carrier === savedCarrier) && (!savedService || service === savedService);
    }) || null
  );
}

function isSavedRatePurchaseError(error) {
  const statusCode = Number(error?.statusCode) || 0;
  if ([400, 404, 410, 422].includes(statusCode)) return true;

  const message = String(error?.message || "").toLowerCase();
  return /(rate|shipment|transaction|expired|invalid|not found|not available|purchase)/.test(message);
}

function shippingOptionFromRate({ type, title, rate }) {
  const customerPrice = Math.max(0, Math.round(Number(rate.price) || 0));

  return {
    id: `${type}:${rate.id}`,
    title,
    display_price: customerPrice,
    displayPrice: customerPrice,
    customer_shipping_price: customerPrice,
    customerShippingPrice: customerPrice,
    real_shippo_amount: customerPrice,
    realShippoAmount: customerPrice,
    shipping_discount: 0,
    shippingDiscount: 0,
    label_purchase_mode: "automatic",
    labelPurchaseMode: "automatic",
    shippo_rate_id: rate.id,
    shippoRateId: rate.id,
    shippo_shipment_id: rate.shipmentId,
    shipmentId: rate.shipmentId,
    carrier: rate.carrier,
    service: rate.service,
    estimated_days: rate.deliveryDays,
    deliveryDays: rate.deliveryDays,
    type
  };
}

function buildShippingOptions({ rates = [] }) {
  const standardRate = selectStandardRate(rates);
  const expressRate = selectExpressRate(rates);
  const options = [];

  if (standardRate) {
    options.push(
      shippingOptionFromRate({
        type: "standard",
        title: "Standard Shipping",
        rate: standardRate
      })
    );
  }

  if (expressRate && expressRate.id !== standardRate?.id) {
    options.push(
      shippingOptionFromRate({
        type: "express",
        title: "Express Shipping",
        rate: expressRate
      })
    );
  }

  if (!options.length && rates[0]) {
    options.push(
      shippingOptionFromRate({
        type: "standard",
        title: "Standard Shipping",
        rate: rates[0]
      })
    );
  }

  return options;
}

function saveSelectedShippingOption(delivery = {}, options = []) {
  const optionId = String(delivery.shippingOptionId || delivery.optionId || "").trim();
  const optionType = String(delivery.shippingOptionType || delivery.typeCode || delivery.shippingType || "").trim();
  const rateId = String(delivery.shippoRateId || delivery.shippo_rate_id || delivery.easyPostRateId || "").trim();
  const selected =
    options.find((option) => option.id === optionId) ||
    options.find((option) => option.shippo_rate_id === rateId && (!optionType || option.type === optionType)) ||
    options.find((option) => option.shippo_rate_id === rateId) ||
    null;

  if (!selected) {
    throw new Error("Select a valid shipping option before checkout.");
  }

  return {
    ...delivery,
    shippingOptionId: selected.id,
    shippingOptionType: selected.type,
    shippingTitle: selected.title,
    price: selected.customer_shipping_price,
    customerShippingPrice: selected.customer_shipping_price,
    customer_shipping_price: selected.customer_shipping_price,
    realShippoCost: selected.real_shippo_amount,
    real_shippo_cost: selected.real_shippo_amount,
    realShippoAmount: selected.real_shippo_amount,
    shippingDiscount: selected.shipping_discount || 0,
    shipping_discount: selected.shipping_discount || 0,
    labelPurchaseMode: selected.label_purchase_mode || "automatic",
    label_purchase_mode: selected.label_purchase_mode || "automatic",
    carrier: selected.carrier,
    service: selected.service,
    deliveryDays: selected.estimated_days,
    shippoShipmentId: selected.shippo_shipment_id,
    shippoRateId: selected.shippo_rate_id
  };
}

function createShippoService({ apiKey, shippingOrigin, logger, requestClient }) {
  function requestOnce(method, apiPath, payload = null) {
    if (typeof requestClient === "function") {
      return Promise.resolve().then(() => requestClient(method, apiPath, payload));
    }

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

            const error = new Error(getShippoErrorMessage(data, responseBody || "Shippo request failed."));
            error.statusCode = res.statusCode;
            error.response = data;
            error.responseBody = responseBody;
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

  async function createShipment({ destination, items, products, parcels, metadata = "" }) {
    const addressTo = getAddressTo(destination);
    const shipmentParcels = parcels || buildShippoParcelsFromCart(items, products);

    if (!addressTo.street1 || !addressTo.city || !addressTo.state || !addressTo.zip) {
      throw new Error("Enter a complete US delivery address before calculating shipping.");
    }

    return request("POST", "/shipments/", {
      address_from: getAddressFrom(shippingOrigin),
      address_to: addressTo,
      parcels: shipmentParcels,
      async: false,
      metadata: String(metadata || "checkout").slice(0, 100)
    });
  }

  async function getShippoRates({ destination, items, products, subtotal = 0, metadata = "" }) {
    const parcels = buildShippoParcelsFromCart(items, products);
    const shipment = await createShipment({ destination, items, products, parcels, metadata });
    const rates = normalizeRates(shipment);
    const options = buildShippingOptions({ rates, subtotal, destination, parcels });

    if (!options.length) {
      throw new Error("No standard or express Shippo shipping options are available for this address.");
    }

    return {
      shipment,
      shipmentId: shipment.object_id || shipment.id || options[0]?.shippo_shipment_id || "",
      rates,
      options
    };
  }

  async function createShipmentForOrder(order) {
    return createShipment({
      destination: getOrderDestination(order),
      items: order.items,
      products: order.items,
      metadata: String(order.number || order.id || "")
    });
  }

  function selectRate(rates, preferredRateId = "") {
    if (!rates.length) throw new Error("Shippo did not return shipping rates for this order.");

    const preferred = preferredRateId ? rates.find((rate) => rate.id === preferredRateId) : null;
    if (preferred) return preferred;

    return selectStandardRate(rates) || rates.find((rate) => rate.attributes.includes("BESTVALUE")) || rates[0];
  }

  async function refreshSelectedRateForOrder(order, savedRate = {}) {
    const shipment = await createShipmentForOrder(order);
    const rates = normalizeRates(shipment);
    const delivery = order.delivery || {};
    const shippingType = delivery.shippingOptionType || delivery.shippingType || delivery.typeCode || "";
    const typedRate = selectRateForShippingType(rates, shippingType);
    const matchingRate = findRateByCarrierService(rates, savedRate);
    const refreshedRate = typedRate || matchingRate || selectRate(rates);

    logger?.info("Refreshed Shippo rate before label purchase.", {
      orderId: order.id,
      oldRateId: savedRate.id || "",
      newRateId: refreshedRate.id
    });

    return refreshedRate;
  }

  async function purchaseShippingLabelAfterPayment(order, options = {}) {
    const paid = String(order.payment?.status || order.status || "").toLowerCase() === "paid" || ["processing", "label_created", "ready_to_ship"].includes(String(order.status || "").toLowerCase());
    if (!paid) throw new Error("Shipping label can only be purchased after payment.");

    const delivery = order.delivery || {};
    let selectedRate = {
      id: String(delivery.shippoRateId || delivery.shippo_rate_id || "").trim(),
      shipmentId: String(delivery.shippoShipmentId || delivery.shippo_shipment_id || "").trim(),
      carrier: delivery.carrier || "",
      service: delivery.service || "",
      price: Math.max(0, Math.round(Number(delivery.realShippoCost || delivery.real_shippo_cost || delivery.realShippoAmount || 0) || 0))
    };

    if (!selectedRate.id && options.requireSavedRate) {
      throw new Error("Saved Shippo rate id is required to buy this label.");
    }

    if (!selectedRate.id) {
      const shipment = await createShipmentForOrder(order);
      selectedRate = selectRate(normalizeRates(shipment));
    }

    const buyRate = (rate) =>
      request("POST", "/transactions/", {
        rate: rate.id,
        async: false,
        label_file_type: "PDF",
        metadata: String(order.number || order.id || "").slice(0, 100)
      });

    let transaction;

    try {
      transaction = await buyRate(selectedRate);
    } catch (error) {
      if (!options.refreshStaleRate || !selectedRate.id || !isSavedRatePurchaseError(error)) {
        throw error;
      }

      logger?.warn("Saved Shippo rate could not be purchased; refreshing rate and retrying label purchase.", {
        orderId: order.id,
        rateId: selectedRate.id,
        message: error.message
      });
      selectedRate = await refreshSelectedRateForOrder(order, selectedRate);
      transaction = await buyRate(selectedRate);
    }

    if (String(transaction.status || "").toUpperCase() !== "SUCCESS") {
      const message = getShippoErrorMessage(transaction.messages, "Shippo did not create a label.");
      throw new Error(message);
    }

    return {
      labelUrl: transaction.label_url || "",
      trackingNumber: transaction.tracking_number || "",
      trackingUrl: transaction.tracking_url_provider || "",
      carrier: selectedRate.carrier || transaction.rate?.provider || "",
      service: selectedRate.service || transaction.rate?.servicelevel?.name || "",
      realShippingCost: selectedRate.price,
      realShippoCost: selectedRate.price,
      shippoTransactionId: transaction.object_id || "",
      shippoRateId: selectedRate.id,
      shippoShipmentId: selectedRate.shipmentId || transaction.shipment || "",
      raw: transaction
    };
  }

  return {
    buildShippingOptions,
    buildShippoParcelsFromCart,
    createLabelForOrder: purchaseShippingLabelAfterPayment,
    createShipmentForOrder,
    getShippoRates,
    normalizeRates,
    purchaseShippingLabelAfterPayment,
    request,
    saveSelectedShippingOption,
    getShippoErrorMessage,
    selectExpressRate,
    selectRate,
    selectStandardRate,
    validateProductShippingFields
  };
}

module.exports = {
  PACKAGE_TYPES,
  buildShippingOptions,
  buildShippoParcelsFromCart,
  createShippoService,
  getShippoErrorMessage,
  normalizeProductShippingFields,
  normalizeRates,
  saveSelectedShippingOption,
  selectExpressRate,
  selectStandardRate,
  validateProductShippingFields
};

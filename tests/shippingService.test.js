const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildShippingOptions,
  buildShippoParcelsFromCart,
  createShippoService,
  getFreeShippingEligibility,
  getShippoErrorMessage,
  validateProductShippingFields
} = require("../services/shippoService");
const { canBuyLabel } = require("../models/orderModel");

const standardRate = {
  id: "rate-standard",
  shipmentId: "shipment-1",
  carrier: "USPS",
  service: "Ground Advantage",
  serviceToken: "usps_ground_advantage",
  price: 750,
  currency: "USD",
  deliveryDays: 5,
  attributes: []
};

const expressRate = {
  id: "rate-express",
  shipmentId: "shipment-1",
  carrier: "UPS",
  service: "Next Day Air",
  serviceToken: "ups_next_day_air",
  price: 2199,
  currency: "USD",
  deliveryDays: 1,
  attributes: []
};

test("standard shipping is paid below the free shipping threshold", () => {
  const options = buildShippingOptions({ rates: [standardRate, expressRate], subtotal: 8000 });

  assert.equal(options[0].type, "standard");
  assert.equal(options[0].title, "Standard Shipping");
  assert.equal(options[0].customerShippingPrice, 750);
  assert.equal(options[0].realShippoAmount, 750);
});

test("free shipping starts at 100 USD and still keeps real Shippo cost", () => {
  const options = buildShippingOptions({
    rates: [standardRate, expressRate],
    subtotal: 12000,
    destination: { state: "IN", country: "US" },
    parcels: [{ weight: "1", length: "12", width: "10", height: "2" }]
  });

  assert.equal(options[0].type, "free");
  assert.equal(options[0].title, "Free Shipping");
  assert.equal(options[0].customerShippingPrice, 0);
  assert.equal(options[0].realShippoAmount, 750);
  assert.equal(options[0].shippoRateId, "rate-standard");
  assert.equal(options[0].shippingDiscount, 750);
  assert.equal(options[0].labelPurchaseMode, "manual");
});

test("express shipping is always paid when available", () => {
  const options = buildShippingOptions({
    rates: [standardRate, expressRate],
    subtotal: 12000,
    destination: { state: "IN", country: "US" },
    parcels: [{ weight: "1", length: "12", width: "10", height: "2" }]
  });
  const express = options.find((option) => option.type === "express");

  assert.ok(express);
  assert.equal(express.customerShippingPrice, 2199);
  assert.equal(express.realShippoAmount, 2199);
});

test("free shipping coverage becomes a partial shipping discount above 10 USD", () => {
  const options = buildShippingOptions({
    rates: [{ ...standardRate, price: 1600 }, expressRate],
    subtotal: 12000,
    destination: { state: "IN", country: "US" },
    parcels: [{ weight: "1", length: "12", width: "10", height: "2" }]
  });

  assert.equal(options[0].title, "Shipping Discount");
  assert.equal(options[0].customerShippingPrice, 600);
  assert.equal(options[0].realShippoAmount, 1600);
  assert.equal(options[0].shippingDiscount, 1000);
});

test("free shipping is not available outside continental US", () => {
  const options = buildShippingOptions({
    rates: [standardRate, expressRate],
    subtotal: 12000,
    destination: { state: "HI", country: "US" },
    parcels: [{ weight: "1", length: "12", width: "10", height: "2" }]
  });

  assert.equal(options[0].type, "standard");
  assert.equal(options[0].customerShippingPrice, 750);
});

test("oversized shipments do not receive free shipping discount", () => {
  const eligibility = getFreeShippingEligibility({
    subtotal: 12000,
    destination: { state: "IN", country: "US" },
    parcels: [{ weight: "12", length: "12", width: "10", height: "2" }]
  });

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "oversized");
});

test("physical products without shipping dimensions block checkout", () => {
  assert.throws(
    () => validateProductShippingFields({ id: "hoodie", title: "Hoodie", shipping: { weight_value: 12 } }),
    /Shipping fields are required/
  );
});

test("cart parcels are built from product shipping fields", () => {
  const parcels = buildShippoParcelsFromCart(
    [{ id: "hoodie-black-m", productId: "hoodie", title: "Hoodie", quantity: 2 }],
    [
      {
        id: "hoodie",
        title: "Hoodie",
        shipping: {
          weight_value: 18,
          weight_unit: "oz",
          length: 15,
          width: 12,
          height: 3,
          dimension_unit: "in",
          package_type: "soft_pack"
        }
      }
    ]
  );

  assert.equal(parcels.length, 2);
  assert.equal(parcels[0].mass_unit, "lb");
  assert.equal(parcels[0].distance_unit, "in");
});

test("label purchase is blocked before payment", async () => {
  const shippo = createShippoService({
    apiKey: "test-key",
    shippingOrigin: {
      name: "HoodyBoody",
      street1: "1 Main St",
      city: "Indianapolis",
      state: "IN",
      zip: "46204",
      country: "US"
    }
  });

  await assert.rejects(
    () =>
      shippo.purchaseShippingLabelAfterPayment({
        status: "pending",
        delivery: { type: "shipping", shippoRateId: "rate-standard" },
        items: []
      }),
    /only be purchased after payment/
  );
});

test("Shippo nested errors are shown as readable admin messages", () => {
  const message = getShippoErrorMessage({
    detail: {
      rate: ["Object not found."],
      address_to: {
        zip: ["Enter a valid ZIP code."]
      }
    },
    messages: [{ text: "Rate expired." }]
  });

  assert.equal(message, "rate: Object not found.; address_to.zip: Enter a valid ZIP code.; Rate expired.");
});

test("manual label purchase refreshes stale saved Shippo rate before retrying", async () => {
  const calls = [];
  const shippo = createShippoService({
    apiKey: "test-key",
    shippingOrigin: {
      name: "HoodyBoody",
      street1: "6463 Bayside South Drive",
      city: "Indianapolis",
      state: "IN",
      zip: "46250",
      country: "US"
    },
    requestClient: async (method, apiPath, payload) => {
      calls.push({ method, apiPath, payload });

      if (method === "POST" && apiPath === "/transactions/" && payload.rate === "rate-old") {
        const error = new Error("rate: Object not found.");
        error.statusCode = 404;
        throw error;
      }

      if (method === "POST" && apiPath === "/shipments/") {
        return {
          object_id: "shipment-new",
          rates: [
            {
              object_id: "rate-fresh",
              provider: "USPS",
              servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" },
              amount: "8.20",
              currency: "USD",
              estimated_days: 4,
              attributes: []
            }
          ]
        };
      }

      if (method === "POST" && apiPath === "/transactions/" && payload.rate === "rate-fresh") {
        return {
          status: "SUCCESS",
          object_id: "transaction-fresh",
          label_url: "https://labels.test/fresh.pdf",
          tracking_number: "9400100000000000000000",
          tracking_url_provider: "https://tracking.test/9400100000000000000000",
          shipment: "shipment-new",
          rate: {
            provider: "USPS",
            servicelevel: { name: "Ground Advantage" }
          }
        };
      }

      throw new Error(`Unexpected Shippo call: ${method} ${apiPath}`);
    }
  });

  const label = await shippo.purchaseShippingLabelAfterPayment(
    {
      id: "order-1",
      number: "HB-1",
      status: "paid",
      payment: { status: "paid" },
      customer: {
        name: "Customer",
        email: "customer@example.com",
        phone: "3175550199"
      },
      delivery: {
        type: "shipping",
        address: "1 Main St",
        city: "Indianapolis",
        state: "IN",
        zip: "46250",
        phone: "3175550199",
        email: "customer@example.com",
        shippoRateId: "rate-old",
        carrier: "USPS",
        service: "Ground Advantage",
        shippingOptionType: "standard",
        realShippoCost: 750
      },
      items: [
        {
          id: "hoodie",
          title: "Hoodie",
          quantity: 1,
          shipping: {
            weight_value: 18,
            weight_unit: "oz",
            length: 15,
            width: 12,
            height: 3,
            dimension_unit: "in",
            package_type: "soft_pack"
          }
        }
      ]
    },
    { requireSavedRate: true, refreshStaleRate: true }
  );

  assert.equal(label.shippoRateId, "rate-fresh");
  assert.equal(label.shippoShipmentId, "shipment-new");
  assert.equal(label.labelUrl, "https://labels.test/fresh.pdf");
  assert.equal(calls.filter((call) => call.apiPath === "/transactions/").length, 2);
  assert.equal(calls.some((call) => call.apiPath === "/shipments/"), true);
});

test("manual Buy Label is available only for paid manual orders without label", () => {
  const order = {
    status: "paid",
    payment: { status: "paid" },
    totals: { subtotal: 12000 },
    delivery: {
      type: "shipping",
      labelPurchaseMode: "manual",
      shippoRateId: "rate-standard"
    },
    shipping: {}
  };

  assert.equal(canBuyLabel(order), true);
  assert.equal(canBuyLabel({ ...order, payment: { status: "pending" }, status: "pending" }), false);
  assert.equal(canBuyLabel({ ...order, shipping: { labelUrl: "https://label.test" } }), false);
  assert.equal(canBuyLabel({ ...order, delivery: { ...order.delivery, labelPurchaseMode: "automatic" } }), false);
});

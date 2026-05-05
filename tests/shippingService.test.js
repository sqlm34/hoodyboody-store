const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildShippingOptions,
  buildShippoParcelsFromCart,
  createShippoService,
  validateProductShippingFields
} = require("../services/shippoService");

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
  const options = buildShippingOptions({ rates: [standardRate, expressRate], subtotal: 12000 });

  assert.equal(options[0].type, "free");
  assert.equal(options[0].title, "Free Shipping");
  assert.equal(options[0].customerShippingPrice, 0);
  assert.equal(options[0].realShippoAmount, 750);
  assert.equal(options[0].shippoRateId, "rate-standard");
});

test("express shipping is always paid when available", () => {
  const options = buildShippingOptions({ rates: [standardRate, expressRate], subtotal: 12000 });
  const express = options.find((option) => option.type === "express");

  assert.ok(express);
  assert.equal(express.customerShippingPrice, 2199);
  assert.equal(express.realShippoAmount, 2199);
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

function createStripeWebhookRouter({ express, orderController }) {
  const router = express.Router();

  router.post("/stripe/webhook", express.raw({ type: "application/json" }), orderController.handleStripeWebhook);

  return router;
}

module.exports = { createStripeWebhookRouter };

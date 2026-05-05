const Stripe = require("stripe");

function createStripeService({ secretKey, webhookSecret, logger }) {
  const stripe = new Stripe(secretKey || "sk_test_placeholder");

  function verifyWebhook(rawBody, signature) {
    if (!webhookSecret) {
      throw new Error("Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET.");
    }

    if (!signature) {
      throw new Error("Stripe signature header is missing.");
    }

    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async function retrieveCheckoutSession(sessionId) {
    if (!secretKey) return null;

    try {
      return await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items", "customer"]
      });
    } catch (error) {
      logger?.warn("Could not retrieve Stripe checkout session.", { sessionId, message: error.message });
      return null;
    }
  }

  async function retrievePaymentIntent(paymentIntentId) {
    if (!secretKey) return null;

    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      logger?.warn("Could not retrieve Stripe payment intent.", { paymentIntentId, message: error.message });
      return null;
    }
  }

  async function retrieveCheckoutSessionByPaymentIntent(paymentIntentId) {
    if (!secretKey) return null;

    try {
      const list = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 1,
        expand: ["data.line_items", "data.customer"]
      });
      return list.data?.[0] || null;
    } catch (error) {
      logger?.warn("Could not find Stripe checkout session by payment intent.", { paymentIntentId, message: error.message });
      return null;
    }
  }

  return {
    retrieveCheckoutSessionByPaymentIntent,
    retrieveCheckoutSession,
    retrievePaymentIntent,
    verifyWebhook
  };
}

module.exports = { createStripeService };

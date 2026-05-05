function createAdminOrderRouter({ express, orderController }) {
  const router = express.Router();
  const jsonBody = express.json({ limit: "1mb" });

  router.get("/admin/orders", orderController.listAdminOrders);
  router.post("/admin/orders/:orderId/label", jsonBody, orderController.retryOrderLabel);
  router.patch("/admin/orders/:orderId/status", jsonBody, orderController.patchOrderStatus);

  return router;
}

module.exports = { createAdminOrderRouter };

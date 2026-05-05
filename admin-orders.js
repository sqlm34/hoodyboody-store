const ordersLocked = document.querySelector("#ordersLocked");
const ordersLockedText = document.querySelector("#ordersLockedText");
const ordersDashboard = document.querySelector("#ordersDashboard");
const ordersList = document.querySelector("#ordersList");
const ordersSummary = document.querySelector("#ordersSummary");
const ordersRefresh = document.querySelector("#ordersRefresh");

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

function formatMoney(cents) {
  return money.format((Number(cents) || 0) / 100);
}

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request error");
    error.status = response.status;
    throw error;
  }

  return data;
}

function showLocked(message) {
  ordersDashboard.hidden = true;
  ordersLocked.hidden = false;
  ordersLockedText.textContent = message;
}

function showDashboard() {
  ordersLocked.hidden = true;
  ordersDashboard.hidden = false;
}

function orderItemsText(order) {
  return (order.items || [])
    .map((item) => `${item.title || item.name || item.id || "Item"} x ${Math.max(1, Number(item.quantity) || 1)}`)
    .join(", ");
}

function getLabelBlock(order) {
  if (!order.labelUrl) {
    const retryButton =
      order.deliveryType === "shipping"
        ? `<button class="button ghost dark admin-order-action" data-action="retry-label" data-order-id="${order.id}" type="button">
            <i class="fa-solid fa-tag" aria-hidden="true"></i>
            <span>Create label</span>
          </button>`
        : "";

    return `
      <div class="admin-label-empty">
        <span>No Shippo label yet</span>
        ${order.shippingError ? `<small>${order.shippingError}</small>` : ""}
        ${retryButton}
      </div>
    `;
  }

  return `
    <div class="admin-label-tools">
      <a class="button ghost dark" href="${order.labelUrl}" target="_blank" rel="noreferrer">
        <i class="fa-regular fa-file-pdf" aria-hidden="true"></i>
        <span>PDF label</span>
      </a>
      <button class="button primary admin-order-action" data-action="print-label" data-label-url="${order.labelUrl}" type="button">
        <i class="fa-solid fa-print" aria-hidden="true"></i>
        <span>Print label</span>
      </button>
    </div>
    <iframe class="admin-label-preview" title="Shippo label preview" src="${order.labelUrl}"></iframe>
  `;
}

function renderOrders(orders) {
  ordersSummary.textContent = orders.length ? `${orders.length} paid order${orders.length === 1 ? "" : "s"}` : "No paid orders yet.";

  if (!orders.length) {
    ordersList.innerHTML = `<div class="checkout-panel admin-empty-state">No paid orders yet.</div>`;
    return;
  }

  ordersList.innerHTML = orders
    .map(
      (order) => `
        <article class="admin-order-card checkout-panel">
          <div class="admin-order-head">
            <div>
              <span class="admin-order-kicker">${formatDate(order.createdAt)}</span>
              <h2>${order.customer?.name || "Customer"}</h2>
              <p>${order.customer?.email || "No email"}${order.customer?.phone ? ` · ${order.customer.phone}` : ""}</p>
            </div>
            <select class="admin-order-status admin-order-action" data-action="status" data-order-id="${order.id}" aria-label="Order status">
              ${["paid", "processing", "shipped"]
                .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
          </div>

          <div class="admin-order-grid">
            <div>
              <span>Items</span>
              <strong>${orderItemsText(order) || "No items"}</strong>
            </div>
            <div>
              <span>Payment amount</span>
              <strong>${formatMoney(order.amount)}</strong>
            </div>
            <div>
              <span>Shipping amount</span>
              <strong>${formatMoney(order.shippingAmount)}</strong>
            </div>
            <div>
              <span>Order ID</span>
              <strong>${order.orderId}</strong>
            </div>
            <div>
              <span>Tracking ID</span>
              <strong>${order.internalTrackingId || "Pending"}</strong>
            </div>
            <div>
              <span>Shippo tracking</span>
              <strong>${order.shippoTrackingNumber || "Pending"}</strong>
            </div>
            <div>
              <span>Carrier</span>
              <strong>${[order.carrier, order.service].filter(Boolean).join(" · ") || "Pending"}</strong>
            </div>
          </div>

          <div class="admin-order-label">
            ${getLabelBlock(order)}
          </div>
        </article>
      `
    )
    .join("");
}

async function loadOrders() {
  ordersRefresh.disabled = true;

  try {
    const data = await api("/api/admin/orders");
    renderOrders(data.orders || []);
    showDashboard();
  } catch (error) {
    showLocked(error.message);
  } finally {
    ordersRefresh.disabled = false;
  }
}

async function handleOrderAction(event) {
  const target = event.target.closest(".admin-order-action");
  if (!target) return;
  if (target.dataset.action === "status" && event.type !== "change") return;
  if (target.dataset.action !== "status" && event.type !== "click") return;

  if (target.dataset.action === "print-label") {
    const url = target.dataset.labelUrl;
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) popup.addEventListener("load", () => popup.print(), { once: true });
    return;
  }

  if (target.dataset.action === "retry-label") {
    target.disabled = true;
    await api(`/api/admin/orders/${encodeURIComponent(target.dataset.orderId)}/label`, { method: "POST", body: "{}" });
    await loadOrders();
    return;
  }

  if (target.dataset.action === "status") {
    await api(`/api/admin/orders/${encodeURIComponent(target.dataset.orderId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: target.value })
    });
  }
}

ordersRefresh.addEventListener("click", loadOrders);
ordersList.addEventListener("click", handleOrderAction);
ordersList.addEventListener("change", handleOrderAction);
loadOrders();

const ordersLocked = document.querySelector("#ordersLocked");
const ordersLockedText = document.querySelector("#ordersLockedText");
const ordersDashboard = document.querySelector("#ordersDashboard");
const ordersList = document.querySelector("#ordersList");
const ordersSummary = document.querySelector("#ordersSummary");
const ordersRefresh = document.querySelector("#ordersRefresh");
const ordersDateFrom = document.querySelector("#ordersDateFrom");
const ordersDateTo = document.querySelector("#ordersDateTo");
const ordersDateClear = document.querySelector("#ordersDateClear");

let allOrders = [];

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

function dateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime();
}

function orderDateValue(order) {
  const date = new Date(order.createdAt || order.paidAt || 0).getTime();
  return Number.isFinite(date) ? date : 0;
}

function getFilteredOrders() {
  const from = dateBoundary(ordersDateFrom?.value || "");
  const to = dateBoundary(ordersDateTo?.value || "", true);

  return allOrders.filter((order) => {
    const orderDate = orderDateValue(order);
    if (from && orderDate < from) return false;
    if (to && orderDate > to) return false;
    return true;
  });
}

function hasDateFilter() {
  return Boolean(ordersDateFrom?.value || ordersDateTo?.value);
}

function getLabelBlock(order) {
  if (!order.labelUrl) {
    const retryButton =
      order.canBuyLabel
        ? `<button class="button primary admin-order-action" data-action="buy-label" data-order-id="${order.id}" type="button">
            <i class="fa-solid fa-tag" aria-hidden="true"></i>
            <span>Buy Label</span>
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
    <div class="admin-label-tools compact">
      <div class="admin-label-meta">
        <strong>Shipping label</strong>
        <small>${[order.carrier, order.service].filter(Boolean).join(" - ") || "Shippo label"}${order.shippoTrackingNumber ? ` - ${order.shippoTrackingNumber}` : ""}</small>
      </div>
      <div class="admin-label-actions" aria-label="Label actions">
        <button
          class="icon-button admin-label-icon print admin-order-action"
          data-action="print-label"
          data-label-url="${order.labelUrl}"
          type="button"
          aria-label="Open and print label"
          title="Open and print label"
        >
          <i class="fa-solid fa-print" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `;
}

function renderOrders(orders) {
  const filtered = hasDateFilter();
  const countText = `${orders.length} paid order${orders.length === 1 ? "" : "s"}`;
  ordersSummary.textContent = orders.length
    ? filtered
      ? `${countText} in selected dates`
      : countText
    : filtered
      ? "No paid orders for selected dates."
      : "No paid orders yet.";

  if (!orders.length) {
    ordersList.innerHTML = `<div class="checkout-panel admin-empty-state">${filtered ? "No paid orders for selected dates." : "No paid orders yet."}</div>`;
    return;
  }

  ordersList.innerHTML = orders
    .map(
      (order) => {
        const paidShippingClass = order.shippingPaidByCustomer ? " shipping-paid-by-customer" : "";
        return `
        <article class="admin-order-card checkout-panel">
          <div class="admin-order-head">
            <div>
              <span class="admin-order-kicker">${formatDate(order.createdAt)}</span>
              <h2>${order.customer?.name || "Customer"}</h2>
              <p>${order.customer?.email || "No email"}${order.customer?.phone ? ` · ${order.customer.phone}` : ""}</p>
            </div>
            <select class="admin-order-status admin-order-action" data-action="status" data-order-id="${order.id}" aria-label="Order status">
              ${["paid", "processing", "label_created", "shipped", "delivered", "cancelled", "refunded"]
                .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
          </div>

          <div class="admin-order-grid admin-shipping-payment-block${paidShippingClass}">
            <div>
              <span>Items</span>
              <strong>${orderItemsText(order) || "No items"}</strong>
            </div>
            <div>
              <span>Subtotal</span>
              <strong>${formatMoney(order.subtotal || 0)}</strong>
            </div>
            <div>
              <span>Payment amount</span>
              <strong>${formatMoney(order.amount)}</strong>
            </div>
            <div>
              <span>Customer shipping</span>
              <strong>${formatMoney(order.customerShippingPrice || order.shippingAmount || 0)}</strong>
            </div>
            <div>
              <span>Real Shippo cost</span>
              <strong>${formatMoney(order.realShippingCost || 0)}</strong>
            </div>
            <div>
              <span>Shipping discount</span>
              <strong>${formatMoney(order.shippingDiscount || 0)}</strong>
            </div>
            <div>
              <span>Label purchase</span>
              <strong>${order.labelPurchaseMode || "automatic"}</strong>
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
      `;
      }
    )
    .join("");
}

async function loadOrders() {
  ordersRefresh.disabled = true;

  try {
    const data = await api("/api/admin/orders");
    allOrders = data.orders || [];
    renderOrders(getFilteredOrders());
    showDashboard();
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/auth.html?next=/admin/orders";
      return;
    }
    showLocked(error.message);
  } finally {
    ordersRefresh.disabled = false;
  }
}

function handleDateFilterChange() {
  renderOrders(getFilteredOrders());
}

function clearDateFilter() {
  ordersDateFrom.value = "";
  ordersDateTo.value = "";
  renderOrders(allOrders);
}

async function handleOrderAction(event) {
  const target = event.target.closest(".admin-order-action");
  if (!target) return;
  if (target.dataset.action === "status" && event.type !== "change") return;
  if (target.dataset.action !== "status" && event.type !== "click") return;

  if (target.dataset.action === "print-label") {
    const url = target.dataset.labelUrl;
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      let printed = false;
      const printLabel = () => {
        if (printed || popup.closed) return;
        printed = true;
        popup.focus();
        popup.print();
      };
      popup.addEventListener("load", printLabel, { once: true });
      setTimeout(printLabel, 1200);
    }
    return;
  }

  if (target.dataset.action === "buy-label") {
    target.disabled = true;
    try {
      await api(`/api/admin/orders/${encodeURIComponent(target.dataset.orderId)}/label`, { method: "POST", body: "{}" });
      await loadOrders();
    } catch (error) {
      ordersSummary.textContent = error.message;
      target.disabled = false;
    }
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
ordersDateFrom?.addEventListener("change", handleDateFilterChange);
ordersDateTo?.addEventListener("change", handleDateFilterChange);
ordersDateClear?.addEventListener("click", clearDateFilter);
ordersList.addEventListener("click", handleOrderAction);
ordersList.addEventListener("change", handleOrderAction);
loadOrders();

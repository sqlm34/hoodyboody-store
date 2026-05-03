let products = window.NITKA_PRODUCTS || [];

const adminLocked = document.querySelector("#adminLocked");
const adminLockedText = document.querySelector("#adminLockedText");
const adminDashboard = document.querySelector("#adminDashboard");
const inventoryList = document.querySelector("#inventoryList");
const adminProductsCount = document.querySelector("#adminProductsCount");
const adminStockTotal = document.querySelector("#adminStockTotal");
const adminLowStock = document.querySelector("#adminLowStock");
const adminNote = document.querySelector("#adminNote");
const reloadInventory = document.querySelector("#reloadInventory");
const adminReviewsList = document.querySelector("#adminReviewsList");
const adminReviewsEmpty = document.querySelector("#adminReviewsEmpty");
const adminReviewsNote = document.querySelector("#adminReviewsNote");
const reloadReviews = document.querySelector("#reloadReviews");

let inventory = {};
let reviews = [];

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

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });

function getStock(productId) {
  return Number(inventory[productId]?.stock || 0);
}

function getStockStatus(stock) {
  if (stock <= 0) return { className: "out", text: "Out of stock" };
  if (stock <= 5) return { className: "low", text: "Low stock" };
  return { className: "in", text: "In stock" };
}

function renderStats() {
  const stocks = products.map((product) => getStock(product.id));
  adminProductsCount.textContent = products.length;
  adminStockTotal.textContent = stocks.reduce((sum, stock) => sum + stock, 0);
  adminLowStock.textContent = stocks.filter((stock) => stock <= 5).length;
}

function renderInventory() {
  renderStats();

  inventoryList.innerHTML = products
    .map((product) => {
      const stock = getStock(product.id);
      const status = getStockStatus(stock);
      const updatedAt = inventory[product.id]?.updatedAt
        ? new Date(inventory[product.id].updatedAt).toLocaleString("en-US")
        : "no data";

      return `
        <form class="inventory-row" data-product-id="${escapeHtml(product.id)}">
          <div class="inventory-product">
            <strong>${escapeHtml(product.title)}</strong>
            <span>${escapeHtml(product.badge)} · ${escapeHtml(product.id)}</span>
          </div>
          <div class="stock-pill ${status.className}">${status.text}</div>
          <label class="inventory-input">
            Stock
            <input type="number" name="stock" min="0" step="1" value="${stock}" />
          </label>
          <div class="inventory-actions">
            <button class="icon-button" type="button" data-adjust="-1" aria-label="Decrease stock">-</button>
            <button class="icon-button" type="button" data-adjust="1" aria-label="Increase stock">+</button>
            <button class="button primary" type="submit">Save</button>
          </div>
          <small>Updated: ${escapeHtml(updatedAt)}</small>
        </form>
      `;
    })
    .join("");
}

function getProductTitle(productId) {
  return products.find((product) => product.id === productId)?.title || productId;
}

function renderReviews() {
  adminReviewsEmpty.hidden = reviews.length > 0;
  adminReviewsList.innerHTML = reviews
    .map((review) => {
      const rating = Math.max(1, Math.min(5, Number(review.rating) || 1));
      const createdAt = review.createdAt ? new Date(review.createdAt).toLocaleString("ru-RU") : "";

      return `
        <article class="admin-review-card" data-review-id="${escapeHtml(review.id)}">
          <div>
            <strong>${escapeHtml(getProductTitle(review.productId))}</strong>
            <span>${"★".repeat(rating)}${"☆".repeat(5 - rating)}</span>
          </div>
          <p>${escapeHtml(review.text)}</p>
          <footer>
            <span>${escapeHtml(review.userName || "Client")} · ${escapeHtml(createdAt)}</span>
            <button class="button ghost dark" type="button" data-delete-review="${escapeHtml(review.id)}">Delete</button>
          </footer>
        </article>
      `;
    })
    .join("");
}

function showLocked(message) {
  adminDashboard.hidden = true;
  adminLocked.hidden = false;
  adminLockedText.textContent = message;
}

function showDashboard() {
  adminLocked.hidden = true;
  adminDashboard.hidden = false;
}

async function loadInventory() {
  adminNote.textContent = "";

  try {
    const data = await api("/api/admin/inventory");
    inventory = data.inventory || {};
    showDashboard();
    renderInventory();
    loadProducts();
    loadReviews();
  } catch (error) {
    showLocked(error.message);
  }
}

async function loadProducts() {
  try {
    const data = await api("/api/admin/products");
    products = data.products || [];
    renderStats();
    renderInventory();
  } catch (error) {
    adminNote.textContent = error.message;
    adminNote.classList.add("error");
  }
}

async function loadReviews() {
  adminReviewsNote.textContent = "";

  try {
    const data = await api("/api/admin/reviews");
    reviews = data.reviews || [];
    renderReviews();
  } catch (error) {
    adminReviewsNote.textContent = error.message;
    adminReviewsNote.classList.add("error");
  }
}

async function saveStock(productId, stock, noteElement) {
  const data = await api("/api/admin/inventory", {
    method: "PATCH",
    body: JSON.stringify({ productId, stock })
  });

  inventory[productId] = data.inventory;
  renderInventory();
  adminNote.textContent = "Stock saved.";
  adminNote.classList.remove("error");
  if (noteElement) noteElement.textContent = "";
}

inventoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-adjust]");
  if (!button) return;

  const row = button.closest("[data-product-id]");
  const input = row.querySelector('input[name="stock"]');
  const nextValue = Math.max(0, Number(input.value || 0) + Number(button.dataset.adjust));
  input.value = nextValue;
});

inventoryList.addEventListener("submit", (event) => {
  event.preventDefault();

  const row = event.target.closest("[data-product-id]");
  const productId = row.dataset.productId;
  const stock = Number(row.elements.stock.value);

  if (!Number.isInteger(stock) || stock < 0) {
    adminNote.textContent = "Stock must be an integer from 0.";
    adminNote.classList.add("error");
    return;
  }

  saveStock(productId, stock).catch((error) => {
    adminNote.textContent = error.message;
    adminNote.classList.add("error");
  });
});

reloadInventory.addEventListener("click", loadInventory);
reloadReviews.addEventListener("click", loadReviews);

adminReviewsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-review]");
  if (!button) return;

  const reviewId = button.dataset.deleteReview;
  if (!window.confirm("Delete this review?")) return;

  api("/api/admin/reviews", {
    method: "DELETE",
    body: JSON.stringify({ reviewId })
  })
    .then(() => {
      reviews = reviews.filter((review) => review.id !== reviewId);
      renderReviews();
      adminReviewsNote.textContent = "Review deleted.";
      adminReviewsNote.classList.remove("error");
    })
    .catch((error) => {
      adminReviewsNote.textContent = error.message;
      adminReviewsNote.classList.add("error");
    });
});

loadInventory();

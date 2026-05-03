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
const adminProductsList = document.querySelector("#adminProductsList");
const adminProductsNote = document.querySelector("#adminProductsNote");
const reloadProducts = document.querySelector("#reloadProducts");

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

function csv(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function galleryLabels(product) {
  return Array.isArray(product.gallery) ? product.gallery.map((item) => item.label).join(", ") : "";
}

function galleryFocus(product) {
  return Array.isArray(product.gallery) ? product.gallery.map((item) => item.focus).join(", ") : "";
}

function renderProductsEditor() {
  adminProductsList.innerHTML = products
    .map(
      (product) => `
        <form class="admin-product-form" data-product-id="${escapeHtml(product.id)}">
          <div class="admin-product-preview" style="--product-image: url('${escapeHtml(product.image || "assets/embroidered-collection.png")}'); --focus: ${escapeHtml(product.focus || "center")}"></div>
          <div class="admin-product-fields">
            <div class="admin-product-title">
              <strong>${escapeHtml(product.title)}</strong>
              <span>${escapeHtml(product.id)}</span>
            </div>
            <div class="form-grid">
              <label>
                Product name
                <input name="title" value="${escapeHtml(product.title)}" required />
              </label>
              <label>
                Price in cents
                <input name="price" type="number" min="0" step="1" value="${Number(product.price) || 0}" required />
              </label>
              <label>
                Category
                <select name="type">
                  <option value="outerwear" ${product.type === "outerwear" ? "selected" : ""}>Outerwear</option>
                  <option value="tops" ${product.type === "tops" ? "selected" : ""}>Tops</option>
                  <option value="accessories" ${product.type === "accessories" ? "selected" : ""}>Accessories</option>
                </select>
              </label>
              <label>
                Badge
                <input name="badge" value="${escapeHtml(product.badge || "")}" />
              </label>
              <label>
                Photo URL or path
                <input name="image" value="${escapeHtml(product.image || "")}" placeholder="assets/product-photo.jpg" />
              </label>
              <label>
                Photo focus
                <input name="focus" value="${escapeHtml(product.focus || "center")}" placeholder="50% 50%" />
              </label>
              <label>
                Sizes
                <input name="sizes" value="${escapeHtml(csv(product.sizes))}" placeholder="S, M, L" />
              </label>
              <label>
                Gallery labels
                <input name="galleryLabels" value="${escapeHtml(galleryLabels(product))}" placeholder="General view, Detail, Back" />
              </label>
              <label class="full-span">
                Gallery focus points
                <input name="galleryFocus" value="${escapeHtml(galleryFocus(product))}" placeholder="50% 50%, 40% 60%, 70% 30%" />
              </label>
              <label class="full-span">
                Card description
                <textarea name="description" rows="2" required>${escapeHtml(product.description || "")}</textarea>
              </label>
              <label class="full-span">
                Product page description
                <textarea name="longDescription" rows="3" required>${escapeHtml(product.longDescription || "")}</textarea>
              </label>
              <label>
                SEO title
                <input name="seoTitle" value="${escapeHtml(product.seoTitle || "")}" placeholder="${escapeHtml(product.title)} | HOODYBOODY" />
              </label>
              <label>
                SEO description
                <textarea name="seoDescription" rows="2" placeholder="Search engine description">${escapeHtml(product.seoDescription || "")}</textarea>
              </label>
            </div>
            <button class="button primary" type="submit">Save product</button>
          </div>
        </form>
      `
    )
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
  adminProductsNote.textContent = "";

  try {
    const data = await api("/api/admin/products");
    products = data.products || [];
    renderStats();
    renderInventory();
    renderProductsEditor();
  } catch (error) {
    adminProductsNote.textContent = error.message;
    adminProductsNote.classList.add("error");
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
reloadProducts.addEventListener("click", loadProducts);

adminProductsList.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = event.target.closest("[data-product-id]");
  const data = Object.fromEntries(new FormData(form));
  data.productId = form.dataset.productId;
  data.price = Number(data.price);

  api("/api/admin/products", {
    method: "PATCH",
    body: JSON.stringify(data)
  })
    .then((response) => {
      products = response.products || products;
      renderProductsEditor();
      renderInventory();
      adminProductsNote.textContent = "Product saved. SEO tags will update automatically.";
      adminProductsNote.classList.remove("error");
    })
    .catch((error) => {
      adminProductsNote.textContent = error.message;
      adminProductsNote.classList.add("error");
    });
});

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

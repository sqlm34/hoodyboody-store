let products = window.NITKA_PRODUCTS || [];

const adminProductsLocked = document.querySelector("#adminProductsLocked");
const adminProductsLockedText = document.querySelector("#adminProductsLockedText");
const adminProductsDashboard = document.querySelector("#adminProductsDashboard");
const adminProductsList = document.querySelector("#adminProductsList");
const adminProductsNote = document.querySelector("#adminProductsNote");
const reloadProducts = document.querySelector("#reloadProducts");

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

function csv(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function galleryLabels(product) {
  return Array.isArray(product.gallery) ? product.gallery.map((item) => item.label).join(", ") : "";
}

function galleryFocus(product) {
  return Array.isArray(product.gallery) ? product.gallery.map((item) => item.focus).join(", ") : "";
}

function showLocked(message) {
  adminProductsDashboard.hidden = true;
  adminProductsLocked.hidden = false;
  adminProductsLockedText.textContent = message;
}

function showDashboard() {
  adminProductsLocked.hidden = true;
  adminProductsDashboard.hidden = false;
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

async function loadProducts() {
  adminProductsNote.textContent = "";

  try {
    const data = await api("/api/admin/products");
    products = data.products || [];
    showDashboard();
    renderProductsEditor();
  } catch (error) {
    showLocked(error.message);
  }
}

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
      adminProductsNote.textContent = "Product saved. SEO tags will update automatically.";
      adminProductsNote.classList.remove("error");
    })
    .catch((error) => {
      adminProductsNote.textContent = error.message;
      adminProductsNote.classList.add("error");
    });
});

reloadProducts.addEventListener("click", loadProducts);

loadProducts();

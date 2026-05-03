let products = window.NITKA_PRODUCTS || [];
const maxUploadSourceBytes = 12 * 1024 * 1024;
const maxImageEdge = 1600;

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
              <div class="admin-photo-upload">
                <input name="image" type="hidden" value="${escapeHtml(product.image || "")}" />
                <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input hidden />
                <span>Фото товара</span>
                <div class="admin-photo-actions">
                  <button class="button ghost dark" type="button" data-upload-photo>Загрузить фото</button>
                  <small>${escapeHtml(product.imageName || "Фото ещё не загружено")}</small>
                </div>
              </div>
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Could not read this image.")));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not prepare this image.")));
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress this image."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.86
    );
  });
}

async function prepareProductImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  if (file.size > maxUploadSourceBytes) {
    throw new Error("Choose an image up to 12 MB.");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const scale = Math.min(1, maxImageEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas);
  const dataUrl = await readFileAsDataUrl(blob);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "product-photo";

  return {
    dataUrl,
    fileName: `${baseName}.jpg`
  };
}

async function uploadProductPhoto(form, file) {
  const productId = form.dataset.productId;
  const note = form.querySelector(".admin-photo-actions small");
  note.textContent = "Загрузка фото...";
  adminProductsNote.textContent = "";
  adminProductsNote.classList.remove("error");

  const prepared = await prepareProductImage(file);
  const response = await api("/api/admin/products/photo", {
    method: "POST",
    body: JSON.stringify({
      productId,
      fileName: prepared.fileName,
      dataUrl: prepared.dataUrl
    })
  });

  products = response.products || products;
  form.querySelector('input[name="image"]').value = response.product.image;
  form.querySelector(".admin-product-preview").style.setProperty("--product-image", `url('${response.product.image}')`);
  note.textContent = response.product.imageName || prepared.fileName;
  adminProductsNote.textContent = "Фото загружено и сохранено для этого товара.";
  adminProductsNote.classList.remove("error");
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

adminProductsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-upload-photo]");
  if (!button) return;

  const form = button.closest("[data-product-id]");
  form.querySelector("[data-photo-input]").click();
});

adminProductsList.addEventListener("change", (event) => {
  const input = event.target.closest("[data-photo-input]");
  if (!input || !input.files.length) return;

  const form = input.closest("[data-product-id]");
  uploadProductPhoto(form, input.files[0]).catch((error) => {
    adminProductsNote.textContent = error.message;
    adminProductsNote.classList.add("error");
    input.value = "";
  });
});

reloadProducts.addEventListener("click", loadProducts);

loadProducts();

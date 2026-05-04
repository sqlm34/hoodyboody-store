let products = window.NITKA_PRODUCTS || [];

const DEFAULT_IMAGE_URL = "assets/embroidered-collection.png";
const DEFAULT_SIZE_OPTIONS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "One size"];
const PHOTO_FOCUS_OPTIONS = [
  { label: "Top left", value: "20% 20%" },
  { label: "Top", value: "50% 20%" },
  { label: "Top right", value: "80% 20%" },
  { label: "Left", value: "20% 50%" },
  { label: "Center", value: "center" },
  { label: "Right", value: "80% 50%" },
  { label: "Bottom left", value: "20% 80%" },
  { label: "Bottom", value: "50% 80%" },
  { label: "Bottom right", value: "80% 80%" }
];
const maxUploadSourceBytes = 12 * 1024 * 1024;
const maxImageEdge = 1600;

const adminProductsLocked = document.querySelector("#adminProductsLocked");
const adminProductsLockedText = document.querySelector("#adminProductsLockedText");
const adminProductsDashboard = document.querySelector("#adminProductsDashboard");
const adminProductsList = document.querySelector("#adminProductsList");
const adminProductsNote = document.querySelector("#adminProductsNote");
const reloadProducts = document.querySelector("#reloadProducts");
const createProductCard = document.querySelector("#createProductCard");

let inventory = {};
let reviews = [];
let statusTimer = 0;
let selectedProductId = "";
let editorMode = "grid";

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

function setProductsStatus(message, isError = false, options = {}) {
  clearTimeout(statusTimer);
  adminProductsNote.textContent = message;
  adminProductsNote.classList.toggle("error", isError);
  adminProductsNote.classList.toggle("success", Boolean(message) && !isError);

  if (message && !options.persist) {
    statusTimer = setTimeout(() => {
      adminProductsNote.textContent = "";
      adminProductsNote.classList.remove("error", "success");
    }, 2600);
  }
}

function getSizeOptions(product) {
  return Array.from(new Set([...DEFAULT_SIZE_OPTIONS, ...(Array.isArray(product.sizes) ? product.sizes : [])]));
}

function normalizeFocus(value) {
  return String(value || "center").trim() || "center";
}

function getFocusOptions(product) {
  const currentFocus = normalizeFocus(product.focus);
  const hasCurrentFocus = PHOTO_FOCUS_OPTIONS.some((option) => option.value === currentFocus);
  return hasCurrentFocus ? PHOTO_FOCUS_OPTIONS : [{ label: "Current", value: currentFocus }, ...PHOTO_FOCUS_OPTIONS];
}

function getProductPhotos(product) {
  const gallery = Array.isArray(product.gallery) ? product.gallery : [];
  const photos = [];
  const seen = new Set();

  function addPhoto(image, label, focus) {
    const url = image || DEFAULT_IMAGE_URL;
    if (seen.has(url)) return;
    seen.add(url);
    photos.push({
      image: url,
      label: label || `Photo ${photos.length + 1}`,
      focus: focus || product.focus || "center",
      canDelete: url.startsWith("/api/product-images/"),
      isCover: url === product.image
    });
  }

  if (product.image) {
    addPhoto(product.image, product.imageName || "Cover photo", product.focus);
  }

  gallery
    .filter((item) => item?.image)
    .forEach((item) => {
      addPhoto(item.image, item.label, item.focus);
    });

  if (!photos.length) {
    addPhoto(DEFAULT_IMAGE_URL, "Default photo", product.focus);
  }

  return photos;
}

function getStock(productId) {
  return Number(inventory[productId]?.stock || 0);
}

function getStockStatus(stock) {
  if (stock <= 0) return { className: "out", text: "Out of stock" };
  if (stock <= 5) return { className: "low", text: "Low stock" };
  return { className: "in", text: "In stock" };
}

function getBlankProduct() {
  return {
    id: "",
    title: "New product card",
    type: "tops",
    badge: "new",
    description: "Short product description.",
    price: 0,
    sizes: ["S", "M", "L"],
    focus: "50% 50%",
    image: DEFAULT_IMAGE_URL,
    imageName: "",
    colors: [{ name: "Black", value: "#202326" }],
    longDescription: "Detailed product description.",
    gallery: [{ label: "General view", focus: "50% 50%", image: DEFAULT_IMAGE_URL }],
    seoTitle: "",
    seoDescription: ""
  };
}

function getProductReviews(productId) {
  return reviews.filter((review) => review.productId === productId);
}

function renderPhotoTiles(product) {
  return `
    <div class="admin-photo-grid" aria-label="Product photos">
      ${getProductPhotos(product)
        .map(
          (photo) => `
            <div class="admin-photo-tile ${photo.isCover ? "active" : ""}">
              <button
                class="admin-photo-cover"
                type="button"
                data-cover-photo="${escapeHtml(photo.image)}"
                title="Use as cover photo"
              >
                <span
                  class="admin-photo-thumb"
                  style="--product-image: url('${escapeHtml(photo.image)}'); --focus: ${escapeHtml(photo.focus)}"
                ></span>
                <small>${escapeHtml(photo.isCover ? "Cover" : photo.label)}</small>
              </button>
              ${
                photo.canDelete
                  ? `<button class="icon-button admin-photo-delete" type="button" data-delete-photo="${escapeHtml(photo.image)}" aria-label="Delete photo"><i class="fa-solid fa-trash"></i></button>`
                  : ""
              }
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSizePicker(product) {
  const selectedSizes = new Set(Array.isArray(product.sizes) ? product.sizes : []);

  return `
    <div class="admin-size-picker full-span" data-size-picker>
      <input type="hidden" name="sizes" value="${escapeHtml(csv(product.sizes))}" />
      <div>
        <span>Sizes shown on product cards</span>
        <small>Click a size to show or hide it.</small>
      </div>
      <div class="admin-size-options">
        ${getSizeOptions(product)
          .map(
            (size) => `
              <button
                class="admin-size-button ${selectedSizes.has(size) ? "active" : ""}"
                type="button"
                data-size-option="${escapeHtml(size)}"
                aria-pressed="${selectedSizes.has(size) ? "true" : "false"}"
              >
                ${escapeHtml(size)}
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderFocusPicker(product) {
  const selectedFocus = normalizeFocus(product.focus);

  return `
    <div class="admin-focus-picker full-span" data-focus-picker>
      <input type="hidden" name="focus" value="${escapeHtml(selectedFocus)}" />
      <div>
        <span>Photo focus</span>
        <small>Choose where the product image should stay centered.</small>
      </div>
      <div class="admin-focus-options">
        ${getFocusOptions(product)
          .map(
            (option) => `
              <button
                class="admin-focus-button ${option.value === selectedFocus ? "active" : ""}"
                type="button"
                data-focus-option="${escapeHtml(option.value)}"
                aria-pressed="${option.value === selectedFocus ? "true" : "false"}"
              >
                ${escapeHtml(option.label)}
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderStockEditor(product) {
  const stock = getStock(product.id);
  const status = getStockStatus(stock);
  const updatedAt = inventory[product.id]?.updatedAt
    ? new Date(inventory[product.id].updatedAt).toLocaleString("en-US")
    : "no data";
  const canSaveStock = Boolean(product.id);

  return `
    <section class="admin-product-stock full-span" data-stock-editor>
      <div class="admin-inline-head">
        <div>
          <strong>Product stock</strong>
          <small>Updated: ${escapeHtml(updatedAt)}</small>
        </div>
        <span class="stock-pill ${status.className}">${status.text}</span>
      </div>
      <div class="admin-stock-controls">
        <button class="icon-button" type="button" data-adjust-stock="-1" aria-label="Decrease stock">-</button>
        <input type="number" name="stock" min="0" step="1" value="${stock}" aria-label="Product stock" readonly />
        <button class="icon-button" type="button" data-adjust-stock="1" aria-label="Increase stock">+</button>
        <button class="button primary" type="button" data-save-stock ${canSaveStock ? "" : "disabled"}>Save stock</button>
      </div>
    </section>
  `;
}

function renderProductReviews(product) {
  const productReviews = getProductReviews(product.id);

  return `
    <section class="admin-product-reviews full-span">
      <div class="admin-inline-head">
        <div>
          <strong>Customer reviews</strong>
          <small>${productReviews.length ? `${productReviews.length} review${productReviews.length === 1 ? "" : "s"}` : "No reviews yet"}</small>
        </div>
      </div>
      ${
        productReviews.length
          ? `<div class="admin-review-grid">
              ${productReviews
                .map((review) => {
                  const rating = Math.max(1, Math.min(5, Number(review.rating) || 1));
                  const createdAt = review.createdAt ? new Date(review.createdAt).toLocaleString("en-US") : "";

                  return `
                    <article class="admin-review-card" data-review-id="${escapeHtml(review.id)}">
                      <div>
                        <strong>${escapeHtml(review.userName || "Client")}</strong>
                        <span>${rating}/5</span>
                      </div>
                      <p>${escapeHtml(review.text)}</p>
                      <footer>
                        <span>${escapeHtml(createdAt)}</span>
                        <button class="button ghost dark" type="button" data-delete-review="${escapeHtml(review.id)}">Delete</button>
                      </footer>
                    </article>
                  `;
                })
                .join("")}
            </div>`
          : `<div class="summary-empty admin-product-empty">No reviews for this product.</div>`
      }
    </section>
  `;
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

function renderProductGrid() {
  return `
    <div class="admin-product-picker" aria-label="Product cards">
      ${products
        .map((product) => {
          const stock = getStock(product.id);
          const status = getStockStatus(stock);

          return `
            <button
              class="admin-product-tile ${product.id === selectedProductId ? "active" : ""}"
              type="button"
              data-open-product="${escapeHtml(product.id)}"
            >
              <span
                class="admin-product-tile-photo"
                style="--product-image: url('${escapeHtml(product.image || DEFAULT_IMAGE_URL)}'); --focus: ${escapeHtml(product.focus || "center")}"
              >
                <span class="product-badge">${escapeHtml(product.badge || "product")}</span>
              </span>
              <span class="admin-product-tile-body">
                <strong>${escapeHtml(product.title)}</strong>
                <small>${escapeHtml(product.type || "product")} · ${escapeHtml(product.id)}</small>
                <span class="stock-pill ${status.className}">${status.text}</span>
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderProductForm(product, mode = "edit") {
  const isCreate = mode === "create";

  return `
    <form class="admin-product-form" data-product-id="${escapeHtml(product.id)}" data-editor-mode="${escapeHtml(mode)}">
      <div
        class="admin-product-preview"
        style="--product-image: url('${escapeHtml(product.image || DEFAULT_IMAGE_URL)}'); --focus: ${escapeHtml(product.focus || "center")}"
      ></div>
      <div class="admin-product-fields">
        <div class="admin-product-title">
          <strong>${escapeHtml(isCreate ? "Create new product card" : product.title)}</strong>
          <span>${escapeHtml(isCreate ? "New card" : product.id)}</span>
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
          <div class="admin-photo-upload full-span">
            <input name="image" type="hidden" value="${escapeHtml(product.image || "")}" />
            <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input multiple hidden />
            <div class="admin-photo-header">
              <span>Product photos</span>
              <small>${isCreate ? "Save the card first, then upload photos." : "Choose one or more JPG, PNG or WEBP photos."}</small>
            </div>
            ${renderPhotoTiles(product)}
            <div class="admin-photo-actions">
              <button class="button ghost dark" type="button" data-upload-photo ${isCreate ? "disabled" : ""}>Upload photos</button>
              <small>${escapeHtml(isCreate ? "Photos are available after saving." : product.imageName || "No uploaded photos yet")}</small>
            </div>
          </div>
          ${renderFocusPicker(product)}
          ${renderSizePicker(product)}
          ${renderStockEditor(product)}
          ${isCreate ? "" : renderProductReviews(product)}
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
        <div class="admin-editor-actions">
          <button class="button ghost dark" type="button" data-close-editor>Back to cards</button>
          <button class="button primary" type="submit">${isCreate ? "Create product" : "Save product"}</button>
        </div>
      </div>
    </form>
  `;
}

function getSelectedProduct() {
  if (editorMode === "create") return getBlankProduct();
  return products.find((product) => product.id === selectedProductId) || null;
}

function renderProductsEditor() {
  const selectedProduct = getSelectedProduct();

  adminProductsList.innerHTML =
    renderProductGrid() +
    (selectedProduct ? renderProductForm(selectedProduct, editorMode === "create" ? "create" : "edit") : "");
}

function renderLegacyProductsEditor() {
  adminProductsList.innerHTML = products
    .map(
      (product) => `
        <form class="admin-product-form" data-product-id="${escapeHtml(product.id)}">
          <div
            class="admin-product-preview"
            style="--product-image: url('${escapeHtml(product.image || DEFAULT_IMAGE_URL)}'); --focus: ${escapeHtml(product.focus || "center")}"
          ></div>
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
              <div class="admin-photo-upload full-span">
                <input name="image" type="hidden" value="${escapeHtml(product.image || "")}" />
                <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input multiple hidden />
                <div class="admin-photo-header">
                  <span>Product photos</span>
                  <small>Choose one or more JPG, PNG or WEBP photos.</small>
                </div>
                ${renderPhotoTiles(product)}
                <div class="admin-photo-actions">
                  <button class="button ghost dark" type="button" data-upload-photo>Upload photos</button>
                  <small>${escapeHtml(product.imageName || "No uploaded photos yet")}</small>
                </div>
              </div>
              ${renderFocusPicker(product)}
              ${renderSizePicker(product)}
              ${renderStockEditor(product)}
              ${renderProductReviews(product)}
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

async function uploadProductPhotos(form, files) {
  const productId = form.dataset.productId;
  const selectedFiles = Array.from(files || []);
  const note = form.querySelector(".admin-photo-actions small");
  const uploadButton = form.querySelector("[data-upload-photo]");
  let latestResponse = null;

  if (!selectedFiles.length) return;

  uploadButton.disabled = true;
  note.textContent = `Uploading ${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"}...`;

  for (const [index, file] of selectedFiles.entries()) {
    note.textContent = `Uploading ${index + 1} of ${selectedFiles.length}: ${file.name}`;
    const prepared = await prepareProductImage(file);
    latestResponse = await api("/api/admin/products/photo", {
      method: "POST",
      body: JSON.stringify({
        productId,
        fileName: prepared.fileName,
        dataUrl: prepared.dataUrl
      })
    });
    products = latestResponse.products || products;
  }

  uploadButton.disabled = false;
  products = latestResponse?.products || products;
  renderProductsEditor();
}

function updateSizePicker(picker) {
  const activeSizes = Array.from(picker.querySelectorAll(".admin-size-button.active")).map((button) => button.dataset.sizeOption);
  picker.querySelector('input[name="sizes"]').value = activeSizes.join(", ");
  return activeSizes;
}

async function loadEditorData(options = {}) {
  if (!options.silent) setProductsStatus("Refreshing owner data...");

  try {
    const [productsData, inventoryData, reviewsData] = await Promise.all([
      api("/api/admin/products"),
      api("/api/admin/inventory"),
      api("/api/admin/reviews")
    ]);

    products = productsData.products || [];
    inventory = inventoryData.inventory || {};
    reviews = reviewsData.reviews || [];
    showDashboard();
    renderProductsEditor();
    if (!options.silent) setProductsStatus("Owner product data refreshed successfully.");
  } catch (error) {
    showLocked(error.message);
  }
}

adminProductsList.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = event.target.closest("[data-product-id]");
  const submitButton = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  const isCreate = form.dataset.editorMode === "create";
  data.productId = form.dataset.productId;
  data.price = Number(data.price);

  if (!String(data.sizes || "").trim()) {
    setProductsStatus("Select at least one size before saving.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = isCreate ? "Creating..." : "Saving...";
  setProductsStatus(isCreate ? "Creating product card..." : "Saving product card...", false, { persist: true });

  api("/api/admin/products", {
    method: isCreate ? "POST" : "PATCH",
    body: JSON.stringify(data)
  })
    .then((response) => {
      products = response.products || products;
      if (response.inventory && response.product?.id) {
        inventory[response.product.id] = response.inventory;
      }
      selectedProductId = response.product?.id || data.productId || selectedProductId;
      editorMode = "edit";
      renderProductsEditor();
      setProductsStatus(isCreate ? "Product card created successfully." : "Product card saved successfully. SEO tags updated automatically.");
    })
    .catch((error) => {
      setProductsStatus(error.message, true);
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.textContent = isCreate ? "Create product" : "Save product";
    });
});

adminProductsList.addEventListener("click", (event) => {
  const openProductButton = event.target.closest("[data-open-product]");
  if (openProductButton) {
    selectedProductId = openProductButton.dataset.openProduct;
    editorMode = "edit";
    renderProductsEditor();
    adminProductsList.querySelector(".admin-product-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const closeEditorButton = event.target.closest("[data-close-editor]");
  if (closeEditorButton) {
    selectedProductId = "";
    editorMode = "grid";
    renderProductsEditor();
    return;
  }

  const uploadButton = event.target.closest("[data-upload-photo]");
  if (uploadButton) {
    const form = uploadButton.closest("[data-product-id]");
    form.querySelector(".admin-photo-actions small").textContent = "Choose photos from your computer.";
    form.querySelector("[data-photo-input]").click();
    return;
  }

  const sizeButton = event.target.closest("[data-size-option]");
  if (sizeButton) {
    const picker = sizeButton.closest("[data-size-picker]");
    const activeCount = picker.querySelectorAll(".admin-size-button.active").length;
    if (sizeButton.classList.contains("active") && activeCount === 1) {
      return;
    }

    sizeButton.classList.toggle("active");
    sizeButton.setAttribute("aria-pressed", sizeButton.classList.contains("active") ? "true" : "false");
    updateSizePicker(picker);
    sizeButton.closest("[data-size-picker]").querySelector("small").textContent = "Click Save product to save size changes.";
    return;
  }

  const focusButton = event.target.closest("[data-focus-option]");
  if (focusButton) {
    const picker = focusButton.closest("[data-focus-picker]");
    const form = focusButton.closest("[data-product-id]");
    const focus = focusButton.dataset.focusOption;

    picker.querySelector('input[name="focus"]').value = focus;
    picker.querySelectorAll(".admin-focus-button").forEach((button) => {
      const isActive = button === focusButton;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    form.querySelector(".admin-product-preview").style.setProperty("--focus", focus);
    form.querySelector(".admin-photo-tile.active .admin-photo-thumb")?.style.setProperty("--focus", focus);
    picker.querySelector("small").textContent = "Click Save product to save photo focus.";
    return;
  }

  const deletePhotoButton = event.target.closest("[data-delete-photo]");
  if (deletePhotoButton) {
    const form = deletePhotoButton.closest("[data-product-id]");
    const note = form.querySelector(".admin-photo-actions small");
    const productId = form.dataset.productId;
    const image = deletePhotoButton.dataset.deletePhoto;
    if (!window.confirm("Delete this photo?")) return;

    deletePhotoButton.disabled = true;
    note.textContent = "Deleting photo...";
    api("/api/admin/products/photo", {
      method: "DELETE",
      body: JSON.stringify({ productId, image })
    })
      .then((response) => {
        products = response.products || products;
        renderProductsEditor();
      })
      .catch((error) => {
        deletePhotoButton.disabled = false;
        note.textContent = error.message;
      });
    return;
  }

  const photoTile = event.target.closest("[data-cover-photo]");
  if (photoTile) {
    const form = photoTile.closest("[data-product-id]");
    const image = photoTile.dataset.coverPhoto;
    form.querySelector('input[name="image"]').value = image;
    form.querySelector(".admin-product-preview").style.setProperty("--product-image", `url('${image}')`);
    form.querySelectorAll(".admin-photo-tile").forEach((tile) => tile.classList.remove("active"));
    photoTile.closest(".admin-photo-tile").classList.add("active");
    form.querySelector(".admin-photo-actions small").textContent = "Click Save product to save cover photo.";
    return;
  }

  const stockButton = event.target.closest("[data-adjust-stock]");
  if (stockButton) {
    const editor = stockButton.closest("[data-stock-editor]");
    const input = editor.querySelector('input[name="stock"]');
    input.value = Math.max(0, Number(input.value || 0) + Number(stockButton.dataset.adjustStock));
    return;
  }

  const saveStockButton = event.target.closest("[data-save-stock]");
  if (saveStockButton) {
    const form = saveStockButton.closest("[data-product-id]");
    const productId = form.dataset.productId;
    const input = form.querySelector('[data-stock-editor] input[name="stock"]');
    const stock = Number(input.value);

    if (!Number.isInteger(stock) || stock < 0) {
      setProductsStatus("Stock must be an integer from 0.", true);
      return;
    }

    saveStockButton.disabled = true;
    setProductsStatus("Saving stock...", false, { persist: true });
    api("/api/admin/inventory", {
      method: "PATCH",
      body: JSON.stringify({ productId, stock })
    })
      .then((data) => {
        inventory[productId] = data.inventory;
        renderProductsEditor();
        setProductsStatus("Product stock saved successfully.");
      })
      .catch((error) => {
        setProductsStatus(error.message, true);
      })
      .finally(() => {
        saveStockButton.disabled = false;
      });
    return;
  }

  const deleteReviewButton = event.target.closest("[data-delete-review]");
  if (deleteReviewButton) {
    const reviewId = deleteReviewButton.dataset.deleteReview;
    if (!window.confirm("Delete this review?")) return;

    deleteReviewButton.disabled = true;
    api("/api/admin/reviews", {
      method: "DELETE",
      body: JSON.stringify({ reviewId })
    })
      .then(() => {
        reviews = reviews.filter((review) => review.id !== reviewId);
        renderProductsEditor();
      })
      .catch((error) => {
        deleteReviewButton.disabled = false;
        deleteReviewButton.textContent = error.message;
      });
  }
});

adminProductsList.addEventListener("change", (event) => {
  const input = event.target.closest("[data-photo-input]");
  if (!input || !input.files.length) return;

  const form = input.closest("[data-product-id]");
  uploadProductPhotos(form, input.files)
    .catch((error) => {
      const uploadButton = form.querySelector("[data-upload-photo]");
      const note = form.querySelector(".admin-photo-actions small");
      uploadButton.disabled = false;
      note.textContent = error.message;
    })
    .finally(() => {
      input.value = "";
    });
});

reloadProducts.addEventListener("click", () => loadEditorData());
createProductCard.addEventListener("click", () => {
  selectedProductId = "";
  editorMode = "create";
  renderProductsEditor();
  adminProductsList.querySelector(".admin-product-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

loadEditorData({ silent: true });

let products = window.NITKA_PRODUCTS || [];

const DEFAULT_IMAGE_URL = "assets/embroidered-collection.png";
const DEFAULT_SIZE_OPTIONS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "One size"];
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

function setProductsStatus(message, isError = false) {
  adminProductsNote.textContent = message;
  adminProductsNote.classList.toggle("error", isError);
  adminProductsNote.classList.toggle("success", Boolean(message) && !isError);
}

function getSizeOptions(product) {
  return Array.from(new Set([...DEFAULT_SIZE_OPTIONS, ...(Array.isArray(product.sizes) ? product.sizes : [])]));
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

function renderPhotoTiles(product) {
  return `
    <div class="admin-photo-grid" aria-label="Product photos">
      ${getProductPhotos(product)
        .map(
          (photo) => `
            <button
              class="admin-photo-tile ${photo.isCover ? "active" : ""}"
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
              <label>
                Photo focus
                <input name="focus" value="${escapeHtml(product.focus || "center")}" placeholder="50% 50%" />
              </label>
              ${renderSizePicker(product)}
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
  setProductsStatus("");

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
  setProductsStatus(`${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"} uploaded and saved.`);
}

function updateSizePicker(picker) {
  const activeSizes = Array.from(picker.querySelectorAll(".admin-size-button.active")).map((button) => button.dataset.sizeOption);
  picker.querySelector('input[name="sizes"]').value = activeSizes.join(", ");
  return activeSizes;
}

async function loadProducts(options = {}) {
  if (!options.silent) setProductsStatus("");

  try {
    const data = await api("/api/admin/products");
    products = data.products || [];
    showDashboard();
    renderProductsEditor();
    if (!options.silent) setProductsStatus("Product cards refreshed.");
  } catch (error) {
    showLocked(error.message);
  }
}

adminProductsList.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = event.target.closest("[data-product-id]");
  const submitButton = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  data.productId = form.dataset.productId;
  data.price = Number(data.price);

  if (!String(data.sizes || "").trim()) {
    setProductsStatus("Select at least one size before saving.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  setProductsStatus("");

  api("/api/admin/products", {
    method: "PATCH",
    body: JSON.stringify(data)
  })
    .then((response) => {
      products = response.products || products;
      renderProductsEditor();
      setProductsStatus("Product card saved successfully. SEO tags updated automatically.");
    })
    .catch((error) => {
      setProductsStatus(error.message, true);
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.textContent = "Save product";
    });
});

adminProductsList.addEventListener("click", (event) => {
  const uploadButton = event.target.closest("[data-upload-photo]");
  if (uploadButton) {
    uploadButton.closest("[data-product-id]").querySelector("[data-photo-input]").click();
    return;
  }

  const sizeButton = event.target.closest("[data-size-option]");
  if (sizeButton) {
    const picker = sizeButton.closest("[data-size-picker]");
    const activeCount = picker.querySelectorAll(".admin-size-button.active").length;
    if (sizeButton.classList.contains("active") && activeCount === 1) {
      setProductsStatus("At least one size must stay active.", true);
      return;
    }

    sizeButton.classList.toggle("active");
    sizeButton.setAttribute("aria-pressed", sizeButton.classList.contains("active") ? "true" : "false");
    updateSizePicker(picker);
    setProductsStatus("Size selection updated. Click Save product to save.");
    return;
  }

  const photoTile = event.target.closest("[data-cover-photo]");
  if (photoTile) {
    const form = photoTile.closest("[data-product-id]");
    const image = photoTile.dataset.coverPhoto;
    form.querySelector('input[name="image"]').value = image;
    form.querySelector(".admin-product-preview").style.setProperty("--product-image", `url('${image}')`);
    form.querySelectorAll(".admin-photo-tile").forEach((tile) => tile.classList.remove("active"));
    photoTile.classList.add("active");
    setProductsStatus("Cover photo selected. Click Save product to save.");
  }
});

adminProductsList.addEventListener("change", (event) => {
  const input = event.target.closest("[data-photo-input]");
  if (!input || !input.files.length) return;

  const form = input.closest("[data-product-id]");
  uploadProductPhotos(form, input.files)
    .catch((error) => {
      const uploadButton = form.querySelector("[data-upload-photo]");
      uploadButton.disabled = false;
      setProductsStatus(error.message, true);
    })
    .finally(() => {
      input.value = "";
    });
});

reloadProducts.addEventListener("click", () => loadProducts());

loadProducts({ silent: true });

let products = window.NITKA_PRODUCTS || [];

const CART_STORAGE_KEY = "nitka-cart";
const FREE_DELIVERY_THRESHOLD = 10000;
const FREE_DELIVERY_LABEL = "$100";

function loadStoredCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function persistCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
  } catch {
    return;
  }
}

const state = {
  filter: "all",
  cart: loadStoredCart(),
  reviewSummary: {},
  inventory: null,
  threadColor: "Pine",
  uploads: []
};

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

const formatPrice = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value / 100);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request error");
  }

  return data;
}

function getReviewWord(count) {
  return count === 1 ? "review" : "reviews";
}

function getProductRating(productId) {
  const summary = state.reviewSummary[productId] || { count: 0, average: 0 };
  const average = Number(summary.average || 0);
  const filledStars = Math.max(0, Math.min(5, Math.round(average)));

  return {
    average,
    count: Number(summary.count || 0),
    stars: `${"★".repeat(filledStars)}${"☆".repeat(5 - filledStars)}`
  };
}

function renderProductRating(productId) {
  const rating = getProductRating(productId);
  const label = rating.count
    ? `${rating.average.toFixed(1)} · ${rating.count} ${getReviewWord(rating.count)}`
    : `0 ${getReviewWord(0)}`;

  return `
    <div class="product-rating" aria-label="Rating ${label}">
      <span class="rating-stars" aria-hidden="true">${rating.stars}</span>
      <span>${label}</span>
    </div>
  `;
}

function getProductStock(productId) {
  if (!state.inventory) return null;
  return Number(state.inventory[productId]?.stock || 0);
}

function getStockLabel(stock) {
  if (stock === null) return "Checking availability";
  if (stock <= 0) return "Out of stock";
  if (stock <= 5) return `${stock} pcs. left`;
  return `${stock} pcs. in stock`;
}

function getStockClass(stock) {
  if (stock === null) return "loading";
  if (stock <= 0) return "out";
  if (stock <= 5) return "low";
  return "in";
}

function renderProductStock(productId) {
  const stock = getProductStock(productId);

  return `
    <div class="stock-pill ${getStockClass(stock)}">
      ${getStockLabel(stock)}
    </div>
  `;
}

function getProductUrl(productId) {
  return `product.html?id=${encodeURIComponent(productId)}`;
}

function getCartProductId(item) {
  if (item.productId) return item.productId;
  if (item.baseProductId) return item.baseProductId;
  if (products.some((product) => product.id === item.id)) return item.id;

  return products
    .map((product) => product.id)
    .sort((a, b) => b.length - a.length)
    .find((productId) => String(item.id || "").startsWith(`${productId}-`));
}

function getCartQuantityForProduct(productId) {
  return state.cart.reduce((sum, item) => {
    return getCartProductId(item) === productId ? sum + item.quantity : sum;
  }, 0);
}

async function loadReviewSummary() {
  try {
    const { summary } = await api("/api/reviews/summary");
    state.reviewSummary = summary || {};
    renderCatalog();
  } catch {
    state.reviewSummary = {};
  }
}

async function loadInventory() {
  try {
    const { inventory } = await api("/api/inventory");
    state.inventory = inventory || {};
    renderCatalog();
  } catch {
    state.inventory = {};
  }
}

async function loadProducts() {
  try {
    const data = await api("/api/products");
    products = Array.isArray(data.products) ? data.products : products;
  } catch {
    products = window.NITKA_PRODUCTS || products;
  }

  renderCatalog();
}

const catalogGrid = document.querySelector("#catalogGrid");
const filterButtons = document.querySelectorAll(".filter");
const cartDrawer = document.querySelector(".cart-drawer");
const cartItems = document.querySelector("#cartItems");
const cartEmpty = document.querySelector("#cartEmpty");
const cartTotal = document.querySelector("#cartTotal");
const cartCount = document.querySelector(".cart-count");
const cartDeliveryNotice = document.querySelector("#cartDeliveryNotice");
const checkoutLink = document.querySelector(".checkout-link");
const scrim = document.querySelector(".scrim");
const customFiles = document.querySelector("#customFiles");
const filePreview = document.querySelector("#filePreview");

function renderCatalog() {
  const visibleProducts =
    state.filter === "all"
      ? products
      : products.filter((product) => product.type === state.filter);

  catalogGrid.innerHTML = visibleProducts
    .map(
      (product) => `
        <article
          class="product-card"
          data-product-url="${getProductUrl(product.id)}"
          role="link"
          tabindex="0"
          aria-label="View details for ${escapeHtml(product.title)}"
        >
          <div class="product-image" style="--focus: ${product.focus}; --product-image: url('${escapeHtml(product.image || "assets/embroidered-collection.png")}')">
            <span class="product-badge">${escapeHtml(product.badge)}</span>
          </div>
          <div class="product-body">
            <div class="product-meta">
              <h3>${escapeHtml(product.title)}</h3>
              <span class="price">${formatPrice(product.price)}</span>
            </div>
            <p>${escapeHtml(product.description)}</p>
            ${renderProductRating(product.id)}
            ${renderProductStock(product.id)}
            <div class="size-row" aria-label="Sizes">
              ${product.sizes.map((size) => `<span class="size-pill">${escapeHtml(size)}</span>`).join("")}
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function addToCart(item) {
  const existing = state.cart.find((cartItem) => cartItem.id === item.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ ...item, quantity: 1 });
  }

  renderCart();
  openCart();
}

function updateQuantity(id, delta) {
  const item = state.cart.find((cartItem) => cartItem.id === id);
  if (!item) return;

  const productId = getCartProductId(item);
  const stock = productId ? getProductStock(productId) : null;
  if (delta > 0 && stock !== null && getCartQuantityForProduct(productId) >= stock) {
    return;
  }

  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((cartItem) => cartItem.id !== id);
  }

  renderCart();
}

function renderCart() {
  persistCart();

  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const remainingForFreeDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - total);

  cartCount.textContent = itemCount;
  cartTotal.textContent = formatPrice(total);
  cartEmpty.classList.toggle("visible", state.cart.length === 0);
  checkoutLink.setAttribute("aria-disabled", state.cart.length === 0 ? "true" : "false");
  cartDeliveryNotice.hidden = state.cart.length === 0;
  cartDeliveryNotice.classList.toggle("success", state.cart.length > 0 && remainingForFreeDelivery === 0);
  cartDeliveryNotice.textContent =
    remainingForFreeDelivery > 0
      ? `Add ${formatPrice(remainingForFreeDelivery)} more to get free delivery from ${FREE_DELIVERY_LABEL}.`
      : `Free delivery from ${FREE_DELIVERY_LABEL} is available for this order.`;

  cartItems.innerHTML = state.cart
    .map(
      (item) => `
        <div class="cart-item">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${formatPrice(item.price)}</span>
            ${item.description ? `<span class="cart-note">${escapeHtml(item.description)}</span>` : ""}
          </div>
          <div class="quantity" aria-label="Quantity">
            <button type="button" aria-label="Decrease quantity" data-qty="${item.id}" data-delta="-1">-</button>
            <strong>${item.quantity}</strong>
            <button
              type="button"
              aria-label="Increase quantity"
              data-qty="${item.id}"
              data-delta="1"
              ${(() => {
                const productId = getCartProductId(item);
                const stock = productId ? getProductStock(productId) : null;
                return stock !== null && getCartQuantityForProduct(productId) >= stock ? "disabled" : "";
              })()}
            >+</button>
          </div>
        </div>
      `
    )
    .join("");

}

function openCart() {
  document.body.classList.add("cart-open");
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  scrim.hidden = false;
}

function closeCart() {
  document.body.classList.remove("cart-open");
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  scrim.hidden = true;
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderCatalog();
  });
});

catalogGrid.addEventListener("click", (event) => {
  if (event.target.closest("a, button, input, textarea, select")) return;

  const card = event.target.closest(".product-card[data-product-url]");
  if (!card || !catalogGrid.contains(card)) return;

  window.location.href = card.dataset.productUrl;
});

catalogGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("a, button, input, textarea, select")) return;

  const card = event.target.closest(".product-card[data-product-url]");
  if (!card || !catalogGrid.contains(card)) return;

  event.preventDefault();
  window.location.href = card.dataset.productUrl;
});

cartItems.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-qty]");
  if (!quantityButton) return;

  updateQuantity(quantityButton.dataset.qty, Number(quantityButton.dataset.delta));
});

document.querySelector(".cart-toggle").addEventListener("click", openCart);
document.querySelector(".cart-close").addEventListener("click", closeCart);
scrim.addEventListener("click", closeCart);

document.querySelector(".add-more-link").addEventListener("click", () => {
  closeCart();
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth", block: "start" });
  history.pushState(null, "", "#catalog");
});

checkoutLink.addEventListener("click", (event) => {
  event.preventDefault();
  if (state.cart.length === 0) return;

  persistCart();
  window.location.href = "checkout.html";
});

document.querySelectorAll(".swatch").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.threadColor = button.dataset.color;
  });
});

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderFilePreview() {
  filePreview.innerHTML = state.uploads
    .map((upload) => {
      const thumb = upload.previewUrl
        ? `<img src="${upload.previewUrl}" alt="">`
        : escapeHtml(upload.extension);

      return `
        <div class="file-chip">
          <span class="file-thumb">${thumb}</span>
          <span>
            ${escapeHtml(upload.name)}
            <small>${formatFileSize(upload.size)}</small>
          </span>
        </div>
      `;
    })
    .join("");
}

customFiles.addEventListener("change", () => {
  state.uploads.forEach((upload) => {
    if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
  });

  state.uploads = Array.from(customFiles.files).map((file) => {
    const extension = file.name.includes(".") ? file.name.split(".").pop().slice(0, 4).toUpperCase() : "FILE";

    return {
      name: file.name,
      size: file.size,
      extension,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : ""
    };
  });

  renderFilePreview();
});

document.querySelector("#customAdd").addEventListener("click", () => {
  const base = document.querySelector("#baseSelect").value;
  const motif = document.querySelector("#motifInput").value.trim() || "signature motif";
  const fileSummary = state.uploads.length
    ? `, files: ${state.uploads.map((upload) => upload.name).join(", ")}`
    : "";

  addToCart({
    id: `custom-${Date.now()}`,
    title: `Custom: ${motif}`,
    description: `${base}, palette: ${state.threadColor}${fileSummary}`,
    price: 3500,
    sizes: ["custom"],
    type: "custom"
  });
});

document.querySelector(".order-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const phoneInput = event.currentTarget.elements.phone;

  if (!window.NITKA_PHONE.validate(phoneInput)) {
    phoneInput.reportValidity();
    document.querySelector(".form-note").textContent = phoneInput.validationMessage;
    document.querySelector(".form-note").classList.add("error");
    return;
  }

  event.currentTarget.reset();
  document.querySelector(".form-note").classList.remove("error");
  document.querySelector(".form-note").textContent = "Thank you! We will contact you to confirm your order details.";
});

loadProducts().then(() => {
  loadReviewSummary();
  loadInventory();
});
renderCart();

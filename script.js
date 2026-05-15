let products = window.NITKA_PRODUCTS || [];

const CART_STORAGE_KEY = "nitka-cart";
const DISCOUNT_THRESHOLD = 20000;
const DISCOUNT_LABEL = "10%";
const DISCOUNT_RATE = 0.1;
const DEFAULT_CATEGORIES = [
  {
    id: "outerwear",
    eyebrow: "outerwear",
    title: "Jackets",
    description: "Layered linen, bomber and denim pieces with embroidery that holds the whole look together.",
    image: "assets/embroidered-collection.png",
    focus: "38% 45%",
    background: "linear-gradient(135deg, #e9f0ea 0%, #f6eee1 100%)",
    sortOrder: 10
  },
  {
    id: "tops",
    eyebrow: "tops",
    title: "Tops",
    description: "Hoodies and shirts with clean stitched details for everyday wear and custom styling.",
    image: "assets/embroidered-collection.png",
    focus: "56% 35%",
    background: "linear-gradient(135deg, #edf1f7 0%, #f7f0eb 100%)",
    sortOrder: 20
  },
  {
    id: "accessories",
    eyebrow: "accessories",
    title: "Accessories",
    description: "Small embroidered pieces that finish the outfit without feeling loud.",
    image: "assets/embroidered-collection.png",
    focus: "44% 68%",
    background: "linear-gradient(135deg, #f4efe7 0%, #e8f2ef 100%)",
    sortOrder: 30
  }
];
let categoryDefinitions = [...DEFAULT_CATEGORIES];
let categoriesLoaded = false;
let CATEGORY_ORDER = categoryDefinitions.map((category) => category.id);
let CATEGORY_META = Object.fromEntries(
  categoryDefinitions.map((category) => [
    category.id,
    {
      eyebrow: category.eyebrow,
      title: category.title,
      copy: category.description,
      image: category.image,
      focus: category.focus,
      background: category.background
    }
  ])
);
const ALL_CATALOG_META = {
  eyebrow: "all pieces",
  title: "All catalog",
  copy: "Browse every embroidered piece from the current collection."
};
const CATEGORY_PAGES = {
  outerwear: "outerwear.html",
  tops: "tops.html",
  accessories: "accessories.html"
};
const PAGE_CATEGORY_TYPES = Object.fromEntries(
  Object.entries(CATEGORY_PAGES).map(([type, page]) => [page, type])
);
const pageParams = new URLSearchParams(window.location.search);
const categoryPageRoot = document.querySelector("[data-category-page]");
const isCategoryPage = Boolean(categoryPageRoot);
const pathPageName = window.location.pathname.split("/").pop() || "";
const pageCategoryType = categoryPageRoot?.dataset.categoryType || PAGE_CATEGORY_TYPES[pathPageName];
const requestedCategoryType = pageParams.get("type") || pageCategoryType;
const initialCatalogFilter = isCategoryPage && requestedCategoryType ? requestedCategoryType : "all";

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
  filter: initialCatalogFilter,
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

function applyCategories(nextCategories) {
  const normalized = Array.isArray(nextCategories)
    ? nextCategories
        .map((category) => ({
          id: String(category.id || "").trim(),
          eyebrow: String(category.eyebrow || category.title || "collection").trim(),
          title: String(category.title || category.id || "Category").trim(),
          description: String(category.description || category.copy || "").trim(),
          image: String(category.image || "").trim(),
          focus: String(category.focus || "center").trim(),
          background: String(category.background || "").trim(),
          sortOrder: Number(category.sortOrder) || 100
        }))
        .filter((category) => category.id && category.title)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    : [];

  categoryDefinitions = normalized;
  CATEGORY_ORDER = categoryDefinitions.map((category) => category.id);
  CATEGORY_META = Object.fromEntries(
    categoryDefinitions.map((category) => [
      category.id,
      {
        eyebrow: category.eyebrow,
        title: category.title,
        copy: category.description,
        image: category.image,
        focus: category.focus,
        background: category.background
      }
    ])
  );
}

async function loadCategories() {
  try {
    const data = await api("/api/categories");
    applyCategories(data.categories);
    categoriesLoaded = true;
  } catch {
    applyCategories(DEFAULT_CATEGORIES);
    categoriesLoaded = false;
  }

  renderCatalog();
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

function getProductUrl(productId, type = "") {
  const productParams = new URLSearchParams({ id: productId });
  const categoryType = type || (state.filter !== "all" ? state.filter : "");

  if (categoryType) {
    productParams.set("category", categoryType);
  }

  return `product.html?${productParams.toString()}`;
}

function getCategoryUrl(type) {
  return CATEGORY_PAGES[type] || `category.html?type=${encodeURIComponent(type)}`;
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
const catalogSections = document.querySelector("#catalogSections");
const catalogView = document.querySelector("#catalogView");
const catalogViewEyebrow = document.querySelector("#catalogViewEyebrow");
const catalogViewTitle = document.querySelector("#catalogViewTitle");
const catalogViewCopy = document.querySelector("#catalogViewCopy");
const catalogReset = document.querySelector("#catalogReset");
const categoryHero = document.querySelector("#categoryHero");
const categoryCatalogTitle = document.querySelector("#categoryCatalogTitle");
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
let catalogHeightFrame = 0;

function syncCatalogCardHeights() {
  if (!catalogGrid) return;

  if (catalogHeightFrame) {
    cancelAnimationFrame(catalogHeightFrame);
  }

  catalogHeightFrame = requestAnimationFrame(() => {
    catalogHeightFrame = 0;
    const cards = Array.from(catalogGrid.querySelectorAll(".product-card"));
    if (!cards.length) return;

    cards.forEach((card) => {
      card.style.height = "auto";
    });

    const tallestCard = cards.reduce(
      (height, card) =>
        Math.max(height, Math.ceil(card.getBoundingClientRect().height)),
      0
    );

    cards.forEach((card) => {
      card.style.height = `${tallestCard}px`;
    });
  });
}

function getCategoryMeta(type) {
  const fallbackTitle = String(type || "collection")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return CATEGORY_META[type] || {
    eyebrow: "collection",
    title: fallbackTitle,
    copy: "A focused edit from the current embroidered collection."
  };
}

function isKnownCategory(type) {
  return categoryDefinitions.some((category) => category.id === type);
}

function getCatalogTypes() {
  if (categoriesLoaded) {
    return categoryDefinitions.map((category) => category.id);
  }

  if (categoryDefinitions.length) {
    return categoryDefinitions.map((category) => category.id);
  }

  const typeSet = new Set(products.map((product) => product.type).filter(Boolean));
  return Array.from(typeSet).sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    }
    return a.localeCompare(b);
  });
}

function getCategoryProducts(type) {
  return products.filter((product) => product.type === type);
}

function getCategoryImage(type) {
  const metaImage = CATEGORY_META[type]?.image;
  if (metaImage) return metaImage;

  const product = getCategoryProducts(type)[0] || products[0] || {};
  return product.image || "assets/embroidered-collection.png";
}

function getCategoryFocus(type) {
  const metaFocus = CATEGORY_META[type]?.focus;
  if (metaFocus) return metaFocus;

  const product = getCategoryProducts(type)[0] || products[0] || {};
  return product.focus || "center";
}

function getCategoryBackground(type) {
  return CATEGORY_META[type]?.background || "linear-gradient(135deg, #f7f8f5 0%, #e4eee8 100%)";
}

function setCatalogFilter(filter, options = {}) {
  state.filter = filter;
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
  });
  renderCatalog();

  if (options.scroll && catalogView) {
    catalogView.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderCatalogSections() {
  if (!catalogSections) return;

  catalogSections.innerHTML = getCatalogTypes()
    .map((type, index) => {
      const meta = getCategoryMeta(type);
      const count = getCategoryProducts(type).length;
      const reverse = index % 2 === 1 ? " reverse" : "";

      return `
        <a
          class="catalog-section-card${reverse}"
          href="${getCategoryUrl(type)}"
          data-category="${escapeHtml(type)}"
          style="--category-image: url('${escapeHtml(getCategoryImage(type))}'); --focus: ${escapeHtml(getCategoryFocus(type))}; --category-bg: ${escapeHtml(getCategoryBackground(type))}"
        >
          <span class="catalog-section-photo" aria-hidden="true"></span>
          <span class="catalog-section-content">
            <span class="catalog-section-kicker">${escapeHtml(meta.eyebrow)} - ${count} ${count === 1 ? "piece" : "pieces"}</span>
            <span class="catalog-section-title">${escapeHtml(meta.title)}</span>
            <span class="catalog-section-copy">${escapeHtml(meta.copy)}</span>
            <span class="catalog-section-action">Open catalog</span>
          </span>
        </a>
      `;
    })
    .join("");
}

function updateCatalogViewHead(visibleCount) {
  if (!catalogViewTitle || !catalogViewCopy) return;

  const categoryMissing = categoriesLoaded && state.filter !== "all" && !isKnownCategory(state.filter);
  const meta = categoryMissing
    ? {
        eyebrow: "category removed",
        title: "Category unavailable",
        copy: "This category is no longer available on the site."
      }
    : state.filter === "all"
      ? ALL_CATALOG_META
      : getCategoryMeta(state.filter);
  if (catalogViewEyebrow) {
    catalogViewEyebrow.textContent = meta.eyebrow;
  }
  catalogViewTitle.textContent = meta.title;
  catalogViewCopy.textContent =
    state.filter === "all"
      ? `${meta.copy} ${visibleCount} pieces available now.`
      : `${meta.copy} ${visibleCount} ${visibleCount === 1 ? "piece" : "pieces"} in this category.`;
  if (catalogReset) {
    catalogReset.hidden = state.filter === "all";
  }
  if (categoryCatalogTitle) {
    categoryCatalogTitle.textContent = `${meta.title} products`;
  }
  if (isCategoryPage) {
    document.title = `${meta.title} | HOODYBOODY`;
    const descriptionTag = document.querySelector('meta[name="description"]') || document.head.appendChild(document.createElement("meta"));
    descriptionTag.setAttribute("name", "description");
    descriptionTag.setAttribute("content", meta.copy || `${meta.title} products from HOODYBOODY.`);
  }
}

function renderCategoryHero() {
  if (!categoryHero) return;

  const heroType = state.filter === "all" ? getCatalogTypes()[0] : state.filter;
  categoryHero.dataset.category = heroType || "collection";
  categoryHero.style.setProperty("--category-image", `url('${getCategoryImage(heroType)}')`);
  categoryHero.style.setProperty("--focus", getCategoryFocus(heroType));
  categoryHero.style.setProperty("--category-bg", getCategoryBackground(heroType));
}

function renderCatalog() {
  renderCatalogSections();
  if (!catalogGrid) return;

  const visibleProducts =
    categoriesLoaded && state.filter !== "all" && !isKnownCategory(state.filter)
      ? []
      : state.filter === "all"
      ? products
      : products.filter((product) => product.type === state.filter);

  updateCatalogViewHead(visibleProducts.length);
  renderCategoryHero();

  if (!visibleProducts.length) {
    catalogGrid.innerHTML = `
      <div class="catalog-empty">
        <h3>No products in this category yet</h3>
        <p>Choose another category or return to the main catalog sections.</p>
        <a class="button primary" href="index.html#catalog">All categories</a>
      </div>
    `;
    return;
  }

  catalogGrid.innerHTML = visibleProducts
    .map(
      (product) => `
        <article
          class="product-card"
          data-product-url="${getProductUrl(product.id, product.type)}"
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
            <div class="product-card-footer">
              ${renderProductRating(product.id)}
              ${renderProductStock(product.id)}
              <div class="size-row" aria-label="Sizes">
                ${product.sizes.map((size) => `<span class="size-pill">${escapeHtml(size)}</span>`).join("")}
              </div>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  syncCatalogCardHeights();
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

function getCartSubtotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getDiscountedUnitAmount(price, discountApplies) {
  const amount = Math.max(0, Math.round(Number(price) || 0));
  return discountApplies ? Math.max(1, Math.round(amount * (1 - DISCOUNT_RATE))) : amount;
}

function getCartDiscount(subtotal) {
  const discountApplies = subtotal >= DISCOUNT_THRESHOLD;
  if (!discountApplies) return 0;

  return state.cart.reduce((sum, item) => {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    return sum + Math.max(0, item.price - getDiscountedUnitAmount(item.price, discountApplies)) * quantity;
  }, 0);
}

function renderCart() {
  persistCart();

  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = getCartSubtotal();
  const discount = getCartDiscount(subtotal);
  const total = Math.max(0, subtotal - discount);
  const remainingForDiscount = Math.max(0, DISCOUNT_THRESHOLD - subtotal);

  cartCount.textContent = itemCount;
  cartTotal.textContent = formatPrice(total);
  cartEmpty.classList.toggle("visible", state.cart.length === 0);
  checkoutLink.setAttribute("aria-disabled", state.cart.length === 0 ? "true" : "false");
  cartDeliveryNotice.hidden = state.cart.length === 0;
  cartDeliveryNotice.classList.toggle("success", state.cart.length > 0 && remainingForDiscount === 0);
  cartDeliveryNotice.textContent =
    remainingForDiscount > 0
      ? `Add ${formatPrice(remainingForDiscount)} more to get ${DISCOUNT_LABEL} off your order.`
      : `${DISCOUNT_LABEL} discount applied. You saved ${formatPrice(discount)}.`;

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
            <button type="button" aria-label="Decrease quantity" data-qty="${item.id}" data-delta="-1">
              <i class="fa-solid fa-minus" aria-hidden="true"></i>
            </button>
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
            >
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
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
    setCatalogFilter(button.dataset.filter, { scroll: true });
  });
});

if (catalogReset) {
  catalogReset.addEventListener("click", () => {
    setCatalogFilter("all", { scroll: true });
  });
}

if (catalogGrid) {
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
}

window.addEventListener("resize", syncCatalogCardHeights);

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(syncCatalogCardHeights).catch(() => {});
}

if (cartItems) {
  cartItems.addEventListener("click", (event) => {
    const quantityButton = event.target.closest("[data-qty]");
    if (!quantityButton) return;

    updateQuantity(quantityButton.dataset.qty, Number(quantityButton.dataset.delta));
  });
}

document.querySelector(".cart-toggle")?.addEventListener("click", openCart);
document.querySelector(".cart-close")?.addEventListener("click", closeCart);
scrim?.addEventListener("click", closeCart);

document.querySelector(".add-more-link")?.addEventListener("click", () => {
  closeCart();
  const catalogTarget = document.querySelector("#categoryCatalog") || document.querySelector("#catalog");
  catalogTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (catalogTarget?.id) {
    history.pushState(null, "", `#${catalogTarget.id}`);
  }
});

checkoutLink?.addEventListener("click", (event) => {
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
  if (!filePreview) return;

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

customFiles?.addEventListener("change", () => {
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

document.querySelector("#customAdd")?.addEventListener("click", () => {
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

document.querySelector(".order-form")?.addEventListener("submit", (event) => {
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

Promise.all([loadCategories(), loadProducts()]).then(() => {
  loadReviewSummary();
  loadInventory();
});
renderCart();

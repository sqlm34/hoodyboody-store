const CART_STORAGE_KEY = "nitka-cart";
const IMAGE_URL = "assets/embroidered-collection.png";

const products = window.NITKA_PRODUCTS || [];
const params = new URLSearchParams(window.location.search);
const product = products.find((item) => item.id === params.get("id"));

const productContent = document.querySelector("#productContent");
const productNotFound = document.querySelector("#productNotFound");
const reviewsSection = document.querySelector("#reviewsSection");
const mainPhoto = document.querySelector("#mainPhoto");
const zoomHint = document.querySelector("#zoomHint");
const thumbnailRow = document.querySelector("#thumbnailRow");
const prevPhoto = document.querySelector("#prevPhoto");
const nextPhoto = document.querySelector("#nextPhoto");
const productBadge = document.querySelector("#productBadge");
const productTitle = document.querySelector("#productTitle");
const productDescription = document.querySelector("#productDescription");
const productPrice = document.querySelector("#productPrice");
const productStock = document.querySelector("#productStock");
const productSizeChoices = document.querySelector("#productSizeChoices");
const productColorChoices = document.querySelector("#productColorChoices");
const quantityMinus = document.querySelector("#quantityMinus");
const quantityPlus = document.querySelector("#quantityPlus");
const productQuantity = document.querySelector("#productQuantity");
const productAdd = document.querySelector("#productAdd");
const productNote = document.querySelector("#productNote");
const productCartLink = document.querySelector("#productCartLink");
const reviewsList = document.querySelector("#reviewsList");
const reviewsEmpty = document.querySelector("#reviewsEmpty");
const reviewForm = document.querySelector("#reviewForm");
const reviewAuthNote = document.querySelector("#reviewAuthNote");
const reviewNote = document.querySelector("#reviewNote");

productAdd.disabled = true;

let selectedPhoto = 0;
let selectedSize = "";
let selectedColor = null;
let isZoomed = false;
let currentUser = null;
let userHasReviewed = false;
let availableStock = null;
let selectedQuantity = 1;

const formatPrice = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value / 100);

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

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  updateCartLink();
}

function updateCartLink() {
  const count = loadCart().reduce((sum, item) => sum + item.quantity, 0);
  productCartLink.textContent = `Cart ${count}`;
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

function getRemainingStockForCart() {
  if (availableStock === null) return Infinity;
  return Math.max(0, availableStock);
}

function getCartQuantityForProduct(cart = loadCart()) {
  return cart.reduce((sum, item) => {
    const itemProductId = item.productId || (String(item.id || "").startsWith(`${product.id}-`) ? product.id : item.id);
    return itemProductId === product.id ? sum + item.quantity : sum;
  }, 0);
}

function getQuantityAvailableToAdd(cart = loadCart()) {
  if (availableStock === null) return Infinity;
  return Math.max(0, availableStock - getCartQuantityForProduct(cart));
}

function getMaxSelectableQuantity() {
  const remaining = getQuantityAvailableToAdd();
  return remaining === Infinity ? 99 : Math.max(1, remaining);
}

function setQuantity(value) {
  const remaining = getQuantityAvailableToAdd();
  const max = getMaxSelectableQuantity();
  selectedQuantity = remaining === 0 ? 1 : Math.max(1, Math.min(max, Math.floor(Number(value) || 1)));
  productQuantity.value = selectedQuantity;
  productQuantity.max = max;
  updateQuantityControls();
}

function updateQuantityControls() {
  const remaining = getQuantityAvailableToAdd();
  const max = getMaxSelectableQuantity();
  const isSoldOut = getRemainingStockForCart() === 0;
  const cannotAddMore = remaining === 0;

  productQuantity.disabled = isSoldOut || cannotAddMore;
  productQuantity.max = max;
  quantityMinus.disabled = isSoldOut || cannotAddMore || selectedQuantity <= 1;
  quantityPlus.disabled = isSoldOut || cannotAddMore || selectedQuantity >= max;
  productAdd.disabled = selectedQuantity < 1 || (availableStock !== null && (isSoldOut || cannotAddMore));
}

function clearQuantityForTyping() {
  if (productQuantity.disabled) return;
  productQuantity.value = "";
  selectedQuantity = 0;
  updateQuantityControls();
}

function handleQuantityInput() {
  if (productQuantity.value === "") {
    selectedQuantity = 0;
    updateQuantityControls();
    return;
  }

  setQuantity(productQuantity.value);
}

function finishQuantityInput() {
  if (productQuantity.value === "") {
    setQuantity(1);
    return;
  }

  setQuantity(productQuantity.value);
}

function renderStock() {
  productStock.textContent = getStockLabel(availableStock);
  productStock.className = `stock-pill product-stock ${getStockClass(availableStock)}`;
  setQuantity(selectedQuantity);
}

async function loadInventory() {
  try {
    const { inventory } = await api("/api/inventory");
    availableStock = Number(inventory?.[product.id]?.stock || 0);
  } catch {
    availableStock = null;
  }

  renderStock();
}

function renderPhoto() {
  const gallery = product.gallery || [{ label: "Photo", focus: product.focus }];
  const photo = gallery[selectedPhoto];
  isZoomed = false;
  mainPhoto.classList.remove("zoomed");
  mainPhoto.style.backgroundImage = `url("${IMAGE_URL}")`;
  mainPhoto.style.backgroundPosition = photo.focus;
  zoomHint.textContent = "Click to zoom";

  thumbnailRow.innerHTML = gallery
    .map(
      (item, index) => `
        <button class="thumbnail ${index === selectedPhoto ? "active" : ""}" type="button" data-photo="${index}">
          <span style="--focus: ${item.focus}"></span>
          ${escapeHtml(item.label)}
        </button>
      `
    )
    .join("");
}

function setPhoto(index) {
  const gallery = product.gallery || [];
  selectedPhoto = (index + gallery.length) % gallery.length;
  renderPhoto();
}

function renderChoices() {
  productSizeChoices.innerHTML = product.sizes
    .map(
      (size) => `
        <button class="choice-pill ${size === selectedSize ? "active" : ""}" type="button" data-size="${escapeHtml(size)}">
          ${escapeHtml(size)}
        </button>
      `
    )
    .join("");

  productColorChoices.innerHTML = product.colors
    .map(
      (color) => `
        <button
          class="color-choice ${color.name === selectedColor.name ? "active" : ""}"
          type="button"
          data-color="${escapeHtml(color.name)}"
          style="--choice-color: ${color.value}"
          aria-label="${escapeHtml(color.name)}"
        >
          <span></span>
          ${escapeHtml(color.name)}
        </button>
      `
    )
    .join("");
}

async function renderReviews() {
  try {
    const { reviews, userHasReviewed: hasReviewed } = await api(`/api/reviews?productId=${encodeURIComponent(product.id)}`);
    userHasReviewed = Boolean(hasReviewed);
    reviewsEmpty.hidden = reviews.length > 0;
    reviewsList.innerHTML = reviews
      .map(
        (review) => `
          <article class="review-card">
            <div>
              <strong>${escapeHtml(review.userName)}</strong>
              <span>${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span>
            </div>
            <p>${escapeHtml(review.text)}</p>
          </article>
        `
      )
      .join("");
  } catch {
    reviewNote.textContent = "Reviews are temporarily unavailable.";
    reviewNote.classList.add("error");
  }
}

function setReviewAccessState() {
  reviewForm.hidden = true;
  reviewAuthNote.hidden = false;

  if (!currentUser) {
    reviewAuthNote.innerHTML = `
      Only registered customers can leave reviews.
      <a href="auth.html">Sign in</a>
    `;
    return;
  }

  if (userHasReviewed) {
    reviewAuthNote.textContent = "You have already reviewed this product. You can leave reviews for other products separately.";
    return;
  }

  reviewForm.hidden = false;
  reviewAuthNote.hidden = true;
  reviewAuthNote.textContent = "";
}

async function updateReviewAccess() {
  try {
    const { user } = await api("/api/session");
    currentUser = user;
  } catch {
    currentUser = null;
  }

  setReviewAccessState();
}

async function refreshReviewsAndAccess() {
  await Promise.all([renderReviews(), updateReviewAccess()]);
  setReviewAccessState();
}

function addToCart() {
  const cart = loadCart();
  const remaining = getRemainingStockForCart();
  const availableToAdd = getQuantityAvailableToAdd(cart);

  if (selectedQuantity < 1) {
    productNote.textContent = "Enter quantity before adding to cart.";
    productNote.classList.add("error");
    return;
  }

  if (remaining === 0) {
    productNote.textContent = "This product is out of stock.";
    productNote.classList.add("error");
    return;
  }

  if (availableToAdd === 0) {
    productNote.textContent = `The cart already contains all ${availableStock} pcs. available for this product.`;
    productNote.classList.add("error");
    return;
  }

  if (availableToAdd !== Infinity && selectedQuantity > availableToAdd) {
    setQuantity(availableToAdd);
    productNote.textContent = `You can add ${availableToAdd} more pcs. for this product.`;
    productNote.classList.add("error");
    return;
  }

  const itemId = `${product.id}-${selectedSize}-${selectedColor.name}`;
  const existing = cart.find((item) => item.id === itemId);

  if (existing) {
    existing.quantity += selectedQuantity;
  } else {
    cart.push({
      ...product,
      id: itemId,
      productId: product.id,
      description: `Size: ${selectedSize}, color: ${selectedColor.name}`,
      sizes: [selectedSize],
      selectedColor: selectedColor.name,
      quantity: selectedQuantity
    });
  }

  saveCart(cart);
  selectedQuantity = 1;
  renderStock();
  productNote.textContent = "Product added to cart.";
  productNote.classList.remove("error");
}

function handleZoomMove(event) {
  if (!isZoomed) return;
  const rect = mainPhoto.getBoundingClientRect();
  const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
  mainPhoto.style.backgroundPosition = `${x}% ${y}%`;
}

function toggleZoom(event) {
  isZoomed = !isZoomed;
  mainPhoto.classList.toggle("zoomed", isZoomed);
  zoomHint.textContent = isZoomed ? "Move the cursor to inspect the detail" : "Click to zoom";
  if (isZoomed) handleZoomMove(event);
  if (!isZoomed) renderPhoto();
}

function renderProduct() {
  if (!product) {
    productNotFound.hidden = false;
    return;
  }

  document.title = `${product.title} | NITKA Atelier`;
  selectedSize = product.sizes[0];
  selectedColor = product.colors[0];
  productBadge.textContent = product.badge;
  productTitle.textContent = product.title;
  productDescription.textContent = product.longDescription;
  productPrice.textContent = formatPrice(product.price);
  productContent.hidden = false;
  reviewsSection.hidden = false;
  renderPhoto();
  renderChoices();
  loadInventory();
  refreshReviewsAndAccess();
  updateCartLink();
}

thumbnailRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-photo]");
  if (!button) return;
  setPhoto(Number(button.dataset.photo));
});

prevPhoto.addEventListener("click", () => setPhoto(selectedPhoto - 1));
nextPhoto.addEventListener("click", () => setPhoto(selectedPhoto + 1));
mainPhoto.addEventListener("click", toggleZoom);
mainPhoto.addEventListener("mousemove", handleZoomMove);
mainPhoto.addEventListener("mouseleave", () => {
  if (!isZoomed) return;
  const photo = product.gallery[selectedPhoto];
  mainPhoto.style.backgroundPosition = photo.focus;
});

productSizeChoices.addEventListener("click", (event) => {
  const button = event.target.closest("[data-size]");
  if (!button) return;
  selectedSize = button.dataset.size;
  renderChoices();
});

productColorChoices.addEventListener("click", (event) => {
  const button = event.target.closest("[data-color]");
  if (!button) return;
  selectedColor = product.colors.find((color) => color.name === button.dataset.color) || product.colors[0];
  renderChoices();
});

quantityMinus.addEventListener("click", () => setQuantity(selectedQuantity - 1));
quantityPlus.addEventListener("click", () => setQuantity(selectedQuantity + 1));
productQuantity.addEventListener("focus", clearQuantityForTyping);
productQuantity.addEventListener("input", handleQuantityInput);
productQuantity.addEventListener("change", finishQuantityInput);
productQuantity.addEventListener("blur", finishQuantityInput);

productAdd.addEventListener("click", addToCart);

reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(reviewForm));

  try {
    await api("/api/reviews", {
      method: "POST",
      body: JSON.stringify({
        productId: product.id,
        rating: Number(data.rating),
        text: data.text
      })
    });
    reviewForm.reset();
    userHasReviewed = true;
    setReviewAccessState();
    reviewNote.textContent = "Thank you! Review added.";
    reviewNote.classList.remove("error");
    await renderReviews();
    setReviewAccessState();
  } catch (error) {
    reviewNote.textContent = error.message;
    reviewNote.classList.add("error");
  }
});

renderProduct();

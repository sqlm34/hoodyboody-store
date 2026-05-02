const CART_STORAGE_KEY = "nitka-cart";
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

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

let cart = loadCart();
let currentUser = null;
let shippingRates = [];
let selectedShippingRate = null;
let shippingRateTimer = null;

const summaryItems = document.querySelector("#summaryItems");
const summaryEmpty = document.querySelector("#summaryEmpty");
const itemsTotal = document.querySelector("#itemsTotal");
const deliveryTotal = document.querySelector("#deliveryTotal");
const checkoutTotal = document.querySelector("#checkoutTotal");
const checkoutDeliveryNotice = document.querySelector("#checkoutDeliveryNotice");
const deliveryInputs = document.querySelectorAll('input[name="delivery"]');
const shippingRateSelect = document.querySelector("#shippingRateSelect");
const shippingRateNote = document.querySelector("#shippingRateNote");
const checkoutForm = document.querySelector("#checkoutForm");
const checkoutNote = document.querySelector(".checkout-note");
const submitButton = document.querySelector(".checkout-submit");
const originalSubmitText = submitButton.textContent;
const accountInline = document.querySelector(".account-inline");
const accountGuest = document.querySelector("#accountGuest");
const accountUser = document.querySelector("#accountUser");
const checkoutUserName = document.querySelector("#checkoutUserName");
const checkoutUserMeta = document.querySelector("#checkoutUserMeta");
const thankYouModal = document.querySelector("#thankYouModal");
const thanksClose = document.querySelector("#thanksClose");
const thanksOrderNumber = document.querySelector("#thanksOrderNumber");
const thanksOrderTotal = document.querySelector("#thanksOrderTotal");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }

  return data;
}

function getDeliveryType() {
  const selected = document.querySelector('input[name="delivery"]:checked');
  return selected?.value || "shipping";
}

function getDeliveryPrice() {
  if (getDeliveryType() === "pickup") return 0;
  return selectedShippingRate?.price || 0;
}

function getItemsTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function sanitizeField(input) {
  if (input.name === "zip") {
    input.value = input.value.replace(/\D/g, "").slice(0, 5);
  }

  if (input.name === "state") {
    input.value = input.value.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  }

  if (input.name === "name" || input.name === "city") {
    input.value = input.value.replace(/[^A-Za-z\s-]/g, "").replace(/\s{2,}/g, " ").slice(0, 60);
  }

  if (input.name === "apartment" || input.name === "entrance") {
    input.value = input.value.replace(/[^A-Za-z0-9\s/-]/g, "").slice(0, 20);
  }

  if (input.name === "address") {
    input.value = input.value.replace(/[<>]/g, "").slice(0, 120);
  }
}

function updateSubmitState() {
  const shippingReady = getDeliveryType() !== "shipping" || Boolean(selectedShippingRate);
  submitButton.disabled = !(cart.length > 0 && checkoutForm.checkValidity() && shippingReady);
}

function renderSummary() {
  const subtotal = getItemsTotal();
  const delivery = cart.length ? getDeliveryPrice() : 0;
  const total = subtotal + delivery;

  summaryEmpty.hidden = cart.length > 0;
  checkoutDeliveryNotice.hidden = cart.length === 0 || getDeliveryType() === "pickup";
  checkoutDeliveryNotice.classList.toggle("success", Boolean(selectedShippingRate));
  checkoutDeliveryNotice.textContent = selectedShippingRate
    ? `${selectedShippingRate.carrier} ${selectedShippingRate.service} added to the total.`
    : "Enter a US address to calculate shipping.";

  summaryItems.innerHTML = cart
    .map(
      (item) => `
        <div class="summary-item">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            ${item.description ? `<span>${escapeHtml(item.description)}</span>` : ""}
          </div>
          <div>
            <span>${item.quantity} pcs.</span>
            <strong>${formatPrice(item.price * item.quantity)}</strong>
          </div>
        </div>
      `
    )
    .join("");

  itemsTotal.textContent = formatPrice(subtotal);
  deliveryTotal.textContent = delivery ? formatPrice(delivery) : "Free";
  checkoutTotal.textContent = formatPrice(total);
  updateSubmitState();
}

function showGuestAccount() {
  accountInline.hidden = false;
  accountGuest.hidden = false;
  accountUser.hidden = true;
}

function showUserAccount(user) {
  accountInline.hidden = false;
  accountGuest.hidden = true;
  accountUser.hidden = false;
    checkoutUserName.textContent = user.name || "Client";
    checkoutUserMeta.textContent = `${user.email || ""}${user.phone ? ` · ${user.phone}` : ""}`;
}

function showThankYou(order) {
  thanksOrderNumber.textContent = order.number;
  thanksOrderTotal.textContent = formatPrice(order.totals?.total || 0);
  thankYouModal.hidden = false;
  document.body.classList.add("modal-open");
}

function renderShippingRates() {
  if (getDeliveryType() === "pickup") {
    selectedShippingRate = null;
    shippingRateSelect.disabled = true;
    shippingRateSelect.innerHTML = `<option value="">Pickup selected</option>`;
    shippingRateNote.textContent = "";
    renderSummary();
    return;
  }

  shippingRateSelect.disabled = shippingRates.length === 0;
  shippingRateSelect.innerHTML = shippingRates.length
    ? shippingRates
        .map((rate) => {
          const days = rate.deliveryDays ? `, ${rate.deliveryDays} days` : "";
          return `<option value="${escapeHtml(rate.id)}">${escapeHtml(rate.carrier)} ${escapeHtml(rate.service)} - ${formatPrice(rate.price)}${days}</option>`;
        })
        .join("")
    : `<option value="">Enter address to calculate shipping</option>`;

  if (shippingRates.length) {
    selectedShippingRate = shippingRates.find((rate) => rate.id === shippingRateSelect.value) || shippingRates[0];
    shippingRateSelect.value = selectedShippingRate.id;
    shippingRateNote.textContent = "Shipping calculated by Shippo.";
    shippingRateNote.classList.remove("error");
  } else {
    selectedShippingRate = null;
  }

  renderSummary();
}

function getShippingDestination() {
  return {
    name: checkoutForm.elements.name.value,
    phone: checkoutForm.elements.phone.value,
    email: checkoutForm.elements.email.value,
    city: checkoutForm.elements.city.value,
    state: checkoutForm.elements.state.value,
    zip: checkoutForm.elements.zip.value,
    address: checkoutForm.elements.address.value,
    apartment: checkoutForm.elements.apartment.value
  };
}

function hasShippingAddress() {
  const destination = getShippingDestination();
  return destination.address.length >= 5 && destination.city.length >= 2 && destination.state.length === 2 && destination.zip.length === 5;
}

async function calculateShippingRates() {
  if (getDeliveryType() !== "shipping" || !cart.length) {
    renderShippingRates();
    return;
  }

  if (!hasShippingAddress()) {
    shippingRates = [];
    selectedShippingRate = null;
    shippingRateNote.textContent = "Enter street, city, state, and ZIP to calculate shipping.";
    shippingRateNote.classList.remove("error");
    renderShippingRates();
    return;
  }

  shippingRateSelect.disabled = true;
  shippingRateNote.textContent = "Calculating shipping...";
  shippingRateNote.classList.remove("error");

  try {
    const data = await api("/api/shipping/rates", {
      method: "POST",
      body: JSON.stringify({
        items: cart,
        destination: getShippingDestination()
      })
    });
    shippingRates = data.rates || [];
    selectedShippingRate = shippingRates[0] || null;
    renderShippingRates();
  } catch (error) {
    shippingRates = [];
    selectedShippingRate = null;
    shippingRateNote.textContent = error.message;
    shippingRateNote.classList.add("error");
    renderShippingRates();
  }
}

function scheduleShippingRates() {
  clearTimeout(shippingRateTimer);
  shippingRateTimer = setTimeout(calculateShippingRates, 500);
}

function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
  cart = [];
  renderSummary();
}

function closeThankYou() {
  thankYouModal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function loadCustomer() {
  try {
    const { user } = await api("/api/session");
    if (!user) {
      currentUser = null;
      showGuestAccount();
      updateSubmitState();
      return;
    }

    const address = user.address || {};
    currentUser = user;
    showUserAccount(user);
    checkoutForm.elements.name.value = user.name || "";
    checkoutForm.elements.phone.value = user.phone || "";
    window.NITKA_PHONE.getInstance(checkoutForm.elements.phone)?.setNumber(user.phone || "");
    checkoutForm.elements.email.value = user.email || "";
    checkoutForm.elements.city.value = address.city || "";
    if (checkoutForm.elements.state) checkoutForm.elements.state.value = address.state || "";
    checkoutForm.elements.zip.value = String(address.zip || "").replace(/\D/g, "").slice(0, 5);
    checkoutForm.elements.address.value = address.address || "";
    checkoutForm.elements.apartment.value = address.apartment || "";
    checkoutForm.elements.entrance.value = address.entrance || "";
    calculateShippingRates();
    updateSubmitState();
  } catch {
    currentUser = null;
    showGuestAccount();
    calculateShippingRates();
    updateSubmitState();
  }
}

function getCheckoutPayload() {
  const formData = Object.fromEntries(new FormData(checkoutForm));
  const deliveryInput = document.querySelector('input[name="delivery"]:checked');
  const paymentInput = document.querySelector('input[name="payment"]:checked');
  const subtotal = getItemsTotal();
  const delivery = getDeliveryPrice();
  const total = subtotal + delivery;

  return {
    items: cart,
    customer: {
      name: formData.name,
      phone: window.NITKA_PHONE.getNumber(checkoutForm.elements.phone),
      email: formData.email
    },
    delivery: {
      type: deliveryInput.value,
      price: delivery,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
      address: formData.address,
      apartment: formData.apartment,
      entrance: formData.entrance,
      comment: formData.deliveryComment,
      carrier: selectedShippingRate?.carrier || "",
      service: selectedShippingRate?.service || "",
      deliveryDays: selectedShippingRate?.deliveryDays || null,
      shippoShipmentId: selectedShippingRate?.shipmentId || "",
      shippoRateId: selectedShippingRate?.id || ""
    },
    payment: {
      type: paymentInput.value,
      provider: "stripe"
    },
    totals: { subtotal, delivery, total }
  };
}

deliveryInputs.forEach((input) => {
  input.addEventListener("change", () => {
    calculateShippingRates();
  });
});

shippingRateSelect.addEventListener("change", () => {
  selectedShippingRate = shippingRates.find((rate) => rate.id === shippingRateSelect.value) || null;
  renderSummary();
});

checkoutForm.querySelectorAll("input, textarea").forEach((field) => {
  field.addEventListener("input", () => {
    sanitizeField(field);
    if (["address", "city", "state", "zip", "apartment", "name", "phone", "email"].includes(field.name)) {
      scheduleShippingRates();
    }
    updateSubmitState();
  });
  field.addEventListener("blur", () => {
    sanitizeField(field);
    if (["address", "city", "state", "zip", "apartment", "name", "phone", "email"].includes(field.name)) {
      scheduleShippingRates();
    }
    updateSubmitState();
  });
});

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  checkoutForm.querySelectorAll("input, textarea").forEach(sanitizeField);

  if (!cart.length) {
    checkoutNote.textContent = "Add items to cart before checkout.";
    checkoutNote.classList.add("error");
    updateSubmitState();
    return;
  }

  if (!checkoutForm.checkValidity()) {
    checkoutNote.textContent = "Fill in all required fields correctly.";
    checkoutNote.classList.add("error");
    checkoutForm.reportValidity();
    updateSubmitState();
    return;
  }

  if (!window.NITKA_PHONE.validate(checkoutForm.elements.phone)) {
    checkoutNote.textContent = checkoutForm.elements.phone.validationMessage;
    checkoutNote.classList.add("error");
    checkoutForm.elements.phone.reportValidity();
    updateSubmitState();
    return;
  }

  if (getDeliveryType() === "shipping" && !selectedShippingRate) {
    checkoutNote.textContent = "Select a shipping rate before checkout.";
    checkoutNote.classList.add("error");
    updateSubmitState();
    return;
  }

  checkoutNote.textContent = "";
  checkoutNote.classList.remove("error");
  submitButton.disabled = true;
  const payload = getCheckoutPayload();
  const usesStripe = payload.payment.type === "card";
  submitButton.textContent = usesStripe ? "Opening Stripe..." : "Creating order...";

  try {
    if (usesStripe) {
      const { url } = await api("/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!url) throw new Error("Stripe did not return payment link.");
      window.location.href = url;
      return;
    }

    const { order } = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    clearCart();
    checkoutNote.textContent = "Order created. We will contact you with payment details.";
    showThankYou(order);
    submitButton.textContent = originalSubmitText;
  } catch (error) {
    checkoutNote.classList.add("error");
    checkoutNote.textContent = error.message;
    submitButton.textContent = originalSubmitText;
    updateSubmitState();
  }
});

thanksClose.addEventListener("click", closeThankYou);
thankYouModal.addEventListener("click", (event) => {
  if (event.target === thankYouModal) closeThankYou();
});

renderSummary();
loadCustomer();
calculateShippingRates();

const stripeStatus = new URLSearchParams(window.location.search).get("stripe");
if (stripeStatus === "success") {
  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  if (sessionId) {
    checkoutNote.classList.remove("error");
    checkoutNote.textContent = "Payment received. Updating stock...";

    api("/api/stripe/complete", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    })
      .then(({ order }) => {
        clearCart();
        checkoutNote.textContent = "Stripe payment was successful. Thank you for your order!";
        if (order) showThankYou(order);
      })
      .catch((error) => {
        checkoutNote.classList.add("error");
        checkoutNote.textContent = error.message;
        updateSubmitState();
      });
  } else {
    clearCart();
    checkoutNote.classList.remove("error");
    checkoutNote.textContent = "Stripe payment was successful. Thank you for your order!";
  }
}

if (stripeStatus === "cancel") {
  checkoutNote.classList.add("error");
  checkoutNote.textContent = "Stripe payment was canceled. Check your data and try again.";
}

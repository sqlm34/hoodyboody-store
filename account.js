function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}

const formatPrice = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format((value || 0) / 100);

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

const profileForm = document.querySelector("#profileForm");
const profileNote = document.querySelector("#profileNote");
const ordersList = document.querySelector("#ordersList");
const ordersEmpty = document.querySelector("#ordersEmpty");
const accountWelcome = document.querySelector("#accountWelcome");
const editProfileButton = document.querySelector("#editProfileButton");
const saveProfileButton = document.querySelector("#saveProfileButton");
const editConfirm = document.querySelector("#editConfirm");
const confirmSaveIntent = document.querySelector("#confirmSaveIntent");
const cancelProfileChanges = document.querySelector("#cancelProfileChanges");

const editableInputs = Array.from(profileForm.querySelectorAll("input, select")).filter(
  (field) => field.name !== "email"
);
let originalProfile = null;
let isEditing = false;
let saveReady = false;

function getProfileValues() {
  return {
    name: profileForm.elements.name.value,
    phone: profileForm.elements.phone.value,
    email: profileForm.elements.email.value,
    city: profileForm.elements.city.value,
    state: profileForm.elements.state.value,
    zip: profileForm.elements.zip.value,
    address: profileForm.elements.address.value,
    apartment: profileForm.elements.apartment.value,
    entrance: profileForm.elements.entrance.value
  };
}

function restoreProfile(values) {
  Object.entries(values).forEach(([key, value]) => {
    if (profileForm.elements[key]) profileForm.elements[key].value = value;
  });
}

function hasProfileChanged() {
  const current = getProfileValues();
  return Object.keys(originalProfile || {}).some((key) => current[key] !== originalProfile[key]);
}

function setInputsLocked(isLocked) {
  editableInputs.forEach((input) => {
    input.disabled = isLocked;
  });
  profileForm.classList.toggle("is-editing", !isLocked);
}

function setViewMode(message = "") {
  isEditing = false;
  saveReady = false;
  setInputsLocked(true);
  editProfileButton.hidden = false;
  saveProfileButton.hidden = true;
  editConfirm.hidden = true;
  profileNote.textContent = message;
  profileNote.classList.remove("error");
}

function setEditMode() {
  originalProfile = getProfileValues();
  isEditing = true;
  saveReady = false;
  setInputsLocked(false);
  editProfileButton.hidden = true;
  saveProfileButton.hidden = true;
  editConfirm.hidden = true;
  profileNote.textContent = "Editing enabled. Change the necessary fields.";
  profileNote.classList.remove("error");
}

function fillProfile(user) {
  const address = user.address || {};
  profileForm.elements.name.value = user.name || "";
  profileForm.elements.phone.value = user.phone || "";
  window.NITKA_PHONE.getInstance(profileForm.elements.phone)?.setNumber(user.phone || "");
  profileForm.elements.email.value = user.email || "";
  profileForm.elements.city.value = address.city || "";
  profileForm.elements.state.value = address.state || "";
  profileForm.elements.zip.value = address.zip || "";
  profileForm.elements.address.value = address.address || "";
  profileForm.elements.apartment.value = address.apartment || "";
  profileForm.elements.entrance.value = address.entrance || "";
  accountWelcome.textContent = `${user.name}, contacts, delivery address and order history are stored here.`;
  originalProfile = getProfileValues();
}

function renderOrders(orders) {
  ordersEmpty.hidden = orders.length > 0;
  ordersList.innerHTML = orders
    .map((order) => {
      const total = order.totals?.total || 0;
      const date = new Date(order.createdAt).toLocaleDateString("en-US");
      const items = (order.items || []).map((item) => escapeHtml(item.title)).join(", ");
      const tracking = order.delivery?.tracking || {};
      const deliverySource = `${order.delivery?.shippingTitle || ""} ${order.delivery?.shippingType || ""} ${order.delivery?.shippingOptionType || ""}`;
      const deliveryLabel = /standard/i.test(deliverySource) ? "Standard AliExpress" : tracking.company || "being clarified";
      tracking.company = deliveryLabel;

      return `
        <article class="order-card">
          <div>
            <strong>${escapeHtml(order.number)}</strong>
            <span>${date} · ${escapeHtml(order.status)}</span>
          </div>
          <p>${items}</p>
          ${
            tracking.number
              ? `<p>Delivery: ${escapeHtml(tracking.company)} · track ${escapeHtml(tracking.number)}</p>`
              : `<p>Delivery: ${escapeHtml(tracking.company || "being clarified")}</p>`
          }
          <strong>${formatPrice(total)}</strong>
        </article>
      `;
    })
    .join("");
}

async function loadAccount() {
  try {
    const { user } = await api("/api/session");
    if (!user) {
      window.location.href = "auth.html";
      return;
    }

    const { orders } = await api("/api/orders");
    fillProfile(user);
    renderOrders(orders);
    setViewMode();
  } catch {
    window.location.href = "auth.html";
  }
}

editProfileButton.addEventListener("click", setEditMode);

profileForm.addEventListener("input", () => {
  if (!isEditing || saveReady) return;
  editConfirm.hidden = !hasProfileChanged();
  profileNote.textContent = "";
});

confirmSaveIntent.addEventListener("click", () => {
  saveReady = true;
  editConfirm.hidden = true;
  saveProfileButton.hidden = false;
  profileNote.textContent = "Check the data and click 'Save profile'.";
  profileNote.classList.remove("error");
});

cancelProfileChanges.addEventListener("click", () => {
  restoreProfile(originalProfile);
  setViewMode("Changes canceled. Data remained the same.");
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!saveReady) {
    profileNote.textContent = "First click 'Edit' and confirm that you want to save the changes.";
    profileNote.classList.add("error");
    return;
  }

  const data = Object.fromEntries(new FormData(profileForm));

  if (!window.NITKA_PHONE.validate(profileForm.elements.phone)) {
    profileNote.textContent = profileForm.elements.phone.validationMessage;
    profileNote.classList.add("error");
    profileForm.elements.phone.reportValidity();
    return;
  }

  data.phone = window.NITKA_PHONE.getNumber(profileForm.elements.phone);

  try {
    const { user } = await api("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(data)
    });
    fillProfile(user);
    setViewMode("Profile saved.");
  } catch (error) {
    profileNote.textContent = error.message;
    profileNote.classList.add("error");
  }
});

setInputsLocked(true);
loadAccount();

let products = window.NITKA_PRODUCTS || [];

const adminLocked = document.querySelector("#adminLocked");
const adminLockedText = document.querySelector("#adminLockedText");
const adminDashboard = document.querySelector("#adminDashboard");
const adminProductsCount = document.querySelector("#adminProductsCount");
const adminStockTotal = document.querySelector("#adminStockTotal");
const adminLowStock = document.querySelector("#adminLowStock");
const adminNote = document.querySelector("#adminNote");

let inventory = {};
let statusTimer = 0;

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

function setAdminStatus(message, isError = false) {
  clearTimeout(statusTimer);
  adminNote.textContent = message;
  adminNote.classList.toggle("error", isError);
  adminNote.classList.toggle("success", Boolean(message) && !isError);

  if (message) {
    statusTimer = setTimeout(() => {
      adminNote.textContent = "";
      adminNote.classList.remove("error", "success");
    }, 2600);
  }
}

function getStock(productId) {
  return Number(inventory[productId]?.stock || 0);
}

function renderStats() {
  const stocks = products.map((product) => getStock(product.id));
  adminProductsCount.textContent = products.length;
  adminStockTotal.textContent = stocks.reduce((sum, stock) => sum + stock, 0);
  adminLowStock.textContent = stocks.filter((stock) => stock <= 5).length;
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

async function loadDashboard() {
  setAdminStatus("");

  try {
    const [productsData, inventoryData] = await Promise.all([
      api("/api/admin/products"),
      api("/api/admin/inventory")
    ]);

    products = productsData.products || [];
    inventory = inventoryData.inventory || {};
    renderStats();
    showDashboard();
  } catch (error) {
    showLocked(error.message);
  }
}

loadDashboard();

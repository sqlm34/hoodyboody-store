async function getSessionUser() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) return null;
    const data = await response.json();
    return data.user || null;
  } catch {
    return null;
  }
}

async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } finally {
    window.location.href = window.location.pathname.includes("admin") ? "/auth.html" : "index.html";
  }
}

const PRODUCT_NAV_ITEMS = [
  { label: "Jackets", href: "jackets.html" },
  { label: "Tops", href: "embroidered-tops.html" },
  { label: "Hoodies", href: "embroidered-hoodies.html" },
  { label: "T-shirts", href: "embroidered-t-shirts.html" },
  { label: "Caps", href: "embroidered-caps.html" },
  { label: "Accessories", href: "embroidered-accessories.html" }
];

const LOCATION_NAV_ITEMS = [
  { label: "All locations", href: "locations.html" },
  { label: "Indiana", href: "indiana.html" },
  { label: "Indianapolis", href: "indianapolis.html" },
  { label: "Fort Wayne", href: "fort-wayne.html" },
  { label: "Evansville", href: "evansville.html" },
  { label: "South Bend", href: "south-bend.html" },
  { label: "Bloomington", href: "bloomington.html" }
];

function renderNavGroup(label, items) {
  return `
    <div class="nav-group">
      <button class="nav-group-button" type="button" aria-expanded="false">
        <span>${label}</span>
        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="nav-dropdown">
        ${items.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
      </div>
    </div>
  `;
}

function enhanceSiteNavigation() {
  const header = document.querySelector(".topbar");
  const nav = header?.querySelector(".nav-links");
  const brand = header?.querySelector(".brand");
  if (!header || !nav || !brand || header.dataset.siteMenuReady === "true" || window.location.pathname.includes("admin")) return;

  header.dataset.siteMenuReady = "true";
  nav.innerHTML = `
    <a href="index.html#catalog">Categories</a>
    ${renderNavGroup("Products", PRODUCT_NAV_ITEMS)}
    ${renderNavGroup("Locations", LOCATION_NAV_ITEMS)}
    <a href="index.html#custom">Embroidery</a>
    <a href="checkout.html">Checkout</a>
  `;

  const toggle = document.createElement("button");
  toggle.className = "site-menu-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
  brand.insertAdjacentElement("afterend", toggle);

  toggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("site-menu-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.innerHTML = `<i class="fa-solid ${isOpen ? "fa-xmark" : "fa-bars"}" aria-hidden="true"></i>`;
  });

  nav.addEventListener("click", (event) => {
    const button = event.target.closest(".nav-group-button");
    if (button) {
      const group = button.closest(".nav-group");
      const isOpen = group.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
      return;
    }

    if (event.target.closest("a")) {
      header.classList.remove("site-menu-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
    }
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) {
      header.querySelectorAll(".nav-group.open").forEach((group) => {
        group.classList.remove("open");
        group.querySelector(".nav-group-button")?.setAttribute("aria-expanded", "false");
      });
    }
  });
}

function decorateHeaderAction(element, iconClass, label) {
  if (!element || element.dataset.decorated === "true") return;

  element.dataset.decorated = "true";
  element.setAttribute("aria-label", label);
  element.setAttribute("title", label);
  element.innerHTML = `
    <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
    <span class="action-text">${label}</span>
  `;
}

async function initSessionNav() {
  const loginLinks = document.querySelectorAll(".login-link");
  const cabinetLinks = document.querySelectorAll(".cabinet-link");
  const adminLinks = document.querySelectorAll(".admin-link");
  const logoutButtons = document.querySelectorAll(".logout-button");
  if (!loginLinks.length && !cabinetLinks.length && !adminLinks.length && !logoutButtons.length) return;

  loginLinks.forEach((link) => decorateHeaderAction(link, "fa-right-to-bracket", "Login"));
  cabinetLinks.forEach((link) => decorateHeaderAction(link, "fa-user", "Cabinet"));
  adminLinks.forEach((link) => decorateHeaderAction(link, "fa-user-shield", "Owner"));
  logoutButtons.forEach((button) => decorateHeaderAction(button, "fa-right-from-bracket", "Logout"));

  const user = await getSessionUser();

  loginLinks.forEach((link) => {
    link.hidden = Boolean(user);
  });

  cabinetLinks.forEach((link) => {
    link.hidden = !user;
  });

  adminLinks.forEach((link) => {
    link.hidden = user?.role !== "admin";
  });

  logoutButtons.forEach((button) => {
    button.hidden = !user;
    button.addEventListener("click", logout);
  });
}

initSessionNav();
enhanceSiteNavigation();

function loadLiveChatWidget() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("admin")) return;
  if (document.querySelector('script[src$="live-chat.js"]')) return;

  const script = document.createElement("script");
  script.src = "live-chat.js";
  script.defer = true;
  document.body.appendChild(script);
}

loadLiveChatWidget();

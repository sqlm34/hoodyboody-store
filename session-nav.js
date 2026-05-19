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
  { label: "Hoodies", href: "/embroidered-hoodies/" },
  { label: "T-shirts", href: "/embroidered-tshirts/" },
  { label: "Sweatshirts", href: "/embroidered-sweatshirts/" },
  { label: "Hats", href: "/embroidered-hats/" },
  { label: "Tote bags", href: "/embroidered-tote-bags/" },
  { label: "Jackets", href: "/embroidered-jackets/" }
];

function renderNavItem(item) {
  if (!item.children?.length) return `<a href="${item.href}">${item.label}</a>`;

  return `
    <div class="nav-subgroup">
      <button class="nav-subgroup-button" type="button" aria-expanded="false">
        <span>${item.label}</span>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
      <div class="nav-submenu">
        <a href="${item.href}">${item.label} state</a>
        ${item.children.map((child) => `<a href="${child.href}">${child.label}</a>`).join("")}
      </div>
    </div>
  `;
}

function renderNavGroup(label, items) {
  return `
    <div class="nav-group">
      <button class="nav-group-button" type="button" aria-expanded="false">
        <span>${label}</span>
        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="nav-dropdown">
        ${items.map(renderNavItem).join("")}
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
    <a href="/">Home</a>
    ${renderNavGroup("Shop", PRODUCT_NAV_ITEMS)}
    <a href="/locations/">Locations</a>
    <a href="/#custom">Embroidery</a>
    <a href="/checkout.html">Checkout</a>
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
    const subgroupButton = event.target.closest(".nav-subgroup-button");
    if (subgroupButton) {
      const subgroup = subgroupButton.closest(".nav-subgroup");
      const isOpen = subgroup.classList.toggle("open");
      subgroupButton.setAttribute("aria-expanded", String(isOpen));
      return;
    }

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
      header.querySelectorAll(".nav-subgroup.open").forEach((subgroup) => {
        subgroup.classList.remove("open");
        subgroup.querySelector(".nav-subgroup-button")?.setAttribute("aria-expanded", "false");
      });
    }
  });
}

function enhanceSiteFooter() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("admin") || document.querySelector(".site-footer")) return;

  const main = document.querySelector("main");
  if (!main) return;

  main.insertAdjacentHTML(
    "afterend",
    `
      <footer class="site-footer" data-footer-ready="true">
        <div class="site-footer-inner">
          <div class="site-footer-brand">
            <a class="brand footer-brand" href="/" aria-label="HOODYBOODY"><span>HOODYBOODY</span></a>
            <p>Premium embroidery for clean wardrobe pieces, custom logo apparel and small batch orders.</p>
          </div>
          <nav class="footer-links" aria-label="Product pages">
            <strong>Products</strong>
            <a href="/embroidered-hoodies/">Embroidered hoodies</a>
            <a href="/embroidered-tshirts/">Embroidered T-shirts</a>
            <a href="/embroidered-hats/">Embroidered hats</a>
            <a href="/embroidered-tote-bags/">Embroidered tote bags</a>
          </nav>
          <nav class="footer-links" aria-label="Service areas">
            <strong>Service areas</strong>
            <a href="/locations/indiana/indianapolis/">Indianapolis</a>
            <a href="/locations/indiana/fort-wayne/">Fort Wayne</a>
            <a href="/locations/indiana/bloomington/">Bloomington</a>
            <a href="/locations/indiana/south-bend/">South Bend</a>
            <a href="/locations/illinois/chicago/">Chicago</a>
          </nav>
          <nav class="footer-links" aria-label="Custom embroidery">
            <strong>Custom</strong>
            <a href="/#custom">Upload logo or design</a>
            <a href="/#custom">Business embroidery</a>
            <a href="/checkout.html">Checkout</a>
          </nav>
        </div>
      </footer>
    `
  );
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
enhanceSiteFooter();

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

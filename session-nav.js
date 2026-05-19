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

const GEO_FALLBACK = {
  stateName: "Indiana",
  stateCode: "IN",
  stateSlug: "indiana",
  locationsUrl: "/locations/indiana/",
  cities: [
    { cityName: "Indianapolis", url: "/locations/indiana/indianapolis/" },
    { cityName: "Fort Wayne", url: "/locations/indiana/fort-wayne/" },
    { cityName: "Bloomington", url: "/locations/indiana/bloomington/" },
    { cityName: "South Bend", url: "/locations/indiana/south-bend/" },
    { cityName: "Evansville", url: "/locations/indiana/evansville/" }
  ]
};
let geoTargetPromise = null;

const escapeNavHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });

function normalizeGeoTarget(data) {
  const stateName = String(data?.stateName || GEO_FALLBACK.stateName).trim() || GEO_FALLBACK.stateName;
  const locationsUrl = String(data?.locationsUrl || GEO_FALLBACK.locationsUrl).trim() || GEO_FALLBACK.locationsUrl;
  const cities = Array.isArray(data?.cities) && data.cities.length ? data.cities : GEO_FALLBACK.cities;
  return {
    ...GEO_FALLBACK,
    ...data,
    stateName,
    locationsUrl,
    cities: cities.map((city) => ({
      cityName: String(city.cityName || "").trim(),
      url: String(city.url || "").trim()
    })).filter((city) => city.cityName && city.url)
  };
}

function getGeoTargetApiUrl() {
  const params = new URLSearchParams();
  const pathState = window.location.pathname.match(/^\/locations\/([^/]+)/)?.[1] || "";
  const queryState = new URLSearchParams(window.location.search).get("state") || "";
  const state = pathState || queryState;
  if (state) params.set("state", state);
  return params.toString() ? `/api/geo-target?${params.toString()}` : "/api/geo-target";
}

function getGeoTarget() {
  if (!geoTargetPromise) {
    geoTargetPromise = fetch(getGeoTargetApiUrl(), { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : GEO_FALLBACK))
      .then(normalizeGeoTarget)
      .catch(() => GEO_FALLBACK);
  }
  return geoTargetPromise;
}

function renderGeoCityChips(geoTarget, limit = 5) {
  return geoTarget.cities
    .slice(0, limit)
    .map((city) => `<a class="location-chip" href="${escapeNavHtml(city.url)}">${escapeNavHtml(city.cityName)}</a>`)
    .join("");
}

function renderGeoFooterLinks(geoTarget) {
  return `
    <strong>${escapeNavHtml(geoTarget.stateName)} service areas</strong>
    ${geoTarget.cities.slice(0, 5).map((city) => `<a href="${escapeNavHtml(city.url)}">${escapeNavHtml(city.cityName)}</a>`).join("")}
    <a href="${escapeNavHtml(geoTarget.locationsUrl)}">All ${escapeNavHtml(geoTarget.stateName)} areas</a>
  `;
}

function applyGeoTarget(geoTarget) {
  document.querySelectorAll(".geo-location-link").forEach((link) => {
    link.setAttribute("href", geoTarget.locationsUrl);
    link.textContent = geoTarget.stateName;
  });

  document.querySelectorAll("[data-geo-city-row]").forEach((row) => {
    row.innerHTML = renderGeoCityChips(geoTarget);
  });

  document.querySelectorAll("[data-geo-footer-links]").forEach((nav) => {
    nav.innerHTML = renderGeoFooterLinks(geoTarget);
  });
}

function hydrateGeoTarget() {
  getGeoTarget().then(applyGeoTarget);
}

function enhanceSiteNavigation() {
  const header = document.querySelector(".topbar");
  const nav = header?.querySelector(".nav-links");
  const brand = header?.querySelector(".brand");
  if (!header || !nav || !brand || header.dataset.siteMenuReady === "true" || window.location.pathname.includes("admin")) return;

  header.dataset.siteMenuReady = "true";
  nav.innerHTML = `
    <a href="/#catalog">Shop</a>
    <a href="/#custom">Embroidery</a>
    <a class="geo-location-link" href="${GEO_FALLBACK.locationsUrl}">${GEO_FALLBACK.stateName}</a>
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
          <nav class="footer-links" aria-label="Service areas" data-geo-footer-links>${renderGeoFooterLinks(GEO_FALLBACK)}</nav>
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
hydrateGeoTarget();

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

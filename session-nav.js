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

function initSitePreloader() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("admin") || path.includes("owner") || document.querySelector("[data-site-preloader]")) return;

  const preloader = document.createElement("div");
  preloader.className = "site-preloader";
  preloader.dataset.sitePreloader = "true";
  preloader.setAttribute("aria-live", "polite");
  preloader.innerHTML = `
    <div class="site-preloader-logo" aria-label="HOODYBOODY">
      <span class="site-preloader-mark">HB</span>
      <span class="site-preloader-word">HOODYBOODY</span>
    </div>
    <div class="site-preloader-percent" data-preloader-percent>0%</div>
  `;

  document.body.classList.add("preloader-active");
  document.body.appendChild(preloader);

  const percent = preloader.querySelector("[data-preloader-percent]");
  const durationMs = 5000;
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    if (percent) percent.textContent = `${Math.round(progress * 100)}%`;
    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    preloader.classList.add("is-complete");
    document.body.classList.remove("preloader-active");
    window.setTimeout(() => preloader.remove(), 520);
  }

  requestAnimationFrame(tick);
}

const GEO_FALLBACK = {
  stateName: "Indiana",
  stateCode: "IN",
  stateSlug: "indiana",
  cityName: "Indianapolis",
  citySlug: "indianapolis",
  cityUrl: "/locations/indiana/indianapolis/",
  locationsUrl: "/locations/indiana/",
  cities: [
    { cityName: "Indianapolis", slug: "indianapolis", stateName: "Indiana", stateCode: "IN", stateSlug: "indiana", url: "/locations/indiana/indianapolis/", latitude: 39.7684, longitude: -86.1581 },
    { cityName: "Fort Wayne", slug: "fort-wayne", stateName: "Indiana", stateCode: "IN", stateSlug: "indiana", url: "/locations/indiana/fort-wayne/", latitude: 41.0793, longitude: -85.1394 },
    { cityName: "Bloomington", slug: "bloomington", stateName: "Indiana", stateCode: "IN", stateSlug: "indiana", url: "/locations/indiana/bloomington/", latitude: 39.1653, longitude: -86.5264 },
    { cityName: "South Bend", slug: "south-bend", stateName: "Indiana", stateCode: "IN", stateSlug: "indiana", url: "/locations/indiana/south-bend/", latitude: 41.6764, longitude: -86.252 },
    { cityName: "Evansville", slug: "evansville", stateName: "Indiana", stateCode: "IN", stateSlug: "indiana", url: "/locations/indiana/evansville/", latitude: 37.9716, longitude: -87.5711 }
  ]
};
GEO_FALLBACK.knownCities = GEO_FALLBACK.cities;
let geoTargetPromise = null;
let browserGeoRequested = false;

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

function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeGeoCity(city, fallback = {}) {
  const stateSlug = String(city?.stateSlug || fallback.stateSlug || "").trim();
  const slug = String(city?.slug || city?.citySlug || fallback.slug || "").trim();
  return {
    cityName: String(city?.cityName || fallback.cityName || "").trim(),
    slug,
    stateName: String(city?.stateName || fallback.stateName || "").trim(),
    stateCode: String(city?.stateCode || fallback.stateCode || "").trim(),
    stateSlug,
    url: String(city?.url || (stateSlug && slug ? `/locations/${stateSlug}/${slug}/` : fallback.url || "")).trim(),
    latitude: toFiniteNumber(city?.latitude ?? fallback.latitude),
    longitude: toFiniteNumber(city?.longitude ?? fallback.longitude)
  };
}

function normalizeGeoTarget(data) {
  const stateName = String(data?.stateName || GEO_FALLBACK.stateName).trim() || GEO_FALLBACK.stateName;
  const stateCode = String(data?.stateCode || GEO_FALLBACK.stateCode).trim() || GEO_FALLBACK.stateCode;
  const stateSlug = String(data?.stateSlug || GEO_FALLBACK.stateSlug).trim() || GEO_FALLBACK.stateSlug;
  const locationsUrl = String(data?.locationsUrl || GEO_FALLBACK.locationsUrl).trim() || GEO_FALLBACK.locationsUrl;
  const cities = Array.isArray(data?.cities) && data.cities.length ? data.cities : GEO_FALLBACK.cities;
  const normalizedCities = cities
    .map((city) => normalizeGeoCity(city, { stateName, stateCode, stateSlug }))
    .filter((city) => city.cityName && city.url);
  const fallbackCity = normalizedCities[0] || normalizeGeoCity({
    cityName: GEO_FALLBACK.cityName,
    slug: GEO_FALLBACK.citySlug,
    stateName,
    stateCode,
    stateSlug,
    url: GEO_FALLBACK.cityUrl
  });
  const cityName = String(data?.cityName || fallbackCity.cityName || GEO_FALLBACK.cityName).trim();
  const citySlug = String(data?.citySlug || fallbackCity.slug || GEO_FALLBACK.citySlug).trim();
  const cityUrl = String(data?.cityUrl || fallbackCity.url || GEO_FALLBACK.cityUrl).trim();
  const knownCitiesSource = Array.isArray(data?.knownCities) && data.knownCities.length ? data.knownCities : normalizedCities;
  const knownCities = knownCitiesSource
    .map((city) => normalizeGeoCity(city, { stateName, stateCode, stateSlug }))
    .filter((city) => city.cityName && city.url);

  return {
    ...GEO_FALLBACK,
    ...data,
    stateName,
    stateCode,
    stateSlug,
    cityName,
    citySlug,
    cityUrl,
    locationsUrl,
    cities: normalizedCities,
    knownCities: knownCities.length ? knownCities : normalizedCities
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

function getGeoLocationLabel(geoTarget) {
  const cityName = String(geoTarget?.cityName || "").trim();
  const stateLabel = String(geoTarget?.stateCode || geoTarget?.stateName || "").trim();
  if (cityName && stateLabel) return `${cityName}, ${stateLabel}`;
  return cityName || stateLabel;
}

function renderHeroGeoTitle(geoTarget) {
  const heroTitle = document.querySelector("[data-geo-hero-title]");
  if (!heroTitle) return;

  const locationLabel = getGeoLocationLabel(geoTarget);
  const titleLocation = locationLabel ? ` <span class="hero-title-location">in ${escapeNavHtml(locationLabel)}</span>` : "";

  heroTitle.innerHTML = `Too Cool <span class="hero-title-for">for</span> Stitches${titleLocation}`;
  document.title = locationLabel ? `HOODYBOODY | Embroidery in ${locationLabel}` : "HOODYBOODY | Embroidery clothes";
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(first, second) {
  const firstLatitude = toFiniteNumber(first?.latitude);
  const firstLongitude = toFiniteNumber(first?.longitude);
  const secondLatitude = toFiniteNumber(second?.latitude);
  const secondLongitude = toFiniteNumber(second?.longitude);
  if ([firstLatitude, firstLongitude, secondLatitude, secondLongitude].some((value) => value === null)) return Infinity;

  const earthRadiusKm = 6371;
  const latitudeDistance = degreesToRadians(secondLatitude - firstLatitude);
  const longitudeDistance = degreesToRadians(secondLongitude - firstLongitude);
  const a =
    Math.sin(latitudeDistance / 2) * Math.sin(latitudeDistance / 2) +
    Math.cos(degreesToRadians(firstLatitude)) *
      Math.cos(degreesToRadians(secondLatitude)) *
      Math.sin(longitudeDistance / 2) *
      Math.sin(longitudeDistance / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestKnownCity(geoTarget, coords) {
  const knownCities = Array.isArray(geoTarget?.knownCities) ? geoTarget.knownCities : [];
  return knownCities
    .filter((city) => toFiniteNumber(city.latitude) !== null && toFiniteNumber(city.longitude) !== null)
    .map((city) => ({ ...city, distanceKm: getDistanceKm(coords, city) }))
    .sort((first, second) => first.distanceKm - second.distanceKm)[0] || null;
}

function applyCityToGeoTarget(geoTarget, city) {
  if (!city) return geoTarget;
  const stateSlug = city.stateSlug || geoTarget.stateSlug;
  return {
    ...geoTarget,
    stateName: city.stateName || geoTarget.stateName,
    stateCode: city.stateCode || geoTarget.stateCode,
    stateSlug,
    cityName: city.cityName || geoTarget.cityName,
    citySlug: city.slug || geoTarget.citySlug,
    cityUrl: city.url || geoTarget.cityUrl,
    locationsUrl: stateSlug ? `/locations/${stateSlug}/` : geoTarget.locationsUrl
  };
}

function applyBrowserPositionToHero(geoTarget) {
  if (browserGeoRequested || !document.querySelector("[data-geo-hero-title]") || !navigator.geolocation) return;

  const hasPromptedForGeo = () => {
    try {
      return sessionStorage.getItem("hoodyboodyGeoPrompted") === "true";
    } catch {
      return false;
    }
  };

  const rememberGeoPrompt = () => {
    try {
      sessionStorage.setItem("hoodyboodyGeoPrompted", "true");
    } catch {
      // Ignore storage restrictions and continue with the browser permission flow.
    }
  };

  const requestPosition = () => {
    browserGeoRequested = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearestCity = findNearestKnownCity(geoTarget, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        if (nearestCity) renderHeroGeoTitle(applyCityToGeoTarget(geoTarget, nearestCity));
      },
      () => {},
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 86400000 }
    );
  };

  if (!navigator.permissions?.query) {
    requestPosition();
    return;
  }

  navigator.permissions
    .query({ name: "geolocation" })
    .then((permission) => {
      if (permission.state === "denied") return;
      if (permission.state === "prompt" && hasPromptedForGeo()) return;
      if (permission.state === "prompt") rememberGeoPrompt();
      requestPosition();
    })
    .catch(requestPosition);
}

function applyGeoTarget(geoTarget) {
  renderHeroGeoTitle(geoTarget);
  applyBrowserPositionToHero(geoTarget);

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
  const actions = header?.querySelector(".top-actions");
  if (!header || !nav || !brand || header.dataset.siteMenuReady === "true" || window.location.pathname.includes("admin")) return;

  header.dataset.siteMenuReady = "true";
  nav.innerHTML = `
    <a href="/#catalog">Shop</a>
    <a href="/#custom">Embroidery</a>
    <div class="mobile-menu-auth" aria-label="Account menu">
      <a class="mobile-menu-action login-link" href="/auth.html" hidden>Login</a>
      <a class="mobile-menu-action cabinet-link" href="/account.html" hidden>Cabinet</a>
      <a class="mobile-menu-action admin-link" href="/admin.html" hidden>Owner</a>
      <button class="mobile-menu-action as-button logout-button" type="button" hidden>Logout</button>
    </div>
  `;

  const toggle = document.createElement("button");
  toggle.className = "site-menu-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
  const cartAction = actions?.querySelector(".cart-toggle, .cart-icon-link");
  if (cartAction) {
    cartAction.insertAdjacentElement("beforebegin", toggle);
  } else if (actions) {
    actions.appendChild(toggle);
  } else {
    brand.insertAdjacentElement("afterend", toggle);
  }

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

initSitePreloader();
enhanceSiteNavigation();
enhanceSiteFooter();
hydrateGeoTarget();
initSessionNav();

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

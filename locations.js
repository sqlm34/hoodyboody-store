(function () {
  const LOCATION_PAGES = {
    locations: {
      title: "Embroidery service areas",
      eyebrow: "locations",
      description: "Browse HOODYBOODY embroidery catalog pages by state and city. We started with Indiana and built the menu so more US states can be added cleanly.",
      parent: "",
      cities: ["indiana", "indianapolis", "fort-wayne", "evansville", "south-bend", "bloomington"],
      highlights: [
        "Custom embroidered clothing",
        "Product catalog by category",
        "Shipping across the United States"
      ]
    },
    indiana: {
      title: "Embroidery clothing in Indiana",
      eyebrow: "indiana",
      description: "HOODYBOODY creates embroidered hoodies, jackets, shirts and accessories for customers across Indiana.",
      parent: "locations",
      cities: ["indianapolis", "fort-wayne", "evansville", "south-bend", "bloomington"],
      highlights: ["Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Bloomington"]
    },
    indianapolis: {
      title: "Embroidery clothing in Indianapolis",
      eyebrow: "indianapolis",
      description: "Shop embroidered clothing and custom pieces for Indianapolis customers with secure checkout and US delivery.",
      parent: "indiana",
      cities: ["indiana", "fort-wayne", "evansville", "south-bend", "bloomington"],
      highlights: ["Custom hoodies", "Logo embroidery", "Gift-ready pieces"]
    },
    "fort-wayne": {
      title: "Embroidery clothing in Fort Wayne",
      eyebrow: "fort wayne",
      description: "Browse embroidered apparel, personalized hoodies and stitched accessories available for Fort Wayne customers.",
      parent: "indiana",
      cities: ["indiana", "indianapolis", "evansville", "south-bend", "bloomington"],
      highlights: ["Embroidered shirts", "Machine embroidery", "Personal orders"]
    },
    evansville: {
      title: "Embroidery clothing in Evansville",
      eyebrow: "evansville",
      description: "Order HOODYBOODY embroidered clothing and accessories for Evansville with simple checkout and delivery.",
      parent: "indiana",
      cities: ["indiana", "indianapolis", "fort-wayne", "south-bend", "bloomington"],
      highlights: ["Jackets", "Accessories", "Custom motifs"]
    },
    "south-bend": {
      title: "Embroidery clothing in South Bend",
      eyebrow: "south bend",
      description: "Personalized embroidered clothing, hoodies and accessories for South Bend customers.",
      parent: "indiana",
      cities: ["indiana", "indianapolis", "fort-wayne", "evansville", "bloomington"],
      highlights: ["Hoodies", "Caps and accessories", "Small batch orders"]
    },
    bloomington: {
      title: "Embroidery clothing in Bloomington",
      eyebrow: "bloomington",
      description: "Embroidered clothing and custom stitched pieces for Bloomington, Indiana customers.",
      parent: "indiana",
      cities: ["indiana", "indianapolis", "fort-wayne", "evansville", "south-bend"],
      highlights: ["Tops", "Gifts", "Personal embroidery"]
    }
  };

  const LOCATION_URLS = {
    locations: "locations.html",
    indiana: "indiana.html",
    indianapolis: "indianapolis.html",
    "fort-wayne": "fort-wayne.html",
    evansville: "evansville.html",
    "south-bend": "south-bend.html",
    bloomington: "bloomington.html"
  };

  const LOCATION_STATES = [
    {
      id: "indiana",
      cities: ["indianapolis", "fort-wayne", "evansville", "south-bend", "bloomington"]
    }
  ];

  const escapeHtml = (value) =>
    String(value || "").replace(/[&<>"']/g, (char) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return entities[char];
    });

  const formatPrice = (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(value) || 0) / 100);

  const root = document.querySelector("[data-location-page]");
  if (!root) return;

  const locationId = root.dataset.locationId || "locations";
  const location = LOCATION_PAGES[locationId] || LOCATION_PAGES.locations;
  let products = window.NITKA_PRODUCTS || [];

  async function loadProducts() {
    try {
      const response = await fetch("/api/products");
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.products)) {
        products = data.products;
      }
    } catch {
      products = window.NITKA_PRODUCTS || products;
    }
  }

  function getLocationLabel(id) {
    const item = LOCATION_PAGES[id];
    return item?.title
      .replace("Embroidery clothing in ", "")
      .replace("Embroidery service areas", "All locations") || "";
  }

  function cityLink(id) {
    const item = LOCATION_PAGES[id];
    if (!item) return "";
    return `<a class="location-chip${id === locationId ? " active" : ""}" href="${LOCATION_URLS[id]}">${escapeHtml(getLocationLabel(id))}</a>`;
  }

  function renderLocationMenu() {
    return `
      <a class="location-chip${locationId === "locations" ? " active" : ""}" href="${LOCATION_URLS.locations}">All locations</a>
      ${LOCATION_STATES.map((state) => `
        <div class="location-state-menu${state.id === locationId || state.cities.includes(locationId) ? " active" : ""}">
          <a class="location-state-trigger" href="${LOCATION_URLS[state.id]}">
            <span>${escapeHtml(getLocationLabel(state.id))}</span>
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </a>
          <div class="location-city-menu">
            ${state.cities.map(cityLink).join("")}
          </div>
        </div>
      `).join("")}
    `;
  }

  function productCard(product) {
    const from = window.location.pathname.split("/").pop() || "locations.html";
    const href = `product.html?id=${encodeURIComponent(product.id)}&location=${encodeURIComponent(locationId)}&from=${encodeURIComponent(from)}`;
    return `
      <a class="location-product-card" href="${href}">
        <span class="location-product-photo" style="--product-image: url('${escapeHtml(product.image || "assets/embroidered-collection.png")}'); --focus: ${escapeHtml(product.focus || "center")}"></span>
        <strong>${escapeHtml(product.title)}</strong>
        <p>${escapeHtml(product.description)}</p>
        <span class="price">${formatPrice(product.price)}</span>
      </a>
    `;
  }

  async function renderLocationPage() {
    await loadProducts();
    document.title = `${location.title} | HOODYBOODY`;
    const descriptionTag = document.querySelector('meta[name="description"]') || document.head.appendChild(document.createElement("meta"));
    descriptionTag.setAttribute("name", "description");
    descriptionTag.setAttribute("content", location.description);

    root.innerHTML = `
    <section class="location-hero">
      <div class="location-hero-copy">
        <p class="eyebrow">${escapeHtml(location.eyebrow)}</p>
        <h1>${escapeHtml(location.title)}</h1>
        <p>${escapeHtml(location.description)}</p>
        <div class="location-actions">
          <a class="button primary" href="embroidered-hoodies.html">Shop products</a>
          <a class="button ghost dark" href="index.html#custom">Custom embroidery</a>
        </div>
      </div>
      <div class="location-hero-media" aria-hidden="true"></div>
    </section>

    <section class="location-section" aria-labelledby="nearby-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">service area menu</p>
          <h2 id="nearby-title">Choose a location</h2>
        </div>
      </div>
      <div class="location-chip-row">
        ${renderLocationMenu()}
      </div>
    </section>

    <section class="location-section" aria-labelledby="location-services-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">what you can order</p>
          <h2 id="location-services-title">Embroidery catalog for this area</h2>
        </div>
      </div>
      <div class="location-grid">
        ${(location.highlights || []).map((item) => `<article class="location-card"><strong>${escapeHtml(item)}</strong><p>Browse ready products or request a custom embroidery order.</p></article>`).join("")}
      </div>
    </section>

    <section class="location-section" aria-labelledby="popular-products-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">popular products</p>
          <h2 id="popular-products-title">Product cards</h2>
        </div>
      </div>
      <div class="location-grid">
        ${products.slice(0, 6).map(productCard).join("")}
      </div>
    </section>
    `;
  }

  renderLocationPage().catch(() => {});
})();

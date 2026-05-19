(function () {
  const CATEGORY_PAGES = {
    outerwear: { title: "Jackets", url: "jackets.html" },
    tops: { title: "Tops", url: "embroidered-tops.html" },
    accessories: { title: "Accessories", url: "embroidered-accessories.html" }
  };
  let categories = Object.entries(CATEGORY_PAGES).map(([id, meta]) => ({ id, title: meta.title, url: meta.url }));
  const PAGE_CATEGORY_TYPES = Object.fromEntries([
    ...Object.entries(CATEGORY_PAGES).map(([type, meta]) => [meta.url, type]),
    ["outerwear.html", "outerwear"],
    ["tops.html", "tops"],
    ["accessories.html", "accessories"],
    ["embroidered-hoodies.html", "tops"],
    ["embroidered-t-shirts.html", "tops"],
    ["embroidered-caps.html", "accessories"]
  ]);
  const PRODUCT_SECTION_PAGES = {
    "jackets.html": "Embroidered Jackets",
    "embroidered-tops.html": "Embroidered Tops",
    "embroidered-accessories.html": "Embroidered Accessories",
    "embroidered-hoodies.html": "Embroidered Hoodies",
    "embroidered-t-shirts.html": "Embroidered T-Shirts",
    "embroidered-caps.html": "Embroidered Caps"
  };
  const STATIC_PAGES = {
    "checkout.html": "Checkout",
    "account.html": "Account",
    "auth.html": "Login"
  };

  const pageName = window.location.pathname.split("/").pop() || "index.html";
  const params = new URLSearchParams(window.location.search);

  if (pageName.startsWith("admin") || document.querySelector(".admin-page")) {
    return;
  }

  const absoluteUrl = (path) => {
    const cleanPath = path || "index.html";
    return new URL(cleanPath, window.location.origin).href;
  };

  const normalizeUrl = (path) => {
    if (!path || path === "index.html") return "index.html";
    return path;
  };

  const baseTrail = () => [
    {
      name: "Home",
      url: "index.html"
    }
  ];

  async function api(path) {
    const response = await fetch(path);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request error");
    return data;
  }

  async function getProducts() {
    try {
      const data = await api("/api/products");
      return Array.isArray(data.products) ? data.products : window.NITKA_PRODUCTS || [];
    } catch {
      return window.NITKA_PRODUCTS || [];
    }
  }

  async function getCategories() {
    try {
      const data = await api("/api/categories");
      categories = Array.isArray(data.categories)
        ? data.categories.map((category) => ({
            id: category.id,
            title: category.title,
            url: CATEGORY_PAGES[category.id]?.url || `category.html?type=${encodeURIComponent(category.id)}`
          }))
        : categories;
    } catch {
      return categories;
    }

    return categories;
  }

  function getCategoryMeta(type) {
    return categories.find((category) => category.id === type) || null;
  }

  function getCategoryType(product) {
    const requestedCategory = params.get("category") || params.get("type");
    if (getCategoryMeta(requestedCategory)) return requestedCategory;
    if (PAGE_CATEGORY_TYPES[pageName] && getCategoryMeta(PAGE_CATEGORY_TYPES[pageName])) return PAGE_CATEGORY_TYPES[pageName];
    if (getCategoryMeta(product?.type)) return product.type;
    return "";
  }

  function addCategoryTrail(trail, categoryType) {
    const category = getCategoryMeta(categoryType);
    if (!category) return trail;

    return [
      ...trail,
      {
        name: "Categories",
        url: "index.html#catalog"
      },
      {
        name: category.title,
        url: category.url
      }
    ];
  }

  async function buildTrail() {
    let trail = baseTrail();

    if (pageName === "index.html") {
      return trail;
    }

    if (pageName === "product.html") {
      const [products] = await Promise.all([getProducts(), getCategories()]);
      const product = products.find((item) => item.id === params.get("id"));
      const returnPage = params.get("from") || "";
      if (PRODUCT_SECTION_PAGES[returnPage]) {
        trail.push({ name: "Categories", url: "index.html#catalog" });
        trail.push({ name: PRODUCT_SECTION_PAGES[returnPage], url: returnPage });
      } else {
        const categoryType = getCategoryType(product);
        trail = addCategoryTrail(trail, categoryType);
      }
      trail.push({
        name: product?.title || "Product",
        url: window.location.pathname.split("/").pop() + window.location.search
      });
      return trail;
    }

    await getCategories();
    if (PRODUCT_SECTION_PAGES[pageName]) {
      trail.push({
        name: "Categories",
        url: "index.html#catalog"
      });
      trail.push({
        name: PRODUCT_SECTION_PAGES[pageName],
        url: pageName
      });
      return trail;
    }

    const categoryType = getCategoryType();
    if (categoryType) {
      return addCategoryTrail(trail, categoryType);
    }

    if (pageName === "category.html") {
      trail.push({
        name: "Category",
        url: window.location.pathname.split("/").pop() + window.location.search
      });
      return trail;
    }

    trail.push({
      name: STATIC_PAGES[pageName] || document.title.replace(/\s+\|\s+.*$/, "") || "Page",
      url: normalizeUrl(pageName)
    });
    return trail;
  }

  function renderBreadcrumbs(trail) {
    document.querySelector(".breadcrumbs")?.remove();

    if (trail.length < 2) return;

    const nav = document.createElement("nav");
    nav.className = "breadcrumbs";
    nav.setAttribute("aria-label", "Breadcrumb");

    const list = document.createElement("ol");
    nav.appendChild(list);

    trail.forEach((crumb, index) => {
      const item = document.createElement("li");
      const isLast = index === trail.length - 1;

      if (isLast) {
        const current = document.createElement("span");
        current.setAttribute("aria-current", "page");
        current.textContent = crumb.name;
        item.appendChild(current);
      } else {
        const link = document.createElement("a");
        link.href = crumb.url;
        link.textContent = crumb.name;
        item.appendChild(link);
      }

      list.appendChild(item);
    });

    const main = document.querySelector("main");
    if (main) {
      main.prepend(nav);
    }
  }

  function renderJsonLd(trail) {
    document.querySelector("#breadcrumb-jsonld")?.remove();

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "breadcrumb-jsonld";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: absoluteUrl(crumb.url)
      }))
    });

    document.head.appendChild(script);
  }

  buildTrail()
    .then((trail) => {
      renderBreadcrumbs(trail);
      renderJsonLd(trail);
    })
    .catch(() => {
      const trail = baseTrail();
      renderJsonLd(trail);
    });
})();

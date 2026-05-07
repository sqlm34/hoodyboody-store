(function () {
  const CATEGORY_PAGES = {
    outerwear: { title: "Jackets", url: "outerwear.html" },
    tops: { title: "Tops", url: "tops.html" },
    accessories: { title: "Accessories", url: "accessories.html" }
  };
  const PAGE_CATEGORY_TYPES = Object.fromEntries(
    Object.entries(CATEGORY_PAGES).map(([type, meta]) => [meta.url, type])
  );
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

  function getCategoryType(product) {
    const requestedCategory = params.get("category") || params.get("type");
    if (CATEGORY_PAGES[requestedCategory]) return requestedCategory;
    if (PAGE_CATEGORY_TYPES[pageName]) return PAGE_CATEGORY_TYPES[pageName];
    if (CATEGORY_PAGES[product?.type]) return product.type;
    return "";
  }

  function addCategoryTrail(trail, categoryType) {
    if (!CATEGORY_PAGES[categoryType]) return trail;

    return [
      ...trail,
      {
        name: "Categories",
        url: "index.html#catalog"
      },
      {
        name: CATEGORY_PAGES[categoryType].title,
        url: CATEGORY_PAGES[categoryType].url
      }
    ];
  }

  async function buildTrail() {
    let trail = baseTrail();

    if (pageName === "index.html") {
      return trail;
    }

    if (pageName === "product.html") {
      const products = await getProducts();
      const product = products.find((item) => item.id === params.get("id"));
      const categoryType = getCategoryType(product);
      trail = addCategoryTrail(trail, categoryType);
      trail.push({
        name: product?.title || "Product",
        url: window.location.pathname.split("/").pop() + window.location.search
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

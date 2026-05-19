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
  const storageKey = "hoodyboody-preloader-seen";
  const path = window.location.pathname.toLowerCase();
  if (path.includes("admin") || path.includes("owner") || document.querySelector("[data-site-preloader]")) return;

  try {
    if (window.localStorage.getItem(storageKey) === "true") return;
    window.localStorage.setItem(storageKey, "true");
  } catch {
    // If storage is blocked, keep the visual loader available for this visit.
  }

  const preloader = document.createElement("div");
  preloader.className = "site-preloader";
  preloader.dataset.sitePreloader = "true";
  preloader.setAttribute("aria-live", "polite");
  preloader.innerHTML = `
    <div class="site-preloader-logo" aria-label="HOODYBOODY">
      <span class="site-preloader-word" data-text="HOODYBOODY">HOODYBOODY</span>
    </div>
    <div class="site-preloader-percent" data-preloader-percent>0%</div>
  `;

  document.body.classList.add("preloader-active");
  document.body.appendChild(preloader);

  const percent = preloader.querySelector("[data-preloader-percent]");
  const durationMs = 2000;
  const startedAt = performance.now();

  function updatePercent() {
    const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
    if (percent) percent.textContent = `${Math.round(progress * 100)}%`;
  }

  const percentTimer = window.setInterval(updatePercent, 40);
  window.setTimeout(() => {
    window.clearInterval(percentTimer);
    if (percent) percent.textContent = "100%";
    preloader.classList.add("is-complete");
    document.body.classList.remove("preloader-active");
    window.setTimeout(() => preloader.remove(), 320);
  }, durationMs);
}

function enhanceSiteNavigation() {
  const header = document.querySelector(".topbar");
  const nav = header?.querySelector(".nav-links");
  const brand = header?.querySelector(".brand");
  const actions = header?.querySelector(".top-actions");
  if (!header || !nav || !brand || header.dataset.siteMenuReady === "true" || window.location.pathname.includes("admin")) return;

  header.dataset.siteMenuReady = "true";
  nav.innerHTML = `
    <div class="nav-group shop-mega-menu">
      <button class="nav-group-button nav-shop-trigger" type="button" aria-expanded="false" aria-controls="shopMegaPanel">Shop</button>
      <div class="shop-mega-panel" id="shopMegaPanel" aria-label="Shop categories">
        <div class="shop-mega-inner">
          <div class="shop-mega-grid">
            <section class="shop-mega-column">
              <h3><a href="/#catalog">Categories</a></h3>
              <ul>
                <li><a href="/jackets.html">Jackets</a></li>
                <li><a href="/embroidered-tops.html">Tops</a></li>
                <li><a href="/embroidered-accessories.html">Accessories</a></li>
                <li><a href="/category.html?type=outerwear">Outerwear</a></li>
                <li><a href="/category.html?type=tops">All Tops</a></li>
                <li><a href="/category.html?type=accessories">All Accessories</a></li>
              </ul>
            </section>
            <section class="shop-mega-column">
              <h3><a href="/#catalog">Product Pages</a></h3>
              <ul>
                <li><a href="/embroidered-hoodies/">Embroidered Hoodies</a></li>
                <li><a href="/embroidered-tshirts/">Embroidered T-shirts</a></li>
                <li><a href="/embroidered-sweatshirts/">Embroidered Sweatshirts</a></li>
                <li><a href="/embroidered-hats/">Embroidered Hats</a></li>
                <li><a href="/embroidered-tote-bags/">Embroidered Tote Bags</a></li>
                <li><a href="/embroidered-jackets/">Embroidered Jackets</a></li>
              </ul>
            </section>
            <section class="shop-mega-column">
              <h3><a href="/#custom">Custom Work</a></h3>
              <ul>
                <li><a href="/#custom">Upload Design</a></li>
                <li><a href="/#custom">Logo Embroidery</a></li>
                <li><a href="/#custom">Business Orders</a></li>
                <li><a href="/#order">Request Quote</a></li>
                <li><a href="/blog/">Embroidery Journal</a></li>
              </ul>
            </section>
            <section class="shop-mega-column">
              <h3><a href="/account.html">Shop Pages</a></h3>
              <ul>
                <li><a href="/account.html">My Account</a></li>
                <li><a href="/checkout.html">Cart</a></li>
                <li><a href="/checkout.html">Checkout</a></li>
                <li><a href="/auth.html">Login</a></li>
              </ul>
            </section>
            <section class="shop-mega-column shop-mega-feature">
              <h3><a href="/#catalog">New Collection</a></h3>
              <a class="shop-mega-image" href="/#catalog" aria-label="Open new collection">
                <img src="/assets/embroidered-collection.png" alt="HOODYBOODY embroidered clothing collection" />
              </a>
            </section>
          </div>
        </div>
      </div>
    </div>
    <a href="/#custom">Embroidery</a>
    <a href="/blog/">Blog</a>
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
      if (group.classList.contains("shop-mega-menu") && isOpen) {
        clearTimeout(shopMegaNavigateTimer);
        group.classList.remove("is-closing");
      }
      button.setAttribute("aria-expanded", String(isOpen));
      return;
    }

    if (event.target.closest("a")) {
      header.classList.remove("site-menu-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
    }
  });

  const shopMegaMenu = nav.querySelector(".shop-mega-menu");
  const shopMegaPanel = nav.querySelector(".shop-mega-panel");
  const shopMegaTrigger = nav.querySelector(".nav-shop-trigger");
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  const shopMegaDissolveMs = 240;
  let shopMegaCloseTimer = 0;
  let shopMegaNavigateTimer = 0;
  const setShopMegaOpen = (isOpen) => {
    clearTimeout(shopMegaCloseTimer);
    if (isOpen) shopMegaMenu?.classList.remove("is-closing");
    shopMegaMenu?.classList.toggle("open", isOpen);
    shopMegaTrigger?.setAttribute("aria-expanded", String(isOpen));
  };
  const closeShopMegaWithDissolve = () => {
    clearTimeout(shopMegaCloseTimer);
    clearTimeout(shopMegaNavigateTimer);
    shopMegaPanel?.querySelector(":focus")?.blur();
    shopMegaMenu?.classList.remove("open");
    shopMegaMenu?.classList.add("is-closing");
    shopMegaTrigger?.setAttribute("aria-expanded", "false");
  };
  const scheduleShopMegaClose = () => {
    clearTimeout(shopMegaCloseTimer);
    shopMegaCloseTimer = window.setTimeout(() => {
      if (shopMegaMenu?.matches(":hover") || shopMegaPanel?.matches(":hover")) return;
      setShopMegaOpen(false);
    }, 320);
  };

  if (shopMegaMenu && shopMegaPanel && shopMegaTrigger) {
    shopMegaMenu.addEventListener("pointerenter", () => {
      if (!supportsHover.matches) return;
      setShopMegaOpen(true);
    });
    shopMegaMenu.addEventListener("pointerleave", () => {
      if (!supportsHover.matches) return;
      shopMegaMenu.classList.remove("is-closing");
      scheduleShopMegaClose();
    });
    shopMegaPanel.addEventListener("pointerenter", () => {
      if (!supportsHover.matches) return;
      setShopMegaOpen(true);
    });
    shopMegaPanel.addEventListener("pointerleave", () => {
      if (!supportsHover.matches) return;
      shopMegaMenu.classList.remove("is-closing");
      scheduleShopMegaClose();
    });
    shopMegaPanel.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const destination = link.href;
      if (!destination) return;

      event.preventDefault();
      closeShopMegaWithDissolve();

      shopMegaNavigateTimer = window.setTimeout(() => {
        header.classList.remove("site-menu-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;

        if (destination !== window.location.href) {
          window.location.assign(destination);
          return;
        }

        shopMegaPanel.querySelector(":focus")?.blur();
      }, shopMegaDissolveMs);
    });
  }

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
          <nav class="footer-links" aria-label="Custom embroidery">
            <strong>Custom</strong>
            <a href="/#custom">Upload logo or design</a>
            <a href="/#custom">Business embroidery</a>
            <a href="/blog/">Blog</a>
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

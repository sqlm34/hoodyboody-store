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

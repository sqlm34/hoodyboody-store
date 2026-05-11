const SERVER_KEY = "hoodyboody-chat-server";
const TOKEN_KEY = "hoodyboody-chat-token";

const serverUrlInput = document.querySelector("#serverUrl");
const adminTokenInput = document.querySelector("#adminToken");
const connectButton = document.querySelector("#connectButton");
const settingsToggle = document.querySelector("#settingsToggle");
const settingsCard = document.querySelector("#settingsCard");
const statusText = document.querySelector("#statusText");
const conversationList = document.querySelector("#conversationList");
const threadHead = document.querySelector("#threadHead");
const threadMessages = document.querySelector("#threadMessages");
const replyForm = document.querySelector("#replyForm");
const replyText = document.querySelector("#replyText");

let socket = null;
let connected = false;
let conversations = [];
let activeConversation = null;
let pollTimer = 0;
let knownMessageIds = new Set();
let loadedOnce = false;
let lastConversationTimes = {};

serverUrlInput.value = localStorage.getItem(SERVER_KEY) || "https://www.hoodyboody.com";
adminTokenInput.value = localStorage.getItem(TOKEN_KEY) || "";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function getServerUrl() {
  let value = serverUrlInput.value.trim();
  if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value.replace(/\/+$/, "");
}

function getToken() {
  return adminTokenInput.value.trim();
}

function setStatus(message) {
  statusText.textContent = message;
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-chat-admin-token": getToken()
  };
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${getServerUrl()}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) }
    });
  } catch {
    throw new Error("Cannot reach server. Check URL and internet connection.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request error");
  return data;
}

async function notify(title, body) {
  const plugins = window.Capacitor?.Plugins;
  const localNotifications = plugins?.LocalNotifications;
  if (!localNotifications) return;

  const permission = await localNotifications.requestPermissions();
  if (permission.display !== "granted") return;

  await localNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Date.now() % 2147483647),
        title,
        body,
        schedule: { at: new Date(Date.now() + 250) }
      }
    ]
  });
}

function renderConversations() {
  if (!conversations.length) {
    conversationList.innerHTML = `<div class="empty">No chats yet.</div>`;
    return;
  }

  conversationList.innerHTML = conversations
    .map((conversation) => {
      const customer = conversation.customer || {};
      const active = activeConversation?.id === conversation.id;
      return `
        <button class="conversation-card ${active ? "active" : ""}" data-id="${escapeHtml(conversation.id)}" type="button">
          <strong>${escapeHtml(customer.name || "Customer")}</strong>
          <small>${escapeHtml(customer.email || customer.phone || "")}</small>
          <em>${escapeHtml(conversation.lastMessageText || "Open chat")}</em>
        </button>
      `;
    })
    .join("");
}

function renderThread() {
  if (!activeConversation) {
    threadHead.innerHTML = `<h2>Select chat</h2><p>New customer messages will appear here.</p>`;
    threadMessages.innerHTML = `<div class="empty">No selected conversation.</div>`;
    return;
  }

  const customer = activeConversation.customer || {};
  const messages = activeConversation.messages || [];
  threadHead.innerHTML = `
    <h2>${escapeHtml(customer.name || "Customer")}</h2>
    <p>${escapeHtml([customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details")}</p>
  `;
  threadMessages.innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <article class="message ${message.senderType === "admin" ? "admin" : "customer"}">
              <div>${escapeHtml(message.text)}</div>
              <small>${escapeHtml(message.senderName || "")}</small>
            </article>
          `
        )
        .join("")
    : `<div class="empty">No messages.</div>`;
  threadMessages.scrollTop = threadMessages.scrollHeight;
}

async function openConversation(conversationId) {
  const data = await api(`/api/admin/chat/conversations/${encodeURIComponent(conversationId)}`);
  activeConversation = data.conversation;
  (activeConversation.messages || []).forEach((message) => knownMessageIds.add(message.id));
  renderConversations();
  renderThread();
  if (socket?.connected) socket.emit("chat:admin:open", { conversationId });
}

async function loadConversations() {
  const data = await api("/api/admin/chat/conversations");
  const nextConversations = data.conversations || [];

  if (loadedOnce) {
    nextConversations.forEach((conversation) => {
      const lastTime = conversation.lastMessageAt || "";
      const wasKnown = lastConversationTimes[conversation.id];
      if (Number(conversation.unreadAdmin || 0) > 0 && lastTime && wasKnown && wasKnown !== lastTime) {
        notify(`Message from ${conversation.customer?.name || "Customer"}`, conversation.lastMessageText || "New customer message");
      }
    });
  }

  nextConversations.forEach((conversation) => {
    lastConversationTimes[conversation.id] = conversation.lastMessageAt || "";
  });
  loadedOnce = true;
  conversations = nextConversations;
  renderConversations();
  if (!activeConversation && conversations[0]) await openConversation(conversations[0].id);
}

function loadSocketClient() {
  if (window.io) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${getServerUrl()}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function connect() {
  const serverUrl = getServerUrl();
  serverUrlInput.value = serverUrl;
  localStorage.setItem(SERVER_KEY, serverUrl);
  localStorage.setItem(TOKEN_KEY, getToken());
  setStatus("Connecting...");

  await loadConversations();

  try {
    await loadSocketClient();
    socket = window.io(getServerUrl(), {
      auth: { adminToken: getToken() },
      transports: ["websocket", "polling"]
    });
    socket.on("connect", () => {
      connected = true;
      setStatus("Socket connected. Waiting for messages.");
      socket.emit("chat:admin:join", { conversationId: activeConversation?.id || "" });
    });
    socket.on("disconnect", () => {
      connected = false;
      setStatus("Socket disconnected. Backup refresh is active.");
      startPolling();
    });
    socket.on("chat:conversation", async (payload) => {
      if (!payload.conversation) return;
      conversations = [payload.conversation, ...conversations.filter((item) => item.id !== payload.conversation.id)];
      renderConversations();
      if (payload.message && payload.message.senderType === "customer" && !knownMessageIds.has(payload.message.id)) {
        knownMessageIds.add(payload.message.id);
        await notify(`Message from ${payload.conversation.customer?.name || "Customer"}`, payload.message.text);
      }
      if (activeConversation?.id === payload.conversation.id) await openConversation(payload.conversation.id);
    });
    socket.on("chat:error", (payload) => setStatus(payload.message || "Chat error"));
  } catch {
    setStatus("Socket unavailable. Backup refresh is active.");
    startPolling();
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      await loadConversations();
      if (activeConversation) await openConversation(activeConversation.id);
    } catch (error) {
      setStatus(error.message);
    }
  }, 5000);
}

conversationList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) openConversation(button.dataset.id);
});

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeConversation) return;
  const text = replyText.value.trim();
  if (!text) return;
  replyText.value = "";

  if (connected && socket) {
    socket.emit("chat:message:send", { senderType: "admin", conversationId: activeConversation.id, text });
    return;
  }

  const data = await api(`/api/admin/chat/conversations/${encodeURIComponent(activeConversation.id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
  activeConversation = data.conversation;
  renderThread();
});

settingsToggle.addEventListener("click", () => settingsCard.classList.toggle("collapsed"));
connectButton.addEventListener("click", () => connect().catch((error) => setStatus(error.message)));

connect().catch((error) => setStatus(error.message));

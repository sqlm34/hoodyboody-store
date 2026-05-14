const TOKEN_KEY = "hoodyboody-chat-admin-token";

const chatLocked = document.querySelector("#chatLocked");
const chatLockedText = document.querySelector("#chatLockedText");
const chatDashboard = document.querySelector("#chatDashboard");
const chatAdminToken = document.querySelector("#chatAdminToken");
const saveChatToken = document.querySelector("#saveChatToken");
const chatStatus = document.querySelector("#chatStatus");
const conversationList = document.querySelector("#chatConversationList");
const threadHead = document.querySelector("#chatThreadHead");
const threadMessages = document.querySelector("#chatThreadMessages");
const replyForm = document.querySelector("#chatReplyForm");
const replyText = document.querySelector("#chatReplyText");
const refreshChat = document.querySelector("#refreshChat");
const enableChatNotifications = document.querySelector("#enableChatNotifications");
const toggleChatSettings = document.querySelector("#toggleChatSettings");
const chatSettingsPanel = document.querySelector("#chatSettingsPanel");
const saveChatSettings = document.querySelector("#saveChatSettings");
const chatColor = document.querySelector("#chatColor");
const chatAccentColor = document.querySelector("#chatAccentColor");
const chatTimeColor = document.querySelector("#chatTimeColor");
const chatPushColor = document.querySelector("#chatPushColor");
const chatLogoText = document.querySelector("#chatLogoText");
const chatWelcomeText = document.querySelector("#chatWelcomeText");
const chatLogoFile = document.querySelector("#chatLogoFile");
const chatLogoPreview = document.querySelector("#chatLogoPreview");
const replyAttachments = document.querySelector("#chatReplyAttachments");
const attachFileButton = document.querySelector("#chatAttachFile");
const fileInput = document.querySelector("#chatFileInput");

let conversations = [];
let activeConversation = null;
let socket = null;
let connected = false;
let pollTimer = 0;
let loadedConversationsOnce = false;
let lastConversationTimes = {};
let replyDraftAttachments = [];
let chatSettings = {};
const MAX_ATTACHMENT_BYTES = 5_000_000;

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function requestOptions(options = {}) {
  const token = getToken();
  return {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-chat-admin-token": token } : {}),
      ...(options.headers || {})
    }
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, requestOptions(options));
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request error");
    error.status = response.status;
    throw error;
  }

  return data;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function renderAttachment(attachment = {}) {
  const name = escapeHtml(attachment.name || "Attachment");
  if (/^image\//i.test(attachment.type || "")) {
    return `<a class="chat-attachment image-file" href="${escapeHtml(attachment.dataUrl || "")}" download="${name}">
      <img src="${escapeHtml(attachment.dataUrl || "")}" alt="${name}" />
      <span>${name}</span>
    </a>`;
  }

  return `<a class="chat-attachment file-message" href="${escapeHtml(attachment.dataUrl || attachment.url || "")}" download="${name}" target="_blank" rel="noopener">
    <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
    <span>${name}</span>
  </a>`;
}

function renderDraftAttachments() {
  replyAttachments.hidden = replyDraftAttachments.length === 0;
  replyAttachments.innerHTML = replyDraftAttachments
    .map(
      (attachment, index) => `
        <span class="chat-attachment-chip">
          <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
          <span>${escapeHtml(attachment.name || "Attachment")}</span>
          <button type="button" data-remove-attachment="${index}" aria-label="Remove attachment">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </span>
      `
    )
    .join("");
}

function addDraftAttachment(attachment) {
  if (!attachment) return;
  replyDraftAttachments = [...replyDraftAttachments, attachment].slice(0, 4);
  renderDraftAttachments();
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error("File is too large. Maximum is 5 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        kind: "file",
        name: file.name || "Attachment",
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: String(reader.result || "")
      });
    reader.onerror = () => reject(new Error("File could not be attached."));
    reader.readAsDataURL(file);
  });
}

function applySettings(settings = {}) {
  chatSettings = settings || {};
  chatColor.value = chatSettings.chatColor || "#1f6b5a";
  chatAccentColor.value = chatSettings.accentColor || "#263b73";
  chatTimeColor.value = chatSettings.timeColor || "#59616a";
  chatPushColor.value = chatSettings.pushColor || "#1f6b5a";
  chatLogoText.value = chatSettings.logoText || "HOODYBOODY";
  chatWelcomeText.value = chatSettings.welcomeText || "";
  document.documentElement.style.setProperty("--chat-color", chatColor.value);
  document.documentElement.style.setProperty("--chat-accent", chatAccentColor.value);
  document.documentElement.style.setProperty("--chat-time-color", chatTimeColor.value);
  if (chatSettings.logoImage) {
    chatLogoPreview.src = chatSettings.logoImage;
    chatLogoPreview.hidden = false;
  } else {
    chatLogoPreview.hidden = true;
  }
}

async function loadChatSettings() {
  const data = await api("/api/admin/chat/settings");
  applySettings(data.settings || {});
}

async function saveSettings() {
  const data = await api("/api/admin/chat/settings", {
    method: "PATCH",
    body: JSON.stringify({
      chatColor: chatColor.value,
      accentColor: chatAccentColor.value,
      timeColor: chatTimeColor.value,
      pushColor: chatPushColor.value,
      logoText: chatLogoText.value,
      welcomeText: chatWelcomeText.value,
      logoImage: chatSettings.logoImage || ""
    })
  });
  applySettings(data.settings || {});
  chatStatus.textContent = "Chat settings saved.";
}

function showLocked(message) {
  chatDashboard.hidden = true;
  chatLocked.hidden = false;
  chatLockedText.textContent = message;
}

function showDashboard() {
  chatLocked.hidden = true;
  chatDashboard.hidden = false;
}

function renderConversations() {
  if (!conversations.length) {
    conversationList.innerHTML = `<div class="chat-empty-state">No live chat messages yet.</div>`;
    return;
  }

  conversationList.innerHTML = conversations
    .map((conversation) => {
      const customer = conversation.customer || {};
      const active = activeConversation?.id === conversation.id;
      const unread = Number(conversation.unreadAdmin || 0);
      const name = customer.name || "Customer";
      const initials = name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return `
        <button class="chat-conversation-card ${active ? "active" : ""}" type="button" data-id="${escapeHtml(conversation.id)}">
          <span class="chat-avatar">${escapeHtml(initials || "C")}</span>
          <span>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(customer.email || customer.phone || "No contact yet")}</small>
          </span>
          ${unread ? `<b>${unread}</b>` : ""}
          <em>${escapeHtml(conversation.lastMessageText || "New conversation")}</em>
          <time>${formatDate(conversation.lastMessageAt)}</time>
        </button>
      `;
    })
    .join("");
}

function renderThread() {
  if (!activeConversation) {
    threadHead.innerHTML = `<h3>Select a conversation</h3><p>Customer details will appear here.</p>`;
    threadMessages.innerHTML = `<div class="chat-empty-state">Choose a chat on the left.</div>`;
    replyForm.hidden = true;
    return;
  }

  const customer = activeConversation.customer || {};
  threadHead.innerHTML = `
    <h3>${escapeHtml(customer.name || "Customer")}</h3>
    <p>${escapeHtml([customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details")}</p>
  `;

  const messages = activeConversation.messages || [];
  threadMessages.innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <article class="chat-thread-message ${message.senderType === "admin" ? "from-admin" : "from-customer"}">
              ${message.text ? `<div>${escapeHtml(message.text)}</div>` : ""}
              ${(message.attachments || []).map(renderAttachment).join("")}
              <small>${escapeHtml(message.senderName || "")} ${formatDate(message.createdAt)}</small>
            </article>
          `
        )
        .join("")
    : `<div class="chat-empty-state">No messages in this conversation.</div>`;
  threadMessages.scrollTop = threadMessages.scrollHeight;
  replyForm.hidden = false;
}

function notifyAdmin(message, conversation) {
  if (!message || message.senderType !== "customer") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const customerName = conversation?.customer?.name || "Customer";
  new Notification(`New message from ${customerName}`, { body: message.text || "New attachment", tag: message.id });
}

async function loadConversations({ silent = false } = {}) {
  try {
    const data = await api("/api/admin/chat/conversations");
    const nextConversations = data.conversations || [];

    if (loadedConversationsOnce) {
      nextConversations.forEach((conversation) => {
        const lastTime = conversation.lastMessageAt || "";
        const wasKnown = lastConversationTimes[conversation.id];
        if (Number(conversation.unreadAdmin || 0) > 0 && lastTime && wasKnown && wasKnown !== lastTime) {
          notifyAdmin(
            {
              id: `${conversation.id}:${lastTime}`,
              senderType: "customer",
              text: conversation.lastMessageText || "New customer message"
            },
            conversation
          );
        }
      });
    }

    nextConversations.forEach((conversation) => {
      lastConversationTimes[conversation.id] = conversation.lastMessageAt || "";
    });
    loadedConversationsOnce = true;
    conversations = nextConversations;
    showDashboard();
    renderConversations();
    chatStatus.textContent = connected ? "Live connection active" : "Live refresh active";
    if (!activeConversation && conversations[0]) await openConversation(conversations[0].id, { silent: true });
  } catch (error) {
    if (!silent) showLocked(error.status === 401 ? "Login as owner or enter the Android app token." : error.message);
  }
}

async function openConversation(conversationId, { silent = false } = {}) {
  try {
    const data = await api(`/api/admin/chat/conversations/${encodeURIComponent(conversationId)}`);
    activeConversation = data.conversation;
    conversations = conversations.map((conversation) =>
      conversation.id === activeConversation.id ? { ...conversation, unreadAdmin: 0 } : conversation
    );
    renderConversations();
    renderThread();
    if (socket?.connected) socket.emit("chat:admin:open", { conversationId });
  } catch (error) {
    if (!silent) chatStatus.textContent = error.message;
  }
}

function loadSocketClient() {
  if (window.io) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function connectSocket() {
  try {
    await loadSocketClient();
    socket = window.io({
      auth: { adminToken: getToken() },
      transports: ["websocket", "polling"]
    });
    socket.on("connect", () => {
      connected = true;
      chatStatus.textContent = "Live connection active";
      socket.emit("chat:admin:join", { conversationId: activeConversation?.id || "" });
    });
    socket.on("disconnect", () => {
      connected = false;
      chatStatus.textContent = "Live refresh active";
      startPolling();
    });
    socket.on("chat:admin:ready", (payload) => {
      conversations = payload.conversations || conversations;
      if (payload.conversation) activeConversation = payload.conversation;
      showDashboard();
      renderConversations();
      renderThread();
    });
    socket.on("chat:admin:conversation", (payload) => {
      if (payload.conversation) {
        activeConversation = payload.conversation;
        renderThread();
      }
    });
    socket.on("chat:conversation", (payload) => {
      if (!payload.conversation) return;
      conversations = [payload.conversation, ...conversations.filter((conversation) => conversation.id !== payload.conversation.id)];
      if (activeConversation?.id === payload.conversation.id) {
        openConversation(payload.conversation.id, { silent: true });
      }
      renderConversations();
      notifyAdmin(payload.message, payload.conversation);
    });
    socket.on("chat:error", (payload) => {
      chatStatus.textContent = payload.message || "Chat error";
    });
  } catch {
    connected = false;
    chatStatus.textContent = "Live refresh active";
    startPolling();
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    loadConversations({ silent: true });
    if (activeConversation) openConversation(activeConversation.id, { silent: true });
  }, 2500);
}

conversationList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  openConversation(button.dataset.id);
});

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = replyText.value.trim();
  if (!activeConversation || (!text && !replyDraftAttachments.length)) return;
  const attachments = replyDraftAttachments;
  replyText.value = "";

  if (connected && socket) {
    socket.emit(
      "chat:message:send",
      { conversationId: activeConversation.id, senderType: "admin", text, attachments },
      (payload) => {
        if (payload?.conversation) {
          activeConversation = payload.conversation;
          renderThread();
        }
        replyDraftAttachments = [];
        renderDraftAttachments();
      }
    );
    return;
  }

  const data = await api(`/api/admin/chat/conversations/${encodeURIComponent(activeConversation.id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text, attachments })
  });
  activeConversation = data.conversation;
  replyDraftAttachments = [];
  renderDraftAttachments();
  renderThread();
  await loadConversations({ silent: true });
});

refreshChat.addEventListener("click", () => loadConversations());
enableChatNotifications.addEventListener("click", () => {
  if ("Notification" in window) Notification.requestPermission();
});
toggleChatSettings.addEventListener("click", () => {
  chatSettingsPanel.hidden = !chatSettingsPanel.hidden;
});
saveChatSettings.addEventListener("click", () => saveSettings().catch((error) => (chatStatus.textContent = error.message || "Settings were not saved.")));
chatLogoFile.addEventListener("change", async () => {
  const file = chatLogoFile.files?.[0];
  if (!file) return;
  try {
    const attachment = await readFileAsAttachment(file);
    chatSettings.logoImage = attachment.dataUrl;
    chatLogoPreview.src = attachment.dataUrl;
    chatLogoPreview.hidden = false;
  } catch (error) {
    chatStatus.textContent = error.message || "Logo was not loaded.";
  }
});
replyAttachments.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-attachment]");
  if (!button) return;
  replyDraftAttachments = replyDraftAttachments.filter((_, index) => index !== Number(button.dataset.removeAttachment));
  renderDraftAttachments();
});
attachFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  try {
    for (const file of Array.from(fileInput.files || [])) {
      addDraftAttachment(await readFileAsAttachment(file));
    }
    fileInput.value = "";
  } catch (error) {
    chatStatus.textContent = error.message || "File could not be attached.";
  }
});
saveChatToken.addEventListener("click", () => {
  localStorage.setItem(TOKEN_KEY, chatAdminToken.value.trim());
  window.location.reload();
});

chatAdminToken.value = getToken();
Promise.allSettled([loadChatSettings(), loadConversations()]).finally(() => {
  connectSocket();
  startPolling();
});

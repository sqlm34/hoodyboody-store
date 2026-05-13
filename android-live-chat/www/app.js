const SERVER_KEY = "hoodyboody-chat-server";
const TOKEN_KEY = "hoodyboody-chat-token";
const NOTIFICATION_CHANNEL_ID = "hoodyboody_live_chat_v2";
const NOTIFICATION_CHANNEL_KEY = "hoodyboody-chat-notification-channel";

const serverUrlInput = document.querySelector("#serverUrl");
const adminTokenInput = document.querySelector("#adminToken");
const connectButton = document.querySelector("#connectButton");
const notificationsButton = document.querySelector("#notificationsButton");
const testPushButton = document.querySelector("#testPushButton");
const soundSettingsButton = document.querySelector("#soundSettingsButton");
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
let notificationsReady = false;
let pushListenersReady = false;
let firebaseChecked = false;
let firebaseConfigured = false;
let notificationChannelId = localStorage.getItem(NOTIFICATION_CHANNEL_KEY) || NOTIFICATION_CHANNEL_ID;
let currentPushToken = "";

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

function getNotificationChannelId() {
  return notificationChannelId || NOTIFICATION_CHANNEL_ID;
}

function setNotificationChannelId(channelId) {
  const value = String(channelId || "").trim() || NOTIFICATION_CHANNEL_ID;
  notificationChannelId = value;
  localStorage.setItem(NOTIFICATION_CHANNEL_KEY, value);
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

  const ready = notificationsReady || (await ensureNotifications());
  if (!ready) return;

  await localNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Date.now() % 2147483647),
        title,
        body,
        channelId: getNotificationChannelId(),
        sound: "hoodyboody_chat.wav",
        data: { source: "hoodyboody-live-chat" },
        schedule: { at: new Date(Date.now() + 250) }
      }
    ]
  });
}

async function registerPushToken(token) {
  if (!token) return;
  currentPushToken = token;
  const data = await api("/api/admin/chat/push-token", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: "android",
      channelId: getNotificationChannelId()
    })
  });
  return data;
}

async function ensurePushNotifications(options = {}) {
  const silent = options.silent === true;
  const plugins = window.Capacitor?.Plugins;
  const push = plugins?.PushNotifications;
  if (!push) return false;

  try {
    const firebaseReady = await isFirebaseConfigured();
    if (!firebaseReady) {
      if (!silent) setStatus("App works. Firebase push is not configured yet.");
      return false;
    }

    let permission = await push.checkPermissions();
    if (permission.receive !== "granted") permission = await push.requestPermissions();
    if (permission.receive !== "granted") {
      if (!silent) setStatus("Push notifications are off. Allow them in Android settings.");
      return false;
    }

    if (!pushListenersReady) {
      push.addListener("registration", async (token) => {
        try {
          currentPushToken = token.value;
          const data = await registerPushToken(token.value);
          if (!silent) {
            setStatus(data?.pushConfigured ? "Background push notifications enabled." : "Phone registered. Server Firebase push is not configured yet.");
          }
        } catch (error) {
          if (!silent) setStatus(error.message || "Push token was not saved.");
        }
      });
      push.addListener("registrationError", () => {
        if (!silent) setStatus("Push setup needs Firebase google-services.json.");
      });
      push.addListener("pushNotificationReceived", async (notification) => {
        await loadConversations();
        const title = notification.title || notification.data?.title || "HOODYBOODY live chat";
        const body = notification.body || notification.data?.body || "New customer message";
        await notify(title, body);
      });
      push.addListener("pushNotificationActionPerformed", async (notification) => {
        const conversationId = notification.notification?.data?.conversationId || notification.notification?.data?.conversation_id || "";
        await loadConversations();
        if (conversationId) await openConversation(conversationId).catch(() => {});
      });
      pushListenersReady = true;
    }

    await push.register();
    return true;
  } catch (error) {
    if (!silent) setStatus(error.message || "Push notifications are not ready.");
    return false;
  }
}

async function isFirebaseConfigured() {
  if (firebaseChecked) return firebaseConfigured;
  firebaseChecked = true;
  const plugin = window.Capacitor?.Plugins?.HoodyBoodyNotifications;
  if (!plugin?.isFirebaseConfigured) return false;

  try {
    const result = await plugin.isFirebaseConfigured();
    firebaseConfigured = result.configured === true;
    return firebaseConfigured;
  } catch {
    firebaseConfigured = false;
    return false;
  }
}

async function ensureNotifications() {
  const plugins = window.Capacitor?.Plugins;
  const localNotifications = plugins?.LocalNotifications;
  if (!localNotifications) return false;

  try {
    const current = await localNotifications.checkPermissions();
    const permission = current.display === "granted" ? current : await localNotifications.requestPermissions();
    if (permission.display !== "granted") {
      setStatus("Notifications are off. Allow notifications in Android settings.");
      notificationsReady = false;
      return false;
    }

    const plugin = plugins?.HoodyBoodyNotifications;
    if (plugin?.applySavedNotificationSound) {
      const saved = await plugin.applySavedNotificationSound({ channelId: NOTIFICATION_CHANNEL_ID });
      if (saved?.channelId) setNotificationChannelId(saved.channelId);
    }

    await localNotifications.createChannel({
      id: getNotificationChannelId(),
      name: "Customer messages",
      description: "Sound alerts for new HOODYBOODY customer chat messages.",
      importance: 5,
      visibility: 1,
      lights: true,
      lightColor: "#B08D57",
      vibration: true,
      sound: "hoodyboody_chat.wav"
    });
    notificationsReady = true;
    return true;
  } catch {
    notificationsReady = false;
    return false;
  }
}

async function openSoundSettings() {
  const enabled = await ensureNotifications();
  if (!enabled) return;

  const plugin = window.Capacitor?.Plugins?.HoodyBoodyNotifications;
  if (plugin?.chooseNotificationSound) {
    const result = await plugin.chooseNotificationSound({ channelId: getNotificationChannelId() });
    if (result?.channelId) setNotificationChannelId(result.channelId);

    if (result?.selected) {
      notificationsReady = true;
      if (currentPushToken) registerPushToken(currentPushToken).catch(() => {});
      const soundName = result.soundTitle ? `: ${result.soundTitle}` : "";
      setStatus(`Notification sound selected${soundName}.`);
      await notify("HOODYBOODY notifications", "Selected sound is active.");
    } else {
      setStatus("Sound selection canceled.");
    }
    return;
  }

  if (plugin?.openNotificationSettings) {
    await plugin.openNotificationSettings({ channelId: getNotificationChannelId() });
    setStatus("Choose sound in Android notification settings.");
    return;
  }
  setStatus("Open Android app settings and choose sound for Customer messages.");
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

function renderAttachment(attachment = {}) {
  const name = escapeHtml(attachment.name || "Attachment");
  if (attachment.kind === "video-call") {
    return `<a class="attachment" href="${escapeHtml(attachment.url || "")}" target="_blank" rel="noopener">Join video call</a>`;
  }
  if (attachment.kind === "audio" || /^audio\//i.test(attachment.type || "")) {
    return `<audio class="attachment audio" controls src="${escapeHtml(attachment.dataUrl || "")}"></audio>`;
  }
  if (/^image\//i.test(attachment.type || "")) {
    return `<a class="attachment" href="${escapeHtml(attachment.dataUrl || "")}" target="_blank" rel="noopener"><img src="${escapeHtml(attachment.dataUrl || "")}" alt="${name}" /></a>`;
  }
  return `<a class="attachment" href="${escapeHtml(attachment.dataUrl || attachment.url || "")}" target="_blank" rel="noopener">${name}</a>`;
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
              ${message.text ? `<div>${escapeHtml(message.text)}</div>` : ""}
              ${(message.attachments || []).map(renderAttachment).join("")}
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
      if (Number(conversation.unreadAdmin || 0) > 0 && lastTime && wasKnown !== lastTime) {
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
  await ensureNotifications();
  ensurePushNotifications({ silent: true }).catch(() => {});

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
      setStatus("Live refresh connected. Waiting for messages.");
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
    setStatus("Live refresh connected. Waiting for messages.");
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
  }, 2500);
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
notificationsButton.addEventListener("click", async () => {
  const enabled = await ensureNotifications();
  const pushEnabled = enabled ? await ensurePushNotifications() : false;
  if (enabled) await notify("HOODYBOODY notifications", pushEnabled ? "Background push setup was started." : "Sound is enabled.");
  if (!enabled) {
    setStatus("Notifications are off. Allow them in Android settings.");
  } else if (!pushEnabled) {
    setStatus("Local sound is enabled. Background push needs Firebase setup.");
  }
});
testPushButton.addEventListener("click", async () => {
  try {
    await ensurePushNotifications();
    const data = await api("/api/admin/chat/test-push", {
      method: "POST",
      body: JSON.stringify({})
    });
    setStatus(data.pushConfigured ? "Test push sent." : "Firebase push is not configured on the server.");
  } catch (error) {
    setStatus(error.message || "Test push failed.");
  }
});
soundSettingsButton.addEventListener("click", () => {
  openSoundSettings().catch((error) => setStatus(error.message || "Could not open notification settings."));
});

connect().catch((error) => setStatus(error.message));

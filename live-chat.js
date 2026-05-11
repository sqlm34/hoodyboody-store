(function () {
  const STORAGE_KEY = "hoodyboody-live-chat";
  const state = {
    socket: null,
    connected: false,
    conversationId: localStorage.getItem(STORAGE_KEY) || "",
    messages: [],
    pollTimer: 0,
    user: null
  };

  if (document.querySelector("[data-live-chat-root]")) return;

  const path = window.location.pathname.toLowerCase();
  if (path.includes("admin") || path.includes("owner")) return;

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[char];
    });
  }

  function formatTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  const root = document.createElement("section");
  root.className = "live-chat";
  root.dataset.liveChatRoot = "true";
  root.innerHTML = `
    <button class="live-chat-button" type="button" aria-expanded="false" aria-controls="liveChatPanel">
      <i class="fa-solid fa-comments" aria-hidden="true"></i>
      <span>Chat</span>
    </button>
    <aside class="live-chat-panel" id="liveChatPanel" aria-hidden="true">
      <div class="live-chat-head">
        <div>
          <p class="eyebrow">online support</p>
          <h2>Live chat</h2>
        </div>
        <button class="icon-button live-chat-close" type="button" aria-label="Close chat">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <div class="live-chat-status" data-chat-status>Connecting...</div>
      <div class="live-chat-profile">
        <label>
          Name
          <input data-chat-name type="text" autocomplete="name" placeholder="Your name" />
        </label>
        <label>
          Email
          <input data-chat-email type="email" autocomplete="email" placeholder="email@example.com" />
        </label>
        <label>
          Phone
          <input data-chat-phone type="tel" autocomplete="tel" placeholder="+1..." />
        </label>
      </div>
      <div class="live-chat-messages" data-chat-messages aria-live="polite"></div>
      <form class="live-chat-form" data-chat-form>
        <textarea data-chat-text rows="2" placeholder="Write a message..." required></textarea>
        <button class="button primary" type="submit">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          <span>Send</span>
        </button>
      </form>
    </aside>
  `;

  document.body.appendChild(root);

  const openButton = root.querySelector(".live-chat-button");
  const closeButton = root.querySelector(".live-chat-close");
  const panel = root.querySelector(".live-chat-panel");
  const status = root.querySelector("[data-chat-status]");
  const messagesBox = root.querySelector("[data-chat-messages]");
  const form = root.querySelector("[data-chat-form]");
  const textInput = root.querySelector("[data-chat-text]");
  const nameInput = root.querySelector("[data-chat-name]");
  const emailInput = root.querySelector("[data-chat-email]");
  const phoneInput = root.querySelector("[data-chat-phone]");

  function setOpen(isOpen) {
    root.classList.toggle("open", isOpen);
    panel.setAttribute("aria-hidden", String(!isOpen));
    openButton.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      textInput.focus();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }

  function getCustomer() {
    return {
      name: nameInput.value.trim() || state.user?.name || "Customer",
      email: emailInput.value.trim() || state.user?.email || "",
      phone: phoneInput.value.trim() || state.user?.phone || ""
    };
  }

  function setConversation(conversation) {
    if (!conversation) return;
    state.conversationId = conversation.id;
    localStorage.setItem(STORAGE_KEY, conversation.id);
    state.messages = Array.isArray(conversation.messages) ? conversation.messages : state.messages;
    renderMessages();
  }

  function renderMessages() {
    if (!state.messages.length) {
      messagesBox.innerHTML = `<div class="live-chat-empty">Ask us about size, delivery or your order.</div>`;
      return;
    }

    messagesBox.innerHTML = state.messages
      .map(
        (message) => `
          <article class="live-chat-message ${message.senderType === "admin" ? "from-admin" : "from-customer"}">
            <div>${escapeHtml(message.text)}</div>
            <small>${escapeHtml(message.senderName || "")} ${formatTime(message.createdAt)}</small>
          </article>
        `
      )
      .join("");
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  function setStatus(message, ok = false) {
    status.textContent = message;
    status.classList.toggle("ok", ok);
  }

  function notifyCustomer(message) {
    if (!message || message.senderType !== "admin") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible" && root.classList.contains("open")) return;
    new Notification("HOODYBOODY live chat", { body: message.text, tag: message.id });
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

  async function bootstrap() {
    const params = state.conversationId ? `?conversationId=${encodeURIComponent(state.conversationId)}` : "";
    const response = await fetch(`/api/chat/bootstrap${params}`);
    const data = await response.json().catch(() => ({}));
    state.user = data.user || null;
    if (state.user) {
      nameInput.value = state.user.name || "";
      emailInput.value = state.user.email || "";
      phoneInput.value = state.user.phone || "";
    }
    setConversation(data.conversation);
  }

  async function startPolling() {
    clearInterval(state.pollTimer);
    if (!state.conversationId) return;
    state.pollTimer = setInterval(async () => {
      try {
        const response = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(state.conversationId)}`);
        if (!response.ok) return;
        const data = await response.json();
        setConversation(data.conversation);
      } catch {
        return;
      }
    }, 2500);
  }

  async function connectSocket() {
    try {
      await loadSocketClient();
      state.socket = window.io({ transports: ["websocket", "polling"] });
      state.socket.on("connect", () => {
        state.connected = true;
        setStatus("Online", true);
        state.socket.emit("chat:customer:join", {
          conversationId: state.conversationId,
          customer: getCustomer()
        });
      });
      state.socket.on("chat:ready", (payload) => setConversation(payload.conversation));
      state.socket.on("chat:message", (payload) => {
        if (payload.conversation?.id !== state.conversationId) return;
        if (payload.conversation?.messages) {
          setConversation(payload.conversation);
        } else if (payload.message) {
          state.messages = [...state.messages.filter((item) => item.id !== payload.message.id), payload.message];
          renderMessages();
          notifyCustomer(payload.message);
        }
      });
      state.socket.on("disconnect", () => {
        state.connected = false;
        setStatus("Online", true);
        startPolling();
      });
      state.socket.on("chat:error", (payload) => setStatus(payload.message || "Chat error"));
    } catch {
      state.connected = false;
      setStatus("Online via secure backup", true);
      startPolling();
    }
  }

  async function sendMessage(text) {
    const payload = {
      conversationId: state.conversationId,
      customer: getCustomer(),
      text
    };

    if (state.connected && state.socket) {
      state.socket.emit("chat:message:send", payload, (response) => setConversation(response?.conversation));
      return;
    }

    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Message was not sent.");
    setConversation(data.conversation);
    startPolling();
  }

  openButton.addEventListener("click", () => setOpen(!root.classList.contains("open")));
  closeButton.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = "";
    try {
      await sendMessage(text);
    } catch (error) {
      setStatus(error.message || "Message was not sent.");
    }
  });

  renderMessages();
  bootstrap()
    .catch(() => {})
    .finally(connectSocket);
})();

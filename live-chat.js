(function () {
  const STORAGE_KEY = "hoodyboody-live-chat";
  const MAX_ATTACHMENT_BYTES = 5_000_000;

  function loadStoredChat() {
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    if (!raw) return { conversationId: "", clientToken: "" };

    try {
      const parsed = JSON.parse(raw);
      return {
        conversationId: String(parsed.conversationId || "").trim(),
        clientToken: String(parsed.clientToken || "").trim()
      };
    } catch {
      return { conversationId: raw.trim(), clientToken: "" };
    }
  }

  const storedChat = loadStoredChat();
  const state = {
    socket: null,
    connected: false,
    conversationId: storedChat.conversationId,
    clientToken: storedChat.clientToken,
    messages: [],
    attachments: [],
    pollTimer: 0,
    user: null,
    settings: {},
    mediaRecorder: null,
    recordedChunks: []
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
        <div class="live-chat-brand">
          <img class="live-chat-logo" data-chat-logo alt="" hidden />
          <p class="eyebrow">online support</p>
          <h2 data-chat-title>Live chat</h2>
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
        <div class="live-chat-attachments" data-chat-attachments hidden></div>
        <textarea data-chat-text rows="2" placeholder="Write a message..."></textarea>
        <div class="live-chat-tools" aria-label="Chat tools">
          <button class="icon-button" data-chat-file-button type="button" aria-label="Attach file">
            <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
          </button>
          <button class="icon-button" data-chat-audio-button type="button" aria-label="Record audio message">
            <i class="fa-solid fa-microphone" aria-hidden="true"></i>
          </button>
          <button class="icon-button" data-chat-video-button type="button" aria-label="Start video call">
            <i class="fa-solid fa-video" aria-hidden="true"></i>
          </button>
        </div>
        <input data-chat-file type="file" multiple hidden />
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
  const logoImage = root.querySelector("[data-chat-logo]");
  const titleText = root.querySelector("[data-chat-title]");
  const messagesBox = root.querySelector("[data-chat-messages]");
  const form = root.querySelector("[data-chat-form]");
  const textInput = root.querySelector("[data-chat-text]");
  const nameInput = root.querySelector("[data-chat-name]");
  const emailInput = root.querySelector("[data-chat-email]");
  const phoneInput = root.querySelector("[data-chat-phone]");
  const attachmentsBox = root.querySelector("[data-chat-attachments]");
  const fileInput = root.querySelector("[data-chat-file]");
  const fileButton = root.querySelector("[data-chat-file-button]");
  const audioButton = root.querySelector("[data-chat-audio-button]");
  const videoButton = root.querySelector("[data-chat-video-button]");

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

  function saveStoredChat() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversationId: state.conversationId,
        clientToken: state.clientToken
      })
    );
  }

  function applySettings(settings = {}) {
    state.settings = settings || {};
    root.style.setProperty("--chat-color", settings.chatColor || "#1f6b5a");
    root.style.setProperty("--chat-accent", settings.accentColor || "#263b73");
    root.style.setProperty("--chat-time-color", settings.timeColor || "#59616a");
    titleText.textContent = settings.logoText || "Live chat";
    if (settings.logoImage) {
      logoImage.src = settings.logoImage;
      logoImage.hidden = false;
    } else {
      logoImage.hidden = true;
    }
  }

  function setConversation(conversation) {
    if (!conversation) return;
    state.conversationId = conversation.id;
    if (conversation.clientToken) state.clientToken = conversation.clientToken;
    saveStoredChat();
    state.messages = Array.isArray(conversation.messages) ? conversation.messages : state.messages;
    renderMessages();
  }

  function renderAttachment(attachment = {}) {
    const name = escapeHtml(attachment.name || "Attachment");
    if (attachment.kind === "video-call") {
      return `<a class="chat-attachment video-call" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener">
        <i class="fa-solid fa-video" aria-hidden="true"></i>
        <span>Join video call</span>
      </a>`;
    }

    if (attachment.kind === "audio" || /^audio\//i.test(attachment.type || "")) {
      return `<div class="chat-attachment audio-message">
        <audio controls src="${escapeHtml(attachment.dataUrl || "")}"></audio>
        <span>${name}</span>
      </div>`;
    }

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

  function renderMessages() {
    if (!state.messages.length) {
      messagesBox.innerHTML = `<div class="live-chat-empty">${escapeHtml(state.settings.welcomeText || "Ask us about size, delivery or your order.")}</div>`;
      return;
    }

    messagesBox.innerHTML = state.messages
      .map(
        (message) => `
          <article class="live-chat-message ${message.senderType === "admin" ? "from-admin" : "from-customer"}">
            ${message.text ? `<div>${escapeHtml(message.text)}</div>` : ""}
            ${(message.attachments || []).map(renderAttachment).join("")}
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
    new Notification("HOODYBOODY live chat", { body: message.text || "New attachment", tag: message.id });
  }

  function renderComposerAttachments() {
    attachmentsBox.hidden = state.attachments.length === 0;
    attachmentsBox.innerHTML = state.attachments
      .map(
        (attachment, index) => `
          <span class="chat-attachment-chip">
            <i class="fa-solid ${attachment.kind === "audio" ? "fa-microphone" : attachment.kind === "video-call" ? "fa-video" : "fa-paperclip"}" aria-hidden="true"></i>
            <span>${escapeHtml(attachment.name || "Attachment")}</span>
            <button type="button" data-remove-attachment="${index}" aria-label="Remove attachment">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </span>
        `
      )
      .join("");
  }

  function addAttachment(attachment) {
    if (!attachment) return;
    state.attachments = [...state.attachments, attachment].slice(0, 4);
    renderComposerAttachments();
  }

  function readFileAsAttachment(file, kind = "file") {
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
          kind,
          name: file.name || (kind === "audio" ? "Audio message.webm" : "Attachment"),
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: String(reader.result || "")
        });
      reader.onerror = () => reject(new Error("File could not be attached."));
      reader.readAsDataURL(file);
    });
  }

  async function toggleAudioRecording() {
    if (state.mediaRecorder?.state === "recording") {
      state.mediaRecorder.stop();
      audioButton.classList.remove("recording");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus("Audio recording is not available in this browser.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) state.recordedChunks.push(event.data);
    });
    state.mediaRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(state.recordedChunks, { type: state.mediaRecorder.mimeType || "audio/webm" });
      const file = new File([blob], `audio-message-${Date.now()}.webm`, { type: blob.type });
      addAttachment(await readFileAsAttachment(file, "audio"));
      setStatus("Audio message attached.", true);
    });
    state.mediaRecorder.start();
    audioButton.classList.add("recording");
    setStatus("Recording audio... tap microphone again to stop.", true);
  }

  async function addVideoCallInvitation() {
    const roomSeed = state.conversationId || window.crypto?.randomUUID?.() || String(Date.now());
    const roomId = `hoodyboody-${roomSeed}`.replace(/[^\w-]/g, "").slice(0, 80);
    addAttachment({
      kind: "video-call",
      name: "Video call",
      type: "video/link",
      roomId,
      url: `https://meet.jit.si/${roomId}`,
      size: 0
    });
    setStatus("Video call invitation attached.", true);
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
    const response = await fetch(`/api/chat/bootstrap${params}`, {
      headers: state.clientToken ? { "x-chat-client-token": state.clientToken } : {}
    });
    const data = await response.json().catch(() => ({}));
    state.user = data.user || null;
    applySettings(data.settings || {});
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
        const response = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(state.conversationId)}`, {
          headers: state.clientToken ? { "x-chat-client-token": state.clientToken } : {}
        });
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
          clientToken: state.clientToken,
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
    const attachments = state.attachments;
    const payload = {
      conversationId: state.conversationId,
      clientToken: state.clientToken,
      customer: getCustomer(),
      text,
      attachments
    };

    if (state.connected && state.socket) {
      state.socket.emit("chat:message:send", payload, (response) => {
        setConversation(response?.conversation);
        state.attachments = [];
        renderComposerAttachments();
      });
      return;
    }

    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(state.clientToken ? { "x-chat-client-token": state.clientToken } : {}) },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Message was not sent.");
    setConversation(data.conversation);
    state.attachments = [];
    renderComposerAttachments();
    startPolling();
  }

  openButton.addEventListener("click", () => setOpen(!root.classList.contains("open")));
  closeButton.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    if (!text && !state.attachments.length) return;
    textInput.value = "";
    try {
      await sendMessage(text);
    } catch (error) {
      setStatus(error.message || "Message was not sent.");
    }
  });
  attachmentsBox.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-attachment]");
    if (!button) return;
    state.attachments = state.attachments.filter((_, index) => index !== Number(button.dataset.removeAttachment));
    renderComposerAttachments();
  });
  fileButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    try {
      for (const file of Array.from(fileInput.files || [])) {
        addAttachment(await readFileAsAttachment(file));
      }
      fileInput.value = "";
    } catch (error) {
      setStatus(error.message || "File could not be attached.");
    }
  });
  audioButton.addEventListener("click", () => toggleAudioRecording().catch((error) => setStatus(error.message || "Audio could not be recorded.")));
  videoButton.addEventListener("click", () => addVideoCallInvitation());

  renderMessages();
  bootstrap()
    .catch(() => {})
    .finally(connectSocket);
})();

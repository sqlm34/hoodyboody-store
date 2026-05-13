const crypto = require("crypto");

const DEFAULT_CHANNEL_ID = "hoodyboody_live_chat_v2";

const invalidTokenCodes = new Set([
  "INVALID_ARGUMENT",
  "UNREGISTERED",
  "SENDER_ID_MISMATCH",
  "THIRD_PARTY_AUTH_ERROR"
]);

let cachedCredential = null;
let cachedAccessToken = null;
let firebaseInitError = "";

function getEnv(name) {
  return String(process.env[name] || "").trim();
}

function parseServiceAccount(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const candidates = [raw];
  try {
    candidates.push(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    // Ignore malformed base64 and try the raw value below.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) return parsed;
    } catch {
      // Keep trying the next candidate.
    }
  }

  return null;
}

function buildCredentialFromEnv() {
  const serviceAccount = parseServiceAccount(getEnv("FIREBASE_SERVICE_ACCOUNT_JSON"));
  if (serviceAccount) return serviceAccount;

  const projectId = getEnv("FIREBASE_PROJECT_ID");
  const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey
    };
  }

  return null;
}

function getFirebaseCredential() {
  if (cachedCredential) return cachedCredential;

  const credential = buildCredentialFromEnv();
  if (!credential) {
    firebaseInitError = "Firebase credentials are not configured.";
    return null;
  }

  cachedCredential = credential;
  firebaseInitError = "";
  return cachedCredential;
}

function isPushConfigured() {
  return Boolean(getFirebaseCredential());
}

function getPushConfigurationStatus() {
  const hasServiceAccountJson = Boolean(getEnv("FIREBASE_SERVICE_ACCOUNT_JSON"));
  const hasProjectId = Boolean(getEnv("FIREBASE_PROJECT_ID"));
  const hasClientEmail = Boolean(getEnv("FIREBASE_CLIENT_EMAIL"));
  const hasPrivateKey = Boolean(getEnv("FIREBASE_PRIVATE_KEY"));
  const parsedCredential = buildCredentialFromEnv();
  const missing = [];

  if (!hasServiceAccountJson && !(hasProjectId && hasClientEmail && hasPrivateKey)) {
    if (!hasServiceAccountJson) missing.push("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!hasProjectId) missing.push("FIREBASE_PROJECT_ID");
    if (!hasClientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!hasPrivateKey) missing.push("FIREBASE_PRIVATE_KEY");
  }

  return {
    configured: Boolean(parsedCredential),
    source: hasServiceAccountJson ? "FIREBASE_SERVICE_ACCOUNT_JSON" : hasProjectId || hasClientEmail || hasPrivateKey ? "split_env" : "missing",
    missing,
    error: parsedCredential ? "" : firebaseInitError || "Firebase credentials are not configured."
  };
}

function publicPushToken(record = {}) {
  return {
    id: record.id,
    platform: record.platform || "android",
    channelId: record.channelId || DEFAULT_CHANNEL_ID,
    enabled: record.enabled !== false,
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
    lastSeenAt: record.lastSeenAt || ""
  };
}

function upsertPushToken(db, payload = {}) {
  db.chatPushTokens ||= [];

  const token = String(payload.token || payload.value || "").trim();
  if (!token) return null;

  const now = new Date().toISOString();
  const existing = db.chatPushTokens.find((item) => item.token === token);
  const record = existing || {
    id: crypto.randomUUID(),
    token,
    createdAt: now
  };

  record.platform = String(payload.platform || "android").trim().slice(0, 40) || "android";
  record.channelId = String(payload.channelId || DEFAULT_CHANNEL_ID).trim().slice(0, 120) || DEFAULT_CHANNEL_ID;
  record.deviceName = String(payload.deviceName || "").trim().slice(0, 120);
  record.enabled = payload.enabled !== false;
  record.updatedAt = now;
  record.lastSeenAt = now;

  if (!existing) db.chatPushTokens.push(record);
  return record;
}

function removePushToken(db, token) {
  db.chatPushTokens ||= [];
  const before = db.chatPushTokens.length;
  db.chatPushTokens = db.chatPushTokens.filter((item) => item.token !== token);
  return before !== db.chatPushTokens.length;
}

function buildChatPushMessage({ token, conversation, message, channelId = DEFAULT_CHANNEL_ID, title, body, color }) {
  const customerName = String(conversation?.customer?.name || "Customer").trim() || "Customer";
  const fallbackBody = message?.attachments?.length ? "New attachment from customer" : "New customer message";
  const safeBody = String(body || message?.text || fallbackBody).slice(0, 240);
  const safeTitle = String(title || `Message from ${customerName}`).slice(0, 80);
  const safeColor = /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color) : undefined;

  return {
    token,
    notification: {
      title: safeTitle,
      body: safeBody
    },
    data: {
      type: "live_chat",
      conversationId: String(conversation?.id || ""),
      messageId: String(message?.id || ""),
      senderType: String(message?.senderType || ""),
      title: safeTitle,
      body: safeBody
    },
    android: {
      priority: "high",
      collapseKey: `chat-${conversation?.id || "new"}`,
      notification: {
        channelId,
        ...(safeColor ? { color: safeColor } : {}),
        sound: "hoodyboody_chat",
        tag: `chat-${conversation?.id || "new"}`
      }
    }
  };
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getFcmAccessToken(credential) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) return cachedAccessToken.token;

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: credential.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  );
  const unsignedJwt = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsignedJwt).sign(credential.private_key);
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Firebase authorization failed.");
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600)
  };
  return cachedAccessToken.token;
}

function getFcmErrorCode(errorPayload = {}) {
  const details = errorPayload.error?.details || [];
  const fcmError = details.find((item) => item["@type"]?.includes("google.firebase.fcm.v1.FcmError"));
  return fcmError?.errorCode || errorPayload.error?.status || "";
}

async function sendToToken(credential, payload) {
  const accessToken = await getFcmAccessToken(credential);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credential.project_id)}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ message: payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "FCM push request failed.");
    error.code = getFcmErrorCode(data);
    throw error;
  }
  return data;
}

async function sendChatPushNotifications(db, conversation, message, options = {}) {
  const logger = options.logger || console;
  db.chatPushTokens ||= [];

  if (!conversation || !message || message.senderType !== "customer") {
    return { sent: 0, failed: 0, changed: false, skipped: "not_customer_message" };
  }

  const enabledTokens = db.chatPushTokens.filter((record) => record.enabled !== false && record.token);
  if (!enabledTokens.length) return { sent: 0, failed: 0, changed: false, skipped: "no_tokens" };

  const credential = getFirebaseCredential();
  if (!credential) {
    logger.warn(`[push] Firebase push is not configured: ${firebaseInitError || "missing credentials"}`);
    return { sent: 0, failed: 0, changed: false, skipped: "not_configured" };
  }

  let sent = 0;
  let failed = 0;
  let changed = false;

  for (const record of enabledTokens) {
    try {
      await sendToToken(
        credential,
        buildChatPushMessage({
          token: record.token,
          conversation,
          message,
          channelId: record.channelId || DEFAULT_CHANNEL_ID,
          title: options.title,
          body: options.body,
          color: options.color
        })
      );
      sent += 1;
      record.lastSentAt = new Date().toISOString();
    } catch (error) {
      failed += 1;
      const code = error?.code || "";
      logger.warn(`[push] Failed to send chat push: ${code || error.message || "unknown error"}`);
      if (invalidTokenCodes.has(code)) {
        changed = removePushToken(db, record.token) || changed;
      }
    }
  }

  return { sent, failed, changed };
}

async function sendTestPush(db, options = {}) {
  const fakeConversation = {
    id: "test",
    customer: { name: "HOODYBOODY" }
  };
  const fakeMessage = {
    id: crypto.randomUUID(),
    senderType: "customer",
    text: "Push notifications are working."
  };

  return sendChatPushNotifications(db, fakeConversation, fakeMessage, {
    ...options,
    title: "HOODYBOODY test"
  });
}

module.exports = {
  DEFAULT_CHANNEL_ID,
  getPushConfigurationStatus,
  isPushConfigured,
  publicPushToken,
  removePushToken,
  sendChatPushNotifications,
  sendTestPush,
  upsertPushToken
};

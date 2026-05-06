const net = require("net");
const tls = require("tls");

function getEmailConfig(env = process.env) {
  const port = Number(env.SMTP_PORT || 0);
  return {
    host: String(env.SMTP_HOST || "").trim(),
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure: String(env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    user: String(env.SMTP_USER || "").trim(),
    pass: String(env.SMTP_PASS || ""),
    from: String(env.EMAIL_FROM || env.SMTP_FROM || "").trim(),
    fromName: String(env.EMAIL_FROM_NAME || "HOODYBOODY").trim(),
    enabled: String(env.EMAIL_NOTIFICATIONS_ENABLED || "true").toLowerCase() !== "false"
  };
}

function encodeHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function formatMailbox(name, email) {
  const safeEmail = String(email || "").trim();
  const safeName = encodeHeader(name);
  return safeName ? `"${safeName.replace(/"/g, "'")}" <${safeEmail}>` : safeEmail;
}

function getOrderTracking(order = {}) {
  const shipping = order.shipping || {};
  const delivery = order.delivery || {};
  const tracking = delivery.tracking || {};

  return {
    number: shipping.trackingNumber || shipping.shippoTrackingNumber || tracking.number || "",
    url: shipping.trackingUrl || tracking.url || "",
    carrier: shipping.carrier || delivery.carrier || tracking.company || "Shippo"
  };
}

function getCustomerEmail(order = {}) {
  return String(order.customer?.email || order.delivery?.email || "").trim();
}

function buildOrderStatusEmail(order = {}, statusLabel = "") {
  const orderNumber = order.number || order.id || "your order";
  const tracking = getOrderTracking(order);
  const lines = [
    `Order: ${orderNumber}`,
    `Status: ${statusLabel}`,
    ""
  ];

  if (tracking.number) lines.push(`Tracking number: ${tracking.number}`);
  if (tracking.url) lines.push(`Tracking link: ${tracking.url}`);

  lines.push("", "Thank you for shopping with HOODYBOODY.");

  return {
    subject: `Order ${orderNumber}: ${statusLabel}`,
    text: lines.join("\n")
  };
}

function shouldSendNotification(order, key) {
  order.notifications ||= { sent: [] };
  order.notifications.sent ||= [];
  return !order.notifications.sent.includes(key);
}

function markNotificationSent(order, key) {
  order.notifications ||= { sent: [] };
  order.notifications.sent ||= [];
  if (!order.notifications.sent.includes(key)) order.notifications.sent.push(key);
  order.notifications.updatedAt = new Date().toISOString();
}

function smtpSend(config, message) {
  return new Promise((resolve, reject) => {
    let socket = null;
    let buffer = "";

    function close(error) {
      if (socket) socket.destroy();
      if (error) reject(error);
      else resolve();
    }

    function readResponse() {
      return new Promise((resolveRead, rejectRead) => {
        const timeout = setTimeout(() => rejectRead(new Error("SMTP response timed out.")), 15000);

        function onData(chunk) {
          buffer += chunk.toString("utf8");
          const lines = buffer.split(/\r?\n/).filter(Boolean);
          const lastLine = lines[lines.length - 1] || "";

          if (/^\d{3} /.test(lastLine)) {
            socket.off("data", onData);
            clearTimeout(timeout);
            const code = Number(lastLine.slice(0, 3));
            const response = buffer;
            buffer = "";
            if (code >= 400) rejectRead(new Error(response.trim()));
            else resolveRead(response);
          }
        }

        socket.on("data", onData);
      });
    }

    async function command(line) {
      socket.write(`${line}\r\n`);
      return readResponse();
    }

    async function run() {
      await readResponse();
      await command(`EHLO ${config.host || "localhost"}`);

      if (!config.secure) {
        await command("STARTTLS");
        socket = tls.connect({ socket, servername: config.host });
        await new Promise((resolveSecure, rejectSecure) => {
          socket.once("secureConnect", resolveSecure);
          socket.once("error", rejectSecure);
        });
        buffer = "";
        await command(`EHLO ${config.host || "localhost"}`);
      }

      if (config.user && config.pass) {
        await command("AUTH LOGIN");
        await command(Buffer.from(config.user).toString("base64"));
        await command(Buffer.from(config.pass).toString("base64"));
      }

      await command(`MAIL FROM:<${config.from}>`);
      await command(`RCPT TO:<${message.to}>`);
      await command("DATA");
      socket.write(`${message.raw.replace(/^\./gm, "..")}\r\n.\r\n`);
      await readResponse();
      await command("QUIT").catch(() => null);
      close();
    }

    socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    socket.once("error", close);
    run().catch(close);
  });
}

async function sendOrderStatusEmail(order, statusKey, options = {}) {
  const config = getEmailConfig(options.env || process.env);
  const to = getCustomerEmail(order);

  if (!config.enabled || !config.host || !config.from || !to) {
    return { skipped: true, reason: "email_not_configured" };
  }

  if (!shouldSendNotification(order, statusKey)) {
    return { skipped: true, reason: "already_sent" };
  }

  const statusLabel = options.statusLabel || statusKey.replace(/_/g, " ");
  const content = buildOrderStatusEmail(order, statusLabel);
  const raw = [
    `From: ${formatMailbox(config.fromName, config.from)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(content.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    content.text
  ].join("\r\n");

  await smtpSend(config, { to, raw });
  markNotificationSent(order, statusKey);
  return { sent: true };
}

module.exports = {
  buildOrderStatusEmail,
  getEmailConfig,
  sendOrderStatusEmail,
  shouldSendNotification,
  markNotificationSent
};

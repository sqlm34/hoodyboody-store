function timestamp() {
  return new Date().toISOString();
}

function createLogger(scope = "app") {
  function write(level, message, meta = {}) {
    const payload = Object.keys(meta || {}).length ? ` ${JSON.stringify(meta)}` : "";
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      `[${timestamp()}] [${scope}] [${level.toUpperCase()}] ${message}${payload}`
    );
  }

  return {
    info(message, meta) {
      write("info", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
    error(message, meta) {
      write("error", message, meta);
    }
  };
}

module.exports = { createLogger };

const appHandler = require("../server");

function restoreRewrittenUrl(req) {
  const parsedUrl = new URL(req.url || "/", "http://vercel.local");
  const originalPath = parsedUrl.searchParams.get("__path");
  if (!originalPath) return;

  parsedUrl.searchParams.delete("__path");
  const normalizedPath = originalPath.startsWith("/") ? originalPath : `/${originalPath}`;
  const query = parsedUrl.searchParams.toString();
  req.url = `${normalizedPath}${query ? `?${query}` : ""}`;
}

module.exports = (req, res) => {
  restoreRewrittenUrl(req);
  appHandler(req, res);
};

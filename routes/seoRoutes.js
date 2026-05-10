const {
  auditSeoChange,
  buildSeoAudit,
  buildSitemapUrls,
  detectRedirectWarnings,
  ensureSeoDefaults,
  generateRobotsTxt,
  getMediaSeoInventory,
  getSeoPermissions,
  renderSitemapXml,
  sanitizeGlobalSettings,
  sanitizeMediaSeo,
  sanitizeSeoEntry,
  sanitizeSeoRedirect,
  sanitizeSeoSnippet,
  sanitizeSeoTemplate
} = require("../services/seoService");

function createSeoAdminRouter({ express, readDbAsync, writeDbAsync, getSessionUser, adminEmail, getRequestOrigin }) {
  const router = express.Router();
  router.use(express.json({ limit: "2mb" }));

  async function withSeoPermission(req, res, permission, handler) {
    const db = await readDbAsync();
    ensureSeoDefaults(db);
    const user = getSessionUser(req, db);
    const permissions = getSeoPermissions(user, adminEmail);

    if (!user) {
      res.status(401).json({ message: "You must be logged in as the store owner." });
      return;
    }

    if (!permissions.has(permission)) {
      res.status(403).json({ message: "You do not have permission to manage this SEO section." });
      return;
    }

    try {
      await handler({ db, user, permissions });
    } catch (error) {
      res.status(400).json({ message: error.message || "SEO request failed." });
    }
  }

  function filterAuditRows(rows, query) {
    return rows.filter((row) => {
      if (query.entity_type && row.entity_type !== query.entity_type) return false;
      if (query.status && row.status !== query.status) return false;
      if (query.indexing && row.robots_index !== query.indexing) return false;
      if (query.locale && row.locale !== query.locale) return false;
      if (query.updated_by && !String(row.updated_by || "").includes(query.updated_by)) return false;
      if (query.has === "errors" && !row.errors.length) return false;
      if (query.has === "warnings" && !row.warnings.length) return false;
      if (query.date_from && row.updated_at && new Date(row.updated_at) < new Date(query.date_from)) return false;
      if (query.date_to && row.updated_at && new Date(row.updated_at) > new Date(query.date_to)) return false;
      return true;
    });
  }

  router.get("/dashboard", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db, permissions }) => {
      const audit = buildSeoAudit(db, getRequestOrigin(req));
      audit.rows = filterAuditRows(audit.rows, req.query || {});
      res.json({ ...audit, permissions: permissions.permissions, role: permissions.role });
    })
  );

  router.get("/settings", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db, permissions }) => {
      res.json({ settings: db.seoGlobalSettings, permissions: permissions.permissions, role: permissions.role });
    })
  );

  router.put("/settings", (req, res) =>
    withSeoPermission(req, res, "seo.update", async ({ db, user }) => {
      const before = db.seoGlobalSettings;
      const after = sanitizeGlobalSettings(req.body, before);
      db.seoGlobalSettings = after;
      auditSeoChange(db, "update", "seo_global_settings", "global", before, after, user, req);
      await writeDbAsync(db);
      res.json({ settings: db.seoGlobalSettings });
    })
  );

  router.get("/entries", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db }) => {
      const entries = (db.seoEntries || [])
        .filter((entry) => !entry.deleted_at)
        .filter((entry) => !req.query.entity_type || entry.entity_type === req.query.entity_type)
        .filter((entry) => !req.query.status || entry.status === req.query.status)
        .filter((entry) => !req.query.locale || entry.locale === req.query.locale)
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      res.json({ entries });
    })
  );

  router.post("/entries", (req, res) =>
    withSeoPermission(req, res, "seo.create", async ({ db, user }) => {
      const entry = sanitizeSeoEntry(req.body, {}, user);
      const duplicate = findDuplicateEntry(db, entry);
      if (duplicate) throw new Error("SEO entry for this entity or route already exists.");
      db.seoEntries.unshift(entry);
      auditSeoChange(db, "create", "seo_entry", entry.id, null, entry, user, req);
      await writeDbAsync(db);
      res.status(201).json({ entry, entries: db.seoEntries.filter((item) => !item.deleted_at) });
    })
  );

  router.get("/entries/:id", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db }) => {
      const entry = (db.seoEntries || []).find((item) => item.id === req.params.id && !item.deleted_at);
      if (!entry) throw new Error("SEO entry not found.");
      res.json({ entry });
    })
  );

  router.put("/entries/:id", (req, res) =>
    withSeoPermission(req, res, "seo.update", async ({ db, user }) => {
      const index = (db.seoEntries || []).findIndex((item) => item.id === req.params.id && !item.deleted_at);
      if (index === -1) throw new Error("SEO entry not found.");
      const before = db.seoEntries[index];
      const after = sanitizeSeoEntry(req.body, before, user);
      const duplicate = findDuplicateEntry(db, after);
      if (duplicate && duplicate.id !== after.id) throw new Error("SEO entry for this entity or route already exists.");
      db.seoEntries[index] = after;
      auditSeoChange(db, "update", "seo_entry", after.id, before, after, user, req);
      await writeDbAsync(db);
      res.json({ entry: after, entries: db.seoEntries.filter((item) => !item.deleted_at) });
    })
  );

  router.delete("/entries/:id", (req, res) =>
    withSeoPermission(req, res, "seo.delete", async ({ db, user }) => {
      const index = (db.seoEntries || []).findIndex((item) => item.id === req.params.id && !item.deleted_at);
      if (index === -1) throw new Error("SEO entry not found.");
      const before = db.seoEntries[index];
      db.seoEntries[index] = { ...before, deleted_at: new Date().toISOString(), updated_by: user.email || user.id };
      auditSeoChange(db, "delete", "seo_entry", before.id, before, db.seoEntries[index], user, req);
      await writeDbAsync(db);
      res.json({ ok: true, entries: db.seoEntries.filter((item) => !item.deleted_at) });
    })
  );

  router.get("/templates", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db }) => {
      res.json({ templates: (db.seoTemplates || []).sort((a, b) => (a.entity_type || "").localeCompare(b.entity_type || "")) });
    })
  );

  router.post("/templates", (req, res) =>
    withSeoPermission(req, res, "seo.create", async ({ db, user }) => {
      const template = sanitizeSeoTemplate(req.body, {}, user);
      db.seoTemplates.unshift(template);
      auditSeoChange(db, "create", "seo_template", template.id, null, template, user, req);
      await writeDbAsync(db);
      res.status(201).json({ template, templates: db.seoTemplates });
    })
  );

  router.put("/templates/:id", (req, res) =>
    withSeoPermission(req, res, "seo.update", async ({ db, user }) => {
      const index = (db.seoTemplates || []).findIndex((item) => item.id === req.params.id);
      if (index === -1) throw new Error("SEO template not found.");
      const before = db.seoTemplates[index];
      const after = sanitizeSeoTemplate(req.body, before, user);
      db.seoTemplates[index] = after;
      auditSeoChange(db, "update", "seo_template", after.id, before, after, user, req);
      await writeDbAsync(db);
      res.json({ template: after, templates: db.seoTemplates });
    })
  );

  router.delete("/templates/:id", (req, res) =>
    withSeoPermission(req, res, "seo.delete", async ({ db, user }) => {
      const index = (db.seoTemplates || []).findIndex((item) => item.id === req.params.id);
      if (index === -1) throw new Error("SEO template not found.");
      const [before] = db.seoTemplates.splice(index, 1);
      auditSeoChange(db, "delete", "seo_template", before.id, before, null, user, req);
      await writeDbAsync(db);
      res.json({ ok: true, templates: db.seoTemplates });
    })
  );

  router.get("/redirects", (req, res) =>
    withSeoPermission(req, res, "seo.manage_redirects", async ({ db }) => {
      const redirects = (db.seoRedirects || [])
        .filter((redirect) => req.query.enabled === undefined || String(redirect.enabled) === req.query.enabled)
        .filter((redirect) => !req.query.status_code || String(redirect.status_code) === String(req.query.status_code));
      res.json({ redirects, warnings: detectRedirectWarnings(redirects) });
    })
  );

  router.post("/redirects", (req, res) =>
    withSeoPermission(req, res, "seo.manage_redirects", async ({ db, user }) => {
      const redirect = sanitizeSeoRedirect(req.body, {}, db, user);
      db.seoRedirects.unshift(redirect);
      auditSeoChange(db, "create", "seo_redirect", redirect.id, null, redirect, user, req);
      await writeDbAsync(db);
      res.status(201).json({ redirect, redirects: db.seoRedirects, warnings: detectRedirectWarnings(db.seoRedirects) });
    })
  );

  router.put("/redirects/:id", (req, res) =>
    withSeoPermission(req, res, "seo.manage_redirects", async ({ db, user }) => {
      const index = (db.seoRedirects || []).findIndex((item) => item.id === req.params.id);
      if (index === -1) throw new Error("Redirect not found.");
      const before = db.seoRedirects[index];
      const after = sanitizeSeoRedirect(req.body, before, db, user);
      db.seoRedirects[index] = after;
      auditSeoChange(db, "update", "seo_redirect", after.id, before, after, user, req);
      await writeDbAsync(db);
      res.json({ redirect: after, redirects: db.seoRedirects, warnings: detectRedirectWarnings(db.seoRedirects) });
    })
  );

  router.delete("/redirects/:id", (req, res) =>
    withSeoPermission(req, res, "seo.manage_redirects", async ({ db, user }) => {
      const index = (db.seoRedirects || []).findIndex((item) => item.id === req.params.id);
      if (index === -1) throw new Error("Redirect not found.");
      const [before] = db.seoRedirects.splice(index, 1);
      auditSeoChange(db, "delete", "seo_redirect", before.id, before, null, user, req);
      await writeDbAsync(db);
      res.json({ ok: true, redirects: db.seoRedirects, warnings: detectRedirectWarnings(db.seoRedirects) });
    })
  );

  router.post("/redirects/import", (req, res) =>
    withSeoPermission(req, res, "seo.manage_redirects", async ({ db, user }) => {
      const csv = String(req.body.csv || "");
      const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const created = [];
      lines.forEach((line) => {
        const [from_path, to_url, status_code = "301"] = line.split(",").map((part) => part.trim());
        if (!from_path || !to_url) return;
        created.push(sanitizeSeoRedirect({ from_path, to_url, status_code }, {}, db, user));
      });
      db.seoRedirects.unshift(...created);
      auditSeoChange(db, "import", "seo_redirect", "bulk", null, created, user, req);
      await writeDbAsync(db);
      res.status(201).json({ imported: created.length, redirects: db.seoRedirects, warnings: detectRedirectWarnings(db.seoRedirects) });
    })
  );

  router.get("/redirects/export", (req, res) =>
    withSeoPermission(req, res, "seo.manage_redirects", async ({ db }) => {
      const csv = ["from_path,to_url,status_code,enabled,preserve_query_string,notes"]
        .concat((db.seoRedirects || []).map((item) => [item.from_path, item.to_url, item.status_code, item.enabled, item.preserve_query_string, item.notes].map(csvCell).join(",")))
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csv);
    })
  );

  router.get("/robots", (req, res) =>
    withSeoPermission(req, res, "seo.manage_robots", async ({ db }) => {
      res.json({ settings: db.seoGlobalSettings, robots: generateRobotsTxt(db, getRequestOrigin(req)) });
    })
  );

  router.put("/robots", (req, res) =>
    withSeoPermission(req, res, "seo.manage_robots", async ({ db, user }) => {
      const before = db.seoGlobalSettings;
      const after = sanitizeGlobalSettings({ ...before, ...req.body }, before);
      if ((after.robots_advanced_text || after.robots_disallow_patterns.join("\n")).includes("Disallow: /") && !req.body.confirm_disallow_all) {
        throw new Error("Critical warning: Disallow: / blocks the whole site. Confirm before saving.");
      }
      db.seoGlobalSettings = after;
      auditSeoChange(db, "update", "seo_robots", "robots.txt", before, after, user, req);
      await writeDbAsync(db);
      res.json({ settings: after, robots: generateRobotsTxt(db, getRequestOrigin(req)) });
    })
  );

  router.get("/sitemap", (req, res) =>
    withSeoPermission(req, res, "seo.manage_sitemap", async ({ db }) => {
      const urls = buildSitemapUrls(db, getRequestOrigin(req));
      res.json({ urls, count: urls.length, lastGeneratedAt: db.seoSitemap?.lastGeneratedAt || "" });
    })
  );

  router.post("/sitemap/regenerate", (req, res) =>
    withSeoPermission(req, res, "seo.manage_sitemap", async ({ db, user }) => {
      const urls = buildSitemapUrls(db, getRequestOrigin(req));
      const before = db.seoSitemap || {};
      db.seoSitemap = { lastGeneratedAt: new Date().toISOString(), urls };
      db.seoGlobalSettings.last_sitemap_generated_at = db.seoSitemap.lastGeneratedAt;
      auditSeoChange(db, "regenerate", "seo_sitemap", "sitemap.xml", before, db.seoSitemap, user, req);
      await writeDbAsync(db);
      res.json({ urls, count: urls.length, lastGeneratedAt: db.seoSitemap.lastGeneratedAt, xml: renderSitemapXml(urls) });
    })
  );

  router.get("/snippets", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db, permissions }) => {
      if (!permissions.has("seo.manage_code_snippets")) {
        res.json({ snippets: [], restricted: true });
        return;
      }
      res.json({ snippets: db.seoCodeSnippets || [], restricted: false });
    })
  );

  router.post("/snippets", (req, res) =>
    withSeoPermission(req, res, "seo.manage_code_snippets", async ({ db, user, permissions }) => {
      const snippet = sanitizeSeoSnippet(req.body, {}, user, permissions);
      db.seoCodeSnippets.unshift(snippet);
      auditSeoChange(db, "create", "seo_code_snippet", snippet.id, null, snippet, user, req);
      await writeDbAsync(db);
      res.status(201).json({ snippet, snippets: db.seoCodeSnippets });
    })
  );

  router.put("/snippets/:id", (req, res) =>
    withSeoPermission(req, res, "seo.manage_code_snippets", async ({ db, user, permissions }) => {
      const index = (db.seoCodeSnippets || []).findIndex((item) => item.id === req.params.id);
      if (index === -1) throw new Error("SEO snippet not found.");
      const before = db.seoCodeSnippets[index];
      const after = sanitizeSeoSnippet(req.body, before, user, permissions);
      db.seoCodeSnippets[index] = after;
      auditSeoChange(db, "update", "seo_code_snippet", after.id, before, after, user, req);
      await writeDbAsync(db);
      res.json({ snippet: after, snippets: db.seoCodeSnippets });
    })
  );

  router.delete("/snippets/:id", (req, res) =>
    withSeoPermission(req, res, "seo.manage_code_snippets", async ({ db, user }) => {
      const index = (db.seoCodeSnippets || []).findIndex((item) => item.id === req.params.id);
      if (index === -1) throw new Error("SEO snippet not found.");
      const [before] = db.seoCodeSnippets.splice(index, 1);
      auditSeoChange(db, "delete", "seo_code_snippet", before.id, before, null, user, req);
      await writeDbAsync(db);
      res.json({ ok: true, snippets: db.seoCodeSnippets });
    })
  );

  router.get("/media", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db }) => {
      res.json({ media: getMediaSeoInventory(db), saved: db.mediaSeo || [] });
    })
  );

  router.put("/media/:mediaId", (req, res) =>
    withSeoPermission(req, res, "seo.update", async ({ db, user }) => {
      const mediaId = req.params.mediaId;
      const currentIndex = (db.mediaSeo || []).findIndex((item) => item.media_id === mediaId);
      const current = currentIndex === -1 ? {} : db.mediaSeo[currentIndex];
      const after = sanitizeMediaSeo({ ...req.body, media_id: mediaId }, current, user);
      if (currentIndex === -1) db.mediaSeo.unshift(after);
      else db.mediaSeo[currentIndex] = after;
      auditSeoChange(db, currentIndex === -1 ? "create" : "update", "media_seo", mediaId, currentIndex === -1 ? null : current, after, user, req);
      await writeDbAsync(db);
      res.json({ media: getMediaSeoInventory(db), saved: db.mediaSeo });
    })
  );

  router.get("/audit", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db }) => {
      res.json({ logs: db.seoAuditLogs || [] });
    })
  );

  router.post("/audit/:id/rollback", (req, res) =>
    withSeoPermission(req, res, "seo.rollback", async ({ db, user }) => {
      const log = (db.seoAuditLogs || []).find((item) => item.id === req.params.id);
      if (!log || !log.before_json) throw new Error("This audit item cannot be rolled back.");
      rollbackAuditItem(db, log);
      auditSeoChange(db, "rollback", log.entity_type, log.entity_id, log.after_json, log.before_json, user, req);
      await writeDbAsync(db);
      res.json({ ok: true, logs: db.seoAuditLogs || [] });
    })
  );

  router.get("/entities", (req, res) =>
    withSeoPermission(req, res, "seo.view", async ({ db }) => {
      const products = (db.products || []).map((product) => ({ entity_type: "product", entity_id: product.id, title: product.title, route_path: `/product.html?id=${product.id}` }));
      const categories = (db.categories || []).map((category) => ({
        entity_type: "product_category",
        entity_id: category.id,
        title: category.title,
        route_path: category.id === "outerwear" ? "/outerwear.html" : category.id === "tops" ? "/tops.html" : category.id === "accessories" ? "/accessories.html" : `/category.html?type=${category.id}`
      }));
      const pages = [
        { entity_type: "home_page", entity_id: "home", title: "Home", route_path: "/" },
        { entity_type: "static_page", entity_id: "checkout", title: "Checkout", route_path: "/checkout.html" },
        { entity_type: "static_page", entity_id: "account", title: "Account", route_path: "/account.html" },
        { entity_type: "static_page", entity_id: "auth", title: "Login", route_path: "/auth.html" }
      ];
      res.json({ entities: [...pages, ...categories, ...products], products, categories, pages });
    })
  );

  return router;
}

function findDuplicateEntry(db, entry) {
  return (db.seoEntries || []).find((item) => {
    if (item.deleted_at || item.id === entry.id || item.locale !== entry.locale) return false;
    if (entry.entity_id && item.entity_type === entry.entity_type && item.entity_id === entry.entity_id) return true;
    if (entry.route_path && item.route_path === entry.route_path) return true;
    return false;
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[,"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rollbackAuditItem(db, log) {
  const value = log.before_json;
  if (log.entity_type === "seo_global_settings" || log.entity_type === "seo_robots") {
    db.seoGlobalSettings = value;
    return;
  }
  const map = {
    seo_entry: "seoEntries",
    seo_template: "seoTemplates",
    seo_redirect: "seoRedirects",
    seo_code_snippet: "seoCodeSnippets",
    media_seo: "mediaSeo"
  };
  const collectionName = map[log.entity_type];
  if (!collectionName) throw new Error("Rollback is not supported for this audit item.");
  db[collectionName] ||= [];
  const index = db[collectionName].findIndex((item) => item.id === value.id);
  if (index === -1) db[collectionName].unshift(value);
  else db[collectionName][index] = value;
}

module.exports = { createSeoAdminRouter };

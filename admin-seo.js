const seoLocked = document.querySelector("#seoLocked");
const seoLockedText = document.querySelector("#seoLockedText");
const seoDashboard = document.querySelector("#seoDashboard");
const seoNote = document.querySelector("#seoNote");
const seoRefresh = document.querySelector("#seoRefresh");
const panels = Object.fromEntries(Array.from(document.querySelectorAll(".seo-panel")).map((panel) => [panel.dataset.panel, panel]));
const tabs = Array.from(document.querySelectorAll("[data-seo-tab]"));

const state = {
  activeTab: "audit",
  settings: {},
  permissions: [],
  role: "guest",
  audit: { rows: [], summary: {}, redirectWarnings: [], mediaWithoutAlt: [] },
  entries: [],
  templates: [],
  redirects: [],
  redirectWarnings: [],
  sitemap: { urls: [], count: 0 },
  snippets: [],
  snippetsRestricted: false,
  media: [],
  logs: [],
  entities: [],
  editingEntryId: "",
  editingTemplateId: "",
  editingRedirectId: "",
  editingSnippetId: ""
};

const ENTITY_TYPES = [
  "home_page",
  "static_page",
  "dynamic_route",
  "product",
  "product_category",
  "collection",
  "brand",
  "blog_article",
  "blog_category",
  "landing_page",
  "custom_url",
  "search_page",
  "filtered_category_page"
];
const SCHEMA_TYPES = ["WebPage", "CollectionPage", "Product", "BreadcrumbList", "Article", "BlogPosting", "FAQPage", "Organization", "LocalBusiness", "WebSite", "ItemList", "Review"];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Request error");
    error.status = response.status;
    throw error;
  }
  return data;
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

function setStatus(message, isError = false) {
  seoNote.textContent = message;
  seoNote.classList.toggle("error", isError);
  seoNote.classList.toggle("success", Boolean(message) && !isError);
  if (message && !isError) {
    setTimeout(() => {
      if (seoNote.textContent === message) seoNote.textContent = "";
    }, 2600);
  }
}

function showLocked(message) {
  seoDashboard.hidden = true;
  seoLocked.hidden = false;
  seoLockedText.textContent = message;
}

function showDashboard() {
  seoLocked.hidden = true;
  seoDashboard.hidden = false;
}

function hasPermission(permission) {
  return state.permissions.includes(permission);
}

function selectTab(tabName) {
  state.activeTab = tabName;
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.seoTab === tabName));
  Object.values(panels).forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tabName));
  render();
}

async function loadAll(options = {}) {
  if (!options.silent) setStatus("Refreshing SEO data...");
  try {
    const [dashboard, settings, entries, templates, redirects, robots, sitemap, snippets, media, audit, entities] = await Promise.all([
      api("/api/admin/seo/dashboard"),
      api("/api/admin/seo/settings"),
      api("/api/admin/seo/entries"),
      api("/api/admin/seo/templates"),
      api("/api/admin/seo/redirects"),
      api("/api/admin/seo/robots"),
      api("/api/admin/seo/sitemap"),
      api("/api/admin/seo/snippets"),
      api("/api/admin/seo/media"),
      api("/api/admin/seo/audit"),
      api("/api/admin/seo/entities")
    ]);

    state.permissions = dashboard.permissions || settings.permissions || [];
    state.role = dashboard.role || settings.role || "admin";
    state.audit = dashboard;
    state.settings = settings.settings || {};
    state.entries = entries.entries || [];
    state.templates = templates.templates || [];
    state.redirects = redirects.redirects || [];
    state.redirectWarnings = redirects.warnings || [];
    state.robots = robots.robots || "";
    state.sitemap = sitemap;
    state.snippets = snippets.snippets || [];
    state.snippetsRestricted = Boolean(snippets.restricted);
    state.media = media.media || [];
    state.logs = audit.logs || [];
    state.entities = entities.entities || [];
    showDashboard();
    render();
    if (!options.silent) setStatus("SEO data refreshed successfully.");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/auth.html?next=/admin/seo";
      return;
    }
    showLocked(error.message);
  }
}

function render() {
  renderAudit();
  renderSettings();
  renderEntries();
  renderTemplates();
  renderEcommerce();
  renderSchema();
  renderRedirects();
  renderRobots();
  renderSitemap();
  renderHreflang();
  renderSocial();
  renderMedia();
  renderSnippets();
  renderHistory();
}

function badge(text, className = "") {
  return `<span class="seo-badge ${className}">${escapeHtml(text)}</span>`;
}

function renderAudit() {
  const panel = panels.audit;
  const summary = state.audit.summary || {};
  panel.innerHTML = `
    <div class="seo-summary-grid">
      <article><span>Total pages</span><strong>${summary.total_pages || 0}</strong></article>
      <article><span>Errors</span><strong>${summary.errors || 0}</strong></article>
      <article><span>Warnings</span><strong>${summary.warnings || 0}</strong></article>
      <article><span>Noindex</span><strong>${summary.noindex || 0}</strong></article>
      <article><span>Sitemap URLs</span><strong>${summary.sitemap_count || 0}</strong></article>
      <article><span>Media without alt</span><strong>${summary.media_without_alt || 0}</strong></article>
    </div>
    <form class="seo-filter-row" id="seoAuditFilters">
      <select name="entity_type"><option value="">All entity types</option>${ENTITY_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("")}</select>
      <select name="status"><option value="">All statuses</option><option>draft</option><option>published</option><option>archived</option></select>
      <select name="indexing"><option value="">Index/noindex</option><option value="index">index</option><option value="noindex">noindex</option></select>
      <select name="has"><option value="">All health</option><option value="errors">Has errors</option><option value="warnings">Has warnings</option></select>
      <input name="locale" placeholder="Locale" />
      <input name="updated_by" placeholder="Updated by" />
      <input name="date_from" type="date" />
      <input name="date_to" type="date" />
      <button class="button ghost dark" type="submit">Filter</button>
    </form>
    <div class="seo-meta-line">Last sitemap: ${escapeHtml(summary.last_sitemap_generated_at || "not generated")} · Last SEO change: ${escapeHtml(summary.last_seo_updated_at || "no data")}</div>
    <div class="seo-table-wrap">
      <table class="seo-table">
        <thead><tr><th>Page</th><th>Source</th><th>Index</th><th>Problems</th><th>Canonical</th></tr></thead>
        <tbody>
          ${(state.audit.rows || [])
            .map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.title || row.route_path)}</strong><small>${escapeHtml(row.entity_type)} · ${escapeHtml(row.route_path || row.entity_id)}</small></td>
                <td>${escapeHtml(row.source || "")}</td>
                <td>${badge(row.robots_index || "index", row.robots_index === "noindex" ? "warn" : "ok")}</td>
                <td>
                  ${(row.errors || []).map((item) => badge(item, "error")).join(" ")}
                  ${(row.warnings || []).map((item) => badge(item, "warn")).join(" ")}
                </td>
                <td><small>${escapeHtml(row.canonical || "")}</small></td>
              </tr>
            `).join("")}
        </tbody>
      </table>
    </div>
    ${(state.audit.redirectWarnings || []).length ? `<div class="seo-warning-box">${state.audit.redirectWarnings.map((item) => escapeHtml(item.message)).join("<br>")}</div>` : ""}
  `;
}

function settingInput(name, label, type = "text") {
  const value = state.settings[name];
  if (type === "checkbox") {
    return `<label class="seo-check"><input type="checkbox" name="${name}" ${value ? "checked" : ""} /> ${label}</label>`;
  }
  if (type === "textarea") {
    return `<label class="full-span">${label}<textarea name="${name}" rows="3">${escapeHtml(Array.isArray(value) ? value.join("\n") : value || "")}</textarea></label>`;
  }
  return `<label>${label}<input name="${name}" value="${escapeHtml(Array.isArray(value) ? value.join(", ") : value || "")}" /></label>`;
}

function renderSettings() {
  panels.settings.innerHTML = `
    <form class="seo-card" id="seoSettingsForm">
      <div class="seo-section-title"><h3>Global SEO Settings</h3><p>Fallback metadata used when pages do not have their own SEO entry.</p></div>
      <div class="form-grid">
        ${settingInput("site_name", "Site name")}
        ${settingInput("base_url", "Base URL")}
        ${settingInput("default_locale", "Default locale")}
        ${settingInput("available_locales", "Available locales")}
        ${settingInput("title_separator", "Title separator")}
        ${settingInput("default_title_template", "Default title template")}
        ${settingInput("default_meta_title", "Default meta title")}
        ${settingInput("default_meta_description", "Default meta description", "textarea")}
        ${settingInput("default_h1_template", "Default H1 template")}
        ${selectField("default_canonical_strategy", "Canonical strategy", ["self", "custom", "none"], state.settings.default_canonical_strategy)}
        ${selectField("default_robots_index", "Robots index", ["index", "noindex"], state.settings.default_robots_index)}
        ${selectField("default_robots_follow", "Robots follow", ["follow", "nofollow"], state.settings.default_robots_follow)}
        ${settingInput("default_max_snippet", "Max snippet")}
        ${selectField("default_max_image_preview", "Max image preview", ["none", "standard", "large"], state.settings.default_max_image_preview)}
        ${settingInput("default_max_video_preview", "Max video preview")}
        ${settingInput("default_noarchive", "Noarchive", "checkbox")}
        ${settingInput("default_nosnippet", "Nosnippet", "checkbox")}
      </div>
      <div class="seo-section-title"><h3>Brand / Organization</h3></div>
      <div class="form-grid">
        ${settingInput("organization_name", "Organization name")}
        ${settingInput("organization_legal_name", "Legal name")}
        ${settingInput("organization_logo", "Logo")}
        ${settingInput("organization_url", "Organization URL")}
        ${settingInput("organization_phone", "Phone")}
        ${settingInput("organization_email", "Email")}
        ${settingInput("organization_address", "Address", "textarea")}
        ${settingInput("same_as_social_links", "SameAs social links", "textarea")}
        ${settingInput("brand_description", "Brand description", "textarea")}
      </div>
      <div class="seo-section-title"><h3>E-commerce / Sitemap / Verification</h3></div>
      <div class="form-grid">
        ${settingInput("default_product_title_template", "Product title template")}
        ${settingInput("default_category_title_template", "Category title template")}
        ${settingInput("default_product_description_template", "Product description template", "textarea")}
        ${settingInput("default_category_description_template", "Category description template", "textarea")}
        ${settingInput("default_product_schema_enabled", "Product schema enabled", "checkbox")}
        ${settingInput("default_breadcrumb_schema_enabled", "Breadcrumb schema enabled", "checkbox")}
        ${settingInput("sitemap_enabled", "Sitemap enabled", "checkbox")}
        ${settingInput("sitemap_include_pages", "Include pages", "checkbox")}
        ${settingInput("sitemap_include_products", "Include products", "checkbox")}
        ${settingInput("sitemap_include_categories", "Include categories", "checkbox")}
        ${settingInput("sitemap_include_collections", "Include collections", "checkbox")}
        ${settingInput("sitemap_include_brands", "Include brands", "checkbox")}
        ${settingInput("sitemap_include_blog", "Include blog", "checkbox")}
        ${settingInput("exclude_noindex_from_sitemap", "Exclude noindex from sitemap", "checkbox")}
        ${settingInput("auto_regenerate_sitemap_on_publish", "Auto regenerate on publish", "checkbox")}
        ${settingInput("default_changefreq", "Default changefreq")}
        ${settingInput("default_priority", "Default priority")}
        ${settingInput("google_site_verification", "Google verification")}
        ${settingInput("bing_site_verification", "Bing verification")}
        ${settingInput("facebook_domain_verification", "Facebook domain verification")}
      </div>
      <div class="seo-preview-grid">
        ${renderSerpPreview(state.settings.default_meta_title, state.settings.default_meta_description, state.settings.base_url)}
      </div>
      <button class="button primary" type="submit">Save global SEO settings</button>
    </form>
  `;
}

function selectField(name, label, options, selected = "") {
  return `<label>${label}<select name="${name}">${options.map((option) => `<option value="${option}" ${String(selected) === option ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
}

function renderSerpPreview(title, description, url) {
  return `<div class="seo-serp-preview"><small>${escapeHtml(url || "https://www.hoodyboody.com")}</small><strong>${escapeHtml(title || "SEO title preview")}</strong><p>${escapeHtml(description || "Meta description preview.")}</p></div>`;
}

function renderSocialCard(title, description, image) {
  return `<div class="seo-social-card"><div class="seo-social-image" style="--social-image:url('${escapeHtml(image || "/assets/embroidered-collection.png")}')"></div><div><strong>${escapeHtml(title || "Social title preview")}</strong><p>${escapeHtml(description || "Social description preview.")}</p></div></div>`;
}

function getBlankEntry(entity = {}) {
  return {
    id: "",
    entity_type: entity.entity_type || "static_page",
    entity_id: entity.entity_id || "",
    route_path: entity.route_path || "",
    slug: entity.entity_id || "",
    locale: state.settings.default_locale || "en-US",
    status: "published",
    seo_title: entity.title || "",
    meta_title: "",
    meta_description: "",
    h1: entity.title || "",
    short_description: "",
    canonical_mode: "inherited",
    canonical_url: "",
    robots_index: "inherit",
    robots_follow: "inherit",
    og_enabled: true,
    og_type: entity.entity_type === "product" ? "product" : "website",
    twitter_enabled: true,
    twitter_card: "summary_large_image",
    include_in_sitemap: true,
    sitemap_priority: 0.5,
    sitemap_changefreq: "weekly",
    sitemap_lastmod_mode: "auto",
    hreflang_enabled: false,
    hreflang_items: [],
    schema_enabled: entity.entity_type === "product",
    schema_type: entity.entity_type === "product" ? "Product" : entity.entity_type === "product_category" ? "CollectionPage" : "WebPage",
    schema_auto_generate: true,
    schema_json_override: ""
  };
}

function renderEntries() {
  const entry = state.editingEntryId ? state.entries.find((item) => item.id === state.editingEntryId) || getBlankEntry() : getBlankEntry();
  panels.entries.innerHTML = `
    <div class="seo-two-column">
      <div class="seo-card">
        <div class="seo-section-title"><h3>SEO Entries</h3><button class="button primary" type="button" data-new-entry>Create SEO entry</button></div>
        <div class="seo-list">
          ${state.entries.map((item) => `
            <button class="seo-list-item ${item.id === state.editingEntryId ? "active" : ""}" type="button" data-edit-entry="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.seo_title || item.h1 || item.route_path || item.entity_id)}</strong>
              <small>${escapeHtml(item.entity_type)} · ${escapeHtml(item.entity_id || item.route_path)} · ${escapeHtml(item.status)}</small>
            </button>
          `).join("") || `<div class="summary-empty admin-product-empty">No SEO entries yet.</div>`}
        </div>
      </div>
      <form class="seo-card" id="seoEntryForm" data-entry-id="${escapeHtml(entry.id || "")}">
        <div class="seo-section-title"><h3>${entry.id ? "Edit SEO entry" : "Create SEO entry"}</h3><p>Page override wins over template and global defaults.</p></div>
        <div class="seo-entry-tabs">
          <span>Basic SEO</span><span>Search Appearance</span><span>Social</span><span>Indexing</span><span>Canonical & Hreflang</span><span>Schema</span><span>Sitemap</span><span>Advanced</span>
        </div>
        <div class="form-grid">
          ${selectField("entity_type", "Entity type", ENTITY_TYPES, entry.entity_type)}
          <label>Entity ID<input name="entity_id" list="seoEntityIds" value="${escapeHtml(entry.entity_id || "")}" /></label>
          <datalist id="seoEntityIds">${state.entities.map((entity) => `<option value="${escapeHtml(entity.entity_id)}">${escapeHtml(entity.title)} (${escapeHtml(entity.entity_type)})</option>`).join("")}</datalist>
          <label>Route path<input name="route_path" value="${escapeHtml(entry.route_path || "")}" placeholder="/product.html?id=..." /></label>
          <label>Slug<input name="slug" value="${escapeHtml(entry.slug || "")}" /></label>
          <label>Locale<input name="locale" value="${escapeHtml(entry.locale || state.settings.default_locale || "en-US")}" /></label>
          ${selectField("status", "Status", ["draft", "published", "archived"], entry.status)}
          <label>SEO title<input name="seo_title" data-counter="title" value="${escapeHtml(entry.seo_title || "")}" /></label>
          <label>Meta title<input name="meta_title" value="${escapeHtml(entry.meta_title || "")}" /></label>
          <label class="full-span">Meta description<textarea name="meta_description" data-counter="description" rows="3">${escapeHtml(entry.meta_description || "")}</textarea></label>
          <label>H1<input name="h1" value="${escapeHtml(entry.h1 || "")}" /></label>
          <label>Focus keyword<input name="focus_keyword" value="${escapeHtml(entry.focus_keyword || "")}" /></label>
          <label class="full-span">Secondary keywords<textarea name="secondary_keywords" rows="2">${escapeHtml((entry.secondary_keywords || []).join("\n"))}</textarea></label>
          <label class="full-span">SEO content top<textarea name="seo_content_top" rows="3">${escapeHtml(entry.seo_content_top || "")}</textarea></label>
          <label class="full-span">SEO content bottom<textarea name="seo_content_bottom" rows="3">${escapeHtml(entry.seo_content_bottom || "")}</textarea></label>
          ${selectField("canonical_mode", "Canonical mode", ["self", "custom", "inherited", "none"], entry.canonical_mode)}
          <label>Canonical URL<input name="canonical_url" value="${escapeHtml(entry.canonical_url || "")}" /></label>
          ${selectField("robots_index", "Robots index", ["inherit", "index", "noindex"], entry.robots_index)}
          ${selectField("robots_follow", "Robots follow", ["inherit", "follow", "nofollow"], entry.robots_follow)}
          ${checkboxField("robots_noarchive", "Noarchive", entry.robots_noarchive)}
          ${checkboxField("robots_nosnippet", "Nosnippet", entry.robots_nosnippet)}
          ${checkboxField("robots_noimageindex", "Noimageindex", entry.robots_noimageindex)}
          <label>Max snippet<input name="robots_max_snippet" value="${escapeHtml(entry.robots_max_snippet || "")}" /></label>
          ${selectField("robots_max_image_preview", "Max image preview", ["", "none", "standard", "large"], entry.robots_max_image_preview)}
          <label>Unavailable after<input name="unavailable_after" value="${escapeHtml(entry.unavailable_after || "")}" /></label>
          ${checkboxField("og_enabled", "Open Graph enabled", entry.og_enabled !== false)}
          <label>OG title<input name="og_title" value="${escapeHtml(entry.og_title || "")}" /></label>
          <label class="full-span">OG description<textarea name="og_description" rows="2">${escapeHtml(entry.og_description || "")}</textarea></label>
          <label>OG image<input name="og_image" value="${escapeHtml(entry.og_image || "")}" /></label>
          <label>OG image alt<input name="og_image_alt" value="${escapeHtml(entry.og_image_alt || "")}" /></label>
          ${selectField("og_type", "OG type", ["website", "article", "product"], entry.og_type)}
          <label>OG URL<input name="og_url" value="${escapeHtml(entry.og_url || "")}" /></label>
          ${checkboxField("twitter_enabled", "Twitter/X enabled", entry.twitter_enabled !== false)}
          ${selectField("twitter_card", "Twitter card", ["summary", "summary_large_image"], entry.twitter_card)}
          <label>Twitter title<input name="twitter_title" value="${escapeHtml(entry.twitter_title || "")}" /></label>
          <label>Twitter image<input name="twitter_image" value="${escapeHtml(entry.twitter_image || "")}" /></label>
          <label class="full-span">Twitter description<textarea name="twitter_description" rows="2">${escapeHtml(entry.twitter_description || "")}</textarea></label>
          ${checkboxField("include_in_sitemap", "Include in sitemap", entry.include_in_sitemap !== false)}
          <label>Sitemap priority<input name="sitemap_priority" type="number" min="0" max="1" step="0.1" value="${escapeHtml(entry.sitemap_priority ?? 0.5)}" /></label>
          <label>Sitemap changefreq<input name="sitemap_changefreq" value="${escapeHtml(entry.sitemap_changefreq || "weekly")}" /></label>
          ${selectField("sitemap_lastmod_mode", "Lastmod mode", ["auto", "manual"], entry.sitemap_lastmod_mode)}
          <label>Sitemap lastmod<input name="sitemap_lastmod" value="${escapeHtml(entry.sitemap_lastmod || "")}" /></label>
          ${checkboxField("hreflang_enabled", "Hreflang enabled", entry.hreflang_enabled)}
          <label class="full-span">Hreflang JSON<textarea name="hreflang_items" rows="3">${escapeHtml(JSON.stringify(entry.hreflang_items || [], null, 2))}</textarea></label>
          <label>X-default URL<input name="x_default_url" value="${escapeHtml(entry.x_default_url || "")}" /></label>
          ${checkboxField("schema_enabled", "Schema enabled", entry.schema_enabled)}
          ${checkboxField("schema_auto_generate", "Auto-generate schema", entry.schema_auto_generate !== false)}
          ${selectField("schema_type", "Schema type", SCHEMA_TYPES, entry.schema_type)}
          <label class="full-span">Schema JSON override<textarea name="schema_json_override" rows="5">${escapeHtml(entry.schema_json_override || "")}</textarea></label>
        </div>
        <div class="seo-preview-grid">
          ${renderSerpPreview(entry.seo_title, entry.meta_description, entry.canonical_url || entry.route_path)}
          ${renderSocialCard(entry.og_title || entry.seo_title, entry.og_description || entry.meta_description, entry.og_image)}
        </div>
        <div class="admin-editor-actions">
          ${entry.id ? `<button class="button ghost dark danger-button" type="button" data-delete-entry="${escapeHtml(entry.id)}">Delete SEO entry</button>` : ""}
          <button class="button primary" type="submit">${entry.id ? "Save SEO entry" : "Create SEO entry"}</button>
        </div>
      </form>
    </div>
  `;
}

function checkboxField(name, label, checked) {
  return `<label class="seo-check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} /> ${label}</label>`;
}

function renderTemplates() {
  const template = state.editingTemplateId ? state.templates.find((item) => item.id === state.editingTemplateId) || {} : {};
  panels.templates.innerHTML = `
    <div class="seo-two-column">
      <div class="seo-card">
        <div class="seo-section-title"><h3>Templates</h3><button class="button primary" type="button" data-new-template>Create template</button></div>
        <div class="seo-list">${state.templates.map((item) => `<button class="seo-list-item ${item.id === state.editingTemplateId ? "active" : ""}" type="button" data-edit-template="${item.id}"><strong>${escapeHtml(item.name || item.template_name)}</strong><small>${escapeHtml(item.entity_type)} · ${escapeHtml(item.locale)} · order ${escapeHtml(item.fallback_order)}</small></button>`).join("")}</div>
      </div>
      <form class="seo-card" id="seoTemplateForm" data-template-id="${escapeHtml(template.id || "")}">
        <div class="seo-section-title"><h3>${template.id ? "Edit template" : "Create template"}</h3><p>Variables: {site_name}, {page_title}, {product_name}, {category_name}, {price}, {currency}, {sku}, {color}, {size}, {brand_name}, {article_title}.</p></div>
        <div class="form-grid">
          <label>Name<input name="name" value="${escapeHtml(template.name || "")}" required /></label>
          ${selectField("entity_type", "Entity type", ENTITY_TYPES, template.entity_type || "product")}
          <label>Locale<input name="locale" value="${escapeHtml(template.locale || state.settings.default_locale || "en-US")}" /></label>
          <label>Fallback order<input name="fallback_order" type="number" value="${escapeHtml(template.fallback_order || 100)}" /></label>
          ${checkboxField("active", "Active", template.active !== false)}
          <label class="full-span">Title template<textarea name="title_template" rows="2">${escapeHtml(template.title_template || "{page_title} | {site_name}")}</textarea></label>
          <label class="full-span">Meta description template<textarea name="meta_description_template" rows="3">${escapeHtml(template.meta_description_template || "{short_description}")}</textarea></label>
          <label class="full-span">H1 template<textarea name="h1_template" rows="2">${escapeHtml(template.h1_template || "{page_title}")}</textarea></label>
          <label class="full-span">OG title template<textarea name="og_title_template" rows="2">${escapeHtml(template.og_title_template || "{page_title}")}</textarea></label>
          <label class="full-span">OG description template<textarea name="og_description_template" rows="2">${escapeHtml(template.og_description_template || "{short_description}")}</textarea></label>
          <label class="full-span">Canonical template<textarea name="canonical_template" rows="2">${escapeHtml(template.canonical_template || "{canonical_url}")}</textarea></label>
          <label class="full-span">Schema template JSON<textarea name="schema_template_json" rows="4">${escapeHtml(template.schema_template_json || "")}</textarea></label>
        </div>
        <div class="seo-preview-grid">${renderSerpPreview((template.title_template || "{product_name} | {site_name}").replace("{product_name}", "Hoodie Herbarium").replace("{site_name}", state.settings.site_name || "HOODYBOODY"), (template.meta_description_template || "{short_description}").replace("{short_description}", "Dense fleece, sage twig and small monogram."), state.settings.base_url)}</div>
        <div class="admin-editor-actions">
          ${template.id ? `<button class="button ghost dark danger-button" type="button" data-delete-template="${escapeHtml(template.id)}">Delete template</button>` : ""}
          <button class="button primary" type="submit">${template.id ? "Save template" : "Create template"}</button>
        </div>
      </form>
    </div>
  `;
}

function renderEcommerce() {
  const products = state.entities.filter((entity) => entity.entity_type === "product");
  const categories = state.entities.filter((entity) => entity.entity_type === "product_category");
  panels.ecommerce.innerHTML = `
    <div class="seo-card">
      <div class="seo-section-title"><h3>E-commerce SEO</h3><p>Product and category SEO uses the same Page SEO entries with product/category schema support.</p></div>
      <div class="seo-entity-grid">
        ${[...categories, ...products].map((entity) => {
          const entry = state.entries.find((item) => item.entity_type === entity.entity_type && item.entity_id === entity.entity_id);
          return `<article class="seo-entity-card"><strong>${escapeHtml(entity.title)}</strong><small>${escapeHtml(entity.entity_type)} · ${escapeHtml(entity.route_path)}</small>${entry ? badge("SEO entry", "ok") : badge("Using template", "warn")}<button class="button ghost dark" type="button" data-entity-entry="${escapeHtml(entity.entity_type)}|${escapeHtml(entity.entity_id)}">Edit SEO</button></article>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderSchema() {
  panels.schema.innerHTML = `
    <div class="seo-card">
      <div class="seo-section-title"><h3>Structured Data / Schema.org</h3><p>JSON-LD is generated automatically for WebPage, Product, CollectionPage, Organization and BreadcrumbList. Overrides are validated before saving.</p></div>
      <div class="seo-table-wrap"><table class="seo-table"><thead><tr><th>Entry</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${state.entries.map((entry) => `<tr><td>${escapeHtml(entry.seo_title || entry.route_path || entry.entity_id)}</td><td>${escapeHtml(entry.schema_type || "WebPage")}</td><td>${entry.schema_enabled ? badge(entry.schema_validation_status || "enabled", "ok") : badge("auto/global", "warn")}</td><td><button class="button ghost dark" type="button" data-edit-entry="${escapeHtml(entry.id)}" data-switch-tab="entries">Edit schema</button></td></tr>`).join("")}
      </tbody></table></div>
    </div>
  `;
}

function renderRedirects() {
  const redirect = state.editingRedirectId ? state.redirects.find((item) => item.id === state.editingRedirectId) || {} : {};
  panels.redirects.innerHTML = `
    <div class="seo-two-column">
      <div class="seo-card">
        <div class="seo-section-title"><h3>Redirects</h3><button class="button primary" type="button" data-new-redirect>Create redirect</button></div>
        ${(state.redirectWarnings || []).map((item) => `<div class="seo-warning-box">${escapeHtml(item.message)}</div>`).join("")}
        <div class="seo-list">${state.redirects.map((item) => `<button class="seo-list-item ${item.id === state.editingRedirectId ? "active" : ""}" type="button" data-edit-redirect="${item.id}"><strong>${escapeHtml(item.from_path)} → ${escapeHtml(item.to_url)}</strong><small>${escapeHtml(item.status_code)} · hits ${escapeHtml(item.hit_count || 0)} · ${item.enabled === false ? "disabled" : "enabled"}</small></button>`).join("") || `<div class="summary-empty admin-product-empty">No redirects yet.</div>`}</div>
        <form id="seoRedirectImport" class="seo-mini-form"><textarea name="csv" rows="4" placeholder="/old,/new,301"></textarea><button class="button ghost dark" type="submit">Import CSV</button><a class="button ghost dark" href="/api/admin/seo/redirects/export">Export CSV</a></form>
      </div>
      <form class="seo-card" id="seoRedirectForm" data-redirect-id="${escapeHtml(redirect.id || "")}">
        <div class="seo-section-title"><h3>${redirect.id ? "Edit redirect" : "Create redirect"}</h3></div>
        <div class="form-grid">
          <label>From path<input name="from_path" value="${escapeHtml(redirect.from_path || "")}" placeholder="/old-url" required /></label>
          <label>To URL<input name="to_url" value="${escapeHtml(redirect.to_url || "")}" placeholder="/new-url or https://..." required /></label>
          ${selectField("status_code", "Status code", ["301", "302", "307", "308"], String(redirect.status_code || 301))}
          ${checkboxField("preserve_query_string", "Preserve query string", redirect.preserve_query_string !== false)}
          ${checkboxField("is_regex", "Regex redirect", redirect.is_regex)}
          ${checkboxField("enabled", "Enabled", redirect.enabled !== false)}
          <label>Regex flags<input name="regex_flags" value="${escapeHtml(redirect.regex_flags || "")}" /></label>
          <label class="full-span">Notes<textarea name="notes" rows="3">${escapeHtml(redirect.notes || "")}</textarea></label>
        </div>
        <div class="admin-editor-actions">${redirect.id ? `<button class="button ghost dark danger-button" type="button" data-delete-redirect="${redirect.id}">Delete redirect</button>` : ""}<button class="button primary" type="submit">${redirect.id ? "Save redirect" : "Create redirect"}</button></div>
      </form>
    </div>
  `;
}

function renderRobots() {
  panels.robots.innerHTML = `
    <form class="seo-card" id="seoRobotsForm">
      <div class="seo-section-title"><h3>Robots.txt</h3><p>Visual rules generate robots.txt. Advanced text overrides generated output.</p></div>
      <div class="form-grid">
        ${checkboxField("robots_txt_enabled", "Robots.txt enabled", state.settings.robots_txt_enabled !== false)}
        <label class="full-span">Global rules<textarea name="robots_global_rules" rows="4">${escapeHtml(state.settings.robots_global_rules || "")}</textarea></label>
        <label class="full-span">Allow patterns<textarea name="robots_allow_patterns" rows="3">${escapeHtml((state.settings.robots_allow_patterns || []).join("\n"))}</textarea></label>
        <label class="full-span">Disallow patterns<textarea name="robots_disallow_patterns" rows="3">${escapeHtml((state.settings.robots_disallow_patterns || []).join("\n"))}</textarea></label>
        <label class="full-span">Sitemap URL<input name="robots_sitemap_url" value="${escapeHtml(state.settings.robots_sitemap_url || "")}" /></label>
        <label class="full-span">Advanced robots.txt<textarea name="robots_advanced_text" rows="8">${escapeHtml(state.settings.robots_advanced_text || "")}</textarea></label>
        ${checkboxField("confirm_disallow_all", "I confirm if this blocks the whole site", false)}
      </div>
      ${String(state.robots || "").includes("Disallow: /") ? `<div class="seo-warning-box critical">Critical: robots.txt contains Disallow: /</div>` : ""}
      <pre class="seo-code-preview">${escapeHtml(state.robots || "")}</pre>
      <button class="button primary" type="submit">Save robots.txt</button>
    </form>
  `;
}

function renderSitemap() {
  panels.sitemap.innerHTML = `
    <div class="seo-card">
      <div class="seo-section-title"><h3>XML Sitemap</h3><p>${state.sitemap.count || 0} URLs · last generated ${escapeHtml(state.sitemap.lastGeneratedAt || "not generated")}</p></div>
      <div class="admin-toolbar"><button class="button primary" type="button" data-regenerate-sitemap>Regenerate sitemap</button><a class="button ghost dark" href="/sitemap-index.xml" target="_blank">Sitemap index</a><a class="button ghost dark" href="/sitemap.xml" target="_blank">Main sitemap</a></div>
      <div class="seo-table-wrap"><table class="seo-table"><thead><tr><th>URL</th><th>Lastmod</th><th>Freq</th><th>Priority</th></tr></thead><tbody>${(state.sitemap.urls || []).map((url) => `<tr><td>${escapeHtml(url.loc)}</td><td>${escapeHtml(url.lastmod)}</td><td>${escapeHtml(url.changefreq)}</td><td>${escapeHtml(url.priority)}</td></tr>`).join("")}</tbody></table></div>
    </div>
  `;
}

function renderHreflang() {
  panels.hreflang.innerHTML = `
    <form class="seo-card" id="seoHreflangForm">
      <div class="seo-section-title"><h3>Hreflang / Locales</h3><p>This store is currently US-only, but alternate locale structure is ready.</p></div>
      <div class="form-grid">
        ${checkboxField("hreflang_enabled", "Enable hreflang", state.settings.hreflang_enabled)}
        <label>Default locale<input name="default_locale" value="${escapeHtml(state.settings.default_locale || "en-US")}" /></label>
        <label class="full-span">Available locales<textarea name="available_locales" rows="3">${escapeHtml((state.settings.available_locales || []).join("\n"))}</textarea></label>
        <label class="full-span">Global hreflang JSON<textarea name="hreflang_items" rows="5">${escapeHtml(JSON.stringify(state.settings.hreflang_items || [], null, 2))}</textarea></label>
      </div>
      <button class="button primary" type="submit">Save hreflang settings</button>
    </form>
  `;
}

function renderSocial() {
  panels.social.innerHTML = `
    <form class="seo-card" id="seoSocialForm">
      <div class="seo-section-title"><h3>Social Preview / Open Graph</h3></div>
      <div class="form-grid">
        <label>Default OG title<input name="default_og_title" value="${escapeHtml(state.settings.default_og_title || "")}" /></label>
        <label>Default OG image<input name="default_og_image" value="${escapeHtml(state.settings.default_og_image || "")}" /></label>
        <label class="full-span">Default OG description<textarea name="default_og_description" rows="3">${escapeHtml(state.settings.default_og_description || "")}</textarea></label>
        ${selectField("default_og_type", "Default OG type", ["website"], state.settings.default_og_type || "website")}
        <label>OG site name<input name="og_site_name" value="${escapeHtml(state.settings.og_site_name || "")}" /></label>
        <label>OG locale<input name="og_locale" value="${escapeHtml(state.settings.og_locale || "")}" /></label>
        ${selectField("twitter_card", "Twitter/X card", ["summary", "summary_large_image"], state.settings.twitter_card || "summary_large_image")}
        <label>Twitter site<input name="twitter_site" value="${escapeHtml(state.settings.twitter_site || "")}" /></label>
        <label>Twitter creator<input name="twitter_creator" value="${escapeHtml(state.settings.twitter_creator || "")}" /></label>
        <label>Social image alt<input name="default_social_image_alt" value="${escapeHtml(state.settings.default_social_image_alt || "")}" /></label>
      </div>
      <div class="seo-preview-grid">${renderSocialCard(state.settings.default_og_title || state.settings.default_meta_title, state.settings.default_og_description || state.settings.default_meta_description, state.settings.default_og_image)}</div>
      <button class="button primary" type="submit">Save social settings</button>
    </form>
  `;
}

function renderMedia() {
  panels.media.innerHTML = `
    <div class="seo-card">
      <div class="seo-section-title"><h3>Media SEO</h3><p>Product images can be marked decorative or given alt text.</p></div>
      <div class="seo-list">
        ${state.media.map((item) => `
          <form class="seo-media-row" data-media-id="${escapeHtml(item.media_id)}">
            <strong>${escapeHtml(item.file_name || item.media_id)}</strong>
            <input name="alt_text" value="${escapeHtml(item.alt_text || "")}" placeholder="Alt text" />
            <input name="title" value="${escapeHtml(item.title || "")}" placeholder="Title" />
            <label class="seo-check"><input type="checkbox" name="is_decorative" ${item.is_decorative ? "checked" : ""} /> Decorative</label>
            <button class="button ghost dark" type="submit">Save</button>
          </form>
        `).join("") || `<div class="summary-empty admin-product-empty">No uploaded product media yet.</div>`}
      </div>
    </div>
  `;
}

function renderSnippets() {
  if (state.snippetsRestricted) {
    panels.snippets.innerHTML = `<div class="seo-card"><h3>SEO Code Snippets</h3><p>This section is restricted to SuperAdmin because custom head/body code can affect security and tracking.</p></div>`;
    return;
  }
  const snippet = state.editingSnippetId ? state.snippets.find((item) => item.id === state.editingSnippetId) || {} : {};
  panels.snippets.innerHTML = `
    <div class="seo-two-column">
      <div class="seo-card">
        <div class="seo-section-title"><h3>SEO Code Snippets</h3><button class="button primary" type="button" data-new-snippet>Create snippet</button></div>
        <div class="seo-warning-box">Only SuperAdmin can save script/custom head/body snippets. Inline event handlers are blocked.</div>
        <div class="seo-list">${state.snippets.map((item) => `<button class="seo-list-item ${item.id === state.editingSnippetId ? "active" : ""}" type="button" data-edit-snippet="${item.id}"><strong>${escapeHtml(item.name || item.snippet_name)}</strong><small>${escapeHtml(item.snippet_type)} · ${escapeHtml(item.placement)} · ${item.enabled === false ? "disabled" : "enabled"}</small></button>`).join("")}</div>
      </div>
      <form class="seo-card" id="seoSnippetForm" data-snippet-id="${escapeHtml(snippet.id || "")}">
        <div class="form-grid">
          <label>Name<input name="name" value="${escapeHtml(snippet.name || "")}" required /></label>
          ${selectField("snippet_type", "Type", ["meta", "link", "json_ld", "verification", "analytics_script", "custom_head", "custom_body"], snippet.snippet_type || "meta")}
          ${selectField("placement", "Placement", ["head_start", "head_end", "body_start", "body_end"], snippet.placement || "head_end")}
          <label>Priority<input name="priority" type="number" value="${escapeHtml(snippet.priority || 100)}" /></label>
          ${checkboxField("enabled", "Enabled", snippet.enabled !== false)}
          <label class="full-span">Scope JSON<textarea name="scope_json" rows="4">${escapeHtml(JSON.stringify(snippet.scope_json || { all_site: true }, null, 2))}</textarea></label>
          <label class="full-span">Code<textarea name="code" rows="8">${escapeHtml(snippet.code || "")}</textarea></label>
        </div>
        <pre class="seo-code-preview">${escapeHtml(snippet.code || "<meta name=\"example\" content=\"value\">")}</pre>
        <div class="admin-editor-actions">${snippet.id ? `<button class="button ghost dark danger-button" type="button" data-delete-snippet="${snippet.id}">Delete snippet</button>` : ""}<button class="button primary" type="submit">${snippet.id ? "Save snippet" : "Create snippet"}</button></div>
      </form>
    </div>
  `;
}

function renderHistory() {
  panels.history.innerHTML = `
    <div class="seo-card">
      <div class="seo-section-title"><h3>Change History / Audit Log</h3><p>SEO changes are logged with before/after data and rollback where possible.</p></div>
      <div class="seo-table-wrap"><table class="seo-table"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>User</th><th></th></tr></thead><tbody>
        ${state.logs.map((log) => `<tr><td>${escapeHtml(new Date(log.changed_at).toLocaleString())}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.entity_type)} · ${escapeHtml(log.entity_id)}</td><td>${escapeHtml(log.changed_by)}</td><td>${log.before_json ? `<button class="button ghost dark" type="button" data-rollback="${log.id}">Rollback</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
    </div>
  `;
}

function formPayload(form) {
  const data = Object.fromEntries(new FormData(form));
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    data[input.name] = input.checked;
  });
  ["available_locales", "same_as_social_links", "robots_disallow_patterns", "robots_allow_patterns", "secondary_keywords"].forEach((name) => {
    if (data[name] !== undefined) data[name] = String(data[name]).split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  });
  ["hreflang_items", "scope_json"].forEach((name) => {
    if (data[name] !== undefined && String(data[name]).trim()) {
      data[name] = JSON.parse(data[name]);
    }
  });
  return data;
}

async function saveSettingsFromForm(form, endpoint = "/api/admin/seo/settings") {
  const data = formPayload(form);
  const response = await api(endpoint, { method: "PUT", body: JSON.stringify(data) });
  state.settings = response.settings || state.settings;
  if (response.robots) state.robots = response.robots;
  setStatus("SEO settings saved successfully.");
  await loadAll({ silent: true });
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  try {
    if (form.id === "seoSettingsForm" || form.id === "seoHreflangForm" || form.id === "seoSocialForm") {
      event.preventDefault();
      await saveSettingsFromForm(form);
    } else if (form.id === "seoRobotsForm") {
      event.preventDefault();
      await saveSettingsFromForm(form, "/api/admin/seo/robots");
    } else if (form.id === "seoEntryForm") {
      event.preventDefault();
      const id = form.dataset.entryId;
      const method = id ? "PUT" : "POST";
      const path = id ? `/api/admin/seo/entries/${encodeURIComponent(id)}` : "/api/admin/seo/entries";
      const response = await api(path, { method, body: JSON.stringify(formPayload(form)) });
      state.entries = response.entries || state.entries;
      state.editingEntryId = response.entry?.id || id;
      setStatus("SEO entry saved successfully.");
      await loadAll({ silent: true });
    } else if (form.id === "seoTemplateForm") {
      event.preventDefault();
      const id = form.dataset.templateId;
      const method = id ? "PUT" : "POST";
      const path = id ? `/api/admin/seo/templates/${encodeURIComponent(id)}` : "/api/admin/seo/templates";
      const response = await api(path, { method, body: JSON.stringify(formPayload(form)) });
      state.templates = response.templates || state.templates;
      state.editingTemplateId = response.template?.id || id;
      setStatus("SEO template saved successfully.");
      await loadAll({ silent: true });
    } else if (form.id === "seoRedirectForm") {
      event.preventDefault();
      const id = form.dataset.redirectId;
      const method = id ? "PUT" : "POST";
      const path = id ? `/api/admin/seo/redirects/${encodeURIComponent(id)}` : "/api/admin/seo/redirects";
      const response = await api(path, { method, body: JSON.stringify(formPayload(form)) });
      state.redirects = response.redirects || state.redirects;
      state.redirectWarnings = response.warnings || [];
      state.editingRedirectId = response.redirect?.id || id;
      setStatus("Redirect saved successfully.");
      await loadAll({ silent: true });
    } else if (form.id === "seoRedirectImport") {
      event.preventDefault();
      const response = await api("/api/admin/seo/redirects/import", { method: "POST", body: JSON.stringify(formPayload(form)) });
      state.redirects = response.redirects || state.redirects;
      setStatus(`${response.imported || 0} redirects imported.`);
      await loadAll({ silent: true });
    } else if (form.id === "seoSnippetForm") {
      event.preventDefault();
      const id = form.dataset.snippetId;
      const method = id ? "PUT" : "POST";
      const path = id ? `/api/admin/seo/snippets/${encodeURIComponent(id)}` : "/api/admin/seo/snippets";
      const response = await api(path, { method, body: JSON.stringify(formPayload(form)) });
      state.snippets = response.snippets || state.snippets;
      state.editingSnippetId = response.snippet?.id || id;
      setStatus("SEO snippet saved successfully.");
      await loadAll({ silent: true });
    } else if (form.classList.contains("seo-media-row")) {
      event.preventDefault();
      const mediaId = form.dataset.mediaId;
      const response = await api(`/api/admin/seo/media/${encodeURIComponent(mediaId)}`, { method: "PUT", body: JSON.stringify(formPayload(form)) });
      state.media = response.media || state.media;
      setStatus("Media SEO saved successfully.");
      await loadAll({ silent: true });
    } else if (form.id === "seoAuditFilters") {
      event.preventDefault();
      const query = new URLSearchParams(formPayload(form)).toString();
      const dashboard = await api(`/api/admin/seo/dashboard?${query}`);
      state.audit = dashboard;
      renderAudit();
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.addEventListener("click", async (event) => {
  const tabButton = event.target.closest("[data-seo-tab]");
  if (tabButton) {
    selectTab(tabButton.dataset.seoTab);
    return;
  }

  const switchButton = event.target.closest("[data-switch-tab]");
  if (switchButton) {
    selectTab(switchButton.dataset.switchTab);
  }

  const newEntry = event.target.closest("[data-new-entry]");
  if (newEntry) {
    state.editingEntryId = "";
    renderEntries();
    return;
  }

  const editEntry = event.target.closest("[data-edit-entry]");
  if (editEntry) {
    state.editingEntryId = editEntry.dataset.editEntry;
    selectTab("entries");
    renderEntries();
    return;
  }

  const entityEntry = event.target.closest("[data-entity-entry]");
  if (entityEntry) {
    const [entity_type, entity_id] = entityEntry.dataset.entityEntry.split("|");
    const existing = state.entries.find((entry) => entry.entity_type === entity_type && entry.entity_id === entity_id);
    if (existing) {
      state.editingEntryId = existing.id;
    } else {
      const entity = state.entities.find((item) => item.entity_type === entity_type && item.entity_id === entity_id) || {};
      const response = await api("/api/admin/seo/entries", { method: "POST", body: JSON.stringify(getBlankEntry(entity)) });
      state.entries = response.entries || state.entries;
      state.editingEntryId = response.entry.id;
    }
    selectTab("entries");
    await loadAll({ silent: true });
    return;
  }

  await handleDeleteButtons(event);

  const editTemplate = event.target.closest("[data-edit-template]");
  if (editTemplate) {
    state.editingTemplateId = editTemplate.dataset.editTemplate;
    renderTemplates();
    return;
  }

  if (event.target.closest("[data-new-template]")) {
    state.editingTemplateId = "";
    renderTemplates();
    return;
  }

  const editRedirect = event.target.closest("[data-edit-redirect]");
  if (editRedirect) {
    state.editingRedirectId = editRedirect.dataset.editRedirect;
    renderRedirects();
    return;
  }

  if (event.target.closest("[data-new-redirect]")) {
    state.editingRedirectId = "";
    renderRedirects();
    return;
  }

  const editSnippet = event.target.closest("[data-edit-snippet]");
  if (editSnippet) {
    state.editingSnippetId = editSnippet.dataset.editSnippet;
    renderSnippets();
    return;
  }

  if (event.target.closest("[data-new-snippet]")) {
    state.editingSnippetId = "";
    renderSnippets();
    return;
  }

  if (event.target.closest("[data-regenerate-sitemap]")) {
    const response = await api("/api/admin/seo/sitemap/regenerate", { method: "POST", body: "{}" });
    state.sitemap = response;
    setStatus("Sitemap regenerated successfully.");
    await loadAll({ silent: true });
    return;
  }

  const rollback = event.target.closest("[data-rollback]");
  if (rollback) {
    if (!window.confirm("Rollback this SEO change?")) return;
    await api(`/api/admin/seo/audit/${encodeURIComponent(rollback.dataset.rollback)}/rollback`, { method: "POST", body: "{}" });
    setStatus("SEO change rolled back.");
    await loadAll({ silent: true });
  }
});

async function handleDeleteButtons(event) {
  const actions = [
    ["data-delete-entry", "/api/admin/seo/entries/", "SEO entry"],
    ["data-delete-template", "/api/admin/seo/templates/", "SEO template"],
    ["data-delete-redirect", "/api/admin/seo/redirects/", "Redirect"],
    ["data-delete-snippet", "/api/admin/seo/snippets/", "SEO snippet"]
  ];

  for (const [attr, path, label] of actions) {
    const button = event.target.closest(`[${attr}]`);
    if (!button) continue;
    const id = button.getAttribute(attr);
    if (!window.confirm(`Delete this ${label}?`)) return;
    await api(`${path}${encodeURIComponent(id)}`, { method: "DELETE" });
    setStatus(`${label} deleted.`);
    state.editingEntryId = "";
    state.editingTemplateId = "";
    state.editingRedirectId = "";
    state.editingSnippetId = "";
    await loadAll({ silent: true });
    return;
  }
}

document.addEventListener("input", (event) => {
  const form = event.target.closest("#seoEntryForm");
  if (!form) return;
  const title = form.elements.seo_title?.value || form.elements.meta_title?.value || "";
  const description = form.elements.meta_description?.value || "";
  const url = form.elements.canonical_url?.value || form.elements.route_path?.value || "";
  const preview = form.querySelector(".seo-serp-preview");
  if (preview) preview.outerHTML = renderSerpPreview(title, description, url);
});

seoRefresh.addEventListener("click", () => loadAll());
loadAll({ silent: true });

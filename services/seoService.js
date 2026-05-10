const XML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const PUBLIC_STATIC_PAGES = [
  { route_path: "/", entity_type: "home_page", entity_id: "home", page_title: "Embroidery clothes", h1: "Embroidered clothing by Irina" },
  { route_path: "/index.html", entity_type: "home_page", entity_id: "home", page_title: "Embroidery clothes", h1: "Embroidered clothing by Irina" },
  { route_path: "/checkout.html", entity_type: "static_page", entity_id: "checkout", page_title: "Checkout", h1: "Checkout" },
  { route_path: "/account.html", entity_type: "static_page", entity_id: "account", page_title: "Account", h1: "Account" },
  { route_path: "/auth.html", entity_type: "static_page", entity_id: "auth", page_title: "Login", h1: "Login" }
];

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

const SCHEMA_TYPES = [
  "WebPage",
  "CollectionPage",
  "Product",
  "BreadcrumbList",
  "Article",
  "BlogPosting",
  "FAQPage",
  "Organization",
  "LocalBusiness",
  "WebSite",
  "ItemList",
  "Review"
];

const REDIRECT_STATUS_CODES = new Set([301, 302, 307, 308]);
const RAW_CODE_TYPES = new Set(["analytics_script", "custom_head", "custom_body"]);

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

function cleanString(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPath(value) {
  const path = cleanString(value, 500);
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function cleanArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item, 500)).filter(Boolean);
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function priority(value, fallback = 0.5) {
  return Math.max(0, Math.min(1, Number(toNumber(value, fallback).toFixed(2))));
}

function normalizeLocale(value, fallback = "en-US") {
  return cleanString(value || fallback, 20) || fallback;
}

function isAbsoluteUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isMediaAsset(value) {
  return !value || value.startsWith("/") || value.startsWith("assets/");
}

function absoluteUrl(baseUrl, pathOrUrl = "") {
  if (!pathOrUrl) return "";
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl;
  const base = cleanString(baseUrl || "https://www.hoodyboody.com").replace(/\/+$/, "");
  const path = String(pathOrUrl).startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function normalizeRoutePath(value) {
  const routePath = cleanPath(value);
  if (routePath === "/index.html") return "/";
  return routePath;
}

function routeKey(pathname, search = "") {
  const path = normalizeRoutePath(pathname || "/");
  return `${path}${search || ""}`;
}

function slugify(value, fallback = "seo-entry") {
  const slug = cleanString(value, 90)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `${fallback}-${Date.now().toString(36)}`;
}

function defaultSeoGlobalSettings() {
  return {
    site_name: "HOODYBOODY",
    base_url: "https://www.hoodyboody.com",
    default_locale: "en-US",
    available_locales: ["en-US"],
    title_separator: "|",
    default_title_template: "{page_title} | {site_name}",
    default_meta_title: "HOODYBOODY | Embroidery clothes",
    default_meta_description: "Embroidered clothing, hoodies, shirts, jackets and accessories by HOODYBOODY.",
    default_h1_template: "{page_title}",
    default_canonical_strategy: "self",
    default_robots_index: "index",
    default_robots_follow: "follow",
    default_max_snippet: "",
    default_max_image_preview: "large",
    default_max_video_preview: "",
    default_noarchive: false,
    default_nosnippet: false,
    organization_name: "HOODYBOODY",
    organization_legal_name: "HOODYBOODY",
    organization_logo: "/assets/embroidered-collection.png",
    organization_url: "https://www.hoodyboody.com",
    organization_phone: "",
    organization_email: "",
    organization_address: "6463 Bayside South Drive, Indianapolis, IN 46250, United States",
    same_as_social_links: [],
    brand_description: "Custom embroidery clothing and accessories.",
    default_og_title: "",
    default_og_description: "",
    default_og_image: "/assets/embroidered-collection.png",
    default_og_type: "website",
    og_site_name: "HOODYBOODY",
    og_locale: "en_US",
    twitter_card: "summary_large_image",
    twitter_site: "",
    twitter_creator: "",
    default_social_image_alt: "HOODYBOODY embroidered clothing",
    default_product_title_template: "{product_name} | {site_name}",
    default_category_title_template: "{category_name} | {site_name}",
    default_collection_title_template: "{collection_name} | {site_name}",
    default_brand_title_template: "{brand_name} | {site_name}",
    default_product_description_template: "{product_name} by {site_name}. Price {price} {currency}.",
    default_category_description_template: "Shop {category_name} from {site_name}.",
    default_product_schema_enabled: true,
    default_breadcrumb_schema_enabled: true,
    sitemap_enabled: true,
    sitemap_include_pages: true,
    sitemap_include_products: true,
    sitemap_include_categories: true,
    sitemap_include_collections: true,
    sitemap_include_brands: true,
    sitemap_include_blog: true,
    default_changefreq: "weekly",
    default_priority: 0.7,
    exclude_noindex_from_sitemap: true,
    auto_regenerate_sitemap_on_publish: true,
    robots_txt_enabled: true,
    robots_global_rules: "User-agent: *\nAllow: /",
    robots_sitemap_url: "https://www.hoodyboody.com/sitemap.xml",
    robots_disallow_patterns: [],
    robots_allow_patterns: ["/"],
    robots_advanced_text: "",
    google_site_verification: "",
    bing_site_verification: "",
    yandex_verification: "",
    pinterest_verification: "",
    facebook_domain_verification: "",
    hreflang_enabled: false,
    hreflang_items: [],
    last_sitemap_generated_at: "",
    last_seo_updated_at: ""
  };
}

function defaultSeoTemplates() {
  return [
    {
      id: "template-home",
      entity_type: "home_page",
      locale: "en-US",
      name: "Home page default",
      title_template: "{page_title} | {site_name}",
      meta_description_template: "{site_name} embroidered clothing and accessories.",
      h1_template: "{h1}",
      og_title_template: "{page_title}",
      og_description_template: "{site_name} embroidered clothing and accessories.",
      canonical_template: "{canonical_url}",
      schema_template_json: "",
      active: true,
      fallback_order: 10,
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: "template-product",
      entity_type: "product",
      locale: "en-US",
      name: "Product default",
      title_template: "{product_name} | {site_name}",
      meta_description_template: "{product_name} by {site_name}. {short_description}",
      h1_template: "{product_name}",
      og_title_template: "{product_name}",
      og_description_template: "{short_description}",
      canonical_template: "{canonical_url}",
      schema_template_json: "",
      active: true,
      fallback_order: 10,
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: "template-category",
      entity_type: "product_category",
      locale: "en-US",
      name: "Category default",
      title_template: "{category_name} | {site_name}",
      meta_description_template: "{short_description}",
      h1_template: "{category_name}",
      og_title_template: "{category_name}",
      og_description_template: "{short_description}",
      canonical_template: "{canonical_url}",
      schema_template_json: "",
      active: true,
      fallback_order: 10,
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];
}

function ensureSeoDefaults(db) {
  let changed = false;
  db.seoGlobalSettings ||= defaultSeoGlobalSettings();
  db.seoEntries ||= [];
  db.seoTemplates ||= defaultSeoTemplates();
  db.seoRedirects ||= [];
  db.seoCodeSnippets ||= [];
  db.seoAuditLogs ||= [];
  db.mediaSeo ||= [];
  db.seoSitemap ||= { lastGeneratedAt: "", urls: [] };

  const defaults = defaultSeoGlobalSettings();
  Object.entries(defaults).forEach(([key, value]) => {
    if (db.seoGlobalSettings[key] === undefined) {
      db.seoGlobalSettings[key] = clone(value);
      changed = true;
    }
  });

  if (!Array.isArray(db.seoTemplates) || !db.seoTemplates.length) {
    db.seoTemplates = defaultSeoTemplates();
    changed = true;
  }

  return changed;
}

function getSeoPermissions(user, adminEmail = "") {
  const role = String(user?.role || "").toLowerCase();
  const isOwner = adminEmail && String(user?.email || "").toLowerCase() === String(adminEmail).toLowerCase();
  const superAdmin = role === "superadmin" || isOwner;
  const admin = superAdmin || role === "admin";
  const seoManager = role === "seo_manager";
  const contentEditor = role === "content_editor";
  const permissions = new Set();

  if (superAdmin) {
    [
      "seo.view",
      "seo.create",
      "seo.update",
      "seo.delete",
      "seo.publish",
      "seo.manage_redirects",
      "seo.manage_robots",
      "seo.manage_sitemap",
      "seo.manage_schema",
      "seo.manage_code_snippets",
      "seo.rollback"
    ].forEach((permission) => permissions.add(permission));
  } else if (admin) {
    [
      "seo.view",
      "seo.create",
      "seo.update",
      "seo.delete",
      "seo.publish",
      "seo.manage_redirects",
      "seo.manage_robots",
      "seo.manage_sitemap",
      "seo.manage_schema",
      "seo.rollback"
    ].forEach((permission) => permissions.add(permission));
  } else if (seoManager) {
    [
      "seo.view",
      "seo.create",
      "seo.update",
      "seo.delete",
      "seo.publish",
      "seo.manage_redirects",
      "seo.manage_sitemap",
      "seo.manage_schema"
    ].forEach((permission) => permissions.add(permission));
  } else if (contentEditor) {
    ["seo.view", "seo.update"].forEach((permission) => permissions.add(permission));
  }

  return {
    superAdmin,
    role: superAdmin ? "superadmin" : role || "guest",
    permissions: Array.from(permissions),
    has(permission) {
      return permissions.has(permission);
    }
  };
}

function auditSeoChange(db, action, entityType, entityId, before, after, user, req) {
  db.seoAuditLogs ||= [];
  db.seoAuditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    entity_type: entityType,
    entity_id: entityId || "",
    before_json: before === undefined ? null : clone(before),
    after_json: after === undefined ? null : clone(after),
    changed_by: user?.email || user?.name || user?.id || "system",
    changed_at: nowIso(),
    ip_address: req?.headers?.["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : "",
    user_agent: req?.headers?.["user-agent"] || ""
  });
  db.seoAuditLogs = db.seoAuditLogs.slice(0, 500);
  db.seoGlobalSettings ||= defaultSeoGlobalSettings();
  db.seoGlobalSettings.last_seo_updated_at = db.seoAuditLogs[0].changed_at;
}

function sanitizeGlobalSettings(body = {}, current = {}) {
  const base = { ...defaultSeoGlobalSettings(), ...(current || {}) };
  const textFields = [
    "site_name",
    "base_url",
    "default_locale",
    "title_separator",
    "default_title_template",
    "default_meta_title",
    "default_meta_description",
    "default_h1_template",
    "default_canonical_strategy",
    "default_robots_index",
    "default_robots_follow",
    "default_max_snippet",
    "default_max_image_preview",
    "default_max_video_preview",
    "organization_name",
    "organization_legal_name",
    "organization_logo",
    "organization_url",
    "organization_phone",
    "organization_email",
    "organization_address",
    "brand_description",
    "default_og_title",
    "default_og_description",
    "default_og_image",
    "default_og_type",
    "og_site_name",
    "og_locale",
    "twitter_card",
    "twitter_site",
    "twitter_creator",
    "default_social_image_alt",
    "default_product_title_template",
    "default_category_title_template",
    "default_collection_title_template",
    "default_brand_title_template",
    "default_product_description_template",
    "default_category_description_template",
    "default_changefreq",
    "robots_global_rules",
    "robots_sitemap_url",
    "robots_advanced_text",
    "google_site_verification",
    "bing_site_verification",
    "yandex_verification",
    "pinterest_verification",
    "facebook_domain_verification"
  ];

  textFields.forEach((field) => {
    if (body[field] !== undefined) base[field] = cleanString(body[field], field.includes("description") || field.includes("rules") ? 3000 : 500);
  });

  [
    "default_noarchive",
    "default_nosnippet",
    "default_product_schema_enabled",
    "default_breadcrumb_schema_enabled",
    "sitemap_enabled",
    "sitemap_include_pages",
    "sitemap_include_products",
    "sitemap_include_categories",
    "sitemap_include_collections",
    "sitemap_include_brands",
    "sitemap_include_blog",
    "exclude_noindex_from_sitemap",
    "auto_regenerate_sitemap_on_publish",
    "robots_txt_enabled",
    "hreflang_enabled"
  ].forEach((field) => {
    if (body[field] !== undefined) base[field] = toBool(body[field], base[field]);
  });

  if (body.default_priority !== undefined) base.default_priority = priority(body.default_priority, base.default_priority);
  if (body.available_locales !== undefined) base.available_locales = cleanArray(body.available_locales);
  if (body.same_as_social_links !== undefined) base.same_as_social_links = cleanArray(body.same_as_social_links);
  if (body.robots_disallow_patterns !== undefined) base.robots_disallow_patterns = cleanArray(body.robots_disallow_patterns);
  if (body.robots_allow_patterns !== undefined) base.robots_allow_patterns = cleanArray(body.robots_allow_patterns);
  if (body.hreflang_items !== undefined) base.hreflang_items = sanitizeHreflangItems(body.hreflang_items).items;

  if (!isAbsoluteUrl(base.base_url)) throw new Error("Base URL must be an absolute URL.");
  if (base.robots_sitemap_url && !isAbsoluteUrl(base.robots_sitemap_url)) throw new Error("Robots sitemap URL must be absolute.");
  return base;
}

function parseJsonMaybe(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  return JSON.parse(value);
}

function sanitizeHreflangItems(value) {
  const raw = parseJsonMaybe(value, []);
  const errors = [];
  const seen = new Set();
  let xDefaultCount = 0;
  const items = (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      locale: cleanString(item.locale || item.hreflang || "", 30),
      url: cleanString(item.url || "", 500),
      enabled: toBool(item.enabled, true),
      x_default: toBool(item.x_default || item.xDefault, false)
    }))
    .filter((item) => item.locale && item.url);

  items.forEach((item) => {
    const key = item.locale.toLowerCase();
    if (seen.has(key)) errors.push(`Duplicate hreflang locale: ${item.locale}`);
    seen.add(key);
    if (item.x_default) xDefaultCount += 1;
    if (!isAbsoluteUrl(item.url)) errors.push(`Hreflang URL must be absolute for ${item.locale}.`);
  });
  if (xDefaultCount > 1) errors.push("Only one x-default hreflang item is allowed.");
  return { items, errors };
}

function sanitizeSeoEntry(body = {}, current = {}, user = {}) {
  const now = nowIso();
  const entityType = cleanString(body.entity_type ?? current.entity_type ?? "static_page", 40);
  if (!ENTITY_TYPES.includes(entityType)) throw new Error("Unsupported SEO entity type.");

  const hreflang = sanitizeHreflangItems(body.hreflang_items ?? current.hreflang_items ?? []);
  if (hreflang.errors.length) throw new Error(hreflang.errors[0]);

  const schemaJson = cleanString(body.schema_json_override ?? body.schema_json ?? current.schema_json_override ?? current.schema_json ?? "", 10000);
  if (schemaJson) JSON.parse(schemaJson);

  const entry = {
    id: current.id || `seo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    entity_type: entityType,
    entity_id: cleanString(body.entity_id ?? current.entity_id ?? "", 120),
    route_path: cleanPath(body.route_path ?? current.route_path ?? ""),
    slug: cleanString(body.slug ?? current.slug ?? slugify(body.seo_title || body.h1 || body.route_path || entityType, "seo"), 120),
    locale: normalizeLocale(body.locale ?? current.locale),
    status: ["draft", "published", "archived"].includes(String(body.status ?? current.status)) ? String(body.status ?? current.status) : "published",
    priority_override: body.priority_override !== undefined ? priority(body.priority_override, 0.5) : current.priority_override ?? "",
    seo_title: cleanString(body.seo_title ?? current.seo_title ?? "", 180),
    meta_title: cleanString(body.meta_title ?? current.meta_title ?? "", 180),
    meta_description: cleanString(body.meta_description ?? current.meta_description ?? "", 320),
    h1: cleanString(body.h1 ?? current.h1 ?? "", 180),
    short_description: cleanString(body.short_description ?? current.short_description ?? "", 500),
    focus_keyword: cleanString(body.focus_keyword ?? current.focus_keyword ?? "", 120),
    secondary_keywords: cleanArray(body.secondary_keywords ?? current.secondary_keywords ?? []),
    seo_content_top: cleanString(body.seo_content_top ?? current.seo_content_top ?? "", 5000),
    seo_content_bottom: cleanString(body.seo_content_bottom ?? current.seo_content_bottom ?? "", 5000),
    canonical_url: cleanString(body.canonical_url ?? current.canonical_url ?? "", 500),
    canonical_mode: ["self", "custom", "inherited", "none"].includes(String(body.canonical_mode ?? current.canonical_mode))
      ? String(body.canonical_mode ?? current.canonical_mode)
      : "inherited",
    canonical_source_note: cleanString(body.canonical_source_note ?? current.canonical_source_note ?? "", 500),
    robots_index: ["index", "noindex", "inherit"].includes(String(body.robots_index ?? current.robots_index))
      ? String(body.robots_index ?? current.robots_index)
      : "inherit",
    robots_follow: ["follow", "nofollow", "inherit"].includes(String(body.robots_follow ?? current.robots_follow))
      ? String(body.robots_follow ?? current.robots_follow)
      : "inherit",
    robots_noarchive: toBool(body.robots_noarchive ?? current.robots_noarchive, false),
    robots_nosnippet: toBool(body.robots_nosnippet ?? current.robots_nosnippet, false),
    robots_noimageindex: toBool(body.robots_noimageindex ?? current.robots_noimageindex, false),
    robots_max_snippet: cleanString(body.robots_max_snippet ?? current.robots_max_snippet ?? "", 30),
    robots_max_image_preview: cleanString(body.robots_max_image_preview ?? current.robots_max_image_preview ?? "", 30),
    robots_max_video_preview: cleanString(body.robots_max_video_preview ?? current.robots_max_video_preview ?? "", 30),
    unavailable_after: cleanString(body.unavailable_after ?? current.unavailable_after ?? "", 80),
    og_enabled: toBool(body.og_enabled ?? current.og_enabled, true),
    og_title: cleanString(body.og_title ?? current.og_title ?? "", 180),
    og_description: cleanString(body.og_description ?? current.og_description ?? "", 320),
    og_image: cleanString(body.og_image ?? current.og_image ?? "", 500),
    og_image_alt: cleanString(body.og_image_alt ?? current.og_image_alt ?? "", 180),
    og_type: cleanString(body.og_type ?? current.og_type ?? "website", 40),
    og_url: cleanString(body.og_url ?? current.og_url ?? "", 500),
    og_locale: cleanString(body.og_locale ?? current.og_locale ?? "", 30),
    og_locale_alternate: cleanArray(body.og_locale_alternate ?? current.og_locale_alternate ?? []),
    og_site_name: cleanString(body.og_site_name ?? current.og_site_name ?? "", 100),
    twitter_enabled: toBool(body.twitter_enabled ?? current.twitter_enabled, true),
    twitter_card: cleanString(body.twitter_card ?? current.twitter_card ?? "summary_large_image", 40),
    twitter_title: cleanString(body.twitter_title ?? current.twitter_title ?? "", 180),
    twitter_description: cleanString(body.twitter_description ?? current.twitter_description ?? "", 320),
    twitter_image: cleanString(body.twitter_image ?? current.twitter_image ?? "", 500),
    twitter_image_alt: cleanString(body.twitter_image_alt ?? current.twitter_image_alt ?? "", 180),
    twitter_site: cleanString(body.twitter_site ?? current.twitter_site ?? "", 80),
    twitter_creator: cleanString(body.twitter_creator ?? current.twitter_creator ?? "", 80),
    include_in_sitemap: toBool(body.include_in_sitemap ?? current.include_in_sitemap, true),
    sitemap_priority: priority(body.sitemap_priority ?? current.sitemap_priority ?? 0.5, 0.5),
    sitemap_changefreq: cleanString(body.sitemap_changefreq ?? current.sitemap_changefreq ?? "weekly", 20),
    sitemap_lastmod_mode: ["auto", "manual"].includes(String(body.sitemap_lastmod_mode ?? current.sitemap_lastmod_mode))
      ? String(body.sitemap_lastmod_mode ?? current.sitemap_lastmod_mode)
      : "auto",
    sitemap_lastmod: cleanString(body.sitemap_lastmod ?? current.sitemap_lastmod ?? "", 40),
    hreflang_enabled: toBool(body.hreflang_enabled ?? current.hreflang_enabled, false),
    hreflang_items: hreflang.items,
    x_default_url: cleanString(body.x_default_url ?? current.x_default_url ?? "", 500),
    schema_enabled: toBool(body.schema_enabled ?? current.schema_enabled, false),
    schema_type: SCHEMA_TYPES.includes(String(body.schema_type ?? current.schema_type)) ? String(body.schema_type ?? current.schema_type) : "WebPage",
    schema_json_override: schemaJson,
    schema_auto_generate: toBool(body.schema_auto_generate ?? current.schema_auto_generate, true),
    schema_validation_status: schemaJson ? "valid" : "not_checked",
    schema_validation_errors: [],
    serp_preview_title: cleanString(body.serp_preview_title ?? current.serp_preview_title ?? "", 180),
    serp_preview_description: cleanString(body.serp_preview_description ?? current.serp_preview_description ?? "", 320),
    serp_preview_url: cleanString(body.serp_preview_url ?? current.serp_preview_url ?? "", 500),
    social_preview_image: cleanString(body.social_preview_image ?? current.social_preview_image ?? "", 500),
    social_preview_title: cleanString(body.social_preview_title ?? current.social_preview_title ?? "", 180),
    social_preview_description: cleanString(body.social_preview_description ?? current.social_preview_description ?? "", 320),
    created_by: current.created_by || user?.email || user?.id || "",
    updated_by: user?.email || user?.id || current.updated_by || "",
    created_at: current.created_at || now,
    updated_at: now,
    deleted_at: current.deleted_at || ""
  };

  const validation = validateSeoEntry(entry);
  if (validation.errors.length) throw new Error(validation.errors[0]);
  entry.validation_warnings = validation.warnings;
  return entry;
}

function validateSeoEntry(entry) {
  const errors = [];
  const warnings = [];

  if (!entry.entity_id && !entry.route_path) warnings.push("SEO entry has no entity or route path.");
  if (entry.route_path && !entry.route_path.startsWith("/")) errors.push("Route path must start with /.");
  if (entry.canonical_url && !isAbsoluteUrl(entry.canonical_url)) errors.push("Canonical URL must be absolute or empty.");
  if (entry.og_image && !isAbsoluteUrl(entry.og_image) && !isMediaAsset(entry.og_image)) errors.push("Open Graph image must be absolute URL or media asset.");
  if (entry.twitter_image && !isAbsoluteUrl(entry.twitter_image) && !isMediaAsset(entry.twitter_image)) errors.push("Twitter image must be absolute URL or media asset.");
  if (!entry.seo_title) warnings.push("SEO title is empty.");
  if (entry.seo_title && entry.seo_title.length < 20) warnings.push("SEO title is short.");
  if (entry.seo_title && entry.seo_title.length > 65) warnings.push("SEO title is long.");
  if (!entry.meta_description) warnings.push("Meta description is empty.");
  if (entry.meta_description && entry.meta_description.length < 70) warnings.push("Meta description is short.");
  if (entry.meta_description && entry.meta_description.length > 170) warnings.push("Meta description is long.");
  if (!entry.h1) warnings.push("H1 is empty.");
  if (!entry.canonical_url && entry.canonical_mode === "custom") warnings.push("Custom canonical mode needs canonical URL.");
  if (!entry.og_image) warnings.push("Open Graph image is missing.");
  if (entry.robots_index === "noindex" && entry.include_in_sitemap) warnings.push("Noindex page is included in sitemap.");

  try {
    if (entry.schema_json_override) JSON.parse(entry.schema_json_override);
  } catch {
    errors.push("Schema JSON-LD override is invalid JSON.");
  }

  const hreflang = sanitizeHreflangItems(entry.hreflang_items);
  errors.push(...hreflang.errors);
  return { errors, warnings };
}

function sanitizeSeoTemplate(body = {}, current = {}, user = {}) {
  const schemaTemplate = cleanString(body.schema_template_json ?? current.schema_template_json ?? "", 10000);
  if (schemaTemplate) JSON.parse(schemaTemplate);

  return {
    id: current.id || `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    entity_type: ENTITY_TYPES.includes(String(body.entity_type ?? current.entity_type)) ? String(body.entity_type ?? current.entity_type) : "static_page",
    locale: normalizeLocale(body.locale ?? current.locale),
    name: cleanString(body.name ?? body.template_name ?? current.name ?? current.template_name ?? "SEO template", 100),
    template_name: cleanString(body.template_name ?? body.name ?? current.template_name ?? current.name ?? "SEO template", 100),
    title_template: cleanString(body.title_template ?? current.title_template ?? "{page_title} | {site_name}", 300),
    meta_description_template: cleanString(body.meta_description_template ?? current.meta_description_template ?? "{short_description}", 500),
    h1_template: cleanString(body.h1_template ?? current.h1_template ?? "{page_title}", 300),
    og_title_template: cleanString(body.og_title_template ?? current.og_title_template ?? "{page_title}", 300),
    og_description_template: cleanString(body.og_description_template ?? current.og_description_template ?? "{short_description}", 500),
    canonical_template: cleanString(body.canonical_template ?? current.canonical_template ?? "{canonical_url}", 500),
    schema_template_json: schemaTemplate,
    active: toBool(body.active ?? current.active, true),
    fallback_order: Math.round(toNumber(body.fallback_order ?? current.fallback_order, 100)),
    created_at: current.created_at || nowIso(),
    updated_at: nowIso(),
    created_by: current.created_by || user?.email || user?.id || "",
    updated_by: user?.email || user?.id || current.updated_by || ""
  };
}

function normalizeRedirectPath(value) {
  const path = cleanPath(value);
  return path || "/";
}

function sanitizeSeoRedirect(body = {}, current = {}, db = {}, user = {}) {
  const statusCode = Math.round(toNumber(body.status_code ?? current.status_code, 301));
  if (!REDIRECT_STATUS_CODES.has(statusCode)) throw new Error("Redirect status code must be 301, 302, 307, or 308.");

  const fromPath = normalizeRedirectPath(body.from_path ?? current.from_path);
  const toUrl = cleanString(body.to_url ?? current.to_url ?? "", 600);
  if (!toUrl) throw new Error("Redirect target URL is required.");
  if (fromPath === toUrl) throw new Error("Redirect cannot point to the same URL.");

  const duplicate = (db.seoRedirects || []).find((item) => item.id !== current.id && item.from_path === fromPath && item.enabled !== false);
  if (duplicate) throw new Error("A redirect from this path already exists.");

  const redirect = {
    id: current.id || `redirect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    from_path: fromPath,
    to_url: toUrl,
    status_code: statusCode,
    preserve_query_string: toBool(body.preserve_query_string ?? current.preserve_query_string, true),
    is_regex: toBool(body.is_regex ?? current.is_regex, false),
    regex_flags: cleanString(body.regex_flags ?? current.regex_flags ?? "", 20),
    enabled: toBool(body.enabled ?? current.enabled, true),
    notes: cleanString(body.notes ?? current.notes ?? "", 800),
    hit_count: Number(current.hit_count || 0),
    last_hit_at: current.last_hit_at || "",
    created_at: current.created_at || nowIso(),
    updated_at: nowIso(),
    created_by: current.created_by || user?.email || user?.id || "",
    updated_by: user?.email || user?.id || current.updated_by || ""
  };

  const warnings = detectRedirectWarnings([...(db.seoRedirects || []).filter((item) => item.id !== redirect.id), redirect]);
  redirect.validation_warnings = warnings.filter((warning) => warning.ids?.includes(redirect.id)).map((warning) => warning.message);
  return redirect;
}

function detectRedirectWarnings(redirects = []) {
  const warnings = [];
  const enabled = redirects.filter((redirect) => redirect.enabled !== false && !redirect.is_regex);
  const byFrom = Object.fromEntries(enabled.map((redirect) => [redirect.from_path, redirect]));

  enabled.forEach((redirect) => {
    const visited = new Set([redirect.from_path]);
    let current = redirect;
    for (let depth = 0; depth < 12; depth += 1) {
      const targetPath = getPathFromUrl(current.to_url);
      const next = byFrom[targetPath];
      if (!next) {
        if (depth > 0) warnings.push({ type: "chain", ids: [redirect.id], message: `Redirect chain starts at ${redirect.from_path}.` });
        return;
      }
      if (visited.has(next.from_path)) {
        warnings.push({ type: "loop", ids: [redirect.id, next.id], message: `Redirect loop detected at ${next.from_path}.` });
        return;
      }
      visited.add(next.from_path);
      current = next;
    }
    warnings.push({ type: "chain", ids: [redirect.id], message: `Long redirect chain starts at ${redirect.from_path}.` });
  });

  return warnings;
}

function getPathFromUrl(value) {
  try {
    return new URL(value).pathname || "/";
  } catch {
    return cleanPath(String(value).split("?")[0]);
  }
}

function findRedirectForRequest(db, reqUrl) {
  const parsed = new URL(reqUrl, "https://local.test");
  const requestPath = parsed.pathname || "/";
  const redirects = db.seoRedirects || [];

  for (const redirect of redirects) {
    if (redirect.enabled === false) continue;
    if (redirect.is_regex) {
      try {
        const regex = new RegExp(redirect.from_path, redirect.regex_flags || "");
        if (!regex.test(requestPath)) continue;
        return { redirect, targetUrl: buildRedirectTarget(redirect, parsed, requestPath.replace(regex, redirect.to_url)) };
      } catch {
        continue;
      }
    }

    if (redirect.from_path === requestPath) {
      return { redirect, targetUrl: buildRedirectTarget(redirect, parsed, redirect.to_url) };
    }
  }

  return null;
}

function buildRedirectTarget(redirect, parsedUrl, toUrl) {
  let target = toUrl;
  if (redirect.preserve_query_string && parsedUrl.search) {
    target += target.includes("?") ? `&${parsedUrl.search.slice(1)}` : parsedUrl.search;
  }
  return target;
}

function sanitizeSeoSnippet(body = {}, current = {}, user = {}, permissions = { superAdmin: false }) {
  const snippetType = cleanString(body.snippet_type ?? current.snippet_type ?? "meta", 40);
  const code = cleanString(body.code ?? current.code ?? "", 12000);
  if (RAW_CODE_TYPES.has(snippetType) && !permissions.superAdmin) throw new Error("Only SuperAdmin can manage script/custom SEO snippets.");
  if (/on[a-z]+\s*=/i.test(code)) throw new Error("Inline event handlers like onclick/onerror are not allowed.");
  if (snippetType === "json_ld" && code) JSON.parse(code);

  return {
    id: current.id || `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanString(body.name ?? body.snippet_name ?? current.name ?? current.snippet_name ?? "SEO snippet", 100),
    snippet_name: cleanString(body.snippet_name ?? body.name ?? current.snippet_name ?? current.name ?? "SEO snippet", 100),
    snippet_type: snippetType,
    placement: cleanString(body.placement ?? current.placement ?? "head_end", 40),
    scope: sanitizeScope(body.scope ?? body.scope_json ?? current.scope ?? current.scope_json ?? { all_site: true }),
    scope_json: sanitizeScope(body.scope_json ?? body.scope ?? current.scope_json ?? current.scope ?? { all_site: true }),
    code,
    enabled: toBool(body.enabled ?? current.enabled, true),
    priority: Math.round(toNumber(body.priority ?? current.priority, 100)),
    created_by: current.created_by || user?.email || user?.id || "",
    updated_by: user?.email || user?.id || current.updated_by || "",
    created_at: current.created_at || nowIso(),
    updated_at: nowIso()
  };
}

function sanitizeScope(value) {
  const raw = parseJsonMaybe(value, { all_site: true });
  return {
    all_site: toBool(raw.all_site, true),
    selected_pages: Array.isArray(raw.selected_pages) ? raw.selected_pages.map((item) => cleanString(item, 500)).filter(Boolean) : [],
    selected_entity_types: Array.isArray(raw.selected_entity_types) ? raw.selected_entity_types.map((item) => cleanString(item, 40)).filter(Boolean) : [],
    route_pattern: cleanString(raw.route_pattern || "", 500)
  };
}

function sanitizeMediaSeo(body = {}, current = {}, user = {}) {
  const mediaId = cleanString(body.media_id ?? current.media_id ?? "", 240);
  if (!mediaId) throw new Error("Media ID is required.");
  return {
    id: current.id || `media-seo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    media_id: mediaId,
    alt_text: cleanString(body.alt_text ?? current.alt_text ?? "", 240),
    title: cleanString(body.title ?? current.title ?? "", 160),
    caption: cleanString(body.caption ?? current.caption ?? "", 500),
    description: cleanString(body.description ?? current.description ?? "", 1200),
    file_name: cleanString(body.file_name ?? current.file_name ?? "", 240),
    image_usage_pages: cleanArray(body.image_usage_pages ?? current.image_usage_pages ?? []),
    is_decorative: toBool(body.is_decorative ?? current.is_decorative, false),
    focal_point: cleanString(body.focal_point ?? current.focal_point ?? "", 40),
    width: Math.max(0, Math.round(toNumber(body.width ?? current.width, 0))),
    height: Math.max(0, Math.round(toNumber(body.height ?? current.height, 0))),
    mime_type: cleanString(body.mime_type ?? current.mime_type ?? "", 80),
    created_at: current.created_at || nowIso(),
    updated_at: nowIso(),
    created_by: current.created_by || user?.email || user?.id || "",
    updated_by: user?.email || user?.id || current.updated_by || ""
  };
}

function replaceTemplate(template, values = {}) {
  return cleanString(template, 10000).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function getRequestRoute(req) {
  const url = new URL(req.url, "https://local.test");
  return {
    pathname: url.pathname === "/" ? "/" : normalizeRoutePath(url.pathname),
    search: url.search,
    fullPath: routeKey(url.pathname, url.search)
  };
}

function getPageContext(db, req, requestOrigin = "") {
  const route = getRequestRoute(req);
  const settings = { ...defaultSeoGlobalSettings(), ...(db.seoGlobalSettings || {}) };
  const baseUrl = requestOrigin || settings.base_url;
  const products = publicProductsForSeo(db);
  const categories = publicCategoriesForSeo(db);
  const staticPage = PUBLIC_STATIC_PAGES.find((page) => normalizeRoutePath(page.route_path) === normalizeRoutePath(route.pathname));
  const pageParams = new URL(req.url, "https://local.test").searchParams;

  if (route.pathname === "/product.html") {
    const product = products.find((item) => item.id === pageParams.get("id")) || null;
    if (product) {
      return {
        entity_type: "product",
        entity_id: product.id,
        route_path: route.fullPath,
        page_title: product.title,
        h1: product.title,
        short_description: product.description || product.longDescription,
        image: product.image,
        entity: product,
        values: {
          page_title: product.title,
          h1: product.title,
          product_name: product.title,
          short_description: product.description || product.longDescription,
          price: (Number(product.price || 0) / 100).toFixed(2),
          currency: "USD",
          sku: product.id,
          color: Array.isArray(product.colors) ? product.colors.map((color) => color.name).join(", ") : "",
          size: Array.isArray(product.sizes) ? product.sizes.join(", ") : ""
        },
        canonical_path: `/product.html?id=${encodeURIComponent(product.id)}`
      };
    }
  }

  const pageCategoryType = route.pathname === "/category.html" ? pageParams.get("type") : getStaticCategoryFromPath(route.pathname);
  if (pageCategoryType) {
    const category = categories.find((item) => item.id === pageCategoryType) || null;
    if (category) {
      return {
        entity_type: "product_category",
        entity_id: category.id,
        route_path: route.fullPath,
        page_title: category.title,
        h1: category.title,
        short_description: category.description,
        image: category.image,
        entity: category,
        values: {
          page_title: category.title,
          h1: category.title,
          category_name: category.title,
          collection_name: category.title,
          short_description: category.description
        },
        canonical_path: getCategoryUrl(category.id)
      };
    }
  }

  if (staticPage) {
    return {
      entity_type: staticPage.entity_type,
      entity_id: staticPage.entity_id,
      route_path: route.pathname,
      page_title: staticPage.page_title,
      h1: staticPage.h1,
      short_description: settings.default_meta_description,
      image: settings.default_og_image,
      entity: staticPage,
      values: {
        page_title: staticPage.page_title,
        h1: staticPage.h1,
        short_description: settings.default_meta_description
      },
      canonical_path: route.pathname === "/" ? "/" : route.pathname
    };
  }

  const customEntry = findSeoEntry(db, { route_path: route.fullPath, locale: settings.default_locale }) || findSeoEntry(db, { route_path: route.pathname, locale: settings.default_locale });
  const pageTitle = customEntry?.h1 || customEntry?.seo_title || cleanString(route.pathname.replace(/\.html$/, "").replace(/[/-]+/g, " "), 80) || "Page";
  return {
    entity_type: customEntry?.entity_type || "custom_url",
    entity_id: customEntry?.entity_id || "",
    route_path: route.fullPath,
    page_title: pageTitle,
    h1: pageTitle,
    short_description: settings.default_meta_description,
    image: settings.default_og_image,
    entity: customEntry || {},
    values: {
      page_title: pageTitle,
      h1: pageTitle,
      short_description: settings.default_meta_description
    },
    canonical_path: route.fullPath
  };
}

function getStaticCategoryFromPath(pathname) {
  const page = String(pathname || "").replace(/^\//, "");
  if (page === "outerwear.html") return "outerwear";
  if (page === "tops.html") return "tops";
  if (page === "accessories.html") return "accessories";
  return "";
}

function getCategoryUrl(categoryId) {
  if (categoryId === "outerwear") return "/outerwear.html";
  if (categoryId === "tops") return "/tops.html";
  if (categoryId === "accessories") return "/accessories.html";
  return `/category.html?type=${encodeURIComponent(categoryId)}`;
}

function findSeoEntry(db, query) {
  const entries = (db.seoEntries || []).filter((entry) => !entry.deleted_at && entry.status !== "archived");
  if (query.entity_type && query.entity_id) {
    const match = entries.find(
      (entry) =>
        entry.entity_type === query.entity_type &&
        entry.entity_id === query.entity_id &&
        normalizeLocale(entry.locale) === normalizeLocale(query.locale)
    );
    if (match) return match;
  }
  if (query.route_path) {
    return entries.find(
      (entry) =>
        normalizeRoutePath(entry.route_path).replace(/\/$/, "") === normalizeRoutePath(query.route_path).replace(/\/$/, "") &&
        normalizeLocale(entry.locale) === normalizeLocale(query.locale)
    );
  }
  return null;
}

function findSeoTemplate(db, entityType, locale) {
  return (db.seoTemplates || [])
    .filter((template) => template.active !== false && template.entity_type === entityType && normalizeLocale(template.locale) === normalizeLocale(locale))
    .sort((a, b) => (Number(a.fallback_order) || 0) - (Number(b.fallback_order) || 0))[0];
}

function resolveSeoMetadata(db, req, requestOrigin = "") {
  ensureSeoDefaults(db);
  const settings = { ...defaultSeoGlobalSettings(), ...(db.seoGlobalSettings || {}) };
  const origin = (requestOrigin || settings.base_url).replace(/\/+$/, "");
  const context = getPageContext(db, req, origin);
  const locale = settings.default_locale;
  const entry =
    findSeoEntry(db, { entity_type: context.entity_type, entity_id: context.entity_id, locale }) ||
    findSeoEntry(db, { route_path: context.route_path, locale }) ||
    findSeoEntry(db, { route_path: new URL(req.url, "https://local.test").pathname, locale });
  const template = findSeoTemplate(db, context.entity_type, locale);
  const canonicalSelf = absoluteUrl(origin, context.canonical_path || context.route_path);
  const values = {
    site_name: settings.site_name,
    canonical_url: canonicalSelf,
    brand_name: settings.organization_name,
    collection_name: context.values.collection_name || "",
    category_name: context.values.category_name || "",
    product_name: context.values.product_name || "",
    page_title: context.page_title,
    h1: context.h1,
    short_description: context.short_description || settings.default_meta_description,
    price: context.values.price || "",
    currency: context.values.currency || "USD",
    sku: context.values.sku || "",
    color: context.values.color || "",
    size: context.values.size || "",
    material: context.entity?.material || "",
    gender: context.entity?.gender || "",
    season: context.entity?.season || "",
    article_title: context.values.article_title || "",
    author: context.values.author || "",
    published_date: context.entity?.createdAt || "",
    updated_date: context.entity?.updatedAt || "",
    ...(context.values || {})
  };

  const inheritedTitle = template?.title_template
    ? replaceTemplate(template.title_template, values)
    : replaceTemplate(settings.default_title_template, values) || settings.default_meta_title;
  const title = entry?.seo_title || entry?.meta_title || inheritedTitle || settings.default_meta_title;
  const description =
    entry?.meta_description ||
    (template?.meta_description_template ? replaceTemplate(template.meta_description_template, values) : "") ||
    context.short_description ||
    settings.default_meta_description;
  const h1 = entry?.h1 || (template?.h1_template ? replaceTemplate(template.h1_template, values) : "") || context.h1 || context.page_title;
  const canonicalMode = entry?.canonical_mode || settings.default_canonical_strategy || "self";
  const canonical =
    canonicalMode === "none"
      ? ""
      : canonicalMode === "custom" && entry?.canonical_url
        ? entry.canonical_url
        : template?.canonical_template
          ? replaceTemplate(template.canonical_template, values) || canonicalSelf
          : canonicalSelf;

  const robotsIndex = entry?.robots_index && entry.robots_index !== "inherit" ? entry.robots_index : settings.default_robots_index;
  const robotsFollow = entry?.robots_follow && entry.robots_follow !== "inherit" ? entry.robots_follow : settings.default_robots_follow;
  const robots = buildRobotsMeta({ ...settings, ...(entry || {}), robots_index: robotsIndex, robots_follow: robotsFollow });
  const ogTitle = entry?.og_title || (template?.og_title_template ? replaceTemplate(template.og_title_template, values) : "") || settings.default_og_title || title;
  const ogDescription =
    entry?.og_description || (template?.og_description_template ? replaceTemplate(template.og_description_template, values) : "") || settings.default_og_description || description;
  const ogImage = absoluteUrl(origin, entry?.og_image || context.image || settings.default_og_image);
  const twitterTitle = entry?.twitter_title || ogTitle || title;
  const twitterDescription = entry?.twitter_description || ogDescription || description;
  const twitterImage = absoluteUrl(origin, entry?.twitter_image || entry?.og_image || context.image || settings.default_og_image);
  const hreflangItems =
    entry?.hreflang_enabled && Array.isArray(entry.hreflang_items) && entry.hreflang_items.length
      ? entry.hreflang_items
      : settings.hreflang_enabled
        ? settings.hreflang_items || []
        : [];
  const schemaJsons = buildSchemaJsons(db, context, settings, entry, { origin, title, description, canonical, h1, ogImage });
  const snippets = getApplicableSnippets(db, context, new URL(req.url, "https://local.test").pathname);

  return {
    title,
    description,
    h1,
    canonical,
    robots,
    locale,
    source: entry ? "page override" : template ? "template" : "global",
    context,
    entry,
    og: entry?.og_enabled === false ? null : {
      title: ogTitle,
      description: ogDescription,
      image: ogImage,
      image_alt: entry?.og_image_alt || settings.default_social_image_alt || title,
      type: entry?.og_type || (context.entity_type === "product" ? "product" : settings.default_og_type || "website"),
      url: entry?.og_url || canonical || canonicalSelf,
      site_name: entry?.og_site_name || settings.og_site_name || settings.site_name,
      locale: entry?.og_locale || settings.og_locale || "en_US",
      locale_alternate: entry?.og_locale_alternate || []
    },
    twitter: entry?.twitter_enabled === false ? null : {
      card: entry?.twitter_card || settings.twitter_card || "summary_large_image",
      title: twitterTitle,
      description: twitterDescription,
      image: twitterImage,
      image_alt: entry?.twitter_image_alt || entry?.og_image_alt || settings.default_social_image_alt || title,
      site: entry?.twitter_site || settings.twitter_site || "",
      creator: entry?.twitter_creator || settings.twitter_creator || ""
    },
    hreflang: hreflangItems,
    schemaJsons,
    snippets,
    previews: {
      serp_preview_title: entry?.serp_preview_title || title,
      serp_preview_description: entry?.serp_preview_description || description,
      serp_preview_url: entry?.serp_preview_url || canonical,
      social_preview_image: entry?.social_preview_image || ogImage,
      social_preview_title: entry?.social_preview_title || ogTitle,
      social_preview_description: entry?.social_preview_description || ogDescription
    }
  };
}

function buildRobotsMeta(source) {
  const directives = new Set();
  directives.add(source.robots_index || "index");
  directives.add(source.robots_follow || "follow");
  if (toBool(source.robots_noarchive ?? source.default_noarchive, false)) directives.add("noarchive");
  if (toBool(source.robots_nosnippet ?? source.default_nosnippet, false)) directives.add("nosnippet");
  if (toBool(source.robots_noimageindex, false)) directives.add("noimageindex");
  const maxSnippet = cleanString(source.robots_max_snippet || source.default_max_snippet || "", 30);
  const maxImage = cleanString(source.robots_max_image_preview || source.default_max_image_preview || "", 30);
  const maxVideo = cleanString(source.robots_max_video_preview || source.default_max_video_preview || "", 30);
  if (maxSnippet) directives.add(`max-snippet:${maxSnippet}`);
  if (maxImage) directives.add(`max-image-preview:${maxImage}`);
  if (maxVideo) directives.add(`max-video-preview:${maxVideo}`);
  if (source.unavailable_after) directives.add(`unavailable_after: ${source.unavailable_after}`);
  return Array.from(directives)
    .filter((directive) => directive && directive !== "inherit")
    .join(", ");
}

function buildSchemaJsons(db, context, settings, entry, resolved) {
  const schemaJsons = [];

  if (entry?.schema_enabled && entry.schema_json_override) {
    try {
      schemaJsons.push(JSON.parse(entry.schema_json_override));
    } catch {
      return schemaJsons;
    }
  }

  const shouldAutoGenerate = entry?.schema_enabled || entry?.schema_auto_generate !== false;
  if (!shouldAutoGenerate) return schemaJsons;

  if (context.entity_type === "product" && settings.default_product_schema_enabled !== false && context.entity) {
    const product = context.entity;
    const stock = Number(db.inventory?.[product.id]?.stock || 0);
    schemaJsons.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description: product.longDescription || product.description || resolved.description,
      image: absoluteUrl(settings.base_url, product.image),
      sku: product.id,
      brand: { "@type": "Brand", name: settings.organization_name || settings.site_name },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: (Number(product.price || 0) / 100).toFixed(2),
        availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        url: resolved.canonical
      }
    });
  } else if (context.entity_type === "product_category" && context.entity) {
    const products = publicProductsForSeo(db).filter((product) => product.type === context.entity.id);
    schemaJsons.push({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: context.entity.title,
      description: context.entity.description || resolved.description,
      url: resolved.canonical,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: products.slice(0, 50).map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: absoluteUrl(settings.base_url, `/product.html?id=${encodeURIComponent(product.id)}`),
          name: product.title
        }))
      }
    });
  } else {
    schemaJsons.push({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: resolved.title,
      description: resolved.description,
      url: resolved.canonical
    });
  }

  if (settings.default_breadcrumb_schema_enabled !== false) {
    schemaJsons.push(buildBreadcrumbSchema(context, settings.base_url, resolved.title, resolved.canonical));
  }

  if (context.entity_type === "home_page") {
    schemaJsons.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: settings.organization_name || settings.site_name,
      legalName: settings.organization_legal_name || settings.organization_name || settings.site_name,
      url: settings.organization_url || settings.base_url,
      logo: absoluteUrl(settings.base_url, settings.organization_logo),
      email: settings.organization_email || undefined,
      telephone: settings.organization_phone || undefined,
      address: settings.organization_address || undefined,
      sameAs: settings.same_as_social_links || []
    });
  }

  return dedupeJsonLd(schemaJsons);
}

function buildBreadcrumbSchema(context, baseUrl, title, canonical) {
  const items = [
    { name: "Home", item: absoluteUrl(baseUrl, "/") }
  ];
  if (context.entity_type === "product" && context.entity?.type) {
    const category = context.entity.type;
    items.push({ name: category.replace(/[-_]+/g, " "), item: absoluteUrl(baseUrl, getCategoryUrl(category)) });
  }
  items.push({ name: title || context.page_title, item: canonical });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item
    }))
  };
}

function dedupeJsonLd(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderSeoHead(metadata) {
  const lines = [];
  if (metadata.title) lines.push(`<title>${escapeHtml(metadata.title)}</title>`);
  if (metadata.description) lines.push(`<meta name="description" content="${escapeHtml(metadata.description)}" />`);
  if (metadata.robots) lines.push(`<meta name="robots" content="${escapeHtml(metadata.robots)}" />`);
  if (metadata.canonical) lines.push(`<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />`);
  (metadata.hreflang || [])
    .filter((item) => item.enabled !== false && item.locale && item.url)
    .forEach((item) => {
      lines.push(`<link rel="alternate" hreflang="${escapeHtml(item.x_default ? "x-default" : item.locale)}" href="${escapeHtml(item.url)}" />`);
    });
  if (metadata.og) {
    lines.push(`<meta property="og:title" content="${escapeHtml(metadata.og.title)}" />`);
    lines.push(`<meta property="og:description" content="${escapeHtml(metadata.og.description)}" />`);
    if (metadata.og.image) lines.push(`<meta property="og:image" content="${escapeHtml(metadata.og.image)}" />`);
    if (metadata.og.image_alt) lines.push(`<meta property="og:image:alt" content="${escapeHtml(metadata.og.image_alt)}" />`);
    lines.push(`<meta property="og:type" content="${escapeHtml(metadata.og.type)}" />`);
    lines.push(`<meta property="og:url" content="${escapeHtml(metadata.og.url)}" />`);
    lines.push(`<meta property="og:site_name" content="${escapeHtml(metadata.og.site_name)}" />`);
    lines.push(`<meta property="og:locale" content="${escapeHtml(metadata.og.locale)}" />`);
  }
  if (metadata.twitter) {
    lines.push(`<meta name="twitter:card" content="${escapeHtml(metadata.twitter.card)}" />`);
    lines.push(`<meta name="twitter:title" content="${escapeHtml(metadata.twitter.title)}" />`);
    lines.push(`<meta name="twitter:description" content="${escapeHtml(metadata.twitter.description)}" />`);
    if (metadata.twitter.image) lines.push(`<meta name="twitter:image" content="${escapeHtml(metadata.twitter.image)}" />`);
    if (metadata.twitter.image_alt) lines.push(`<meta name="twitter:image:alt" content="${escapeHtml(metadata.twitter.image_alt)}" />`);
    if (metadata.twitter.site) lines.push(`<meta name="twitter:site" content="${escapeHtml(metadata.twitter.site)}" />`);
    if (metadata.twitter.creator) lines.push(`<meta name="twitter:creator" content="${escapeHtml(metadata.twitter.creator)}" />`);
  }
  (metadata.schemaJsons || []).forEach((schema, index) => {
    lines.push(`<script type="application/ld+json" id="seo-jsonld-${index + 1}">${JSON.stringify(schema)}</script>`);
  });
  (metadata.snippets || [])
    .filter((snippet) => snippet.placement === "head_start" || snippet.placement === "head_end")
    .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0))
    .forEach((snippet) => {
      const rendered = renderSnippet(snippet);
      if (rendered) lines.push(rendered);
    });
  return lines.filter(Boolean).join("\n    ");
}

function renderSnippet(snippet) {
  if (!snippet.enabled || !snippet.code) return "";
  if (snippet.snippet_type === "json_ld") {
    try {
      return `<script type="application/ld+json">${JSON.stringify(JSON.parse(snippet.code))}</script>`;
    } catch {
      return "";
    }
  }
  return snippet.code;
}

function injectSeoHead(html, metadata) {
  const cleaned = String(html)
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, "")
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']alternate["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, "")
    .replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, "");
  const head = renderSeoHead(metadata);
  return cleaned.replace(/<\/head>/i, `    ${head}\n  </head>`);
}

function getApplicableSnippets(db, context, pathname) {
  return (db.seoCodeSnippets || []).filter((snippet) => {
    if (snippet.enabled === false) return false;
    const scope = snippet.scope_json || snippet.scope || { all_site: true };
    if (scope.all_site) return true;
    if (Array.isArray(scope.selected_entity_types) && scope.selected_entity_types.includes(context.entity_type)) return true;
    if (Array.isArray(scope.selected_pages) && scope.selected_pages.includes(pathname)) return true;
    if (scope.route_pattern) {
      try {
        return new RegExp(scope.route_pattern).test(pathname);
      } catch {
        return false;
      }
    }
    return false;
  });
}

function publicProductsForSeo(db) {
  return Array.isArray(db.products) ? db.products : [];
}

function publicCategoriesForSeo(db) {
  return (Array.isArray(db.categories) ? db.categories : []).filter((category) => category && category.id);
}

function buildSitemapUrls(db, baseUrl = "") {
  ensureSeoDefaults(db);
  const settings = { ...defaultSeoGlobalSettings(), ...(db.seoGlobalSettings || {}) };
  const origin = (baseUrl || settings.base_url).replace(/\/+$/, "");
  const urls = [];
  const entryForUrl = (entityType, entityId, routePath) =>
    findSeoEntry(db, { entity_type: entityType, entity_id: entityId, locale: settings.default_locale }) ||
    findSeoEntry(db, { route_path: routePath, locale: settings.default_locale });
  const addUrl = (loc, source = {}) => {
    if (!loc) return;
    const entry = source.entity_type ? entryForUrl(source.entity_type, source.entity_id, loc) : null;
    if (entry) {
      if (entry.status !== "published") return;
      if (entry.include_in_sitemap === false) return;
      if (settings.exclude_noindex_from_sitemap && entry.robots_index === "noindex") return;
    }
    const canonical = absoluteUrl(origin, loc);
    const existing = urls.find((item) => item.loc === canonical);
    if (existing) return;
    urls.push({
      loc: canonical,
      lastmod: source.lastmod || source.updatedAt || source.updated_at || nowIso().slice(0, 10),
      changefreq: source.changefreq || source.sitemap_changefreq || settings.default_changefreq || "weekly",
      priority: priority(source.priority ?? source.sitemap_priority ?? settings.default_priority, settings.default_priority),
      hreflang: source.hreflang || []
    });
  };

  if (settings.sitemap_enabled === false) return [];
  if (settings.sitemap_include_pages !== false) {
    PUBLIC_STATIC_PAGES.filter((page) => page.route_path !== "/index.html").forEach((page) => addUrl(page.route_path, page));
  }
  if (settings.sitemap_include_categories !== false) {
    publicCategoriesForSeo(db).forEach((category) => addUrl(getCategoryUrl(category.id), { ...category, entity_type: "product_category", entity_id: category.id }));
  }
  if (settings.sitemap_include_products !== false) {
    publicProductsForSeo(db).forEach((product) => addUrl(`/product.html?id=${encodeURIComponent(product.id)}`, { ...product, entity_type: "product", entity_id: product.id }));
  }

  (db.seoEntries || [])
    .filter((entry) => !entry.deleted_at && entry.status === "published" && entry.include_in_sitemap !== false)
    .forEach((entry) => {
      if (settings.exclude_noindex_from_sitemap && entry.robots_index === "noindex") return;
      const loc = entry.canonical_mode === "custom" && entry.canonical_url ? entry.canonical_url : entry.route_path || "";
      addUrl(loc, {
        lastmod: entry.sitemap_lastmod_mode === "manual" ? entry.sitemap_lastmod : entry.updated_at,
        sitemap_changefreq: entry.sitemap_changefreq,
        sitemap_priority: entry.sitemap_priority,
        hreflang: entry.hreflang_enabled ? entry.hreflang_items : []
      });
    });

  return urls;
}

function renderSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls
    .map((url) => {
      const hreflang = (url.hreflang || [])
        .filter((item) => item.enabled !== false && item.locale && item.url)
        .map((item) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(item.x_default ? "x-default" : item.locale)}" href="${escapeXml(item.url)}" />`)
        .join("\n");
      return `  <url>\n    <loc>${escapeXml(url.loc)}</loc>\n    <lastmod>${escapeXml(String(url.lastmod).slice(0, 10))}</lastmod>\n    <changefreq>${escapeXml(url.changefreq)}</changefreq>\n    <priority>${escapeXml(url.priority)}</priority>${hreflang ? `\n${hreflang}` : ""}\n  </url>`;
    })
    .join("\n")}\n</urlset>`;
}

function renderSitemapIndex(baseUrl) {
  const origin = baseUrl.replace(/\/+$/, "");
  const maps = ["sitemap-pages.xml", "sitemap-products.xml", "sitemap-categories.xml", "sitemap-blog.xml"];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps
    .map((map) => `  <sitemap>\n    <loc>${escapeXml(`${origin}/${map}`)}</loc>\n    <lastmod>${nowIso().slice(0, 10)}</lastmod>\n  </sitemap>`)
    .join("\n")}\n</sitemapindex>`;
}

function generateRobotsTxt(db, baseUrl = "") {
  ensureSeoDefaults(db);
  const settings = { ...defaultSeoGlobalSettings(), ...(db.seoGlobalSettings || {}) };
  const origin = (baseUrl || settings.base_url).replace(/\/+$/, "");
  if (settings.robots_txt_enabled === false) return "User-agent: *\nDisallow: /";
  if (settings.robots_advanced_text) return settings.robots_advanced_text;

  const lines = [];
  lines.push(settings.robots_global_rules || "User-agent: *");
  (settings.robots_allow_patterns || []).forEach((pattern) => lines.push(`Allow: ${pattern}`));
  (settings.robots_disallow_patterns || []).forEach((pattern) => lines.push(`Disallow: ${pattern}`));
  lines.push(`Sitemap: ${settings.robots_sitemap_url || `${origin}/sitemap.xml`}`);
  return Array.from(new Set(lines.filter(Boolean))).join("\n");
}

function buildSeoAudit(db, baseUrl = "") {
  ensureSeoDefaults(db);
  const settings = { ...defaultSeoGlobalSettings(), ...(db.seoGlobalSettings || {}) };
  const origin = (baseUrl || settings.base_url).replace(/\/+$/, "");
  const candidates = [
    ...PUBLIC_STATIC_PAGES.filter((page) => page.route_path !== "/index.html").map((page) => ({ ...page, id: page.entity_id })),
    ...publicCategoriesForSeo(db).map((category) => ({
      entity_type: "product_category",
      entity_id: category.id,
      route_path: getCategoryUrl(category.id),
      page_title: category.title,
      h1: category.title
    })),
    ...publicProductsForSeo(db).map((product) => ({
      entity_type: "product",
      entity_id: product.id,
      route_path: `/product.html?id=${encodeURIComponent(product.id)}`,
      page_title: product.title,
      h1: product.title
    })),
    ...(db.seoEntries || []).map((entry) => ({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id || entry.id,
      route_path: entry.route_path || "",
      page_title: entry.seo_title || entry.h1 || entry.route_path,
      h1: entry.h1,
      entry
    }))
  ];
  const titleMap = new Map();
  const descriptionMap = new Map();
  const rows = candidates.map((candidate) => {
    const fakeReq = { url: candidate.route_path || "/", headers: { host: new URL(origin).host } };
    const metadata = resolveSeoMetadata(db, fakeReq, origin);
    const entry = candidate.entry || metadata.entry;
    const errors = [];
    const warnings = [];

    if (!metadata.title) errors.push("Missing SEO title.");
    if (!metadata.description) errors.push("Missing meta description.");
    if (!metadata.h1) warnings.push("Missing H1.");
    if (!metadata.canonical) errors.push("Missing canonical URL.");
    if (metadata.robots.includes("noindex")) warnings.push("Page has noindex.");
    if (metadata.robots.includes("noindex") && (entry?.include_in_sitemap ?? true)) errors.push("Noindex page is included in sitemap.");
    if (!metadata.og?.image) warnings.push("Open Graph image is missing.");
    if (!candidate.route_path) errors.push("Empty slug or route path.");
    if (metadata.title && metadata.title.length < 20) warnings.push("SEO title is short.");
    if (metadata.title && metadata.title.length > 65) warnings.push("SEO title is long.");
    if (metadata.description && metadata.description.length < 70) warnings.push("Meta description is short.");
    if (metadata.description && metadata.description.length > 170) warnings.push("Meta description is long.");
    metadata.schemaJsons.forEach((schema) => {
      try {
        JSON.stringify(schema);
      } catch {
        errors.push("Invalid JSON-LD.");
      }
    });

    const row = {
      id: `${candidate.entity_type}:${candidate.entity_id || candidate.route_path}`,
      entity_type: candidate.entity_type,
      entity_id: candidate.entity_id,
      route_path: candidate.route_path,
      locale: entry?.locale || settings.default_locale,
      status: entry?.status || "published",
      robots_index: metadata.robots.includes("noindex") ? "noindex" : "index",
      updated_by: entry?.updated_by || "",
      updated_at: entry?.updated_at || "",
      title: metadata.title,
      description: metadata.description,
      canonical: metadata.canonical,
      source: metadata.source,
      errors,
      warnings
    };

    if (row.title) titleMap.set(row.title, [...(titleMap.get(row.title) || []), row.id]);
    if (row.description) descriptionMap.set(row.description, [...(descriptionMap.get(row.description) || []), row.id]);
    return row;
  });

  rows.forEach((row) => {
    if (row.title && titleMap.get(row.title)?.length > 1) row.warnings.push("Duplicate SEO title.");
    if (row.description && descriptionMap.get(row.description)?.length > 1) row.warnings.push("Duplicate meta description.");
  });

  const redirectWarnings = detectRedirectWarnings(db.seoRedirects || []);
  const sitemapUrls = buildSitemapUrls(db, origin);
  const mediaWithoutAlt = getMediaSeoInventory(db).filter((item) => !item.alt_text && !item.is_decorative);
  return {
    rows,
    summary: {
      total_pages: rows.length,
      errors: rows.filter((row) => row.errors.length).length,
      warnings: rows.filter((row) => row.warnings.length).length,
      noindex: rows.filter((row) => row.robots_index === "noindex").length,
      sitemap_count: sitemapUrls.length,
      last_sitemap_generated_at: db.seoSitemap?.lastGeneratedAt || settings.last_sitemap_generated_at || "",
      last_seo_updated_at: settings.last_seo_updated_at || "",
      media_without_alt: mediaWithoutAlt.length,
      redirect_warnings: redirectWarnings.length
    },
    redirectWarnings,
    mediaWithoutAlt
  };
}

function getMediaSeoInventory(db) {
  const mediaSeoById = Object.fromEntries((db.mediaSeo || []).map((item) => [item.media_id, item]));
  const items = [];
  Object.values(db.productImages || {}).forEach((image) => {
    const override = mediaSeoById[image.id] || {};
    items.push({
      id: override.id || "",
      media_id: image.id,
      file_name: image.fileName || image.id,
      mime_type: image.mimeType || "",
      width: override.width || 0,
      height: override.height || 0,
      image_usage_pages: [`product:${image.productId}`],
      alt_text: override.alt_text || "",
      title: override.title || "",
      caption: override.caption || "",
      description: override.description || "",
      is_decorative: override.is_decorative === true,
      focal_point: override.focal_point || ""
    });
  });
  return items;
}

module.exports = {
  buildSeoAudit,
  buildSitemapUrls,
  defaultSeoGlobalSettings,
  detectRedirectWarnings,
  ensureSeoDefaults,
  findRedirectForRequest,
  generateRobotsTxt,
  getMediaSeoInventory,
  getSeoPermissions,
  injectSeoHead,
  renderSitemapIndex,
  renderSitemapXml,
  renderSeoHead,
  replaceTemplate,
  resolveSeoMetadata,
  sanitizeGlobalSettings,
  sanitizeMediaSeo,
  sanitizeSeoEntry,
  sanitizeSeoRedirect,
  sanitizeSeoSnippet,
  sanitizeSeoTemplate,
  auditSeoChange,
  validateSeoEntry
};

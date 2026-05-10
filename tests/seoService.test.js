const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NITKA_DB_PATH = ":memory:";

const {
  buildSitemapUrls,
  detectRedirectWarnings,
  ensureSeoDefaults,
  generateRobotsTxt,
  injectSeoHead,
  replaceTemplate,
  resolveSeoMetadata,
  sanitizeSeoEntry
} = require("../services/seoService");

function makeDb() {
  const db = {
    products: [
      {
        id: "hoodie",
        title: "Hoodie Herbarium",
        type: "tops",
        description: "Dense fleece with embroidery.",
        longDescription: "Dense fleece with embroidery and monogram.",
        price: 7900,
        image: "assets/embroidered-collection.png",
        colors: [{ name: "Black" }],
        sizes: ["M"]
      }
    ],
    categories: [
      {
        id: "tops",
        title: "Tops",
        description: "Hoodies and shirts.",
        image: "assets/embroidered-collection.png"
      }
    ],
    inventory: { hoodie: { stock: 4 } },
    seoEntries: [],
    seoTemplates: [],
    seoRedirects: [],
    seoCodeSnippets: [],
    seoAuditLogs: [],
    mediaSeo: [],
    productImages: {}
  };
  ensureSeoDefaults(db);
  return db;
}

test("SEO resolver uses page override before templates and global defaults", () => {
  const db = makeDb();
  db.seoEntries.push(
    sanitizeSeoEntry({
      entity_type: "product",
      entity_id: "hoodie",
      status: "published",
      seo_title: "Custom Hoodie SEO Title",
      meta_description: "Custom hoodie meta description long enough for search preview.",
      h1: "Custom Hoodie H1",
      canonical_mode: "self"
    })
  );

  const metadata = resolveSeoMetadata(
    db,
    { url: "/product.html?id=hoodie", headers: { host: "www.hoodyboody.com", "x-forwarded-proto": "https" } },
    "https://www.hoodyboody.com"
  );

  assert.equal(metadata.title, "Custom Hoodie SEO Title");
  assert.equal(metadata.h1, "Custom Hoodie H1");
  assert.equal(metadata.source, "page override");
  assert.match(metadata.canonical, /product\.html\?id=hoodie$/);
});

test("template variables are replaced", () => {
  assert.equal(
    replaceTemplate("{product_name} | {site_name} - {price} {currency}", {
      product_name: "Hoodie",
      site_name: "HOODYBOODY",
      price: "79.00",
      currency: "USD"
    }),
    "Hoodie | HOODYBOODY - 79.00 USD"
  );
});

test("robots meta generation includes noindex and nofollow without conflicts", () => {
  const db = makeDb();
  db.seoEntries.push(
    sanitizeSeoEntry({
      route_path: "/landing",
      entity_type: "landing_page",
      seo_title: "Landing page title",
      meta_description: "Landing page description for testing robots directives.",
      robots_index: "noindex",
      robots_follow: "nofollow",
      robots_noarchive: true
    })
  );

  const metadata = resolveSeoMetadata(db, { url: "/landing", headers: { host: "www.hoodyboody.com" } }, "https://www.hoodyboody.com");
  assert.match(metadata.robots, /noindex/);
  assert.match(metadata.robots, /nofollow/);
  assert.match(metadata.robots, /noarchive/);
});

test("sitemap excludes noindex SEO entries", () => {
  const db = makeDb();
  db.seoEntries.push(
    sanitizeSeoEntry({
      entity_type: "product",
      entity_id: "hoodie",
      status: "published",
      seo_title: "Noindex Hoodie",
      meta_description: "Noindex hoodie description for sitemap exclusion.",
      robots_index: "noindex",
      include_in_sitemap: true
    })
  );

  const urls = buildSitemapUrls(db, "https://www.hoodyboody.com");
  assert.equal(urls.some((url) => url.loc.includes("product.html?id=hoodie")), false);
});

test("JSON-LD validation rejects invalid schema overrides", () => {
  assert.throws(
    () =>
      sanitizeSeoEntry({
        route_path: "/bad-schema",
        entity_type: "custom_url",
        seo_title: "Bad schema test page",
        meta_description: "Bad schema test page description.",
        schema_json_override: "{bad json"
      }),
    /JSON/
  );
});

test("redirect loop detection reports loops", () => {
  const warnings = detectRedirectWarnings([
    { id: "a", from_path: "/a", to_url: "/b", enabled: true },
    { id: "b", from_path: "/b", to_url: "/a", enabled: true }
  ]);
  assert.equal(warnings.some((warning) => warning.type === "loop"), true);
});

test("robots.txt includes sitemap URL", () => {
  const db = makeDb();
  const robots = generateRobotsTxt(db, "https://www.hoodyboody.com");
  assert.match(robots, /Sitemap: https:\/\/www\.hoodyboody\.com\/sitemap\.xml/);
});

test("head injection removes duplicate SEO tags and inserts canonical", () => {
  const db = makeDb();
  const metadata = resolveSeoMetadata(db, { url: "/product.html?id=hoodie", headers: { host: "www.hoodyboody.com" } }, "https://www.hoodyboody.com");
  const html = injectSeoHead("<html><head><title>Old</title><meta name=\"description\" content=\"old\"><meta name=\"robots\" content=\"noindex\"></head><body></body></html>", metadata);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/name=\"description\"/g) || []).length, 1);
  assert.match(html, /rel=\"canonical\"/);
});

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

process.env.NITKA_DB_PATH = ":memory:";

const app = require("../server");

function startServer() {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test("homepage removes featured categories, service coverage, and thread palette controls", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive" \/>/);
    assert.doesNotMatch(html, /featured categories/i);
    assert.doesNotMatch(html, /service coverage/i);
    assert.doesNotMatch(html, /View service areas/i);
    assert.doesNotMatch(html, /Thread palette/i);
    assert.doesNotMatch(html, /data-service-city-row/);
  } finally {
    server.close();
  }
});

test("location pages and automatic geo targeting remain removed", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const locations = await fetch(`${baseUrl}/locations/`);
    const cityLocation = await fetch(`${baseUrl}/locations/indiana/indianapolis/`);

    assert.equal(locations.status, 404);
    assert.equal(cityLocation.status, 404);

    const removedApi = await fetch(`${baseUrl}/api/geo-target`);
    const removedApiJson = await removedApi.json();
    assert.equal(removedApi.status, 404);
    assert.equal(removedApiJson.message, "API not found.");

    const homeWithHeaders = await fetch(`${baseUrl}/`, {
      headers: {
        "x-vercel-ip-city": "Chicago",
        "x-vercel-ip-country-region": "IL"
      }
    });
    const homeHtml = await homeWithHeaders.text();
    assert.match(homeHtml, /<title>HOODYBOODY \| Embroidery clothes<\/title>/);
    assert.match(homeHtml, /Too Cool <span class="hero-title-for">for<\/span> Stitches/);
    assert.doesNotMatch(homeHtml, /hero-title-location/);
    assert.doesNotMatch(homeHtml, /geo-location-link/);
    assert.doesNotMatch(homeHtml, /\/locations\//);
  } finally {
    server.close();
  }
});

test("blog page renders Valeska-style single post functionality", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/blog/`);
    const html = await response.text();
    const script = await fetch(`${baseUrl}/blog.js`);
    const scriptText = await script.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /Fashion Is Our Passion \| HOODYBOODY Blog/);
    assert.match(html, /data-blog-gallery/);
    assert.match(html, /blog-newsletter/);
    assert.match(html, /data-blog-comment-form/);
    assert.match(html, /href="\/blog\/">Blog/);
    assert.match(scriptText, /data-blog-newsletter/);
    assert.match(scriptText, /Slide \$\{activeIndex \+ 1\} of \$\{slides\.length\}/);
  } finally {
    server.close();
  }
});

test("customer can log in with phone and keep account session", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const register = await fetch(`${baseUrl}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Transition Test",
        phone: "+1 317 555 0199",
        email: "transition-test@example.com",
        password: "secret123"
      })
    });
    assert.equal(register.status, 201);

    const login = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: "3175550199",
        password: "secret123"
      })
    });
    const cookie = login.headers.get("set-cookie") || "";
    assert.equal(login.status, 200);
    assert.match(cookie, /nitka_session=/);

    const session = await fetch(`${baseUrl}/api/session`, {
      headers: { Cookie: cookie }
    });
    const sessionJson = await session.json();
    assert.equal(session.status, 200);
    assert.equal(sessionJson.user.email, "transition-test@example.com");
  } finally {
    server.close();
  }
});

test("sitemap architecture is generated without opening indexing", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
    const sitemapXml = await sitemap.text();
    const robots = await fetch(`${baseUrl}/robots.txt`);
    const robotsTxt = await robots.text();

    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers.get("x-robots-tag") || "", /noindex/);
    assert.doesNotMatch(sitemapXml, /\/locations\//);
    assert.match(sitemapXml, /\/blog\//);
    assert.match(sitemapXml, /\/embroidered-hoodies\//);
    assert.match(robotsTxt, /Disallow: \//);
    assert.match(robots.headers.get("x-robots-tag") || "", /noindex/);
  } finally {
    server.close();
  }
});

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

test("clean location routes render SEO-ready content while staying noindex", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/locations/indiana/indianapolis/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive" \/>/);
    assert.match(html, /Custom Embroidery in Indianapolis/);
    assert.match(html, /FAQPage/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/locations\/indiana\/indianapolis\/" \/>/);
    assert.doesNotMatch(html, /Chicago/);
  } finally {
    server.close();
  }
});

test("geo target pages only expose the active state", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const locations = await fetch(`${baseUrl}/locations/`);
    const html = await locations.text();
    const geoTarget = await fetch(`${baseUrl}/api/geo-target`);
    const geoJson = await geoTarget.json();

    assert.equal(locations.status, 200);
    assert.match(html, /Custom Embroidery in Indiana/);
    assert.match(html, /Indianapolis/);
    assert.doesNotMatch(html, /Choose a state/);
    assert.doesNotMatch(html, /Chicago/);
    assert.equal(geoTarget.status, 200);
    assert.equal(geoJson.stateSlug, "indiana");
    assert.deepEqual(
      geoJson.cities.map((city) => city.stateSlug),
      geoJson.cities.map(() => "indiana")
    );

    const illinoisTarget = await fetch(`${baseUrl}/api/geo-target?state=illinois`);
    const illinoisJson = await illinoisTarget.json();
    assert.equal(illinoisJson.stateSlug, "illinois");
    assert.deepEqual(
      illinoisJson.cities.map((city) => city.stateSlug),
      illinoisJson.cities.map(() => "illinois")
    );
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
    assert.match(sitemapXml, /\/locations\/indiana\/indianapolis\//);
    assert.doesNotMatch(sitemapXml, /\/locations\/illinois\/chicago\//);
    assert.match(sitemapXml, /\/embroidered-hoodies\//);
    assert.match(robotsTxt, /Disallow: \//);
    assert.match(robots.headers.get("x-robots-tag") || "", /noindex/);
  } finally {
    server.close();
  }
});

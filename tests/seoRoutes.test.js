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
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();
    const capImage = await fetch(`${baseUrl}/assets/custom-order-cap.png`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive" \/>/);
    assert.match(css, /custom-order-cap\.png/);
    assert.match(css, /width: min\(400px, 100%\)/);
    assert.equal(capImage.status, 200);
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
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /Fashion Is Our Passion \| HOODYBOODY Blog/);
    assert.match(html, /data-blog-gallery/);
    assert.match(html, /id="qodef-page-sidebar"/);
    assert.match(html, /blog-sidebar-nav/);
    assert.match(html, /blog-sidebar-gallery-grid/);
    assert.match(html, /blog-reply-grid/);
    assert.match(html, /blog-newsletter/);
    assert.match(html, /data-blog-comment-form/);
    assert.match(html, /<ol class="blog-comment-list">[\s\S]*data-blog-comment-id/);
    assert.match(html, /href="\/blog\/">Blog/);
    assert.match(scriptText, /data-blog-newsletter/);
    assert.match(scriptText, /Slide \$\{activeIndex \+ 1\} of \$\{slides\.length\}/);
    assert.match(css, /\.blog-layout/);
    assert.match(css, /\.blog-sidebar-widget/);
    assert.match(css, /grid-template-columns: minmax\(270px, 31\.6%\) minmax\(0, 1fr\)/);
    assert.match(css, /\.blog-comment > ol/);
    assert.match(css, /overflow-wrap: anywhere/);
  } finally {
    server.close();
  }
});

test("owner can create blog posts and upload blog photos", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const login = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: "owner@nitka.local",
        password: "owner123"
      })
    });
    const cookie = login.headers.get("set-cookie") || "";
    assert.equal(login.status, 200);
    assert.match(cookie, /nitka_session=/);

    const adminPage = await fetch(`${baseUrl}/admin-blog.html`);
    const adminHtml = await adminPage.text();
    assert.equal(adminPage.status, 200);
    assert.match(adminHtml, /Create blog posts/);
    assert.match(adminHtml, /Comment moderation/);
    assert.match(adminHtml, /admin-blog\.js/);

    const postsResponse = await fetch(`${baseUrl}/api/admin/blog/posts`, {
      headers: { Cookie: cookie }
    });
    const postsJson = await postsResponse.json();
    assert.equal(postsResponse.status, 200);
    assert.ok(postsJson.posts.some((post) => post.slug === "fashion-is-our-passion"));

    const createResponse = await fetch(`${baseUrl}/api/admin/blog/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        title: "Studio Notes",
        slug: "studio-notes",
        category: "Studio",
        author: "HOODYBOODY Studio",
        date: "2026-05-19",
        status: "published",
        tags: "Embroidery, Studio",
        excerpt: "Short studio note about custom embroidery.",
        body: "First paragraph for the studio note.\n\n## Process\n\nMore text for the blog page."
      })
    });
    const createdJson = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(createdJson.post.status, "published");
    assert.match(createdJson.post.slug, /^studio-notes/);

    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const photoResponse = await fetch(`${baseUrl}/api/admin/blog/posts/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        postId: createdJson.post.id,
        fileName: "studio-note.png",
        dataUrl: tinyPng
      })
    });
    const photoJson = await photoResponse.json();
    assert.equal(photoResponse.status, 200);
    assert.match(photoJson.post.gallery[photoJson.post.gallery.length - 1].image, /^\/api\/blog-images\//);

    const publicPost = await fetch(`${baseUrl}/blog/${createdJson.post.slug}/`);
    const publicHtml = await publicPost.text();
    assert.equal(publicPost.status, 200);
    assert.match(publicHtml, /Studio Notes \| HOODYBOODY Blog/);
    assert.match(publicHtml, /First paragraph for the studio note/);
    assert.match(publicHtml, /\/api\/blog-images\//);

    const commentResponse = await fetch(`${baseUrl}/api/blog/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postSlug: createdJson.post.slug,
        name: "Comment Tester",
        email: "comment-tester@example.com",
        website: "https://example.com",
        comment: "This pending comment should wait for approval."
      })
    });
    const commentJson = await commentResponse.json();
    assert.equal(commentResponse.status, 201);
    assert.equal(commentJson.comment.status, "pending");

    const hiddenPending = await fetch(`${baseUrl}/blog/${createdJson.post.slug}/`);
    const hiddenPendingHtml = await hiddenPending.text();
    assert.doesNotMatch(hiddenPendingHtml, /This pending comment should wait for approval/);

    const commentsResponse = await fetch(`${baseUrl}/api/admin/blog/comments`, {
      headers: { Cookie: cookie }
    });
    const commentsJson = await commentsResponse.json();
    assert.equal(commentsResponse.status, 200);
    const pendingComment = commentsJson.comments.find((comment) => comment.commentId === commentJson.comment.id);
    assert.equal(pendingComment.status, "pending");
    assert.equal(pendingComment.email, "comment-tester@example.com");

    const approveResponse = await fetch(`${baseUrl}/api/admin/blog/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        postId: createdJson.post.id,
        commentId: commentJson.comment.id,
        status: "published"
      })
    });
    assert.equal(approveResponse.status, 200);

    const replyResponse = await fetch(`${baseUrl}/api/admin/blog/comments/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        postId: createdJson.post.id,
        commentId: commentJson.comment.id,
        text: "Published owner reply from moderation."
      })
    });
    assert.equal(replyResponse.status, 201);

    const publicApproved = await fetch(`${baseUrl}/blog/${createdJson.post.slug}/`);
    const publicApprovedHtml = await publicApproved.text();
    assert.match(publicApprovedHtml, /This pending comment should wait for approval/);
    assert.match(publicApprovedHtml, /Published owner reply from moderation/);
  } finally {
    server.close();
  }
});

test("shop navigation exposes Rubi-style mega menu markup", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/session-nav.js`);
    const script = await response.text();
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();

    assert.equal(response.status, 200);
    assert.match(script, /shop-mega-menu/);
    assert.match(script, /shopMegaPanel/);
    assert.match(script, /New Collection/);
    assert.match(script, /Embroidered Hoodies/);
    assert.match(script, /Embroidered Tote Bags/);
    assert.match(script, /shop-mega-image/);
    assert.match(script, /scheduleShopMegaClose/);
    assert.match(script, /closeShopMegaWithDissolve/);
    assert.match(script, /shopMegaDissolveMs = 240/);
    assert.match(script, /pointerenter/);
    assert.match(script, /window\.location\.assign\(destination\)/);
    assert.match(css, /shop-mega-menu::after/);
    assert.match(css, /shop-mega-menu\.is-closing \.shop-mega-panel/);
    assert.match(css, /pointer-events: none/);
    assert.match(css, /checkout-topbar \.nav-links > a/);
    assert.match(css, /checkout-topbar \.shop-mega-column li a/);
  } finally {
    server.close();
  }
});

test("live chat validates composer fields and contains long attachment names", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const scriptResponse = await fetch(`${baseUrl}/live-chat.js`);
    const script = await scriptResponse.text();
    const phoneResponse = await fetch(`${baseUrl}/phone-validation.js`);
    const phoneScript = await phoneResponse.text();
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();

    assert.equal(scriptResponse.status, 200);
    assert.match(script, /MAX_PHONE_DIGITS = 15/);
    assert.match(script, /sanitizePhoneValue/);
    assert.match(script, /updateSubmitState/);
    assert.match(script, /disabled aria-disabled="true"/);
    assert.match(script, /Fill in name, email, phone and message before sending/);
    assert.match(phoneScript, /MAX_PHONE_DIGITS = 15/);
    assert.match(phoneScript, /sanitizePhoneInput/);
    assert.match(css, /text-overflow: ellipsis/);
    assert.match(css, /grid-template-columns: auto minmax\(0, 1fr\) auto/);
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

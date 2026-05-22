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
    const scriptResponse = await fetch(`${baseUrl}/script.js`);
    const script = await scriptResponse.text();
    const capImage = await fetch(`${baseUrl}/assets/custom-order-cap.png`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive" \/>/);
    assert.match(css, /custom-order-cap\.png/);
    assert.match(css, /width: min\(400px, 100%\)/);
    assert.match(css, /grid-template-columns: 25\.25% 74\.75%/);
    assert.match(css, /aspect-ratio: 254 \/ 296/);
    assert.match(css, /gap: 30px 0/);
    assert.doesNotMatch(script, /catalog-section-all/);
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
    const response = await fetch(`${baseUrl}/blog/fashion-is-our-passion/`);
    const html = await response.text();
    const script = await fetch(`${baseUrl}/blog.js`);
    const scriptText = await script.text();
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(html, /Fashion Is Our Passion \| HOODYBOODY Blog/);
    assert.match(html, /data-blog-gallery/);
    assert.match(html, /data-blog-gallery-status/);
    assert.match(html, /blog-builder-block/);
    assert.match(html, /blog-image-pair/);
    assert.match(html, /Process Of Making Fashion Items/);
    assert.ok(
      html.indexOf("The best embroidered garments") < html.indexOf("Authentic Design") &&
        html.indexOf("Authentic Design") < html.indexOf("We look at fabric weight") &&
        html.indexOf("We look at fabric weight") < html.indexOf("blog-image-pair") &&
        html.indexOf("blog-image-pair") < html.indexOf("Every custom order"),
      "blog article must match the Valeska paragraph, heading, image-pair sequence"
    );
    assert.match(html, /id="qodef-page-sidebar"/);
    assert.match(html, /blog-sidebar-nav/);
    assert.match(html, /blog-sidebar-gallery-grid/);
    assert.match(html, /blog-reply-grid/);
    assert.doesNotMatch(html, /blog-newsletter/);
    assert.doesNotMatch(html, /Keep In Touch|Subscribe To Our Newsletter/i);
    assert.match(html, /data-blog-comment-form/);
    assert.match(html, /<ol class="blog-comment-list">[\s\S]*data-blog-comment-id/);
    assert.match(html, /href="\/blog\/">Blog/);
    assert.match(html, /blog-post-nav-card previous" href="\/blog\/machine-embroidery-for-clothes\//);
    assert.match(html, /blog-post-nav-card next is-disabled/);
    assert.doesNotMatch(scriptText, /data-blog-newsletter/);
    assert.match(scriptText, /Slide \$\{activeIndex \+ 1\} of \$\{slides\.length\}/);
    assert.match(scriptText, /data-blog-lightbox/);
    assert.match(scriptText, /Escape/);
    assert.match(css, /\.blog-layout/);
    assert.match(css, /\.blog-sidebar-widget/);
    assert.match(css, /grid-template-columns: minmax\(270px, 31\.6%\) minmax\(0, 1fr\)/);
    assert.match(css, /\.blog-sidebar-tags a/);
    assert.match(css, /\.blog-sidebar-tags \.tagcloud\s*{\s*display: grid/);
    assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /min-height: 38px/);
    assert.match(css, /blog-block-style-accent/);
    assert.match(css, /blog-image-single/);
    assert.match(css, /\.blog-divider/);
    assert.match(css, /\.blog-lightbox/);
    assert.match(css, /\.blog-post-nav-card\.is-disabled/);
    assert.match(css, /\.blog-rich-html/);
    assert.match(css, /\.blog-rich-html table/);
    assert.doesNotMatch(css, /blog-newsletter/);
    assert.match(css, /\.blog-tags span\s*{\s*display: none/);
    assert.match(css, /\.blog-comment > ol/);
    assert.match(css, /overflow-wrap: anywhere/);
  } finally {
    server.close();
  }
});

test("machine embroidery guide renders imported blog content with tables and no card icons", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/blog/machine-embroidery-for-clothes/`);
    const html = await response.text();
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();

    assert.equal(response.status, 200);
    assert.match(html, /Machine Embroidery for Clothes: The Ultimate Guide \| 2026 \| HOODYBOODY Blog/);
    assert.match(html, /<time datetime="2026-05-22">May 22, 2026<\/time>/);
    assert.match(html, /Updated May 22, 2026/);
    assert.match(html, /blog-rich-html/);
    assert.match(html, /Table of Contents/);
    assert.match(html, /What Is Machine Embroidery for Clothes/);
    assert.match(html, /Best Fabrics for Machine Embroidery/);
    assert.match(html, /Choosing the Right Stabilizer/);
    assert.match(html, /Thread Types & Colors/);
    assert.match(html, /Common Mistakes & How to Avoid Them/);
    assert.match(html, /Frequently Asked Questions/);
    assert.doesNotMatch(html, /Ready to Start Embroidering/);
    assert.doesNotMatch(html, /Shop Embroidery Supplies/);
    assert.match(html, /Cotton \(denim, twill\)/);
    assert.match(html, /Polyester \(40wt\)/);
    assert.match(html, /Fabric puckering/);
    assert.equal((html.match(/<table>/g) || []).length, 3);
    assert.equal((html.match(/class="card"/g) || []).length, 11);
    assert.equal((html.match(/class="card-icon"/g) || []).length, 0);
    assert.match(html, /blog-post-nav-card previous" href="\/blog\/best-stabilizers-for-embroidery-on-knit-fabric\//);
    assert.match(html, /blog-post-nav-card next" href="\/blog\/fashion-is-our-passion\//);
    assert.match(css, /blog-rich-html \.card-grid/);
    assert.match(css, /blog-rich-html \.table-wrap/);
    assert.match(css, /blog-rich-html \.step-num/);
    assert.match(css, /padding: 28px 30px/);
  } finally {
    server.close();
  }
});

test("third stabilizer guide renders with SEO date, imported layout, and no icons", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const latestResponse = await fetch(`${baseUrl}/blog/`);
    const latestHtml = await latestResponse.text();
    const response = await fetch(`${baseUrl}/blog/best-stabilizers-for-embroidery-on-knit-fabric/`);
    const html = await response.text();
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();

    assert.equal(latestResponse.status, 200);
    assert.match(latestHtml, /Best Stabilizers for Embroidery on Knit Fabric \| Complete Guide 2026 \| HOODYBOODY Blog/);
    assert.equal(response.status, 200);
    assert.match(html, /Best Stabilizers for Embroidery on Knit Fabric \| Complete Guide 2026 \| HOODYBOODY Blog/);
    assert.match(html, /<time datetime="2026-05-25">May 25, 2026<\/time>/);
    assert.match(html, /"datePublished":"2026-05-25"/);
    assert.match(html, /"dateModified":"2026-05-25T00:00:00.000Z"/);
    assert.match(html, /Materials Guide · 2026/);
    assert.match(html, /Updated May 25, 2026/);
    assert.match(html, /Why Knit Fabric Needs Special Stabilization/);
    assert.match(html, /The 3 Stabilizer Types Explained/);
    assert.match(html, /Best Stabilizer Brands for Knit Fabric/);
    assert.match(html, /Fabric-to-Stabilizer Chart/);
    assert.match(html, /How to Apply Stabilizer on Knit Fabric/);
    assert.match(html, /Frequently Asked Questions/);
    assert.equal((html.match(/class="stabilizer-card"/g) || []).length, 3);
    assert.equal((html.match(/class="brand-card"/g) || []).length, 5);
    assert.equal((html.match(/<table>/g) || []).length, 1);
    assert.doesNotMatch(html, /class="card-icon"/);
    assert.doesNotMatch(html, /class="stars"/);
    assert.doesNotMatch(html, /📋|✂|🧻|💧|💡|★|⭐|⚠/u);
    assert.match(html, /blog-post-nav-card previous is-disabled/);
    assert.match(html, /blog-post-nav-card next" href="\/blog\/machine-embroidery-for-clothes\//);
    assert.match(css, /blog-rich-html \.stabilizer-grid/);
    assert.match(css, /blog-rich-html \.brand-card/);
  } finally {
    server.close();
  }
});

test("owner can moderate blog comments while blog editing stays disabled", async () => {
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
    assert.match(adminHtml, /Moderate blog comments/);
    assert.match(adminHtml, /Comment moderation/);
    assert.match(adminHtml, /admin-blog\.js/);
    assert.doesNotMatch(adminHtml, /Create blog post/);
    assert.doesNotMatch(adminHtml, /adminBlogList/);

    const adminScriptResponse = await fetch(`${baseUrl}/admin-blog.js`);
    const adminScript = await adminScriptResponse.text();
    const cssResponse = await fetch(`${baseUrl}/styles.css`);
    const css = await cssResponse.text();
    assert.match(adminScript, /api\/admin\/blog\/comments/);
    assert.match(adminScript, /data-comment-status/);
    assert.match(adminScript, /data-send-comment-reply/);
    assert.doesNotMatch(adminScript, /api\/admin\/blog\/posts/);
    assert.doesNotMatch(adminScript, /data-blog-builder/);
    assert.doesNotMatch(adminScript, /data-add-blog-block/);
    assert.doesNotMatch(adminScript, /data-copy-blog-block/);
    assert.match(css, /admin-blog-comments-list/);

    const disabledPostsResponse = await fetch(`${baseUrl}/api/admin/blog/posts`, {
      headers: { Cookie: cookie }
    });
    const disabledPostsJson = await disabledPostsResponse.json();
    assert.equal(disabledPostsResponse.status, 410);
    assert.match(disabledPostsJson.message, /Blog editing is disabled/);

    const disabledPhotoResponse = await fetch(`${baseUrl}/api/admin/blog/posts/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({})
    });
    const disabledPhotoJson = await disabledPhotoResponse.json();
    assert.equal(disabledPhotoResponse.status, 410);
    assert.match(disabledPhotoJson.message, /Blog editing is disabled/);

    const defaultPost = {
      id: "fashion-is-our-passion",
      slug: "fashion-is-our-passion"
    };

    const commentResponse = await fetch(`${baseUrl}/api/blog/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postSlug: defaultPost.slug,
        name: "Comment Tester",
        email: "comment-tester@example.com",
        website: "https://example.com",
        comment: "This pending comment should wait for approval."
      })
    });
    const commentJson = await commentResponse.json();
    assert.equal(commentResponse.status, 201);
    assert.equal(commentJson.comment.status, "pending");

    const hiddenPending = await fetch(`${baseUrl}/blog/${defaultPost.slug}/`);
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
        postId: defaultPost.id,
        commentId: commentJson.comment.id,
        status: "published"
      })
    });
    assert.equal(approveResponse.status, 200);

    const replyResponse = await fetch(`${baseUrl}/api/admin/blog/comments/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        postId: defaultPost.id,
        commentId: commentJson.comment.id,
        text: "Published owner reply from moderation."
      })
    });
    assert.equal(replyResponse.status, 201);

    const publicApproved = await fetch(`${baseUrl}/blog/${defaultPost.slug}/`);
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

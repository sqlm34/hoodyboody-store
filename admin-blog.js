const DEFAULT_BLOG_IMAGE = "/assets/embroidered-collection.png";
const BLOG_STATUS_OPTIONS = ["draft", "published"];
const BLOG_BLOCK_TYPES = [
  ["paragraph", "Paragraph"],
  ["heading2", "Heading"],
  ["heading3", "Subheading"],
  ["image", "Single photo"],
  ["imagePair", "Two photos"],
  ["divider", "Divider"],
  ["html", "HTML section"]
];
const BLOG_BLOCK_STYLES = [
  ["default", "Default"],
  ["large", "Large text"],
  ["quote", "Quote"],
  ["accent", "Accent panel"],
  ["wide", "Wide image"],
  ["inset", "Inset image"]
];
const maxUploadSourceBytes = 12 * 1024 * 1024;
const maxImageEdge = 1800;

const adminBlogLocked = document.querySelector("#adminBlogLocked");
const adminBlogLockedText = document.querySelector("#adminBlogLockedText");
const adminBlogDashboard = document.querySelector("#adminBlogDashboard");
const adminBlogList = document.querySelector("#adminBlogList");
const adminBlogNote = document.querySelector("#adminBlogNote");
const adminBlogCommentsPanel = document.querySelector("#adminBlogCommentsPanel");
const adminBlogCommentsList = document.querySelector("#adminBlogCommentsList");
const adminBlogCommentsNote = document.querySelector("#adminBlogCommentsNote");
const reloadBlogPosts = document.querySelector("#reloadBlogPosts");
const createBlogPost = document.querySelector("#createBlogPost");
const reloadBlogComments = document.querySelector("#reloadBlogComments");

let blogPosts = [];
let blogComments = [];
let selectedPostId = "";
let editorMode = "grid";
let statusTimer = 0;
let commentsStatusTimer = 0;
let draggedBlogBlock = null;
let pointerDragList = null;
let pointerDragForm = null;

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
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });

function csv(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function setBlogStatus(message, isError = false, options = {}) {
  clearTimeout(statusTimer);
  adminBlogNote.textContent = message;
  adminBlogNote.classList.toggle("error", isError);
  adminBlogNote.classList.toggle("success", Boolean(message) && !isError);

  if (message && !options.persist) {
    statusTimer = setTimeout(() => {
      adminBlogNote.textContent = "";
      adminBlogNote.classList.remove("error", "success");
    }, 2800);
  }
}

function setBlogCommentsStatus(message, isError = false, options = {}) {
  clearTimeout(commentsStatusTimer);
  adminBlogCommentsNote.textContent = message;
  adminBlogCommentsNote.classList.toggle("error", isError);
  adminBlogCommentsNote.classList.toggle("success", Boolean(message) && !isError);

  if (message && !options.persist) {
    commentsStatusTimer = setTimeout(() => {
      adminBlogCommentsNote.textContent = "";
      adminBlogCommentsNote.classList.remove("error", "success");
    }, 2800);
  }
}

function showLocked(message) {
  adminBlogDashboard.hidden = true;
  adminBlogCommentsPanel.hidden = true;
  adminBlogLocked.hidden = false;
  adminBlogLockedText.textContent = message;
}

function showDashboard() {
  adminBlogLocked.hidden = true;
  adminBlogDashboard.hidden = false;
  adminBlogCommentsPanel.hidden = false;
}

function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "new-blog-post";
}

function getBlankPost() {
  return {
    id: "",
    slug: "",
    title: "New blog post",
    excerpt: "Short blog excerpt for previews and search snippets.",
    category: "Embroidery Journal",
    author: "HOODYBOODY Studio",
    date: new Date().toISOString().slice(0, 10),
    status: "draft",
    tags: ["Embroidery"],
    body: "Write the opening paragraph here.\n\n## Section heading\n\nAdd the next block of blog text here.",
    gallery: [{ image: DEFAULT_BLOG_IMAGE, alt: "HOODYBOODY embroidered clothing", focus: "50% 50%" }],
    blocks: getDefaultBlogBlocks()
  };
}

function getPostPhotos(post) {
  const gallery = Array.isArray(post.gallery) ? post.gallery : [];
  const photos = gallery
    .filter((item) => item?.image)
    .map((item, index) => ({
      image: item.image,
      alt: item.alt || `Blog photo ${index + 1}`,
      focus: item.focus || "50% 50%",
      canDelete: String(item.image).startsWith("/api/blog-images/")
    }));

  return photos.length
    ? photos
    : [{ image: DEFAULT_BLOG_IMAGE, alt: "HOODYBOODY embroidered clothing", focus: "50% 50%", canDelete: false }];
}

function getCoverPhoto(post) {
  return getPostPhotos(post)[0] || { image: DEFAULT_BLOG_IMAGE, focus: "50% 50%" };
}

function normalizeBuilderType(value) {
  return BLOG_BLOCK_TYPES.some(([type]) => type === value) ? value : "paragraph";
}

function normalizeBuilderStyle(value) {
  return BLOG_BLOCK_STYLES.some(([style]) => style === value) ? value : "default";
}

function normalizeBuilderImage(value = {}, fallback = {}) {
  const source = typeof value === "string" ? { image: value } : value || {};
  const image = String(source.image || source.url || fallback.image || DEFAULT_BLOG_IMAGE).trim();
  return {
    image,
    alt: String(source.alt || fallback.alt || "HOODYBOODY embroidered clothing").trim(),
    focus: String(source.focus || fallback.focus || "50% 50%").trim()
  };
}

function htmlToBuilderText(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDefaultBlogBlocks(post = {}) {
  const photos = getPostPhotos(post);
  const first = photos[0] || { image: DEFAULT_BLOG_IMAGE, alt: "HOODYBOODY embroidered clothing", focus: "50% 50%" };
  const second = photos[1] || first;

  return [
    { type: "paragraph", style: "default", text: "Write the opening paragraph here." },
    { type: "paragraph", style: "default", text: "Add the second paragraph with context, story, and value for the reader." },
    { type: "heading2", style: "default", text: "Section Heading" },
    { type: "paragraph", style: "default", text: "Add the next block of blog text here." },
    { type: "imagePair", style: "default", images: [first, second] },
    { type: "paragraph", style: "default", text: "Continue the article with another detailed paragraph." },
    { type: "heading3", style: "default", text: "Process Of Making Fashion Items" },
    { type: "paragraph", style: "default", text: "Close this section with a final paragraph." }
  ];
}

function bodyToBuilderBlocks(body, post = {}) {
  const rawBlocks = String(body || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const blocks = [];
  let insertPhotoPair = false;
  let photoPairInserted = false;
  let paragraphCount = 0;
  const hasHeading2 = rawBlocks.some((block) => block.startsWith("## "));
  const insertBuilderPhotoPair = () => {
    const photos = getPostPhotos(post);
    blocks.push({ type: "imagePair", style: "default", images: [photos[1] || photos[0], photos[2] || photos[0]] });
    photoPairInserted = true;
  };

  rawBlocks.forEach((block) => {
    if (block.startsWith("### ")) {
      blocks.push({ type: "heading3", style: "default", text: block.slice(4).trim() });
      return;
    }

    if (block.startsWith("## ")) {
      blocks.push({ type: "heading2", style: "default", text: block.slice(3).trim() });
      insertPhotoPair = true;
      return;
    }

    blocks.push({ type: "paragraph", style: "default", text: block });
    paragraphCount += 1;

    if (insertPhotoPair && !photoPairInserted) {
      insertBuilderPhotoPair();
      insertPhotoPair = false;
      return;
    }

    if (!hasHeading2 && paragraphCount === 2 && !photoPairInserted) insertBuilderPhotoPair();
  });

  return blocks.length ? blocks : getDefaultBlogBlocks(post);
}

function ensureBuilderImagePair(blocks = [], post = {}) {
  if (!Array.isArray(blocks) || blocks.some((block) => block.type === "imagePair")) return blocks;

  const photos = getPostPhotos(post);
  const imagePair = { type: "imagePair", style: "default", images: [photos[1] || photos[0], photos[2] || photos[0]] };
  const nextBlocks = [...blocks];
  const headingIndex = nextBlocks.findIndex((block) => block.type === "heading2");
  const paragraphAfterHeadingIndex =
    headingIndex === -1 ? -1 : nextBlocks.findIndex((block, index) => index > headingIndex && block.type === "paragraph");
  const paragraphIndexes = nextBlocks.reduce((indexes, block, index) => {
    if (block.type === "paragraph") indexes.push(index);
    return indexes;
  }, []);
  const insertAfterIndex = paragraphAfterHeadingIndex !== -1 ? paragraphAfterHeadingIndex : paragraphIndexes[1] ?? paragraphIndexes[0] ?? -1;

  if (insertAfterIndex === -1) return blocks;

  nextBlocks.splice(insertAfterIndex + 1, 0, imagePair);
  return nextBlocks;
}

function getPostBlocks(post) {
  if (Array.isArray(post.blocks) && post.blocks.length) {
    const normalizedBlocks = post.blocks.map((block) => {
      const type = normalizeBuilderType(block?.type);
      const style = normalizeBuilderStyle(block?.style);

      if (type === "image") {
        return { type, style, image: normalizeBuilderImage(block?.image || block, getCoverPhoto(post)) };
      }

      if (type === "html") {
        return { type, style, html: String(block?.html || block?.body || block?.content || "").trim() };
      }

      if (type === "imagePair") {
        const photos = getPostPhotos(post);
        const images = Array.isArray(block?.images) ? block.images : [];
        return {
          type,
          style,
          images: [
            normalizeBuilderImage(images[0], photos[1] || photos[0]),
            normalizeBuilderImage(images[1], photos[2] || photos[0])
          ]
        };
      }

      return {
        type,
        style,
        text: String(block?.text || block?.body || block?.content || "").trim()
      };
    });

    return ensureBuilderImagePair(normalizedBlocks, post);
  }

  return bodyToBuilderBlocks(post.body, post);
}

function builderBlocksToBody(blocks = []) {
  return blocks
    .map((block) => {
      if (block.type === "heading2") return `## ${block.text || ""}`.trim();
      if (block.type === "heading3") return `### ${block.text || ""}`.trim();
      if (block.type === "paragraph") return String(block.text || "").trim();
      if (block.type === "html") return htmlToBuilderText(block.html);
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function renderBuilderOptions(options, activeValue) {
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === activeValue ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function renderBuilderPhotoSelect(slot, photos, currentImage) {
  return `
    <select data-block-photo-select data-block-image-slot="${slot}">
      <option value="">Choose uploaded photo</option>
      ${photos
        .map(
          (photo, index) => `
            <option
              value="${escapeHtml(photo.image)}"
              data-alt="${escapeHtml(photo.alt)}"
              data-focus="${escapeHtml(photo.focus)}"
              ${photo.image === currentImage ? "selected" : ""}
            >${escapeHtml(index === 0 ? "Cover photo" : photo.alt)}</option>`
        )
        .join("")}
    </select>`;
}

function renderBuilderImageFields(block, post) {
  const photos = getPostPhotos(post);
  const isSavedPost = Boolean(post?.id);
  const images =
    block.type === "imagePair"
      ? [
          normalizeBuilderImage(block.images?.[0], photos[1] || photos[0]),
          normalizeBuilderImage(block.images?.[1], photos[2] || photos[0])
        ]
      : [normalizeBuilderImage(block.image || block.images?.[0], photos[0])];

  return `
    <div class="admin-builder-images">
      ${[0, 1]
        .map((slot) => {
          const image = images[slot] || normalizeBuilderImage({}, photos[slot] || photos[0]);
          return `
            <div class="admin-builder-image-field admin-builder-image-slot-${slot}">
              <span
                class="admin-builder-image-preview"
                style="--product-image: url('${escapeHtml(image.image)}'); --focus: ${escapeHtml(image.focus)}"
                aria-label="${escapeHtml(image.alt)}"
              ></span>
              <label>
                Photo ${slot + 1}
                ${renderBuilderPhotoSelect(slot, photos, image.image)}
              </label>
              <input type="hidden" data-block-image-url="${slot}" value="${escapeHtml(image.image)}" />
              <button class="button ghost dark admin-builder-upload" type="button" data-upload-block-photo data-block-image-slot="${slot}" ${isSavedPost ? "" : "disabled"}>Upload</button>
              <label>
                Alt text
                <input data-block-image-alt="${slot}" value="${escapeHtml(image.alt)}" />
              </label>
              <label>
                Focus
                <input data-block-image-focus="${slot}" value="${escapeHtml(image.focus)}" placeholder="50% 50%" />
              </label>
            </div>`;
        })
        .join("")}
    </div>`;
}

function renderEditorGallery(post) {
  const photos = getPostPhotos(post);
  const cover = photos[0];

  return `
    <section class="blog-gallery qodef-e-media admin-editor-gallery" data-editor-gallery aria-label="Editorial image">
      <div class="blog-gallery-track">
        <figure class="blog-gallery-slide is-active" aria-hidden="false">
          <img src="${escapeHtml(cover.image)}" alt="${escapeHtml(cover.alt)}" style="object-position: ${escapeHtml(cover.focus)}" />
        </figure>
      </div>
      <span class="admin-editor-gallery-note">Cover photo</span>
    </section>`;
}

function createEditorBlock(type, post = {}, seed = {}) {
  const normalizedType = normalizeBuilderType(type);
  const photos = getPostPhotos(post);
  const style = normalizeBuilderStyle(seed.style);
  const text = String(seed.text || "").trim();

  if (normalizedType === "image") {
    return {
      type: normalizedType,
      style,
      image: normalizeBuilderImage(seed.image || seed.images?.[0], photos[0])
    };
  }

  if (normalizedType === "imagePair") {
    return {
      type: normalizedType,
      style,
      images: [
        normalizeBuilderImage(seed.images?.[0] || seed.image, photos[1] || photos[0]),
        normalizeBuilderImage(seed.images?.[1], photos[2] || photos[0])
      ]
    };
  }

  if (normalizedType === "divider") {
    return { type: normalizedType, style };
  }

  if (normalizedType === "html") {
    return {
      type: normalizedType,
      style,
      html: String(seed.html || "<p>Paste imported article HTML here.</p>").trim()
    };
  }

  return {
    type: normalizedType,
    style,
    text: text || (normalizedType === "paragraph" ? "New paragraph text." : normalizedType === "heading3" ? "New subheading" : "New heading")
  };
}

function renderEditorImageBlock(block, post) {
  const image = normalizeBuilderImage(block.image, getCoverPhoto(post));

  return `
    <figure class="blog-image-single blog-builder-block blog-block-style-${escapeHtml(normalizeBuilderStyle(block.style))}">
      <img src="${escapeHtml(image.image)}" alt="${escapeHtml(image.alt)}" style="object-position: ${escapeHtml(image.focus)}" />
    </figure>
    ${renderBuilderImageFields({ ...block, type: "image" }, post)}`;
}

function renderEditorImagePairBlock(block, post) {
  const photos = getPostPhotos(post);
  const images = [
    normalizeBuilderImage(block.images?.[0], photos[1] || photos[0]),
    normalizeBuilderImage(block.images?.[1], photos[2] || photos[0])
  ];

  return `
    <div class="blog-image-pair blog-builder-block blog-block-style-${escapeHtml(normalizeBuilderStyle(block.style))}">
      ${images
        .map(
          (image) => `
        <figure>
          <img src="${escapeHtml(image.image)}" alt="${escapeHtml(image.alt)}" style="object-position: ${escapeHtml(image.focus)}" />
        </figure>`
        )
        .join("")}
    </div>
    ${renderBuilderImageFields({ ...block, type: "imagePair" }, post)}`;
}

function renderEditorBlock(block, index, post) {
  const type = normalizeBuilderType(block?.type);
  const style = normalizeBuilderStyle(block?.style);
  const text = String(block?.text || "").trim();
  let content = "";

  if (type === "heading2") {
    content = `<h2 class="blog-builder-block blog-block-style-${escapeHtml(style)}" contenteditable="true" data-block-text>${escapeHtml(text || "New heading")}</h2>`;
  } else if (type === "heading3") {
    content = `<h3 class="blog-builder-block blog-block-style-${escapeHtml(style)}" contenteditable="true" data-block-text>${escapeHtml(text || "New subheading")}</h3>`;
  } else if (type === "image") {
    content = renderEditorImageBlock(block, post);
  } else if (type === "imagePair") {
    content = renderEditorImagePairBlock(block, post);
  } else if (type === "divider") {
    content = `<div class="blog-divider blog-builder-block blog-block-style-${escapeHtml(style)}" aria-hidden="true"></div>`;
  } else if (type === "html") {
    content = `
      <div class="blog-rich-html blog-builder-block blog-block-style-${escapeHtml(style)}">${block?.html || ""}</div>
      <label class="admin-html-source">
        Imported HTML
        <textarea data-block-html rows="8">${escapeHtml(block?.html || "")}</textarea>
      </label>`;
  } else {
    content = `<p class="blog-builder-block blog-block-style-${escapeHtml(style)}" contenteditable="true" data-block-text>${escapeHtml(text || "New paragraph text.")}</p>`;
  }

  return `
    <article class="admin-page-block" data-blog-block data-block-type="${escapeHtml(type)}" draggable="true">
      <div class="admin-page-block-toolbar">
        <button class="admin-drag-handle" type="button" aria-label="Drag block" title="Drag block"><i class="fa-solid fa-grip-lines"></i></button>
        <span class="admin-builder-order" data-block-order>${index + 1}</span>
        <label>
          <span>Block</span>
          <select data-block-type-select>
            ${renderBuilderOptions(BLOG_BLOCK_TYPES, type)}
          </select>
        </label>
        <label>
          <span>Design</span>
          <select data-block-style-select>
            ${renderBuilderOptions(BLOG_BLOCK_STYLES, style)}
          </select>
        </label>
        <button class="icon-button" type="button" data-move-blog-block="up" aria-label="Move block up"><i class="fa-solid fa-arrow-up"></i></button>
        <button class="icon-button" type="button" data-move-blog-block="down" aria-label="Move block down"><i class="fa-solid fa-arrow-down"></i></button>
        <button class="icon-button" type="button" data-copy-blog-block aria-label="Copy block"><i class="fa-regular fa-copy"></i></button>
        <button class="icon-button danger-button" type="button" data-delete-blog-block aria-label="Delete block"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="admin-page-block-content">${content}</div>
    </article>`;
}

function renderBlogBuilder(post) {
  const blocks = getPostBlocks(post);
  const photos = getPostPhotos(post);

  return `
    <div class="admin-blog-builder admin-blog-page-builder" data-blog-builder>
      <input type="hidden" name="blocks" data-blog-blocks-field value="${escapeHtml(JSON.stringify(blocks))}" />
      <textarea name="body" data-blog-body-fallback hidden>${escapeHtml(builderBlocksToBody(blocks))}</textarea>
      <div class="admin-blog-builder-head">
        <div>
          <strong>Live blog page editor</strong>
          <small>Edit the article as it appears to visitors. Drag blocks to reorder them.</small>
        </div>
        <div class="admin-builder-adds" aria-label="Add blog block">
          <button class="button ghost dark" type="button" data-add-blog-block="paragraph">Paragraph</button>
          <button class="button ghost dark" type="button" data-add-blog-block="heading2">Heading</button>
          <button class="button ghost dark" type="button" data-add-blog-block="heading3">Subheading</button>
          <button class="button ghost dark" type="button" data-add-blog-block="image">Photo</button>
          <button class="button ghost dark" type="button" data-add-blog-block="imagePair">Two photos</button>
          <button class="button ghost dark" type="button" data-add-blog-block="divider">Divider</button>
        </div>
      </div>

      <div class="admin-blog-live-page blog-page-body">
        <div class="blog-single-page qodef-grid qodef-layout--template qodef-gutter--extra">
          <div class="blog-layout qodef-grid-inner clear">
            <div class="blog-content-section qodef-grid-item qodef-page-content-section qodef-col--8 qodef-col-push--4">
              <div class="blog-single qodef-blog qodef-m qodef--single">
                <article class="blog-article qodef-blog-item qodef-e" aria-labelledby="admin-blog-page-title">
                  <div class="qodef-e-inner">
                    ${renderEditorGallery(post)}
                    <div class="blog-article-content qodef-e-content">
                      <div class="blog-post-meta qodef-e-info admin-page-meta">
                        <input name="date" type="date" value="${escapeHtml(post.date || new Date().toISOString().slice(0, 10))}" required />
                        <span>/</span>
                        <input name="category" value="${escapeHtml(post.category || "Embroidery Journal")}" required />
                      </div>
                      <textarea class="blog-title admin-page-title-input" id="admin-blog-page-title" name="title" rows="2" required>${escapeHtml(post.title)}</textarea>
                      <div class="blog-content qodef-e-text admin-builder-list" data-blog-builder-list>
                        ${blocks.map((block, index) => renderEditorBlock(block, index, post)).join("")}
                      </div>
                      <footer class="blog-post-footer qodef-e-bottom-holder" aria-label="Post tags and share links">
                        <div class="blog-tags qodef-e-left qodef-e-info">
                          ${(post.tags || []).map((tag) => `<a href="/blog/" tabindex="-1">${escapeHtml(tag)}</a>`).join("")}
                        </div>
                        <ul class="blog-share qodef-e-right qodef-e-info" aria-label="Share">
                          <li><span>fb</span></li>
                          <li><span>tw</span></li>
                          <li><span>pin</span></li>
                        </ul>
                      </footer>
                    </div>
                  </div>
                </article>
                <section class="blog-author" aria-labelledby="admin-blog-author-title">
                  <span class="blog-author-photo" aria-label="${escapeHtml(post.author || "HOODYBOODY Studio")}"></span>
                  <div>
                    <h4 id="admin-blog-author-title"><span>${escapeHtml(post.author || "HOODYBOODY Studio")}</span></h4>
                    <p>Embroidery notes, product decisions, and quiet wardrobe ideas from the HOODYBOODY worktable.</p>
                    <div class="blog-author-links">
                      <span>Custom</span>
                      <span>Catalog</span>
                      <span>Journal</span>
                    </div>
                  </div>
                </section>
                <nav class="blog-post-nav" aria-label="Post navigation">
                  <span class="blog-post-nav-card previous is-disabled" aria-disabled="true"><span class="blog-post-nav-thumb"></span><span>Previous</span></span>
                  <span class="blog-post-nav-card next is-disabled" aria-disabled="true"><span>Next</span><span class="blog-post-nav-thumb"></span></span>
                </nav>
              </div>
            </div>
            <div class="blog-sidebar-section qodef-grid-item qodef-page-sidebar-section qodef-col--4 qodef-col-pull--8">
              <aside id="qodef-page-sidebar" class="blog-sidebar" role="complementary" aria-label="Blog sidebar preview">
                <div class="blog-sidebar-widget blog-sidebar-hero">
                  <img src="${escapeHtml(photos[0].image)}" alt="${escapeHtml(photos[0].alt)}" style="object-position: ${escapeHtml(photos[0].focus)}" />
                </div>
                <nav class="blog-sidebar-widget blog-sidebar-nav" aria-label="Blog categories">
                  <h5>Categories</h5>
                  <ul>
                    <li><span>Fashion</span></li>
                    <li><span>Inspiring Outfit</span></li>
                    <li><span>Lifestyle</span></li>
                    <li><span>Outdoors</span></li>
                    <li><span>Street-Style</span></li>
                  </ul>
                </nav>
                <div class="blog-sidebar-widget blog-sidebar-tags">
                  <h5>Tags</h5>
                  <div class="tagcloud">
                    <span class="tag-small">Beauty</span>
                    <span class="tag-small">Design</span>
                    <span class="tag-large">Outfit</span>
                    <span class="tag-medium">Stylish</span>
                  </div>
                </div>
                <div class="blog-sidebar-widget blog-sidebar-gallery">
                  <h5>Gallery</h5>
                  <div class="blog-sidebar-gallery-grid">
                    ${Array.from({ length: 6 }, (_, index) => photos[index % photos.length])
                      .map((photo) => `<span><img src="${escapeHtml(photo.image)}" alt="${escapeHtml(photo.alt)}" style="object-position: ${escapeHtml(photo.focus)}" /></span>`)
                      .join("")}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function collectBlogBlocks(form) {
  const readValue = (field) => String(field?.value ?? field?.textContent ?? "").trim();

  return Array.from(form.querySelectorAll("[data-blog-block]"))
    .map((card) => {
      const type = normalizeBuilderType(card.dataset.blockType);
      const style = normalizeBuilderStyle(card.querySelector("[data-block-style-select]")?.value);

      if (type === "divider") {
        return { type, style };
      }

      if (type === "html") {
        return {
          type,
          style,
          html: readValue(card.querySelector("[data-block-html]")) || card.querySelector(".blog-rich-html")?.innerHTML.trim() || ""
        };
      }

      if (type === "image") {
        return {
          type,
          style,
          image: {
            image: readValue(card.querySelector('[data-block-image-url="0"]')) || DEFAULT_BLOG_IMAGE,
            alt: readValue(card.querySelector('[data-block-image-alt="0"]')) || "HOODYBOODY blog image",
            focus: readValue(card.querySelector('[data-block-image-focus="0"]')) || "50% 50%"
          }
        };
      }

      if (type === "imagePair") {
        return {
          type,
          style,
          images: [0, 1].map((slot) => ({
            image: readValue(card.querySelector(`[data-block-image-url="${slot}"]`)) || DEFAULT_BLOG_IMAGE,
            alt: readValue(card.querySelector(`[data-block-image-alt="${slot}"]`)) || "HOODYBOODY blog image",
            focus: readValue(card.querySelector(`[data-block-image-focus="${slot}"]`)) || "50% 50%"
          }))
        };
      }

      return {
        type,
        style,
        text: readValue(card.querySelector("[data-block-text]"))
      };
    })
    .filter((block) => block.type === "divider" || block.type === "html" || block.type === "image" || block.type === "imagePair" || block.text);
}

function syncBlogBuilderFields(form) {
  const blocks = collectBlogBlocks(form);
  const body = builderBlocksToBody(blocks);
  const blocksField = form.querySelector("[data-blog-blocks-field]");
  const bodyField = form.querySelector("[data-blog-body-fallback]");
  if (blocksField) blocksField.value = JSON.stringify(blocks);
  if (bodyField) bodyField.value = body;
  return { blocks, body };
}

function updateBuilderOrder(form) {
  form.querySelectorAll("[data-block-order]").forEach((item, index) => {
    item.textContent = String(index + 1);
  });
}

function getEditorBlockIndex(card) {
  return Math.max(0, Array.from(card.parentElement?.children || []).indexOf(card));
}

function replaceEditorBlock(card, block, form) {
  const post = getSelectedPost() || getBlankPost();
  const index = getEditorBlockIndex(card);
  card.insertAdjacentHTML("afterend", renderEditorBlock(block, index, post));
  card.remove();
  updateBuilderOrder(form);
  syncBlogBuilderFields(form);
}

function getBlockFromCard(card, nextType = card?.dataset.blockType) {
  const type = normalizeBuilderType(nextType);
  const style = normalizeBuilderStyle(card?.querySelector("[data-block-style-select]")?.value);
  const text = String(card?.querySelector("[data-block-text]")?.value ?? card?.querySelector("[data-block-text]")?.textContent ?? "").trim();
  const images = [0, 1].map((slot) => ({
    image: String(card?.querySelector(`[data-block-image-url="${slot}"]`)?.value || "").trim(),
    alt: String(card?.querySelector(`[data-block-image-alt="${slot}"]`)?.value || "").trim(),
    focus: String(card?.querySelector(`[data-block-image-focus="${slot}"]`)?.value || "").trim()
  }));

  if (type === "image") return { type, style, image: images[0], text };
  if (type === "imagePair") return { type, style, images, text };
  if (type === "divider") return { type, style };
  if (type === "html") return { type, style, html: String(card?.querySelector("[data-block-html]")?.value || card?.querySelector(".blog-rich-html")?.innerHTML || "").trim() };
  return { type, style, text };
}

function cloneBlogBlock(block) {
  return JSON.parse(JSON.stringify(block || {}));
}

function tagsFromInput(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getEditorPostSnapshot(form, patch = {}) {
  const currentPost = getSelectedPost() || getBlankPost();
  const data = Object.fromEntries(new FormData(form));
  const builderData = syncBlogBuilderFields(form);

  return {
    ...currentPost,
    ...patch,
    id: form.dataset.postId || currentPost.id,
    slug: String(data.slug || currentPost.slug || slugify(data.title || currentPost.title)).trim(),
    title: String(data.title || currentPost.title || "New blog post").trim(),
    excerpt: String(data.excerpt || currentPost.excerpt || "").trim(),
    category: String(data.category || currentPost.category || "Embroidery Journal").trim(),
    author: String(data.author || currentPost.author || "HOODYBOODY Studio").trim(),
    date: String(data.date || currentPost.date || new Date().toISOString().slice(0, 10)).trim(),
    status: String(data.status || currentPost.status || "draft").trim(),
    tags: tagsFromInput(data.tags).length ? tagsFromInput(data.tags) : currentPost.tags || ["Embroidery"],
    blocks: builderData.blocks.map(cloneBlogBlock),
    body: builderData.body
  };
}

function replacePostInState(post) {
  if (!post?.id) return;
  const postIndex = blogPosts.findIndex((item) => item.id === post.id);
  if (postIndex === -1) {
    blogPosts = [post, ...blogPosts];
    return;
  }

  blogPosts = blogPosts.map((item, index) => (index === postIndex ? post : item));
}

function setBlockImageAt(blocks, blockIndex, slot, image) {
  const nextBlocks = blocks.map(cloneBlogBlock);
  const target = nextBlocks[blockIndex];
  if (!target || !image) return nextBlocks;
  const normalizedImage = normalizeBuilderImage(image, image);

  if (target.type === "imagePair") {
    target.images = Array.isArray(target.images) ? target.images : [];
    target.images[slot] = normalizedImage;
    if (!target.images[slot === 0 ? 1 : 0]) target.images[slot === 0 ? 1 : 0] = normalizedImage;
    return nextBlocks;
  }

  target.type = "image";
  target.image = normalizedImage;
  return nextBlocks;
}

function replaceImageReferences(blocks, oldImage, nextImage) {
  if (!oldImage || !nextImage) return blocks.map(cloneBlogBlock);
  return blocks.map((block) => {
    const nextBlock = cloneBlogBlock(block);
    if (nextBlock.type === "image" && nextBlock.image?.image === oldImage) {
      nextBlock.image = normalizeBuilderImage(nextImage, nextBlock.image);
    }

    if (nextBlock.type === "imagePair" && Array.isArray(nextBlock.images)) {
      nextBlock.images = nextBlock.images.map((image) => (image?.image === oldImage ? normalizeBuilderImage(nextImage, image) : image));
    }

    return nextBlock;
  });
}

function getUploadButtonForMode(form, options = {}) {
  if (options.mode === "block") {
    return form
      .querySelectorAll("[data-blog-block]")
      [options.blockIndex]?.querySelector(`[data-upload-block-photo][data-block-image-slot="${options.slot}"]`);
  }

  if (options.mode === "replace-photo") {
    return form.querySelector(`[data-replace-photo-index="${options.photoIndex}"]`);
  }

  return form.querySelector("[data-upload-photo]");
}

function getDragAfterBlock(container, y) {
  return Array.from(container.querySelectorAll("[data-blog-block]:not(.is-dragging)")).reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function moveDraggedBlogBlock(y) {
  if (!pointerDragList || !draggedBlogBlock) return;
  const nextBlock = getDragAfterBlock(pointerDragList, y);
  if (nextBlock) {
    pointerDragList.insertBefore(draggedBlogBlock, nextBlock);
  } else {
    pointerDragList.appendChild(draggedBlogBlock);
  }
}

function finishPointerBlogDrag() {
  if (!draggedBlogBlock || !pointerDragForm) return;
  draggedBlogBlock.classList.remove("is-dragging");
  updateBuilderOrder(pointerDragForm);
  syncBlogBuilderFields(pointerDragForm);
  draggedBlogBlock = null;
  pointerDragList = null;
  pointerDragForm = null;
}

function renderStatusSelect(post) {
  return `
    <select name="status">
      ${BLOG_STATUS_OPTIONS.map((status) => `<option value="${status}" ${post.status === status ? "selected" : ""}>${status}</option>`).join("")}
    </select>
  `;
}

function renderPhotoTiles(post, isCreate = false) {
  const photos = getPostPhotos(post);
  const canEditPhotos = !isCreate && Boolean(post.id);

  return `
    <div class="admin-photo-grid">
      ${photos
        .map(
          (photo, index) => `
            <div class="admin-photo-tile ${index === 0 ? "active" : ""}">
              <span
                class="admin-photo-thumb"
                style="--product-image: url('${escapeHtml(photo.image)}'); --focus: ${escapeHtml(photo.focus)}"
                aria-label="${escapeHtml(photo.alt)}"
              ></span>
              <small>${escapeHtml(index === 0 ? "Cover photo" : photo.alt)}</small>
              <div class="admin-photo-tile-actions">
                <button class="button ghost dark" type="button" data-replace-photo-index="${index}" ${canEditPhotos ? "" : "disabled"}>Upload</button>
                <button class="icon-button admin-photo-delete" type="button" data-delete-photo="${escapeHtml(photo.image)}" data-delete-photo-index="${index}" aria-label="Delete photo" ${canEditPhotos && photos.length > 1 ? "" : "disabled"}><i class="fa-solid fa-xmark"></i></button>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPostGrid() {
  if (!blogPosts.length) {
    return `<div class="admin-empty-state">No blog posts yet. Create the first post.</div>`;
  }

  return `
    <div class="admin-product-picker admin-blog-picker">
      ${blogPosts
        .map((post) => {
          const photo = getCoverPhoto(post);
          return `
            <button class="admin-product-tile admin-blog-tile ${post.id === selectedPostId ? "active" : ""}" type="button" data-open-post="${escapeHtml(post.id)}">
              <span
                class="admin-product-tile-photo"
                style="--product-image: url('${escapeHtml(photo.image)}'); --focus: ${escapeHtml(photo.focus)}"
              >
                <span class="product-badge">${escapeHtml(post.status || "draft")}</span>
              </span>
              <span class="admin-product-tile-body">
                <strong>${escapeHtml(post.title)}</strong>
                <small>${escapeHtml(post.slug ? `/blog/${post.slug}/` : "Unsaved post")}</small>
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPostForm(post, mode = "edit") {
  const isCreate = mode === "create";

  return `
    <form class="admin-product-form admin-blog-form admin-blog-page-form" data-post-id="${escapeHtml(post.id)}" data-editor-mode="${escapeHtml(mode)}">
      <div class="admin-product-fields admin-blog-fields admin-blog-editor-panel">
        <div class="admin-product-title">
          <strong>${escapeHtml(isCreate ? "Create new blog post" : post.title)}</strong>
          <span>${escapeHtml(isCreate ? "Draft" : post.slug)}</span>
        </div>
        <div class="form-grid">
          <label>
            Slug
            <input name="slug" value="${escapeHtml(post.slug || slugify(post.title))}" required />
          </label>
          <label>
            Author
            <input name="author" value="${escapeHtml(post.author || "HOODYBOODY Studio")}" required />
          </label>
          <label>
            Status
            ${renderStatusSelect(post)}
          </label>
          <label class="full-span">
            Tags
            <input name="tags" value="${escapeHtml(csv(post.tags))}" placeholder="Embroidery, Outfit, Studio" />
          </label>
          <div class="admin-photo-upload full-span">
            <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input multiple hidden />
            <div class="admin-photo-header">
              <span>Blog photos</span>
              <small>${isCreate ? "Save the post first, then upload photos." : "Choose one or more JPG, PNG or WEBP photos."}</small>
            </div>
            ${renderPhotoTiles(post, isCreate)}
            <div class="admin-photo-actions">
              <button class="button ghost dark" type="button" data-upload-photo ${isCreate ? "disabled" : ""}>Upload photos</button>
              <small>${escapeHtml(isCreate ? "Photos are available after saving." : "The first photo is used as the cover.")}</small>
            </div>
          </div>
          <label class="full-span">
            Meta excerpt
            <textarea name="excerpt" rows="3" required>${escapeHtml(post.excerpt || "")}</textarea>
          </label>
        </div>
        <div class="admin-editor-actions">
          <button class="button ghost dark" type="button" data-close-editor>Back to posts</button>
          ${
            isCreate
              ? ""
              : `<a class="button ghost dark" href="/blog/${escapeHtml(post.slug)}/" target="_blank" rel="noreferrer">View post</a>
                 <button class="button ghost dark danger-button" type="button" data-delete-post="${escapeHtml(post.id)}">Delete post</button>`
          }
          <button class="button primary" type="submit">${isCreate ? "Create post" : "Save post"}</button>
        </div>
      </div>
      ${renderBlogBuilder(post)}
    </form>
  `;
}

function getSelectedPost() {
  if (editorMode === "create") return getBlankPost();
  return blogPosts.find((post) => post.id === selectedPostId) || null;
}

function renderBlogEditor() {
  const selectedPost = getSelectedPost();
  adminBlogList.innerHTML = renderPostGrid() + (selectedPost ? renderPostForm(selectedPost, editorMode === "create" ? "create" : "edit") : "");
}

function formatCommentDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function renderCommentModerationCard(comment) {
  const isPending = comment.status === "pending";
  const isPublished = comment.status === "published";
  const isRejected = comment.status === "rejected";
  const indent = Math.min(Number(comment.depth) || 0, 3);

  return `
    <article class="admin-comment-card status-${escapeHtml(comment.status)}" style="--comment-depth: ${indent}">
      <div class="admin-comment-head">
        <div>
          <span class="admin-comment-status">${escapeHtml(comment.status)}</span>
          <strong>${escapeHtml(comment.name)}</strong>
          <small>${escapeHtml(comment.email || "No email")} ${comment.website ? ` / ${escapeHtml(comment.website)}` : ""}</small>
        </div>
        <div class="admin-comment-post">
          <a href="/blog/${escapeHtml(comment.postSlug)}/" target="_blank" rel="noreferrer">${escapeHtml(comment.postTitle)}</a>
          <small>${escapeHtml(formatCommentDate(comment.createdAt))}${comment.parentId ? " / reply" : ""}</small>
        </div>
      </div>
      <p>${escapeHtml(comment.text)}</p>
      <div class="admin-comment-actions">
        <button class="button ghost dark" type="button" data-comment-status="published" data-post-id="${escapeHtml(comment.postId)}" data-comment-id="${escapeHtml(comment.commentId)}" ${isPublished ? "disabled" : ""}>Approve</button>
        <button class="button ghost dark" type="button" data-comment-status="pending" data-post-id="${escapeHtml(comment.postId)}" data-comment-id="${escapeHtml(comment.commentId)}" ${isPending ? "disabled" : ""}>Pending</button>
        <button class="button ghost dark" type="button" data-comment-status="rejected" data-post-id="${escapeHtml(comment.postId)}" data-comment-id="${escapeHtml(comment.commentId)}" ${isRejected ? "disabled" : ""}>Reject</button>
        <button class="button ghost dark danger-button" type="button" data-delete-comment data-post-id="${escapeHtml(comment.postId)}" data-comment-id="${escapeHtml(comment.commentId)}">Delete</button>
      </div>
      <div class="admin-comment-reply">
        <textarea rows="2" placeholder="Reply as HOODYBOODY Studio" data-comment-reply-text></textarea>
        <button class="button primary" type="button" data-send-comment-reply data-post-id="${escapeHtml(comment.postId)}" data-comment-id="${escapeHtml(comment.commentId)}">Reply</button>
      </div>
    </article>
  `;
}

function renderBlogCommentsModeration() {
  const pendingCount = blogComments.filter((comment) => comment.status === "pending").length;
  const publishedCount = blogComments.filter((comment) => comment.status === "published").length;

  if (!blogComments.length) {
    adminBlogCommentsList.innerHTML = `<div class="admin-empty-state">No blog comments yet.</div>`;
    return;
  }

  adminBlogCommentsList.innerHTML = `
    <div class="admin-comment-summary">
      <span><strong>${pendingCount}</strong> pending</span>
      <span><strong>${publishedCount}</strong> published</span>
      <span><strong>${blogComments.length}</strong> total</span>
    </div>
    ${blogComments.map(renderCommentModerationCard).join("")}
  `;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Could not read this image.")));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not prepare this image.")));
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress this image."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.86
    );
  });
}

async function prepareBlogImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  if (file.size > maxUploadSourceBytes) {
    throw new Error("Choose an image up to 12 MB.");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const scale = Math.min(1, maxImageEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas);
  const dataUrl = await readFileAsDataUrl(blob);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "blog-photo";

  return {
    dataUrl,
    fileName: `${baseName}.jpg`
  };
}

async function uploadBlogPhotos(form, files, options = {}) {
  const postId = form.dataset.postId;
  const selectedFiles = Array.from(files || []).slice(0, options.mode === "gallery" || !options.mode ? Number.POSITIVE_INFINITY : 1);
  const note = form.querySelector(".admin-photo-actions small");
  const uploadButton = getUploadButtonForMode(form, options);
  const snapshot = getEditorPostSnapshot(form);
  let latestResponse = null;
  const uploadedPhotos = [];

  if (!selectedFiles.length) return;

  if (uploadButton) uploadButton.disabled = true;
  if (note) note.textContent = `Uploading ${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"}...`;

  for (const [index, file] of selectedFiles.entries()) {
    if (note) note.textContent = `Uploading ${index + 1} of ${selectedFiles.length}: ${file.name}`;
    const prepared = await prepareBlogImage(file);
    const body = {
      postId,
      fileName: prepared.fileName,
      dataUrl: prepared.dataUrl
    };

    if (options.mode === "replace-photo" && Number.isInteger(options.photoIndex)) {
      body.replaceIndex = options.photoIndex;
    }

    latestResponse = await api("/api/admin/blog/posts/photo", {
      method: "POST",
      body: JSON.stringify(body)
    });
    blogPosts = latestResponse.posts || blogPosts;
    const nextGallery = latestResponse.post?.gallery || [];
    uploadedPhotos.push(options.mode === "replace-photo" && Number.isInteger(options.photoIndex) ? nextGallery[options.photoIndex] : nextGallery[nextGallery.length - 1]);
  }

  const serverPost = latestResponse?.post || {};
  const nextGallery = serverPost.gallery || snapshot.gallery || [];
  let nextBlocks = snapshot.blocks.map(cloneBlogBlock);

  if (options.mode === "block" && uploadedPhotos[0]) {
    nextBlocks = setBlockImageAt(nextBlocks, options.blockIndex, options.slot || 0, uploadedPhotos[0]);
  }

  if (options.mode === "replace-photo" && uploadedPhotos[0]) {
    const oldPhoto = snapshot.gallery?.[options.photoIndex];
    nextBlocks = replaceImageReferences(nextBlocks, oldPhoto?.image, uploadedPhotos[0]);
  }

  const mergedPost = {
    ...serverPost,
    ...snapshot,
    gallery: nextGallery,
    blocks: nextBlocks,
    body: builderBlocksToBody(nextBlocks),
    updatedAt: serverPost.updatedAt || snapshot.updatedAt
  };

  replacePostInState(mergedPost);
  renderBlogEditor();
  setBlogStatus(options.mode === "replace-photo" ? "Blog photo replaced successfully." : "Blog photo uploaded successfully.");
}

async function loadBlogPosts(options = {}) {
  try {
    const [postsData, commentsData] = await Promise.all([api("/api/admin/blog/posts"), api("/api/admin/blog/comments")]);
    blogPosts = postsData.posts || [];
    blogComments = commentsData.comments || [];
    showDashboard();
    renderBlogEditor();
    renderBlogCommentsModeration();
    if (!options.silent) setBlogStatus("Blog posts refreshed successfully.");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/auth.html?next=/admin-blog.html";
      return;
    }
    showLocked(error.message);
  }
}

async function loadBlogComments(options = {}) {
  try {
    const data = await api("/api/admin/blog/comments");
    blogComments = data.comments || [];
    renderBlogCommentsModeration();
    if (!options.silent) setBlogCommentsStatus("Blog comments refreshed successfully.");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/auth.html?next=/admin-blog.html";
      return;
    }
    setBlogCommentsStatus(error.message, true);
  }
}

adminBlogList.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = event.target.closest("[data-post-id]");
  const submitButton = form.querySelector('button[type="submit"]');
  const builderData = syncBlogBuilderFields(form);
  const hasTextContent = builderData.blocks.some((block) => ["paragraph", "heading2", "heading3"].includes(block.type) && block.text);

  if (!hasTextContent) {
    setBlogStatus("Add at least one heading or paragraph before saving.", true);
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  const isCreate = form.dataset.editorMode === "create";
  data.postId = form.dataset.postId;
  data.blocks = builderData.blocks;
  data.body = builderData.body;

  submitButton.disabled = true;
  submitButton.textContent = isCreate ? "Creating..." : "Saving...";
  setBlogStatus(isCreate ? "Creating blog post..." : "Saving blog post...", false, { persist: true });

  api("/api/admin/blog/posts", {
    method: isCreate ? "POST" : "PATCH",
    body: JSON.stringify(data)
  })
    .then((response) => {
      blogPosts = response.posts || blogPosts;
      selectedPostId = response.post?.id || data.postId || selectedPostId;
      editorMode = "edit";
      renderBlogEditor();
      setBlogStatus(isCreate ? "Blog post created successfully." : "Blog post saved successfully.");
    })
    .catch((error) => {
      setBlogStatus(error.message, true);
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.textContent = isCreate ? "Create post" : "Save post";
    });
});

adminBlogList.addEventListener("click", (event) => {
  const openPostButton = event.target.closest("[data-open-post]");
  if (openPostButton) {
    selectedPostId = openPostButton.dataset.openPost;
    editorMode = "edit";
    renderBlogEditor();
    adminBlogList.querySelector(".admin-blog-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const closeEditorButton = event.target.closest("[data-close-editor]");
  if (closeEditorButton) {
    selectedPostId = "";
    editorMode = "grid";
    renderBlogEditor();
    return;
  }

  const addBlockButton = event.target.closest("[data-add-blog-block]");
  if (addBlockButton) {
    const form = addBlockButton.closest("[data-post-id]");
    const list = form.querySelector("[data-blog-builder-list]");
    const post = getSelectedPost() || getBlankPost();
    const type = normalizeBuilderType(addBlockButton.dataset.addBlogBlock);
    const block = createEditorBlock(type, post);

    list.insertAdjacentHTML("beforeend", renderEditorBlock(block, list.children.length, post));
    updateBuilderOrder(form);
    syncBlogBuilderFields(form);
    list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
    list.lastElementChild?.querySelector("[data-block-text]")?.focus();
    return;
  }

  const moveBlockButton = event.target.closest("[data-move-blog-block]");
  if (moveBlockButton) {
    const form = moveBlockButton.closest("[data-post-id]");
    const card = moveBlockButton.closest("[data-blog-block]");
    const direction = moveBlockButton.dataset.moveBlogBlock;

    if (direction === "up" && card.previousElementSibling) {
      card.parentElement.insertBefore(card, card.previousElementSibling);
    }

    if (direction === "down" && card.nextElementSibling) {
      card.parentElement.insertBefore(card.nextElementSibling, card);
    }

    updateBuilderOrder(form);
    syncBlogBuilderFields(form);
    return;
  }

  const copyBlockButton = event.target.closest("[data-copy-blog-block]");
  if (copyBlockButton) {
    const form = copyBlockButton.closest("[data-post-id]");
    const card = copyBlockButton.closest("[data-blog-block]");
    const post = getSelectedPost() || getBlankPost();
    const block = createEditorBlock(card.dataset.blockType, post, getBlockFromCard(card));
    const index = getEditorBlockIndex(card) + 1;

    card.insertAdjacentHTML("afterend", renderEditorBlock(block, index, post));
    updateBuilderOrder(form);
    syncBlogBuilderFields(form);
    card.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const deleteBlockButton = event.target.closest("[data-delete-blog-block]");
  if (deleteBlockButton) {
    const form = deleteBlockButton.closest("[data-post-id]");
    const card = deleteBlockButton.closest("[data-blog-block]");
    const remainingBlocks = form.querySelectorAll("[data-blog-block]").length;
    if (remainingBlocks <= 1) {
      setBlogStatus("Keep at least one builder block.", true);
      return;
    }

    card.remove();
    updateBuilderOrder(form);
    syncBlogBuilderFields(form);
    return;
  }

  const blockUploadButton = event.target.closest("[data-upload-block-photo]");
  if (blockUploadButton) {
    const form = blockUploadButton.closest("[data-post-id]");
    const card = blockUploadButton.closest("[data-blog-block]");
    const input = form.querySelector("[data-photo-input]");
    input.dataset.uploadMode = "block";
    input.dataset.blockIndex = String(getEditorBlockIndex(card));
    input.dataset.blockImageSlot = String(Number(blockUploadButton.dataset.blockImageSlot) || 0);
    input.multiple = false;
    form.querySelector(".admin-photo-actions small").textContent = "Choose a photo for this block.";
    input.click();
    return;
  }

  const uploadButton = event.target.closest("[data-upload-photo]");
  if (uploadButton) {
    const form = uploadButton.closest("[data-post-id]");
    const input = form.querySelector("[data-photo-input]");
    input.dataset.uploadMode = "gallery";
    input.dataset.blockIndex = "";
    input.dataset.blockImageSlot = "";
    input.dataset.photoIndex = "";
    input.multiple = true;
    form.querySelector(".admin-photo-actions small").textContent = "Choose blog photos from your computer.";
    input.click();
    return;
  }

  const replacePhotoButton = event.target.closest("[data-replace-photo-index]");
  if (replacePhotoButton) {
    const form = replacePhotoButton.closest("[data-post-id]");
    const input = form.querySelector("[data-photo-input]");
    input.dataset.uploadMode = "replace-photo";
    input.dataset.photoIndex = String(Number(replacePhotoButton.dataset.replacePhotoIndex) || 0);
    input.dataset.blockIndex = "";
    input.dataset.blockImageSlot = "";
    input.multiple = false;
    form.querySelector(".admin-photo-actions small").textContent = "Choose a replacement photo.";
    input.click();
    return;
  }

  const deletePhotoButton = event.target.closest("[data-delete-photo]");
  if (deletePhotoButton) {
    const form = deletePhotoButton.closest("[data-post-id]");
    const note = form.querySelector(".admin-photo-actions small");
    const postId = form.dataset.postId;
    const image = deletePhotoButton.dataset.deletePhoto;
    const photoIndex = Number(deletePhotoButton.dataset.deletePhotoIndex);
    const snapshot = getEditorPostSnapshot(form);
    const oldPhoto = snapshot.gallery?.[photoIndex] || { image };
    if (!window.confirm("Delete this blog photo?")) return;

    deletePhotoButton.disabled = true;
    note.textContent = "Deleting photo...";
    api("/api/admin/blog/posts/photo", {
      method: "DELETE",
      body: JSON.stringify({ postId, image, photoIndex })
    })
      .then((response) => {
        blogPosts = response.posts || blogPosts;
        const serverPost = response.post || {};
        const nextGallery = serverPost.gallery || snapshot.gallery || [];
        const fallbackPhoto = nextGallery[photoIndex] || nextGallery[0] || getCoverPhoto(snapshot);
        const nextBlocks = replaceImageReferences(snapshot.blocks, oldPhoto.image, fallbackPhoto);
        replacePostInState({
          ...serverPost,
          ...snapshot,
          gallery: nextGallery,
          blocks: nextBlocks,
          body: builderBlocksToBody(nextBlocks),
          updatedAt: serverPost.updatedAt || snapshot.updatedAt
        });
        renderBlogEditor();
        setBlogStatus("Blog photo deleted successfully.");
      })
      .catch((error) => {
        deletePhotoButton.disabled = false;
        note.textContent = error.message;
      });
    return;
  }

  const deletePostButton = event.target.closest("[data-delete-post]");
  if (deletePostButton) {
    const postId = deletePostButton.dataset.deletePost;
    if (!window.confirm("Delete this blog post?")) return;

    deletePostButton.disabled = true;
    setBlogStatus("Deleting blog post...", false, { persist: true });
    api("/api/admin/blog/posts", {
      method: "DELETE",
      body: JSON.stringify({ postId })
    })
      .then((response) => {
        blogPosts = response.posts || blogPosts;
        selectedPostId = "";
        editorMode = "grid";
        renderBlogEditor();
        setBlogStatus("Blog post deleted successfully.");
      })
      .catch((error) => {
        deletePostButton.disabled = false;
        setBlogStatus(error.message, true);
      });
  }
});

adminBlogCommentsList.addEventListener("click", (event) => {
  const statusButton = event.target.closest("[data-comment-status]");
  if (statusButton) {
    statusButton.disabled = true;
    setBlogCommentsStatus("Updating comment status...", false, { persist: true });
    api("/api/admin/blog/comments", {
      method: "PATCH",
      body: JSON.stringify({
        postId: statusButton.dataset.postId,
        commentId: statusButton.dataset.commentId,
        status: statusButton.dataset.commentStatus
      })
    })
      .then((response) => {
        blogComments = response.comments || blogComments;
        renderBlogCommentsModeration();
        setBlogCommentsStatus("Comment moderation status saved.");
      })
      .catch((error) => {
        statusButton.disabled = false;
        setBlogCommentsStatus(error.message, true);
      });
    return;
  }

  const deleteButton = event.target.closest("[data-delete-comment]");
  if (deleteButton) {
    if (!window.confirm("Delete this blog comment?")) return;
    deleteButton.disabled = true;
    setBlogCommentsStatus("Deleting comment...", false, { persist: true });
    api("/api/admin/blog/comments", {
      method: "DELETE",
      body: JSON.stringify({
        postId: deleteButton.dataset.postId,
        commentId: deleteButton.dataset.commentId
      })
    })
      .then((response) => {
        blogComments = response.comments || blogComments;
        renderBlogCommentsModeration();
        setBlogCommentsStatus("Comment deleted.");
      })
      .catch((error) => {
        deleteButton.disabled = false;
        setBlogCommentsStatus(error.message, true);
      });
    return;
  }

  const replyButton = event.target.closest("[data-send-comment-reply]");
  if (replyButton) {
    const card = replyButton.closest(".admin-comment-card");
    const textarea = card.querySelector("[data-comment-reply-text]");
    const text = textarea.value.trim();

    if (!text) {
      setBlogCommentsStatus("Write a reply before sending.", true);
      return;
    }

    replyButton.disabled = true;
    setBlogCommentsStatus("Publishing reply...", false, { persist: true });
    api("/api/admin/blog/comments/reply", {
      method: "POST",
      body: JSON.stringify({
        postId: replyButton.dataset.postId,
        commentId: replyButton.dataset.commentId,
        text
      })
    })
      .then((response) => {
        blogComments = response.comments || blogComments;
        renderBlogCommentsModeration();
        setBlogCommentsStatus("Reply published.");
      })
      .catch((error) => {
        replyButton.disabled = false;
        setBlogCommentsStatus(error.message, true);
      });
  }
});

adminBlogList.addEventListener("input", (event) => {
  const builderField = event.target.closest("[data-blog-builder]");
  if (builderField) {
    const form = event.target.closest("[data-post-id]");
    syncBlogBuilderFields(form);
  }

  const titleInput = event.target.closest('[name="title"]');
  if (!titleInput) return;

  const form = titleInput.closest("[data-post-id]");
  const slugInput = form.querySelector('input[name="slug"]');
  if (form.dataset.editorMode === "create") {
    slugInput.value = slugify(titleInput.value);
  }
});

adminBlogList.addEventListener("change", (event) => {
  const blockTypeSelect = event.target.closest("[data-block-type-select]");
  if (blockTypeSelect) {
    const form = blockTypeSelect.closest("[data-post-id]");
    const card = blockTypeSelect.closest("[data-blog-block]");
    const post = getSelectedPost() || getBlankPost();
    const nextType = normalizeBuilderType(blockTypeSelect.value);
    const seed = getBlockFromCard(card, nextType);
    const nextBlock = createEditorBlock(nextType, post, seed);
    replaceEditorBlock(card, nextBlock, form);
    return;
  }

  const blockStyleSelect = event.target.closest("[data-block-style-select]");
  if (blockStyleSelect) {
    const form = blockStyleSelect.closest("[data-post-id]");
    const card = blockStyleSelect.closest("[data-blog-block]");
    const post = getSelectedPost() || getBlankPost();
    const nextBlock = createEditorBlock(card.dataset.blockType, post, getBlockFromCard(card));
    replaceEditorBlock(card, nextBlock, form);
    return;
  }

  const blockPhotoSelect = event.target.closest("[data-block-photo-select]");
  if (blockPhotoSelect) {
    const form = blockPhotoSelect.closest("[data-post-id]");
    const slot = blockPhotoSelect.dataset.blockImageSlot;
    const option = blockPhotoSelect.selectedOptions[0];
    const card = blockPhotoSelect.closest("[data-blog-block]");
    const imageInput = card.querySelector(`[data-block-image-url="${slot}"]`);
    const altInput = card.querySelector(`[data-block-image-alt="${slot}"]`);
    const focusInput = card.querySelector(`[data-block-image-focus="${slot}"]`);

    if (option?.value) {
      if (imageInput) imageInput.value = option.value;
      if (altInput) altInput.value = option.dataset.alt || altInput.value;
      if (focusInput) focusInput.value = option.dataset.focus || focusInput.value;
      const post = getSelectedPost() || getBlankPost();
      const nextBlock = createEditorBlock(card.dataset.blockType, post, getBlockFromCard(card));
      replaceEditorBlock(card, nextBlock, form);
    }
    return;
  }

  const imageField = event.target.closest("[data-block-image-url], [data-block-image-alt], [data-block-image-focus]");
  if (imageField) {
    const form = imageField.closest("[data-post-id]");
    const card = imageField.closest("[data-blog-block]");
    const post = getSelectedPost() || getBlankPost();
    const nextBlock = createEditorBlock(card.dataset.blockType, post, getBlockFromCard(card));
    replaceEditorBlock(card, nextBlock, form);
    return;
  }

  const input = event.target.closest("[data-photo-input]");
  if (!input || !input.files.length) return;

  const form = input.closest("[data-post-id]");
  const options = {
    mode: input.dataset.uploadMode || "gallery",
    blockIndex: Number(input.dataset.blockIndex),
    slot: Number(input.dataset.blockImageSlot) || 0,
    photoIndex: Number(input.dataset.photoIndex)
  };

  uploadBlogPhotos(form, input.files, options)
    .catch((error) => {
      const uploadButton = getUploadButtonForMode(form, options);
      const note = form.querySelector(".admin-photo-actions small");
      if (uploadButton) uploadButton.disabled = false;
      if (note) note.textContent = error.message;
    })
    .finally(() => {
      input.value = "";
      input.dataset.uploadMode = "gallery";
      input.dataset.blockIndex = "";
      input.dataset.blockImageSlot = "";
      input.dataset.photoIndex = "";
      input.multiple = true;
    });
});

adminBlogList.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".admin-drag-handle");
  if (!handle) return;
  const card = handle.closest("[data-blog-block]");
  const list = card?.closest("[data-blog-builder-list]");
  const form = card?.closest("[data-post-id]");
  if (!card || !list || !form) return;

  event.preventDefault();
  draggedBlogBlock = card;
  pointerDragList = list;
  pointerDragForm = form;
  card.classList.add("is-dragging");
  handle.setPointerCapture?.(event.pointerId);
});

adminBlogList.addEventListener("pointermove", (event) => {
  if (!draggedBlogBlock || !pointerDragList) return;
  event.preventDefault();
  moveDraggedBlogBlock(event.clientY);
});

adminBlogList.addEventListener("pointerup", finishPointerBlogDrag);
adminBlogList.addEventListener("pointercancel", finishPointerBlogDrag);

adminBlogList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-blog-block]");
  if (!card) return;
  draggedBlogBlock = card;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.blockType || "blog-block");
});

adminBlogList.addEventListener("dragover", (event) => {
  const list = event.target.closest("[data-blog-builder-list]");
  if (!list || !draggedBlogBlock) return;
  event.preventDefault();
  const nextBlock = getDragAfterBlock(list, event.clientY);
  if (nextBlock) {
    list.insertBefore(draggedBlogBlock, nextBlock);
  } else {
    list.appendChild(draggedBlogBlock);
  }
});

adminBlogList.addEventListener("drop", (event) => {
  const list = event.target.closest("[data-blog-builder-list]");
  if (!list || !draggedBlogBlock) return;
  event.preventDefault();
  const form = list.closest("[data-post-id]");
  draggedBlogBlock.classList.remove("is-dragging");
  draggedBlogBlock = null;
  updateBuilderOrder(form);
  syncBlogBuilderFields(form);
});

adminBlogList.addEventListener("dragend", () => {
  const card = draggedBlogBlock || adminBlogList.querySelector("[data-blog-block].is-dragging");
  const form = card?.closest("[data-post-id]");
  card?.classList.remove("is-dragging");
  draggedBlogBlock = null;
  if (form) {
    updateBuilderOrder(form);
    syncBlogBuilderFields(form);
  }
});

reloadBlogPosts.addEventListener("click", () => loadBlogPosts());
reloadBlogComments.addEventListener("click", () => loadBlogComments());
createBlogPost.addEventListener("click", () => {
  selectedPostId = "";
  editorMode = "create";
  renderBlogEditor();
  adminBlogList.querySelector(".admin-blog-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

loadBlogPosts({ silent: true });

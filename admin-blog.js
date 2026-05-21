const DEFAULT_BLOG_IMAGE = "/assets/embroidered-collection.png";
const BLOG_STATUS_OPTIONS = ["draft", "published"];
const BLOG_BLOCK_TYPES = [
  ["paragraph", "Paragraph"],
  ["heading2", "Heading"],
  ["heading3", "Subheading"],
  ["image", "Single photo"],
  ["imagePair", "Two photos"]
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
              <label>
                Photo ${slot + 1}
                ${renderBuilderPhotoSelect(slot, photos, image.image)}
              </label>
              <label>
                Image URL
                <input data-block-image-url="${slot}" value="${escapeHtml(image.image)}" />
              </label>
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

function renderBlogBuilderBlock(block, index, post) {
  const type = normalizeBuilderType(block?.type);
  const style = normalizeBuilderStyle(block?.style);
  const text = String(block?.text || "").trim();

  return `
    <article class="admin-builder-block" data-blog-block data-block-type="${escapeHtml(type)}">
      <div class="admin-builder-block-head">
        <span class="admin-builder-order" data-block-order>${index + 1}</span>
        <label>
          Block
          <select data-block-type-select>
            ${renderBuilderOptions(BLOG_BLOCK_TYPES, type)}
          </select>
        </label>
        <label>
          Design
          <select data-block-style-select>
            ${renderBuilderOptions(BLOG_BLOCK_STYLES, style)}
          </select>
        </label>
        <div class="admin-builder-actions">
          <button class="icon-button" type="button" data-move-blog-block="up" aria-label="Move block up"><i class="fa-solid fa-arrow-up"></i></button>
          <button class="icon-button" type="button" data-move-blog-block="down" aria-label="Move block down"><i class="fa-solid fa-arrow-down"></i></button>
          <button class="icon-button danger-button" type="button" data-delete-blog-block aria-label="Delete block"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <label class="admin-builder-text">
        Text
        <textarea data-block-text rows="${type === "paragraph" ? "4" : "2"}">${escapeHtml(text)}</textarea>
      </label>
      ${renderBuilderImageFields({ ...block, type }, post)}
    </article>`;
}

function renderBlogBuilder(post) {
  const blocks = getPostBlocks(post);

  return `
    <div class="admin-blog-builder full-span" data-blog-builder>
      <input type="hidden" name="blocks" data-blog-blocks-field value="${escapeHtml(JSON.stringify(blocks))}" />
      <textarea name="body" data-blog-body-fallback hidden>${escapeHtml(builderBlocksToBody(blocks))}</textarea>
      <div class="admin-blog-builder-head">
        <div>
          <strong>Blog page builder</strong>
          <small>Move blocks, change type, choose design style, and attach article photos.</small>
        </div>
        <div class="admin-builder-adds" aria-label="Add blog block">
          <button class="button ghost dark" type="button" data-add-blog-block="paragraph">Paragraph</button>
          <button class="button ghost dark" type="button" data-add-blog-block="heading2">Heading</button>
          <button class="button ghost dark" type="button" data-add-blog-block="heading3">Subheading</button>
          <button class="button ghost dark" type="button" data-add-blog-block="image">Photo</button>
          <button class="button ghost dark" type="button" data-add-blog-block="imagePair">Two photos</button>
        </div>
      </div>
      <div class="admin-builder-list" data-blog-builder-list>
        ${blocks.map((block, index) => renderBlogBuilderBlock(block, index, post)).join("")}
      </div>
    </div>`;
}

function collectBlogBlocks(form) {
  return Array.from(form.querySelectorAll("[data-blog-block]"))
    .map((card) => {
      const type = normalizeBuilderType(card.dataset.blockType);
      const style = normalizeBuilderStyle(card.querySelector("[data-block-style-select]")?.value);

      if (type === "image") {
        return {
          type,
          style,
          image: {
            image: card.querySelector('[data-block-image-url="0"]')?.value.trim() || DEFAULT_BLOG_IMAGE,
            alt: card.querySelector('[data-block-image-alt="0"]')?.value.trim() || "HOODYBOODY blog image",
            focus: card.querySelector('[data-block-image-focus="0"]')?.value.trim() || "50% 50%"
          }
        };
      }

      if (type === "imagePair") {
        return {
          type,
          style,
          images: [0, 1].map((slot) => ({
            image: card.querySelector(`[data-block-image-url="${slot}"]`)?.value.trim() || DEFAULT_BLOG_IMAGE,
            alt: card.querySelector(`[data-block-image-alt="${slot}"]`)?.value.trim() || "HOODYBOODY blog image",
            focus: card.querySelector(`[data-block-image-focus="${slot}"]`)?.value.trim() || "50% 50%"
          }))
        };
      }

      return {
        type,
        style,
        text: card.querySelector("[data-block-text]")?.value.trim() || ""
      };
    })
    .filter((block) => block.type === "image" || block.type === "imagePair" || block.text);
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

function renderStatusSelect(post) {
  return `
    <select name="status">
      ${BLOG_STATUS_OPTIONS.map((status) => `<option value="${status}" ${post.status === status ? "selected" : ""}>${status}</option>`).join("")}
    </select>
  `;
}

function renderPhotoTiles(post, isCreate = false) {
  const photos = getPostPhotos(post);

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
              ${
                photo.canDelete && !isCreate
                  ? `<button class="icon-button admin-photo-delete" type="button" data-delete-photo="${escapeHtml(photo.image)}" aria-label="Delete photo"><i class="fa-solid fa-xmark"></i></button>`
                  : ""
              }
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
  const cover = getCoverPhoto(post);

  return `
    <form class="admin-product-form admin-blog-form" data-post-id="${escapeHtml(post.id)}" data-editor-mode="${escapeHtml(mode)}">
      <div
        class="admin-product-preview admin-blog-preview"
        style="--product-image: url('${escapeHtml(cover.image)}'); --focus: ${escapeHtml(cover.focus || "50% 50%")}"
      ></div>
      <div class="admin-product-fields admin-blog-fields">
        <div class="admin-product-title">
          <strong>${escapeHtml(isCreate ? "Create new blog post" : post.title)}</strong>
          <span>${escapeHtml(isCreate ? "Draft" : post.slug)}</span>
        </div>
        <div class="form-grid">
          <label>
            Post title
            <input name="title" value="${escapeHtml(post.title)}" required />
          </label>
          <label>
            Slug
            <input name="slug" value="${escapeHtml(post.slug || slugify(post.title))}" required />
          </label>
          <label>
            Category
            <input name="category" value="${escapeHtml(post.category || "Embroidery Journal")}" required />
          </label>
          <label>
            Author
            <input name="author" value="${escapeHtml(post.author || "HOODYBOODY Studio")}" required />
          </label>
          <label>
            Publish date
            <input name="date" type="date" value="${escapeHtml(post.date || new Date().toISOString().slice(0, 10))}" required />
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
          ${renderBlogBuilder(post)}
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

async function uploadBlogPhotos(form, files) {
  const postId = form.dataset.postId;
  const selectedFiles = Array.from(files || []);
  const note = form.querySelector(".admin-photo-actions small");
  const uploadButton = form.querySelector("[data-upload-photo]");
  let latestResponse = null;

  if (!selectedFiles.length) return;

  uploadButton.disabled = true;
  note.textContent = `Uploading ${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"}...`;

  for (const [index, file] of selectedFiles.entries()) {
    note.textContent = `Uploading ${index + 1} of ${selectedFiles.length}: ${file.name}`;
    const prepared = await prepareBlogImage(file);
    latestResponse = await api("/api/admin/blog/posts/photo", {
      method: "POST",
      body: JSON.stringify({
        postId,
        fileName: prepared.fileName,
        dataUrl: prepared.dataUrl
      })
    });
    blogPosts = latestResponse.posts || blogPosts;
  }

  uploadButton.disabled = false;
  blogPosts = latestResponse?.posts || blogPosts;
  renderBlogEditor();
  setBlogStatus("Blog photo uploaded successfully.");
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
    const photos = getPostPhotos(post);
    const type = normalizeBuilderType(addBlockButton.dataset.addBlogBlock);
    const block =
      type === "image"
        ? { type, style: "default", image: photos[0] }
        : type === "imagePair"
          ? { type, style: "default", images: [photos[1] || photos[0], photos[2] || photos[0]] }
          : { type, style: "default", text: type === "paragraph" ? "New paragraph text." : "New heading" };

    list.insertAdjacentHTML("beforeend", renderBlogBuilderBlock(block, list.children.length, post));
    updateBuilderOrder(form);
    syncBlogBuilderFields(form);
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

  const uploadButton = event.target.closest("[data-upload-photo]");
  if (uploadButton) {
    const form = uploadButton.closest("[data-post-id]");
    form.querySelector(".admin-photo-actions small").textContent = "Choose blog photos from your computer.";
    form.querySelector("[data-photo-input]").click();
    return;
  }

  const deletePhotoButton = event.target.closest("[data-delete-photo]");
  if (deletePhotoButton) {
    const form = deletePhotoButton.closest("[data-post-id]");
    const note = form.querySelector(".admin-photo-actions small");
    const postId = form.dataset.postId;
    const image = deletePhotoButton.dataset.deletePhoto;
    if (!window.confirm("Delete this blog photo?")) return;

    deletePhotoButton.disabled = true;
    note.textContent = "Deleting photo...";
    api("/api/admin/blog/posts/photo", {
      method: "DELETE",
      body: JSON.stringify({ postId, image })
    })
      .then((response) => {
        blogPosts = response.posts || blogPosts;
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

  const titleInput = event.target.closest('input[name="title"]');
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
    card.dataset.blockType = normalizeBuilderType(blockTypeSelect.value);
    syncBlogBuilderFields(form);
    return;
  }

  const blockStyleSelect = event.target.closest("[data-block-style-select]");
  if (blockStyleSelect) {
    const form = blockStyleSelect.closest("[data-post-id]");
    syncBlogBuilderFields(form);
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
      syncBlogBuilderFields(form);
    }
    return;
  }

  const input = event.target.closest("[data-photo-input]");
  if (!input || !input.files.length) return;

  const form = input.closest("[data-post-id]");
  uploadBlogPhotos(form, input.files)
    .catch((error) => {
      const uploadButton = form.querySelector("[data-upload-photo]");
      const note = form.querySelector(".admin-photo-actions small");
      uploadButton.disabled = false;
      note.textContent = error.message;
    })
    .finally(() => {
      input.value = "";
    });
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

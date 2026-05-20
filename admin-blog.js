const DEFAULT_BLOG_IMAGE = "/assets/embroidered-collection.png";
const BLOG_STATUS_OPTIONS = ["draft", "published"];
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
    gallery: [{ image: DEFAULT_BLOG_IMAGE, alt: "HOODYBOODY embroidered clothing", focus: "50% 50%" }]
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
          <label class="full-span">
            Blog text
            <textarea name="body" rows="12" required>${escapeHtml(post.body || "")}</textarea>
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
  const data = Object.fromEntries(new FormData(form));
  const isCreate = form.dataset.editorMode === "create";
  data.postId = form.dataset.postId;

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
  const titleInput = event.target.closest('input[name="title"]');
  if (!titleInput) return;

  const form = titleInput.closest("[data-post-id]");
  const slugInput = form.querySelector('input[name="slug"]');
  if (form.dataset.editorMode === "create") {
    slugInput.value = slugify(titleInput.value);
  }
});

adminBlogList.addEventListener("change", (event) => {
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

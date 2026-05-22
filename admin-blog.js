const adminBlogLocked = document.querySelector("#adminBlogLocked");
const adminBlogLockedText = document.querySelector("#adminBlogLockedText");
const adminBlogCommentsPanel = document.querySelector("#adminBlogCommentsPanel");
const adminBlogCommentsList = document.querySelector("#adminBlogCommentsList");
const adminBlogCommentsNote = document.querySelector("#adminBlogCommentsNote");
const reloadBlogComments = document.querySelector("#reloadBlogComments");

let blogComments = [];
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

function setBlogCommentsStatus(message, isError = false, options = {}) {
  if (!adminBlogCommentsNote) return;

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
  if (adminBlogCommentsPanel) adminBlogCommentsPanel.hidden = true;
  if (adminBlogLocked) adminBlogLocked.hidden = false;
  if (adminBlogLockedText) adminBlogLockedText.textContent = message;
}

function showDashboard() {
  if (adminBlogLocked) adminBlogLocked.hidden = true;
  if (adminBlogCommentsPanel) adminBlogCommentsPanel.hidden = false;
}

function formatCommentDate(value) {
  if (!value) return "No date";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function renderCommentModerationCard(comment) {
  const isPending = comment.status === "pending";
  const isPublished = comment.status === "published";
  const isRejected = comment.status === "rejected";
  const depthClass = comment.depth ? " is-reply" : "";

  return `
    <article class="admin-comment-card${depthClass}">
      <div class="admin-comment-meta">
        <div>
          <span class="admin-comment-status">${escapeHtml(comment.status)}</span>
          <strong>${escapeHtml(comment.name)}</strong>
          <small>${escapeHtml(comment.email || "No email")}${comment.website ? ` / ${escapeHtml(comment.website)}` : ""}</small>
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
  if (!adminBlogCommentsList) return;

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

async function loadBlogComments(options = {}) {
  try {
    const data = await api("/api/admin/blog/comments");
    blogComments = data.comments || [];
    showDashboard();
    renderBlogCommentsModeration();
    if (!options.silent) setBlogCommentsStatus("Blog comments refreshed successfully.");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/auth.html?next=/admin-blog.html";
      return;
    }
    showLocked(error.message);
    setBlogCommentsStatus(error.message, true, { persist: true });
  }
}

adminBlogCommentsList?.addEventListener("click", async (event) => {
  const statusButton = event.target.closest("[data-comment-status]");
  const deleteButton = event.target.closest("[data-delete-comment]");
  const replyButton = event.target.closest("[data-send-comment-reply]");

  if (statusButton) {
    statusButton.disabled = true;
    try {
      const data = await api("/api/admin/blog/comments", {
        method: "PATCH",
        body: JSON.stringify({
          postId: statusButton.dataset.postId,
          commentId: statusButton.dataset.commentId,
          status: statusButton.dataset.commentStatus
        })
      });
      blogComments = data.comments || [];
      renderBlogCommentsModeration();
      setBlogCommentsStatus("Comment status updated.");
    } catch (error) {
      statusButton.disabled = false;
      setBlogCommentsStatus(error.message, true);
    }
    return;
  }

  if (deleteButton) {
    deleteButton.disabled = true;
    try {
      const data = await api("/api/admin/blog/comments", {
        method: "DELETE",
        body: JSON.stringify({
          postId: deleteButton.dataset.postId,
          commentId: deleteButton.dataset.commentId
        })
      });
      blogComments = data.comments || [];
      renderBlogCommentsModeration();
      setBlogCommentsStatus("Comment deleted.");
    } catch (error) {
      deleteButton.disabled = false;
      setBlogCommentsStatus(error.message, true);
    }
    return;
  }

  if (replyButton) {
    const card = replyButton.closest(".admin-comment-card");
    const textarea = card?.querySelector("[data-comment-reply-text]");
    const text = String(textarea?.value || "").trim();

    if (!text) {
      setBlogCommentsStatus("Write a reply before sending.", true);
      textarea?.focus();
      return;
    }

    replyButton.disabled = true;
    try {
      const data = await api("/api/admin/blog/comments/reply", {
        method: "POST",
        body: JSON.stringify({
          postId: replyButton.dataset.postId,
          commentId: replyButton.dataset.commentId,
          text
        })
      });
      blogComments = data.comments || [];
      renderBlogCommentsModeration();
      setBlogCommentsStatus("Reply published.");
    } catch (error) {
      replyButton.disabled = false;
      setBlogCommentsStatus(error.message, true);
    }
  }
});

reloadBlogComments?.addEventListener("click", () => loadBlogComments());

loadBlogComments({ silent: true });

(function () {
  const gallery = document.querySelector("[data-blog-gallery]");

  function getBlogLightbox() {
    let lightbox = document.querySelector("[data-blog-lightbox]");
    if (lightbox) return lightbox;

    lightbox = document.createElement("div");
    lightbox.className = "blog-lightbox";
    lightbox.dataset.blogLightbox = "";
    lightbox.innerHTML = `
      <button class="blog-lightbox-close" type="button" aria-label="Close image"></button>
      <img alt="" />
    `;
    document.body.append(lightbox);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox || event.target.closest(".blog-lightbox-close")) closeBlogLightbox();
    });
    return lightbox;
  }

  function openBlogLightbox(image) {
    const lightbox = getBlogLightbox();
    const lightboxImage = lightbox.querySelector("img");
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Blog gallery image";
    lightbox.classList.add("is-visible");
    document.body.classList.add("blog-lightbox-open");
    lightbox.querySelector(".blog-lightbox-close")?.focus({ preventScroll: true });
  }

  function closeBlogLightbox() {
    const lightbox = document.querySelector("[data-blog-lightbox]");
    if (!lightbox) return;
    lightbox.classList.remove("is-visible");
    document.body.classList.remove("blog-lightbox-open");
  }

  if (gallery) {
    const slides = Array.from(gallery.querySelectorAll(".blog-gallery-slide"));
    const previous = gallery.querySelector(".blog-gallery-prev");
    const next = gallery.querySelector(".blog-gallery-next");
    const status = gallery.querySelector("[data-blog-gallery-status]");
    let activeIndex = 0;

    function showSlide(nextIndex) {
      activeIndex = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const isActive = index === activeIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
      });
      if (status) status.textContent = `Slide ${activeIndex + 1} of ${slides.length}`;
    }

    previous?.addEventListener("click", () => showSlide(activeIndex - 1));
    next?.addEventListener("click", () => showSlide(activeIndex + 1));
    gallery.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") showSlide(activeIndex - 1);
      if (event.key === "ArrowRight") showSlide(activeIndex + 1);
    });

    showSlide(0);
  }

  document.addEventListener("click", (event) => {
    const image = event.target.closest(".blog-gallery img, .blog-image-pair img, .blog-image-single img, .blog-sidebar-gallery-grid img");
    if (!image) return;
    event.preventDefault();
    openBlogLightbox(image);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeBlogLightbox();
  });

  document.querySelectorAll(".blog-reply-link").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.querySelector("[data-blog-comment-form]");
      const textarea = form?.querySelector("textarea");
      const parentInput = form?.querySelector("[data-blog-reply-parent]");
      const target = form?.querySelector("[data-blog-reply-target]");
      const name = button.dataset.replyTo || "this comment";
      const commentId = button.dataset.replyCommentId || "";
      if (textarea) textarea.placeholder = `Reply to ${name} *`;
      if (parentInput) parentInput.value = commentId;
      if (target) {
        target.hidden = false;
        target.textContent = `Replying to ${name} `;
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.dataset.blogReplyCancel = "";
        cancelButton.textContent = "Cancel";
        target.append(cancelButton);
      }
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      textarea?.focus({ preventScroll: true });
    });
  });

  document.querySelector("[data-blog-comment-form]")?.addEventListener("click", (event) => {
    const cancelButton = event.target.closest("[data-blog-reply-cancel]");
    if (!cancelButton) return;
    const form = event.currentTarget;
    const textarea = form.querySelector("textarea");
    const parentInput = form.querySelector("[data-blog-reply-parent]");
    const target = form.querySelector("[data-blog-reply-target]");
    if (textarea) textarea.placeholder = "Your Comment *";
    if (parentInput) parentInput.value = "";
    if (target) {
      target.hidden = true;
      target.textContent = "";
    }
  });

  document.querySelector("[data-blog-comment-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector(".blog-form-status");
    const submitButton = form.querySelector(".blog-submit");
    const data = Object.fromEntries(new FormData(form));

    if (!String(data.comment || "").trim() || !String(data.name || "").trim() || !String(data.email || "").trim()) {
      if (status) status.textContent = "Fill name, email and comment text.";
      return;
    }

    submitButton.disabled = true;
    if (status) status.textContent = "Sending comment...";

    try {
      const response = await fetch("/api/blog/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "Could not send this comment.");
      }

      form.reset();
      const textarea = form.querySelector("textarea");
      const target = form.querySelector("[data-blog-reply-target]");
      if (textarea) textarea.placeholder = "Your Comment *";
      if (target) {
        target.hidden = true;
        target.textContent = "";
      }
      if (status) status.textContent = result.message || "Thank you. Your comment is awaiting review.";
    } catch (error) {
      if (status) status.textContent = error.message || "Could not send this comment.";
    } finally {
      submitButton.disabled = false;
    }
  });

  const backTop = document.querySelector("[data-blog-back-top]");
  backTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener(
    "scroll",
    () => {
      backTop?.classList.toggle("is-visible", window.scrollY > 520);
    },
    { passive: true }
  );
})();

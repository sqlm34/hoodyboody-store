(function () {
  const gallery = document.querySelector("[data-blog-gallery]");

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

  const newsletter = document.querySelector("[data-blog-newsletter]");
  const newsletterForm = document.querySelector("[data-blog-newsletter-form]");
  const newsletterClose = document.querySelector("[data-blog-newsletter-close]");
  const newsletterDisable = document.querySelector("[data-blog-newsletter-disable]");
  const newsletterStatus = document.querySelector(".blog-newsletter-status");
  const newsletterKey = "hoodyboody-blog-newsletter-disabled";

  function hideNewsletter(disable = false) {
    if (!newsletter) return;
    newsletter.classList.remove("is-visible");
    newsletter.setAttribute("aria-hidden", "true");
    if (disable) {
      try {
        window.localStorage.setItem(newsletterKey, "true");
      } catch {
        return;
      }
    }
  }

  if (newsletter) {
    let disabled = false;
    try {
      disabled = window.localStorage.getItem(newsletterKey) === "true";
    } catch {
      disabled = false;
    }

    if (!disabled) {
      window.setTimeout(() => {
        newsletter.classList.add("is-visible");
        newsletter.setAttribute("aria-hidden", "false");
      }, 850);
    }
  }

  newsletterClose?.addEventListener("click", () => hideNewsletter(Boolean(newsletterDisable?.checked)));
  newsletterDisable?.addEventListener("change", () => {
    if (newsletterDisable.checked) hideNewsletter(true);
  });
  newsletterForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (newsletterStatus) newsletterStatus.textContent = "Thank you. Your first quote code is ready.";
    window.setTimeout(() => hideNewsletter(false), 1200);
  });

  document.querySelectorAll(".blog-reply-link").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.querySelector("[data-blog-comment-form]");
      const textarea = form?.querySelector("textarea");
      const name = button.dataset.replyTo || "this comment";
      if (textarea) textarea.placeholder = `Reply to ${name} *`;
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      textarea?.focus({ preventScroll: true });
    });
  });

  document.querySelector("[data-blog-comment-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector(".blog-form-status");
    form.reset();
    if (status) status.textContent = "Thank you. Your comment is awaiting review.";
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

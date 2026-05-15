const DEFAULT_CATEGORY_IMAGE = "assets/embroidered-collection.png";
const DEFAULT_CATEGORY_BACKGROUND = "linear-gradient(135deg, #f7f8f5 0%, #e4eee8 100%)";

const adminCategoriesLocked = document.querySelector("#adminCategoriesLocked");
const adminCategoriesLockedText = document.querySelector("#adminCategoriesLockedText");
const adminCategoriesDashboard = document.querySelector("#adminCategoriesDashboard");
const adminCategoriesList = document.querySelector("#adminCategoriesList");
const adminCategoriesNote = document.querySelector("#adminCategoriesNote");
const reloadCategories = document.querySelector("#reloadCategories");
const createCategory = document.querySelector("#createCategory");

let categories = [];
let categoryStatusTimer = 0;
let createMode = false;

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
  String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function setCategoriesStatus(message, isError = false, options = {}) {
  clearTimeout(categoryStatusTimer);
  adminCategoriesNote.textContent = message;
  adminCategoriesNote.classList.toggle("error", isError);
  adminCategoriesNote.classList.toggle("success", Boolean(message) && !isError);

  if (message && !options.persist) {
    categoryStatusTimer = setTimeout(() => {
      adminCategoriesNote.textContent = "";
      adminCategoriesNote.classList.remove("error", "success");
    }, 2600);
  }
}

function showLocked(message) {
  adminCategoriesDashboard.hidden = true;
  adminCategoriesLocked.hidden = false;
  adminCategoriesLockedText.textContent = message;
}

function showDashboard() {
  adminCategoriesLocked.hidden = true;
  adminCategoriesDashboard.hidden = false;
}

function getBlankCategory() {
  const nextOrder = categories.reduce((max, category) => Math.max(max, Number(category.sortOrder) || 0), 0) + 10;

  return {
    id: "",
    title: "New category",
    eyebrow: "collection",
    description: "Short category description for the homepage section.",
    image: DEFAULT_CATEGORY_IMAGE,
    focus: "center",
    background: DEFAULT_CATEGORY_BACKGROUND,
    sortOrder: nextOrder
  };
}

function getCategoryUrl(categoryId) {
  const staticPages = {
    outerwear: "outerwear.html",
    tops: "tops.html",
    accessories: "accessories.html"
  };

  return staticPages[categoryId] || `category.html?type=${encodeURIComponent(categoryId)}`;
}

function renderCategoryForm(category, mode = "edit") {
  const isCreate = mode === "create";
  const image = category.image || DEFAULT_CATEGORY_IMAGE;
  const focus = category.focus || "center";
  const background = category.background || DEFAULT_CATEGORY_BACKGROUND;

  return `
    <form class="admin-category-form" data-category-id="${escapeHtml(category.id)}" data-category-mode="${escapeHtml(mode)}">
      <div
        class="admin-category-preview"
        style="--category-image: url('${escapeHtml(image)}'); --focus: ${escapeHtml(focus)}; --category-bg: ${escapeHtml(background)}"
      >
        <span>${escapeHtml(category.eyebrow || "collection")}</span>
        <strong>${escapeHtml(category.title || "Category")}</strong>
      </div>
      <div class="admin-category-fields">
        <div class="admin-product-title">
          <strong>${escapeHtml(isCreate ? "Create new category" : category.title)}</strong>
          <span>${escapeHtml(isCreate ? "New section" : category.id)}</span>
        </div>
        <div class="form-grid">
          <label>
            Category name
            <input name="title" value="${escapeHtml(category.title || "")}" required />
          </label>
          <label>
            Slug
            <input name="id" value="${escapeHtml(category.id || "")}" placeholder="for example: dresses" ${isCreate ? "required" : "readonly"} />
          </label>
          <label>
            Small label
            <input name="eyebrow" value="${escapeHtml(category.eyebrow || "")}" required />
          </label>
          <label>
            Sort order
            <input name="sortOrder" type="number" step="1" value="${Number(category.sortOrder) || 100}" required />
          </label>
          <label class="full-span">
            Homepage and category description
            <textarea name="description" rows="3" required>${escapeHtml(category.description || "")}</textarea>
          </label>
          <label class="full-span">
            Category photo URL or site path
            <input name="image" value="${escapeHtml(image)}" required />
          </label>
          <label>
            Photo focus
            <select name="focus">
              ${["center", "50% 20%", "80% 50%", "50% 80%", "20% 50%", "38% 45%", "56% 35%", "44% 68%"]
                .map((option) => `<option value="${option}" ${focus === option ? "selected" : ""}>${option}</option>`)
                .join("")}
            </select>
          </label>
          <label>
            Section background
            <input name="background" value="${escapeHtml(background)}" required />
          </label>
        </div>
        <div class="admin-editor-actions">
          ${
            isCreate
              ? `<button class="button ghost dark" type="button" data-cancel-category>Create later</button>`
              : `<a class="button ghost dark" href="${getCategoryUrl(category.id)}" target="_blank" rel="noreferrer">Open page</a>
                 <button class="button ghost dark danger-button" type="button" data-delete-category="${escapeHtml(category.id)}">Delete category</button>`
          }
          <button class="button primary" type="submit">${isCreate ? "Create category" : "Save category"}</button>
        </div>
      </div>
    </form>
  `;
}

function renderCategories() {
  const createForm = createMode ? renderCategoryForm(getBlankCategory(), "create") : "";
  const categoryForms = categories.map((category) => renderCategoryForm(category)).join("");

  adminCategoriesList.innerHTML =
    createForm ||
    categoryForms
      ? `${createForm}${categoryForms}`
      : `<div class="summary-empty admin-product-empty">No categories yet. Create the first category section.</div>`;
}

async function loadCategories(options = {}) {
  if (!options.silent) setCategoriesStatus("Refreshing categories...");

  try {
    const data = await api("/api/admin/categories");
    categories = data.categories || [];
    showDashboard();
    renderCategories();
    if (!options.silent) setCategoriesStatus("Categories refreshed successfully.");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/auth.html?next=/admin-categories.html";
      return;
    }
    showLocked(error.message);
  }
}

adminCategoriesList.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = event.target.closest("[data-category-id]");
  const submitButton = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  const isCreate = form.dataset.categoryMode === "create";

  data.categoryId = form.dataset.categoryId || data.id;
  data.id = slugify(data.id || data.title);

  if (!data.id || !String(data.title || "").trim() || !String(data.description || "").trim()) {
    setCategoriesStatus("Fill category slug, title and description.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = isCreate ? "Creating..." : "Saving...";
  setCategoriesStatus(isCreate ? "Creating category..." : "Saving category...", false, { persist: true });

  api("/api/admin/categories", {
    method: isCreate ? "POST" : "PATCH",
    body: JSON.stringify(data)
  })
    .then((response) => {
      categories = response.categories || categories;
      createMode = false;
      renderCategories();
      setCategoriesStatus(isCreate ? "Category created successfully." : "Category saved successfully.");
    })
    .catch((error) => {
      setCategoriesStatus(error.message, true);
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.textContent = isCreate ? "Create category" : "Save category";
    });
});

adminCategoriesList.addEventListener("input", (event) => {
  const titleInput = event.target.closest('form[data-category-mode="create"] input[name="title"]');
  if (!titleInput) return;

  const form = titleInput.closest("form");
  const slugInput = form.querySelector('input[name="id"]');
  if (!slugInput.dataset.touched) slugInput.value = slugify(titleInput.value);
});

adminCategoriesList.addEventListener("change", (event) => {
  const slugInput = event.target.closest('form[data-category-mode="create"] input[name="id"]');
  if (slugInput) {
    slugInput.dataset.touched = "true";
    slugInput.value = slugify(slugInput.value);
  }
});

adminCategoriesList.addEventListener("click", (event) => {
  const cancelButton = event.target.closest("[data-cancel-category]");
  if (cancelButton) {
    createMode = false;
    renderCategories();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-category]");
  if (!deleteButton) return;

  const categoryId = deleteButton.dataset.deleteCategory;
  const category = categories.find((item) => item.id === categoryId);
  if (!window.confirm(`Delete category "${category?.title || categoryId}" from the site? Product cards will stay saved.`)) return;

  deleteButton.disabled = true;
  setCategoriesStatus("Deleting category...", false, { persist: true });
  api("/api/admin/categories", {
    method: "DELETE",
    body: JSON.stringify({ categoryId })
  })
    .then((response) => {
      categories = response.categories || [];
      renderCategories();
      setCategoriesStatus("Category removed from the site.");
    })
    .catch((error) => {
      deleteButton.disabled = false;
      setCategoriesStatus(error.message, true);
    });
});

reloadCategories.addEventListener("click", () => loadCategories());
createCategory.addEventListener("click", () => {
  createMode = true;
  renderCategories();
  adminCategoriesList.querySelector("form")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

loadCategories({ silent: true });

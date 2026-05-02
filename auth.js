async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request error");
  }

  return data;
}

function setNote(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
}

async function redirectIfLoggedIn() {
  try {
    const { user } = await api("/api/session");
    if (user) window.location.href = "account.html";
  } catch {
    return;
  }
}

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const note = document.querySelector("#registerNote");
  const data = Object.fromEntries(new FormData(form));

  if (data.password !== data.passwordConfirm) {
    setNote(note, "Passwords do not match.", true);
    return;
  }

  if (!window.NITKA_PHONE.validate(form.elements.phone)) {
    setNote(note, form.elements.phone.validationMessage, true);
    form.elements.phone.reportValidity();
    return;
  }

  try {
    await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        phone: window.NITKA_PHONE.getNumber(form.elements.phone),
        email: data.email,
        password: data.password
      })
    });
    setNote(note, "Cabinet created. Opening profile...");
    window.location.href = "account.html";
  } catch (error) {
    setNote(note, error.message, true);
  }
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const note = document.querySelector("#loginNote");
  const data = Object.fromEntries(new FormData(form));

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: data.email,
        password: data.password
      })
    });
    setNote(note, "Done. Opening cabinet...");
    window.location.href = "account.html";
  } catch (error) {
    setNote(note, error.message, true);
  }
});

redirectIfLoggedIn();

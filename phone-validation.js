(function () {
  const instances = new WeakMap();
  const phoneErrorMessages = {
    1: "Invalid country code.",
    2: "Phone number is too short.",
    3: "Phone number is too long.",
    4: "Phone number is not valid."
  };

  function setPhoneValidity(input, message = "") {
    input.setCustomValidity(message);
    input.closest("label")?.classList.toggle("phone-error", Boolean(message));
  }

  function getPhoneMessage(instance) {
    if (!instance) return "Phone validation is not ready yet.";
    const errorCode = instance.getValidationError?.();
    return phoneErrorMessages[errorCode] || "Enter a valid phone number.";
  }

  function initPhoneInputs(scope = document) {
    if (!window.intlTelInput) return [];

    return Array.from(scope.querySelectorAll('input[type="tel"], input[name="phone"]')).map((input) => {
      if (instances.has(input)) return instances.get(input);

      const instance = window.intlTelInput(input, {
        initialCountry: "us",
        nationalMode: true,
        strictMode: true,
        autoPlaceholder: "aggressive",
        allowedNumberTypes: ["MOBILE", "FIXED_LINE"]
      });

      instances.set(input, instance);
      input.setAttribute("maxlength", "24");
      input.setAttribute("inputmode", "tel");

      input.addEventListener("input", () => {
        if (input.value.trim()) validatePhoneInput(input, { quiet: true });
        else setPhoneValidity(input);
        input.dispatchEvent(new CustomEvent("phonevalidationchange", { bubbles: true }));
      });
      input.addEventListener("countrychange", () => {
        setPhoneValidity(input);
        input.dispatchEvent(new CustomEvent("phonevalidationchange", { bubbles: true }));
      });
      input.addEventListener("blur", () => {
        if (!input.value.trim()) {
          setPhoneValidity(input);
          input.dispatchEvent(new CustomEvent("phonevalidationchange", { bubbles: true }));
          return;
        }

        setPhoneValidity(input, instance.isValidNumber() ? "" : getPhoneMessage(instance));
        input.dispatchEvent(new CustomEvent("phonevalidationchange", { bubbles: true }));
      });

      queueMicrotask(() => {
        input.dispatchEvent(new CustomEvent("phonevalidationchange", { bubbles: true }));
      });

      return instance;
    });
  }

  function getPhoneInstance(input) {
    return input ? instances.get(input) || null : null;
  }

  function validatePhoneInput(input, options = {}) {
    const instance = getPhoneInstance(input);
    if (!input || !input.value.trim()) {
      if (!options.quiet) setPhoneValidity(input, input?.required ? "Enter a phone number." : "");
      return !input?.required;
    }

    if (!instance || !instance.isValidNumber()) {
      if (!options.quiet) setPhoneValidity(input, getPhoneMessage(instance));
      return false;
    }

    setPhoneValidity(input);
    return true;
  }

  function getPhoneNumber(input) {
    const instance = getPhoneInstance(input);
    if (!instance || !instance.isValidNumber()) return input?.value.trim() || "";
    return instance.getNumber();
  }

  window.NITKA_PHONE = {
    init: initPhoneInputs,
    validate: validatePhoneInput,
    getNumber: getPhoneNumber,
    getInstance: getPhoneInstance
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initPhoneInputs());
  } else {
    initPhoneInputs();
  }
})();

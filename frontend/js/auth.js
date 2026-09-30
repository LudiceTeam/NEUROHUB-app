import { api, tokens } from "./api.js";
import { config } from "./config.js";
import { h, errorText } from "./dom.js";

export function renderLogin(root, onSuccess) {
  const error = h("p", { class: "form-error", role: "alert" });
  const card = h("div", { class: "auth-card" });

  const showError = (e) => { error.textContent = e ? errorText(e) : ""; };
  const finish = (data) => { tokens.set(data); onSuccess(); };

  function emailStep(prefill = "") {
    const email = h("input", {
      class: "input", type: "email", required: true, autocomplete: "email",
      placeholder: "you@example.com", value: prefill,
    });
    const submit = h("button", { class: "btn primary block", type: "submit" }, "Continue with email");

    const form = h("form", {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        showError();
        submit.disabled = true;
        submit.textContent = "Sending code…";
        try {
          await api.sendCode(email.value.trim());
          codeStep(email.value.trim());
        } catch (err) {
          // A code that is still valid can be entered right away.
          if (String(err.message).includes("Code already sent")) codeStep(email.value.trim());
          showError(err);
        } finally {
          submit.disabled = false;
          submit.textContent = "Continue with email";
        }
      },
    }, h("label", { class: "label" }, "Email", email), submit);

    const google = config.GOOGLE_CLIENT_ID ? googleBlock() : null;

    card.replaceChildren(
      h("div", { class: "brand" }, h("img", { src: "logo.png", alt: "", width: "56", height: "56" }), h("span", {}, "Veora")),
      h("h1", {}, "All AI in one place"),
      h("p", { class: "muted" }, "Sign in to chat with 40+ models from OpenAI, Anthropic, Google, Meta and more."),
      google,
      google && h("div", { class: "divider" }, h("span", {}, "or")),
      form,
      error,
    );
    email.focus();
  }

  function codeStep(email) {
    const code = h("input", {
      class: "input code", inputmode: "numeric", autocomplete: "one-time-code",
      pattern: "[0-9]{6}", maxlength: "6", required: true, placeholder: "••••••",
    });
    const submit = h("button", { class: "btn primary block", type: "submit" }, "Sign in");

    const verify = async () => {
      showError();
      submit.disabled = true;
      try {
        finish(await api.checkCode(email, code.value));
      } catch (err) {
        showError(err);
        submit.disabled = false;
        code.select();
      }
    };

    code.addEventListener("input", () => {
      code.value = code.value.replace(/\D/g, "").slice(0, 6);
      if (code.value.length === 6) verify();
    });

    card.replaceChildren(
      h("div", { class: "brand" }, h("img", { src: "logo.png", alt: "", width: "56", height: "56" }), h("span", {}, "Veora")),
      h("h1", {}, "Check your email"),
      h("p", { class: "muted" }, "We sent a 6-digit code to ", h("strong", {}, email), "."),
      h("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); verify(); } },
        h("label", { class: "label" }, "Code", code), submit),
      h("button", { class: "btn link", type: "button", onclick: () => { showError(); emailStep(email); } }, "Use a different email"),
      error,
    );
    code.focus();
  }

  function googleBlock() {
    const slot = h("div", { class: "google-slot" });
    loadGoogle().then(() => {
      window.google.accounts.id.initialize({
        client_id: config.GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          showError();
          try { finish(await api.googleAuth(credential)); } catch (err) { showError(err); }
        },
      });
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      window.google.accounts.id.renderButton(slot, {
        theme: dark ? "filled_black" : "outline", size: "large", shape: "pill", width: 320, text: "continue_with",
      });
    }).catch(() => slot.remove());
    return slot;
  }

  root.replaceChildren(h("main", { class: "auth" }, card));
  emailStep();
}

let googleScript;
function loadGoogle() {
  googleScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
  return googleScript;
}

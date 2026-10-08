import { api, tokens } from "./api.js";
import { config } from "./config.js";
import { h, errorText } from "./dom.js";

// mode: "login" | "signup" (same email-code flow; only the copy differs). onBack returns to the landing page.
export function renderLogin(root, onSuccess, { mode = "login", onBack } = {}) {
  const error = h("p", { class: "form-error", role: "alert" });
  const card = h("div", { class: "auth-card" });
  const signup = mode === "signup";

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


    card.replaceChildren(
      h("div", { class: "brand" }, h("img", { src: "logo.png", alt: "", width: "56", height: "56" }), h("span", {}, "Veora")),
      h("h1", {}, signup ? "Create your account" : "Welcome back"),
      h("p", { class: "muted" }, signup
        ? "Get 5 free requests every day across 40+ models from OpenAI, Anthropic, Google, Meta and more."
        : "Sign in to continue to your chats."),
      providerButtons(),
      h("div", { class: "divider" }, h("span", {}, "or")),
      form,
      error,
      h("p", { class: "auth-switch muted" }, signup ? "Already have an account? " : "New to Veora? ",
        h("a", { href: signup ? "#login" : "#signup" }, signup ? "Log in" : "Create an account")),
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

  function providerButtons() {
    // Apple sign-in is a placeholder until its site endpoint is ready.
    const soon = () => { error.textContent = "Coming soon. Sign in with email for now."; };
    return h("div", { class: "stack providers" },
      googleButton(),
      h("button", { class: "btn block provider", type: "button", onclick: soon },
        h("span", { class: "provider-icon", html: APPLE_SVG }), "Continue with Apple"),
    );
  }

  // Our styled button with Google's real (invisible) button on top of it: Google Identity
  // Services only hands out an ID token from its own button, so the click has to land there.
  function googleButton() {
    const text = h("span", {}, "Continue with Google");
    const btn = h("button", { class: "btn block provider", type: "button" },
      h("span", { class: "provider-icon", html: GOOGLE_SVG }), text);
    const overlay = h("div", { class: "google-overlay" });
    const wrap = h("div", { class: "provider-wrap" }, btn, overlay);

    if (!config.GOOGLE_CLIENT_ID) {
      btn.onclick = () => showError(new Error("Google sign-in isn't configured yet. Sign in with email for now."));
      return wrap;
    }

    btn.onclick = () => showError(new Error("Google sign-in is still loading. Try again in a second."));

    const onCredential = async ({ credential }) => {
      showError();
      wrap.classList.add("busy");
      text.textContent = "Signing in…";
      try {
        finish(await api.googleAuth(credential));
      } catch (err) {
        showError(err);
        wrap.classList.remove("busy");
        text.textContent = "Continue with Google";
      }
    };

    loadGoogle().then(() => {
      const gis = window.google.accounts.id;
      gis.initialize({ client_id: config.GOOGLE_CLIENT_ID, callback: onCredential, ux_mode: "popup" });
      // Wait a frame so the card is laid out and the button has its real width.
      requestAnimationFrame(() => {
        gis.renderButton(overlay, {
          type: "standard", size: "large", shape: "pill", text: "continue_with",
          width: Math.min(400, Math.round(btn.offsetWidth) || 320),
        });
        wrap.classList.add("ready");
      });
      // If a click misses the overlay (e.g. at the very edge), fall back to the One Tap prompt.
      btn.onclick = () => gis.prompt();
    }).catch(() => {
      btn.onclick = () => showError(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
    });

    return wrap;
  }

  const back = onBack && h("button", { class: "auth-back", type: "button", onclick: onBack }, "← Back to home");
  root.replaceChildren(h("main", { class: "auth" }, back || null, card));
  emailStep();
}

let googleScript;
function loadGoogle() {
  googleScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve() : reject(new Error("GIS unavailable")));
    s.onerror = () => { googleScript = null; reject(new Error("GIS failed to load")); };
    document.head.append(s);
  });
  return googleScript;
}

const GOOGLE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>`;
const APPLE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 12.64c-.02-2.2 1.8-3.26 1.88-3.31a4.04 4.04 0 0 0-3.18-1.72c-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76a4.24 4.24 0 0 0-3.59 2.18c-1.53 2.66-.39 6.59 1.1 8.74.73 1.05 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13a9.4 9.4 0 0 0 1.2-2.47 3.83 3.83 0 0 1-2.3-3.51zM14.2 6.17c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.55 1.31-.56.64-1.05 1.68-.92 2.68.97.07 1.96-.49 2.57-1.21z"/></svg>`;

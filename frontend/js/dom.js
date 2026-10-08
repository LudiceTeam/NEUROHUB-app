export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function icon(name) {
  const paths = {
    plus: "M12 5v14M5 12h14",
    send: "M5 12h14M13 6l6 6-6 6",
    clip: "M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7L10 17.7a1.7 1.7 0 01-2.4-2.4l8-8",
    dots: "M12 6h.01M12 12h.01M12 18h.01",
    menu: "M4 6h16M4 12h16M4 18h16",
    close: "M6 6l12 12M18 6L6 18",
    pin: "M9 4h6l-1 6 4 4H6l4-4-1-6zM12 14v6",
    copy: "M9 9h10v10H9zM5 15V5h10",
    check: "M5 13l4 4L19 7",
    translate: "M4 5h8M8 3v2M10 5c-.6 3.6-2.6 6.6-6 8M6 8.5c1 2 2.6 3.6 5 4.5M13 20l4-9 4 9M14.4 17h5.2",
    chevronDown: "M6 9l6 6 6-6",
    download: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
    external: "M14 5h5v5M19 5l-8 8M18 14v5H5V6h5",
    sidebar: "M4 5h16v14H4zM9 5v14",
    folder: "M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z",
    folderPlus: "M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5zM12 10.5v5M9.5 13h5",
    chevron: "M9 6l6 6-6 6",
    edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
    trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", paths[name]);
  svg.append(p);
  return svg;
}

const ERRORS = {
  "Doesnt have requests": "You're out of requests for this model. They refill automatically, or upgrade your plan.",
  "Access denied": "Your account is temporarily restricted.",
  "Invalid google token": "Google sign-in failed. Try again or use email.",
  "Email is not verified": "Your Google account email isn't verified.",
  "Not enough credits": "Not enough credits left today for this model. Pick a cheaper model or upgrade your plan.",
  "Too many photos for your plan": "Your plan allows fewer photos per message. Upgrade to send up to 5.",
  "Invalid GPT name": "Give the GPT a name up to 60 characters.",
  "Invalid GPT instructions": "Add instructions — up to 4000 characters.",
  "GPT limit": "You can have up to 20 custom GPTs. Delete one to add another.",
  "GPT not found": "This GPT no longer exists.",
  "Upgrade required": "This model is included with every paid plan.",
  "No video credits": "You've used this month's video generations. They refill monthly — or upgrade for more.",
  "Already subscribed": "You already have a plan. Cancel it in “Manage subscription” before switching.",
  "No Stripe subscription": "We couldn't find a subscription bought on this site for your account.",
  "Invalid subscription plan": "This plan isn't available.",
  "Invalid plan": "Cloning your voice is included with Basic and higher plans.",
  "Limit error": "You've reached your plan's voice limit. Delete a voice or upgrade your plan.",
  "Audio file too large": "That recording is too large. Use a shorter clip.",
  "Unsupported audio format": "This audio format isn't supported. Try MP3 or WAV.",
  "Audio file is empty": "The recording is empty. Try again.",
  "Voice not found": "This voice no longer exists. Pick another one.",
  "Invalid name": "Give the voice a name up to 40 characters.",
  "Text is too long": "That's too long to read aloud. Voice models take up to 3000 characters.",
  "Nothing to voice": "Type some text to read aloud.",
  "Voice models don't accept images": "Voice models don't accept images. Pick another model to send photos.",
  "Invalid code": "That code isn't right. Check your email and try again.",
  "Code already sent": "A code was already sent. Check your inbox (and spam).",
  "Error while generating": "The model couldn't generate a response. Try again or pick another model.",
  "Invalid model name": "This model isn't available.",
  "To many photos": "You can attach up to 5 photos.",
  "Invalid API key": "The site isn't configured with the API key (see frontend/js/config.js).",
  "Token expired": "Your session expired. Please sign in again.",
  "Rate limit exceeded": "Too many requests. Wait a minute and try again.",
};

export function errorText(e) {
  const msg = e?.message || String(e);
  for (const [key, text] of Object.entries(ERRORS)) if (msg.includes(key)) return text;
  if (e?.status === 429) return ERRORS["Rate limit exceeded"];
  if (e instanceof TypeError) return "Can't reach the server. Check your connection.";
  return msg;
}

let toastTimer;
export function toast(message, kind = "error") {
  let el = document.querySelector(".toast");
  if (!el) {
    el = h("div", { class: "toast", role: "status" });
    document.body.append(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}

const LANG_NAMES = {
  js: "JavaScript", javascript: "JavaScript", jsx: "JSX", ts: "TypeScript", typescript: "TypeScript", tsx: "TSX",
  py: "Python", python: "Python", rb: "Ruby", ruby: "Ruby", go: "Go", golang: "Go", rs: "Rust", rust: "Rust",
  java: "Java", kt: "Kotlin", kotlin: "Kotlin", swift: "Swift", c: "C", cpp: "C++", "c++": "C++", cs: "C#", csharp: "C#",
  php: "PHP", sh: "Shell", bash: "Bash", zsh: "Zsh", shell: "Shell", ps1: "PowerShell", powershell: "PowerShell",
  html: "HTML", xml: "XML", css: "CSS", scss: "SCSS", json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
  sql: "SQL", md: "Markdown", markdown: "Markdown", dockerfile: "Dockerfile", diff: "Diff", plaintext: "Text", text: "Text",
};

function languageName(lang) {
  if (!lang) return "Code";
  return LANG_NAMES[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1);
}

// Wraps a <pre> in a card with a language label and copy button, and highlights it with highlight.js.
function enhanceCodeBlock(pre) {
  const code = pre.querySelector("code");
  if (!code) return;
  const requested = [...code.classList].find((c) => c.startsWith("language-"))?.slice(9);
  const { hljs } = window;
  let lang = requested;
  if (hljs) {
    if (requested && !hljs.getLanguage(requested)) code.className = "";
    hljs.highlightElement(code);
    // highlight.js adds language-<detected> when it had to guess.
    lang = requested || [...code.classList].find((c) => c.startsWith("language-"))?.slice(9);
  }

  const label = h("span", {}, "Copy");
  const btn = h("button", { class: "code-copy", type: "button", "aria-label": "Copy code" }, icon("copy"), label);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.innerText);
      btn.replaceChildren(icon("check"), h("span", {}, "Copied"));
      btn.classList.add("done");
      setTimeout(() => { btn.replaceChildren(icon("copy"), label); btn.classList.remove("done"); }, 1600);
    } catch { /* clipboard blocked */ }
  });

  const block = h("div", { class: "code-block" },
    h("div", { class: "code-head" }, h("span", { class: "code-lang" }, languageName(lang)), btn));
  pre.replaceWith(block);
  block.append(pre);
}

export function markdown(text) {
  const { marked, DOMPurify } = window;
  if (!marked || !DOMPurify) return h("div", { class: "md" }, h("p", {}, text));
  const html = DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }));
  const el = h("div", { class: "md", html });
  el.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  el.querySelectorAll("pre").forEach(enhanceCodeBlock);
  return el;
}

// Minimal modal on top of <dialog>. Resolves with the value passed to close(), or null.
export function modal(title, buildBody, { wide = false } = {}) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: `modal${wide ? " wide" : ""}` });
    const close = (value = null) => { dlg.close(); dlg.remove(); resolve(value); };
    dlg.append(
      h("header", {},
        h("h2", {}, title),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: () => close() }, icon("close"))),
      buildBody(close),
    );
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function promptModal(title, { value = "", placeholder = "", confirm = "Save" } = {}) {
  return modal(title, (close) => {
    const input = h("input", { class: "input", value, placeholder, maxlength: "120" });
    const form = h("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); close(input.value.trim() || null); } },
      input,
      h("div", { class: "row end" },
        h("button", { class: "btn ghost", type: "button", onclick: () => close() }, "Cancel"),
        h("button", { class: "btn primary", type: "submit" }, confirm)));
    setTimeout(() => { input.focus(); input.select(); });
    return form;
  });
}

export function confirmModal(title, text, { confirm = "Delete", danger = true } = {}) {
  return modal(title, (close) => h("div", { class: "stack" },
    h("p", { class: "muted" }, text),
    h("div", { class: "row end" },
      h("button", { class: "btn ghost", type: "button", onclick: () => close(false) }, "Cancel"),
      h("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "button", onclick: () => close(true) }, confirm))));
}

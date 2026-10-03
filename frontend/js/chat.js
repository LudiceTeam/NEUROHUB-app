import { api } from "./api.js";
import { createModelPicker, modelLabel, VOICE_MODELS } from "./model-picker.js";
import { h, icon, toast, errorText, markdown, promptModal, confirmModal } from "./dom.js";
import { openProfile } from "./profile.js";
import { setupSidebar } from "./sidebar.js";

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const PINNED_KEY = "veora_pinned";

export function renderApp(root, logout) {
  const state = {
    chats: [],            // [[chat_id, title], ...] in backend order (pinned first)
    chatId: null,
    messages: [],         // { role: "user"|"assistant", text?, images?, image?, video?, model?, pending?, error? }
    model: "auto",
    profile: null,
    attachments: [],      // File[]
    sending: false,
    pinned: new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || "[]")),
  };

  // ---------- layout ----------
  const chatList = h("nav", { class: "chat-list", "aria-label": "Chats" });
  const profileBtn = h("button", { class: "profile-btn", type: "button", onclick: () => openProfile(state, { logout, onChange: loadProfile }) });
  const sidebar = h("aside", { class: "sidebar" },
    h("div", { class: "sidebar-top" },
      h("div", { class: "brand small" }, h("img", { src: "logo.png", alt: "", width: "28", height: "28" }), h("span", {}, "Veora")),
      h("button", { class: "icon-btn only-desktop", type: "button", "aria-label": "Close sidebar", title: "Close sidebar (⌘⇧S)", onclick: () => sidebarCtl.collapse() }, icon("sidebar")),
      h("button", { class: "icon-btn only-mobile", type: "button", "aria-label": "Close menu", onclick: () => toggleSidebar(false) }, icon("close"))),
    h("button", { class: "btn new-chat", type: "button", onclick: newChat }, icon("plus"), "New chat"),
    chatList,
    profileBtn,
  );
  const scrim = h("div", { class: "scrim", onclick: () => toggleSidebar(false) });

  const picker = createModelPicker({ value: state.model, onSelect: onModelChange });

  const title = h("div", { class: "chat-title" });
  const header = h("header", { class: "topbar" },
    h("button", { class: "icon-btn only-mobile", type: "button", "aria-label": "Open menu", onclick: () => toggleSidebar(true) }, icon("menu")),
    h("button", { class: "icon-btn when-collapsed", type: "button", "aria-label": "Open sidebar", title: "Open sidebar (⌘⇧S)", onclick: () => sidebarCtl.expand() }, icon("sidebar")),
    h("button", { class: "icon-btn when-collapsed", type: "button", "aria-label": "New chat", title: "New chat", onclick: newChat }, icon("plus")),
    title,
    picker.el);

  const thread = h("div", { class: "thread", "aria-live": "polite" });
  const scroller = h("div", { class: "scroller" }, thread);

  const textarea = h("textarea", {
    class: "composer-input", rows: "1", placeholder: "Message Veora…", "aria-label": "Message",
    oninput: autosize,
    onkeydown: (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    },
    onpaste: (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); addFiles(files); }
    },
  });
  const fileInput = h("input", {
    type: "file", accept: "image/*", multiple: true, hidden: true,
    onchange: () => { addFiles([...fileInput.files]); fileInput.value = ""; },
  });
  const previews = h("div", { class: "previews" });
  const attachBtn = h("button", { class: "icon-btn", type: "button", "aria-label": "Attach images", onclick: () => fileInput.click() }, icon("clip"));
  const sendBtn = h("button", { class: "send-btn", type: "submit", "aria-label": "Send" }, icon("send"));
  const composer = h("form", { class: "composer", onsubmit: (e) => { e.preventDefault(); send(); } },
    previews,
    h("div", { class: "composer-row" },
      attachBtn, textarea, fileInput, sendBtn),
  );
  const quota = h("p", { class: "quota" });

  const main = h("main", { class: "main" }, header, scroller, h("div", { class: "composer-wrap" }, composer, quota));
  const shell = h("div", { class: "shell" }, sidebar, scrim, main);
  root.replaceChildren(shell);
  const sidebarCtl = setupSidebar(shell);

  // Drag & drop images anywhere on the chat.
  main.addEventListener("dragover", (e) => { e.preventDefault(); main.classList.add("dragging"); });
  main.addEventListener("dragleave", (e) => { if (e.target === main) main.classList.remove("dragging"); });
  main.addEventListener("drop", (e) => {
    e.preventDefault();
    main.classList.remove("dragging");
    addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });

  // ---------- rendering ----------
  function toggleSidebar(open) { shell.classList.toggle("sidebar-open", open); }

  function renderChats() {
    if (!state.chats.length) {
      chatList.replaceChildren(h("p", { class: "empty-list" }, "No chats yet"));
      return;
    }
    chatList.replaceChildren(...state.chats.map(([id, name]) => {
      const pinned = state.pinned.has(id);
      const item = h("div", { class: `chat-item${id === state.chatId ? " active" : ""}` },
        h("button", { class: "chat-link", type: "button", title: name, onclick: () => openChat(id) },
          pinned && icon("pin"), h("span", {}, name || "New chat")),
        h("button", { class: "icon-btn chat-more", type: "button", "aria-label": "Chat options", onclick: (e) => { e.stopPropagation(); chatMenu(item, id, name); } }, icon("dots")));
      return item;
    }));
  }

  function chatMenu(item, id, name) {
    document.querySelector(".menu")?.remove();
    const pinned = state.pinned.has(id);
    const menu = h("div", { class: "menu", role: "menu" },
      h("button", { type: "button", onclick: () => rename(id, name) }, "Rename"),
      h("button", { type: "button", onclick: () => togglePin(id, !pinned) }, pinned ? "Unpin" : "Pin"),
      h("button", { type: "button", class: "danger", onclick: () => remove(id) }, "Delete"));
    item.append(menu);
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }));
  }

  function renderTitle() {
    const current = state.chats.find(([id]) => id === state.chatId);
    title.textContent = current ? current[1] : "New chat";
  }

  function renderThread() {
    if (!state.messages.length) {
      const name = state.profile?.Name ? `, ${state.profile.Name}` : "";
      thread.replaceChildren(h("div", { class: "welcome" },
        h("img", { src: "logo.png", alt: "", width: "64", height: "64" }),
        h("h1", {}, `How can I help${name}?`),
        h("p", { class: "muted" }, "Pick a model at the top or leave it on Auto — Veora will choose the best one for your request.")));
      return;
    }
    thread.replaceChildren(...state.messages.map(renderMessage));
    requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  }

  function renderMessage(m) {
    if (m.role === "user") {
      return h("div", { class: "msg user" },
        m.images?.length && h("div", { class: "msg-images" }, m.images.map((src) => h("a", { href: src, target: "_blank", rel: "noopener" }, h("img", { src, alt: "Attached image", loading: "lazy" })))),
        m.text && h("div", { class: "bubble" }, m.text));
    }
    const body = [];
    if (m.pending) body.push(h("div", { class: "typing", "aria-label": "Generating" }, h("span"), h("span"), h("span")));
    if (m.error) body.push(h("p", { class: "msg-error" }, m.error));
    if (m.text) body.push(markdown(m.text));
    if (m.image) body.push(h("a", { href: m.image, target: "_blank", rel: "noopener", class: "gen-image" }, h("img", { src: m.image, alt: "Generated image", loading: "lazy" })));
    if (m.audio) body.push(h("div", { class: "gen-audio" },
      h("audio", { src: m.audio, controls: true, preload: "metadata" }),
      h("a", { class: "btn ghost small", href: m.audio, download: "", target: "_blank", rel: "noopener" }, "Download")));
    if (m.video) body.push(h("video", { src: m.video, controls: true, playsinline: true, class: "gen-video" }));
    if (m.videoPending) body.push(h("p", { class: "muted" }, "🎬 Your video is being generated. Open this chat again in a few minutes to see it."));
    return h("div", { class: "msg assistant" },
      h("div", { class: "avatar" }, h("img", { src: "logo.png", alt: "" })),
      h("div", { class: "msg-body" },
        m.model && h("div", { class: "msg-model" }, modelLabel(m.model)),
        body));
  }

  function renderPreviews() {
    previews.replaceChildren(...state.attachments.map((file, i) => {
      const url = URL.createObjectURL(file);
      return h("div", { class: "preview" },
        h("img", { src: url, alt: file.name, onload: () => URL.revokeObjectURL(url) }),
        h("button", { type: "button", "aria-label": "Remove image", onclick: () => { state.attachments.splice(i, 1); renderPreviews(); } }, icon("close")));
    }));
  }

  function renderQuota() {
    const p = state.profile;
    if (!p) { quota.textContent = ""; return; }
    quota.textContent = `${p.Requests ?? 0} requests · ${p["Nano Requests"] ?? 0} premium requests left`;
  }

  function renderProfileBtn() {
    const p = state.profile || {};
    const pic = p["Profile Picture"];
    profileBtn.replaceChildren(
      pic ? h("img", { class: "avatar-img", src: pic, alt: "" }) : h("span", { class: "avatar-img initials" }, (p.Name || "?").slice(0, 1).toUpperCase()),
      h("span", { class: "profile-meta" }, h("strong", {}, p.Name || "Account"), h("small", {}, planName(p))));
  }

  // Voice models read the text aloud and don't take images.
  function updateComposerHint() {
    const voice = VOICE_MODELS.has(state.model);
    textarea.placeholder = voice ? "Text to read aloud…" : "Message Veora…";
    attachBtn.disabled = voice;
    attachBtn.title = voice ? "Voice models don't accept images" : "";
    if (voice && state.attachments.length) {
      state.attachments = [];
      renderPreviews();
    }
  }

  function autosize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 220) + "px";
  }

  function setSending(value) {
    state.sending = value;
    sendBtn.disabled = value;
    composer.classList.toggle("busy", value);
  }

  // ---------- data ----------
  async function loadProfile() {
    try {
      state.profile = await api.profile();
    } catch (e) {
      if (e.status !== 401) toast(errorText(e));
    }
    renderProfileBtn();
    renderQuota();
    if (!state.messages.length) renderThread();
  }

  async function loadChats() {
    try {
      const data = (await api.chats()) || {};
      state.chats = Object.entries(data);
    } catch (e) {
      toast(errorText(e));
    }
    renderChats();
    renderTitle();
  }

  async function loadModel() {
    try {
      const { model_name } = await api.getModel();
      if (model_name) state.model = model_name;
      updateComposerHint();
    } catch {
      // Needs X-API-KEY; without it we just keep the default.
    }
    picker.setValue(state.model);
  }

  async function onModelChange(id) {
    try {
      await api.changeModel(id);
      state.model = id;
      updateComposerHint();
    } catch (e) {
      toast(errorText(e));
      throw e;
    }
  }

  async function openChat(id) {
    toggleSidebar(false);
    state.chatId = id;
    renderChats();
    renderTitle();
    thread.replaceChildren(h("div", { class: "loading" }, h("div", { class: "typing" }, h("span"), h("span"), h("span"))));
    try {
      const data = await api.messages(id);
      if (state.chatId !== id) return;
      state.messages = (data?.result || []).flatMap(fromHistory);
    } catch (e) {
      state.messages = [];
      toast(errorText(e));
    }
    renderThread();
  }

  function newChat() {
    toggleSidebar(false);
    state.chatId = null;
    state.messages = [];
    renderChats();
    renderTitle();
    renderThread();
    textarea.focus();
  }

  async function rename(id, current) {
    const name = await promptModal("Rename chat", { value: current });
    if (!name) return;
    try {
      await api.renameChat(id, name);
      await loadChats();
    } catch (e) { toast(errorText(e)); }
  }

  async function togglePin(id, value) {
    try {
      await api.pinChat(id, value);
      value ? state.pinned.add(id) : state.pinned.delete(id);
      localStorage.setItem(PINNED_KEY, JSON.stringify([...state.pinned]));
      await loadChats();
    } catch (e) { toast(errorText(e)); }
  }

  async function remove(id) {
    const ok = await confirmModal("Delete chat?", "This chat and all its messages and images will be permanently deleted.");
    if (!ok) return;
    try {
      await api.deleteChat(id);
      state.pinned.delete(id);
      localStorage.setItem(PINNED_KEY, JSON.stringify([...state.pinned]));
      if (state.chatId === id) newChat();
      await loadChats();
    } catch (e) { toast(errorText(e)); }
  }

  function addFiles(files) {
    if (VOICE_MODELS.has(state.model)) {
      if (files.length) toast("Voice models don't accept images. Pick another model to send photos.");
      return;
    }
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_IMAGE_SIZE) { toast(`${f.name} is larger than 5 MB`); continue; }
      if (state.attachments.length >= MAX_IMAGES) { toast("You can attach up to 5 images"); break; }
      state.attachments.push(f);
    }
    renderPreviews();
    textarea.focus();
  }

  async function send() {
    const text = textarea.value.trim();
    const files = [...state.attachments];
    if (state.sending || (!text && !files.length)) return;

    setSending(true);
    const knownChats = new Set(state.chats.map(([id]) => id));
    const userMsg = { role: "user", text, images: files.map((f) => URL.createObjectURL(f)) };
    const reply = { role: "assistant", pending: true };
    state.messages.push(userMsg, reply);
    textarea.value = "";
    autosize();
    state.attachments = [];
    renderPreviews();
    renderThread();

    try {
      const res = files.length
        ? await api.askPhoto(state.chatId, text, files)
        : await api.askText(state.chatId, text);
      applyReply(reply, res);
    } catch (e) {
      reply.error = errorText(e);
    }
    reply.pending = false;
    renderThread();
    setSending(false);

    // The backend doesn't return the id of a newly created chat; find it by diffing the list.
    await loadChats();
    if (!state.chatId) {
      const created = state.chats.find(([id]) => !knownChats.has(id));
      if (created) {
        state.chatId = created[0];
        renderChats();
        renderTitle();
      }
    }
    loadProfile();
  }

  function applyReply(reply, res) {
    reply.model = state.model === "auto" ? null : state.model;
    if (!res || typeof res !== "object") { reply.error = "Empty response from server."; return; }
    if (res.audio) reply.audio = res.audio;
    else if (res.image) reply.image = res.image;
    else if (res.video_task_id) reply.videoPending = true;
    else if (res.message === "error") reply.error = "This chat is not available.";
    else if (res.message === "None") reply.error = "Account not found. Try signing in again.";
    else if (typeof res.message === "string") reply.text = res.message;
    else reply.error = "Unexpected response from server.";
  }

  // ---------- boot ----------
  renderChats();
  renderTitle();
  renderThread();
  renderProfileBtn();
  loadProfile();
  loadChats();
  loadModel();
  textarea.focus();
}

function fromHistory(m) {
  const out = [];
  if (m.message || m.image_message?.length) {
    out.push({ role: "user", text: m.message && m.message !== "None" ? m.message : "", images: m.image_message || [] });
  }
  const reply = { role: "assistant", model: m.model };
  if (m.response) reply.text = m.response;
  if (m.image_response) {
    if (/\.mp4(\?|$)/i.test(m.image_response)) reply.video = m.image_response;
    else if (/\.mp3(\?|$)/i.test(m.image_response)) reply.audio = m.image_response;
    else reply.image = m.image_response;
  }
  if (!m.response && !m.image_response) reply.videoPending = true;
  out.push(reply);
  return out;
}

export function planName(p) {
  if (!p) return "";
  const plans = ["Elite", "Max", "Premium", "Plus", "Basic", "Starter"];
  return plans.find((k) => p[k]) ? `${plans.find((k) => p[k])} plan` : "Free plan";
}

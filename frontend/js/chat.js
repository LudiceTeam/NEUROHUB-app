import { api } from "./api.js";
import { createModelPicker, modelLabel, VOICE_MODELS, IMAGE_MODELS, VIDEO_MODELS } from "./model-picker.js";
import { FREE_MODELS } from "./config.js";
import { h, icon, toast, errorText, markdown, promptModal, confirmModal } from "./dom.js";
import { openProfile } from "./profile.js";
import { setupSidebar } from "./sidebar.js";
import { createTtsStudio } from "./tts-studio.js";
import { moveToFolderModal, tagsModal } from "./folders.js";
import { applyAppearance, cachedPerks, cachePerks, hasPerks, loadPrefs } from "./appearance.js";
import { LANGUAGES, languageName, preferredLanguage, setPreferredLanguage, translateMarkdown } from "./translate.js";
import { openLightbox } from "./lightbox.js";
import { audioCard } from "./audio-card.js";
import { handleBillingReturn, openPlans } from "./billing.js";
import { createVoiceInput } from "./voice-input.js";

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const PINNED_KEY = "veora_pinned";
const SUGGESTIONS = [
  ["💡", "Explain quantum computing like I'm 12"],
  ["🐍", "Write a Python script that renames files by date"],
  ["✈️", "Plan a 3-day trip to Tokyo on a budget"],
  ["✍️", "Help me write a friendly follow-up email"],
];
const EXPANDED_KEY = "veora_open_folders";
const DRAG_TYPE = "text/veora-chat";

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
    folders: [],          // [{ folder_id, folder_name, tags }]
    folderOf: new Map(),  // chat_id -> folder_id
    expanded: new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) || "[]")),
    loading: { chats: true, folders: true, profile: true },
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

  const PAID_PLANS = ["Starter", "Basic", "Plus", "Premium", "Max", "Elite"];
  const isPaid = () => PAID_PLANS.some((k) => state.profile?.[k]);
  // Free plan: only FREE_MODELS; every other model is PLUS and opens the plans dialog.
  const isLockedModel = (id) => Boolean(state.profile) && !isPaid() && id !== "auto" && !FREE_MODELS.has(id);
  const picker = createModelPicker({
    value: state.model,
    onSelect: onModelChange,
    isLocked: isLockedModel,
    onLocked: () => {
      toast("This model is included with every paid plan.", "info");
      openPlans(state.profile);
    },
  });

  const title = h("div", { class: "chat-title" });
  const header = h("header", { class: "topbar" },
    h("button", { class: "icon-btn only-mobile", type: "button", "aria-label": "Open menu", onclick: () => toggleSidebar(true) }, icon("menu")),
    h("button", { class: "icon-btn when-collapsed", type: "button", "aria-label": "Open sidebar", title: "Open sidebar (⌘⇧S)", onclick: () => sidebarCtl.expand() }, icon("sidebar")),
    h("button", { class: "icon-btn when-collapsed", type: "button", "aria-label": "New chat", title: "New chat", onclick: newChat }, icon("plus")),
    title,
    picker.el);

  const thread = h("div", { class: "thread", "aria-live": "polite" });
  // Images open in the fullscreen viewer (with every image of the chat) instead of a new tab.
  const IMAGE_SELECTOR = ".msg-images img, .gen-image img";
  thread.addEventListener("click", (e) => {
    const img = e.target.closest(IMAGE_SELECTOR);
    if (!img || e.metaKey || e.ctrlKey) return;   // Cmd/Ctrl-click still opens a tab
    e.preventDefault();
    const all = [...thread.querySelectorAll(IMAGE_SELECTOR)];
    openLightbox(all.map((el) => ({ src: el.currentSrc || el.src, alt: el.alt })), all.indexOf(img));
  });
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

  // Dictation: the transcript is inserted at the cursor so it can be edited before sending.
  const voiceInput = createVoiceInput({
    composer,
    onText: (text) => {
      const { selectionStart: a, selectionEnd: b, value } = textarea;
      const before = value.slice(0, a);
      const sep = before && !/\s$/.test(before) ? " " : "";
      textarea.value = before + sep + text + value.slice(b);
      const caret = (before + sep + text).length;
      autosize();
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    },
  });
  sendBtn.before(voiceInput.button);

  // Voice models get a text-to-speech studio instead of the chat thread.
  const studio = createTtsStudio({
    onGenerate: generateSpeech,
    onSelectModel: async (id) => { await onModelChange(id); picker.setValue(id); },
  });
  const chatView = h("div", { class: "chat-view" }, scroller, h("div", { class: "composer-wrap" }, composer, quota));
  const main = h("main", { class: "main" }, header, chatView, studio.el);
  // Shown only if the first load takes longer than a moment, so fast loads don't flash.
  const splash = h("div", { class: "boot-splash", hidden: true, role: "status", "aria-live": "polite" },
    h("div", { class: "boot-inner" },
      h("img", { class: "boot-logo", src: "logo.png", alt: "", width: "72", height: "72" }),
      h("p", {}, "Loading your chats…"),
      h("div", { class: "boot-bar" })));
  // Splash after 300 ms of loading; after 2.5 s it gives way to the skeletons below it.
  const splashTimer = setTimeout(() => { if (booting()) splash.hidden = false; }, 300);
  const splashCap = setTimeout(() => hideSplash(), 2500);
  const shell = h("div", { class: "shell" }, sidebar, scrim, main, splash);
  root.replaceChildren(shell);
  const sidebarCtl = setupSidebar(shell);

  // Drag & drop images anywhere on the chat.
  main.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    main.classList.add("dragging");
  });
  main.addEventListener("dragleave", (e) => { if (e.target === main) main.classList.remove("dragging"); });
  main.addEventListener("drop", (e) => {
    e.preventDefault();
    main.classList.remove("dragging");
    addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });

  // ---------- rendering ----------
  function toggleSidebar(open) { shell.classList.toggle("sidebar-open", open); }

  // The splash waits for chats and profile; folders keep the sidebar skeleton until they arrive.
  function booting() {
    return state.loading.chats || state.loading.profile;
  }

  function hideSplash() {
    clearTimeout(splashTimer);
    clearTimeout(splashCap);
    if (!splash.isConnected) return;
    if (splash.hidden) { splash.remove(); return; }
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 400);
  }

  function finishBoot() {
    if (!booting()) hideSplash();
  }

  const skel = (width, cls = "") => h("span", { class: `skel ${cls}`, style: `width:${width}` });

  function sidebarSkeleton() {
    const rows = (widths) => widths.map((w) => h("div", { class: "skel-row" }, skel(w)));
    return [
      h("div", { class: "side-section", "aria-hidden": "true" },
        h("div", { class: "side-head" }, h("span", {}, "Folders")), rows(["58%", "44%"])),
      h("div", { class: "side-section", "aria-hidden": "true" },
        h("div", { class: "side-head" }, h("span", {}, "Chats")), rows(["72%", "55%", "84%", "61%", "47%", "76%", "58%", "66%"])),
    ];
  }

  function threadSkeleton() {
    const assistant = (widths) => h("div", { class: "msg assistant skel-msg" },
      h("span", { class: "skel skel-avatar" }),
      h("div", { class: "msg-body" }, widths.map((w) => skel(w, "skel-line"))));
    return h("div", { class: "thread-skeleton", "aria-label": "Loading messages", role: "status" },
      h("div", { class: "msg user" }, skel("42%", "skel-bubble")),
      assistant(["92%", "86%", "64%"]),
      h("div", { class: "msg user" }, skel("28%", "skel-bubble")),
      assistant(["88%", "74%"]));
  }

  function renderChats() {
    if (state.loading.chats || state.loading.folders) {
      chatList.replaceChildren(...sidebarSkeleton());
      return;
    }
    const loose = state.chats.filter(([id]) => !state.folderOf.get(id));

    const folderSection = h("div", { class: "side-section" },
      h("div", { class: "side-head" },
        h("span", {}, "Folders"),
        h("button", { class: "icon-btn tiny", type: "button", "aria-label": "New folder", title: "New folder", onclick: () => newFolder() }, icon("folderPlus"))),
      state.folders.length ? state.folders.map(folderBlock) : h("p", { class: "empty-list" }, "Group chats into folders"));

    const chatsSection = h("div", { class: "side-section" },
      h("div", { class: "side-head" }, h("span", {}, "Chats")),
      loose.length ? loose.map(([id, name]) => chatItem(id, name))
        : h("p", { class: "empty-list" }, state.chats.length ? "All chats are in folders" : "No chats yet"));
    // Dropping a chat on the "Chats" section takes it out of its folder.
    dropTarget(chatsSection, "");

    chatList.replaceChildren(folderSection, chatsSection);

    // First real render after the skeleton: items cascade in once.
    if (!state.listIntroDone) {
      state.listIntroDone = true;
      chatList.querySelectorAll(".chat-item").forEach((el, i) => el.style.setProperty("--i", String(Math.min(i, 16))));
      chatList.classList.add("intro");
      setTimeout(() => chatList.classList.remove("intro"), 1400);
    }
  }

  function chatItem(id, name) {
    const pinned = state.pinned.has(id);
    const item = h("div", {
      class: `chat-item${id === state.chatId ? " active" : ""}`, draggable: "true",
      ondragstart: (e) => {
        e.dataTransfer.setData(DRAG_TYPE, id);
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
      },
      ondragend: () => item.classList.remove("dragging"),
    },
      h("button", { class: "chat-link", type: "button", title: name, onclick: () => openChat(id) },
        pinned && icon("pin"), h("span", {}, name || "New chat")),
      h("button", { class: "icon-btn chat-more", type: "button", "aria-label": "Chat options", onclick: (e) => { e.stopPropagation(); chatMenu(item, id, name); } }, icon("dots")));
    return item;
  }

  function folderBlock(f) {
    const open = state.expanded.has(f.folder_id);
    const chats = state.chats.filter(([id]) => state.folderOf.get(id) === f.folder_id);
    const tags = f.tags?.length ? f.tags.join(", ") : "";
    const row = h("div", { class: "chat-item folder-item" },
      h("button", {
        class: "chat-link", type: "button", "aria-expanded": String(open), title: tags ? `${f.folder_name} · ${tags}` : f.folder_name,
        onclick: () => toggleFolder(f.folder_id),
      },
        h("span", { class: `folder-chevron${open ? " open" : ""}` }, icon("chevron")),
        icon("folder"),
        h("span", {}, f.folder_name),
        h("small", { class: "folder-count" }, String(chats.length))),
      h("button", { class: "icon-btn chat-more", type: "button", "aria-label": "Folder options", onclick: (e) => { e.stopPropagation(); folderMenu(row, f); } }, icon("dots")));
    const block = h("div", { class: "folder" }, row,
      open && h("div", { class: "folder-chats" },
        chats.length ? chats.map(([id, name]) => chatItem(id, name)) : h("p", { class: "empty-list" }, "Drag chats here")));
    dropTarget(block, f.folder_id);
    return block;
  }

  function dropTarget(el, folderId) {
    el.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("drop");
    });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop"); });
    el.addEventListener("drop", (e) => {
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("drop");
      moveChat(id, folderId);
    });
  }

  function showMenu(item, entries) {
    document.querySelector(".menu")?.remove();
    const menu = h("div", { class: "menu", role: "menu" },
      entries.map(([label, action, danger]) => h("button", { type: "button", class: danger ? "danger" : "", onclick: action }, label)));
    item.append(menu);
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }));
  }

  function chatMenu(item, id, name) {
    const pinned = state.pinned.has(id);
    showMenu(item, [
      ["Rename", () => rename(id, name)],
      [pinned ? "Unpin" : "Pin", () => togglePin(id, !pinned)],
      ["Move to folder…", () => moveChatDialog(id)],
      ["Delete", () => remove(id), true],
    ]);
  }

  function folderMenu(item, f) {
    showMenu(item, [
      ["Rename", () => renameFolder(f)],
      ["Tags…", () => editTags(f)],
      ["Delete folder", () => removeFolder(f), true],
    ]);
  }

  function renderTitle() {
    const current = state.chats.find(([id]) => id === state.chatId);
    title.textContent = current ? current[1] : "New chat";
  }

  function renderThread() {
    if (!state.messages.length) {
      const name = state.profile?.Name ? `, ${state.profile.Name}` : "";
      thread.replaceChildren(h("div", { class: "welcome" },
        h("div", { class: "welcome-logo" }, h("img", { src: "logo.png", alt: "", width: "64", height: "64" })),
        h("h1", {}, `How can I help${name}?`),
        h("p", { class: "muted" }, "Pick a model at the top or leave it on Auto — Veora will choose the best one for your request."),
        h("div", { class: "suggestions" }, SUGGESTIONS.map(([emoji, text], i) => h("button", {
          class: "suggestion", type: "button", style: `--i:${i}`,
          onclick: () => { textarea.value = text; autosize(); textarea.focus(); },
        }, h("span", { class: "suggestion-emoji", "aria-hidden": "true" }, emoji), h("span", {}, text))))));
      return;
    }
    thread.replaceChildren(...state.messages.map(renderMessage));
    requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  }

  function renderMessage(m) {
    if (m.role === "user") {
      const el = h("div", { class: `msg user${m.fresh ? " enter" : ""}` },
        m.images?.length > 0 && h("div", { class: "msg-images" }, m.images.map((src) => h("a", { href: src, target: "_blank", rel: "noopener" }, fadeImg(src, "Attached image")))),
        m.text && h("div", { class: "bubble" }, m.text));
      m.fresh = false;
      return el;
    }
    const body = [];
    if (m.pending) body.push(h("div", { class: "thinking", role: "status" },
      h("span", { class: "thinking-text" }, m.pendingLabel || "Thinking"),
      h("span", { class: "typing", "aria-hidden": "true" }, h("span"), h("span"), h("span"))));
    if (m.error) body.push(h("p", { class: "msg-error" }, m.error));
    if (m.text) body.push(markdown(m.showTranslated && m.translation ? m.translation.text : m.text));
    if (m.image) body.push(h("a", { href: m.image, target: "_blank", rel: "noopener", class: "gen-image" }, fadeImg(m.image, "Generated image")));
    if (m.audio) body.push(h("div", { class: "gen-audio" }, audioCard(m.audio, { label: voiceLabel(m.model) })));
    if (m.video) body.push(h("video", { src: m.video, controls: true, playsinline: true, class: "gen-video" }));
    if (m.videoTask || m.videoPending) body.push(videoGeneratingCard(m));
    const el = h("div", { class: `msg assistant${m.fresh ? " enter" : ""}${m.arrived ? " arrive" : ""}` },
      h("div", { class: "avatar" }, h("img", { src: "logo.png", alt: "" })),
      h("div", { class: "msg-body" },
        m.model && h("div", { class: "msg-model" }, modelLabel(m.model)),
        body,
        m.text && !m.pending && messageActions(m)));
    // A reply that just arrived reveals its blocks one after another.
    if (m.arrived) {
      el.querySelectorAll(".md > *, .gen-image, .gen-audio, .gen-video, .msg-error").forEach((block, i) => block.style.setProperty("--i", String(Math.min(i, 12))));
    }
    m.fresh = false;
    m.arrived = false;
    m.el = el;
    return el;
  }

  // Images fade in once loaded instead of popping in.
  function fadeImg(src, alt) {
    const done = (e) => e.target.classList.add("loaded");
    return h("img", { src, alt, loading: "lazy", class: "fade-img", onload: done, onerror: done });
  }

  // Re-renders one message in place (used by copy/translate state changes).
  function rerenderMessage(m) {
    const old = m.el;
    const fresh = renderMessage(m);
    if (old?.isConnected) old.replaceWith(fresh);
  }

  function messageActions(m) {
    const shownText = () => (m.showTranslated && m.translation ? m.translation.text : m.text);
    const copyBtn = h("button", {
      class: "msg-action", type: "button",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(shownText());
          copyBtn.replaceChildren(icon("check"), "Copied");
          setTimeout(() => copyBtn.replaceChildren(icon("copy"), "Copy"), 1500);
        } catch { toast("Couldn't copy to the clipboard."); }
      },
    }, icon("copy"), "Copy");

    const lang = preferredLanguage();
    const label = m.translating ? "Translating…"
      : m.showTranslated ? "Show original"
      : `Translate · ${languageName(lang)}`;
    const wrap = h("div", { class: "msg-actions" },
      copyBtn,
      h("span", { class: "msg-action-group" },
        h("button", { class: "msg-action", type: "button", disabled: Boolean(m.translating), onclick: () => toggleTranslation(m, lang) },
          icon("translate"), label),
        h("button", {
          class: "msg-action caret", type: "button", "aria-label": "Choose translation language", disabled: Boolean(m.translating),
          onclick: (e) => {
            e.stopPropagation();
            languageMenu(wrap, (code) => {
              setPreferredLanguage(code);
              toggleTranslation(m, code, true);
            });
          },
        }, icon("chevronDown"))),
      m.showTranslated && m.translation && h("span", { class: "msg-translated-note" }, `Translated to ${languageName(m.translation.lang)}`));
    return wrap;
  }

  async function toggleTranslation(m, lang, forceLang = false) {
    if (m.showTranslated && !forceLang) {
      m.showTranslated = false;
      rerenderMessage(m);
      return;
    }
    if (m.translation?.lang === lang) {
      m.showTranslated = true;
      rerenderMessage(m);
      return;
    }
    m.translating = true;
    rerenderMessage(m);
    try {
      m.translation = { lang, text: await translateMarkdown(m.text, lang) };
      m.showTranslated = true;
    } catch (e) {
      toast(errorText(e));
    }
    m.translating = false;
    rerenderMessage(m);
  }

  function languageMenu(anchor, onPick) {
    document.querySelector(".menu")?.remove();
    const current = preferredLanguage();
    // Open upwards when there isn't room below (e.g. the last message above the composer).
    const up = anchor.getBoundingClientRect().bottom > innerHeight * 0.55;
    const menu = h("div", { class: `menu lang-menu${up ? " up" : ""}`, role: "menu" },
      LANGUAGES.map(([code, name]) => h("button", { type: "button", class: code === current ? "selected" : "", onclick: () => onPick(code) }, name)));
    anchor.append(menu);
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }));
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
    const videos = p["Video Credits"] ? ` · ${p["Video Credits"]} video${p["Video Credits"] === 1 ? "" : "s"}` : "";
    quota.textContent = `${p.Requests ?? 0} requests today · ${p["Nano Requests"] ?? 0} premium this month${videos} left`;
  }

  function renderProfileBtn() {
    if (state.loading.profile && !state.profile) {
      profileBtn.replaceChildren(
        h("span", { class: "skel skel-avatar" }),
        h("span", { class: "profile-meta grow" }, skel("70%"), skel("45%", "skel-small")));
      return;
    }
    const p = state.profile || {};
    const pic = p["Profile Picture"];
    profileBtn.replaceChildren(
      pic ? h("img", { class: "avatar-img", src: pic, alt: "" }) : h("span", { class: "avatar-img initials" }, (p.Name || "?").slice(0, 1).toUpperCase()),
      h("span", { class: "profile-meta" }, h("strong", {}, p.Name || "Account"), h("small", {}, planName(p))));
  }

  // Voice models open the TTS studio; the chat composer also refuses images for them.
  function updateMode() {
    const voice = VOICE_MODELS.has(state.model);
    const wasVoice = main.classList.contains("tts-mode");
    main.classList.toggle("tts-mode", voice);
    if (voice) {
      studio.setModel(state.model);
      if (!wasVoice) {
        studio.setGenerations(collectGenerations());
        studio.loadVoices();
      }
    } else if (wasVoice) {
      studio.stop();
      renderThread();
    }
    textarea.placeholder = voice ? "Text to read aloud…"
      : VIDEO_MODELS.has(state.model) ? "Describe the video you want — attach a photo to animate it…"
      : "Message Veora…";
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
    state.loading.profile = false;
    picker.refresh();
    // A free account still set to a PLUS model (e.g. after the plan ended) goes back to Auto.
    if (isLockedModel(state.model)) {
      onModelChange("auto").then(() => picker.setValue("auto")).catch(() => {});
    }
    if (state.profile) {
      const perks = hasPerks(state.profile);
      cachePerks(perks);
      applyAppearance(loadPrefs(), perks);
    }
    renderProfileBtn();
    renderQuota();
    finishBoot();
    studio.setCredits(state.profile?.["Nano Requests"] ?? null);
    if (state.profile) studio.setPlan(state.profile);
    if (!state.messages.length) renderThread();
  }

  async function loadChats() {
    try {
      const data = (await api.chats()) || {};
      state.chats = Object.entries(data);
    } catch (e) {
      toast(errorText(e));
    }
    state.loading.chats = false;
    renderChats();
    renderTitle();
    finishBoot();
  }

  async function loadModel() {
    try {
      const { model_name } = await api.getModel();
      if (model_name) state.model = model_name;
      updateMode();
    } catch {
      // Needs X-API-KEY; without it we just keep the default.
    }
    picker.setValue(state.model);
    picker.el.classList.remove("is-loading");
    if (isLockedModel(state.model)) {
      onModelChange("auto").then(() => picker.setValue("auto")).catch(() => {});
    }
  }

  async function onModelChange(id) {
    try {
      await api.changeModel(id);
      state.model = id;
      updateMode();
    } catch (e) {
      toast(errorText(e));
      if (String(e.message).includes("Upgrade required")) openPlans(state.profile);
      throw e;
    }
  }

  async function openChat(id) {
    toggleSidebar(false);
    state.chatId = id;
    renderChats();
    renderTitle();
    thread.replaceChildren(threadSkeleton());
    try {
      const data = await api.messages(id);
      if (state.chatId !== id) return;
      state.messages = (data?.result || []).flatMap(fromHistory);
    } catch (e) {
      state.messages = [];
      toast(errorText(e));
    }
    renderThread();
    // Replay the fade-in for the freshly opened chat.
    thread.classList.remove("thread-in");
    void thread.offsetWidth;
    thread.classList.add("thread-in");
    if (VOICE_MODELS.has(state.model)) studio.setGenerations(collectGenerations());
    watchPendingVideos(id);
  }

  // ---------- video ----------
  // Placeholder while a video renders: a 9:16 frame with a shimmer and an elapsed-time counter.
  function videoGeneratingCard(m) {
    const time = h("span", { class: "vg-time" });
    const tick = () => {
      if (!m.videoTask) { time.textContent = ""; return; }
      const sec = Math.floor((Date.now() - m.videoTask.started) / 1000);
      time.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    };
    tick();
    const timer = setInterval(() => (time.isConnected ? tick() : clearInterval(timer)), 1000);
    return h("div", { class: "video-gen", role: "status" },
      h("div", { class: "vg-frame", "aria-hidden": "true" }, h("span", { class: "vg-icon" }, "🎬")),
      h("div", { class: "vg-text" },
        h("strong", {}, "Generating your video"),
        h("span", { class: "muted small" }, "Usually takes 1–3 minutes. You can keep chatting — it will appear here."),
        time));
  }

  // Polls a job started in this session until the clip is ready (or fails / times out).
  async function pollVideo(reply) {
    const { task_id, message_id, started } = reply.videoTask;
    while (reply.videoTask && Date.now() - started < 16 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 5000));
      let res;
      try { res = await api.videoStatus(task_id, message_id); } catch { continue; }
      if (res?.status === "completed" && res.url) {
        reply.videoTask = null;
        reply.video = res.url;
      } else if (res?.status === "failed" || res?.message === "error") {
        reply.videoTask = null;
        reply.error = "The video couldn't be generated. Your video credit was refunded — please try again.";
      } else {
        continue;
      }
      reply.arrived = true;
      rerenderMessage(reply);
      loadProfile();
      return;
    }
  }

  // History shows unfinished videos without a job id: re-read the chat until they resolve.
  async function watchPendingVideos(chatId) {
    const started = Date.now();
    while (state.chatId === chatId && state.messages.some((m) => m.videoPending) && Date.now() - started < 16 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 10000));
      if (state.chatId !== chatId) return;
      try {
        const data = await api.messages(chatId);
        const fresh = (data?.result || []).flatMap(fromHistory);
        if (state.chatId !== chatId) return;
        if (fresh.filter((m) => m.videoPending).length < state.messages.filter((m) => m.videoPending).length) {
          state.messages = fresh;
          renderThread();
        }
      } catch { /* try again on the next tick */ }
    }
  }

  function newChat() {
    toggleSidebar(false);
    state.chatId = null;
    state.messages = [];
    renderChats();
    renderTitle();
    renderThread();
    if (VOICE_MODELS.has(state.model)) {
      studio.setGenerations([]);
      studio.focus();
    } else {
      textarea.focus();
    }
  }

  // ---------- folders ----------
  async function loadFolders() {
    try {
      const res = await api.folders();
      state.folders = res?.result || [];
      const lists = await Promise.all(state.folders.map((f) =>
        api.folderChats(f.folder_id).then((r) => r?.result || []).catch(() => [])));
      state.folderOf = new Map();
      state.folders.forEach((f, i) => lists[i].forEach((chatId) => state.folderOf.set(chatId, f.folder_id)));
    } catch (e) {
      if (e.status !== 401) toast(errorText(e));
    }
    state.loading.folders = false;
    renderChats();
    finishBoot();
  }

  function saveExpanded() {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...state.expanded]));
  }

  function toggleFolder(id) {
    state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
    saveExpanded();
    renderChats();
  }

  // Folder endpoints answer {"messsage": "error"} (sic) when the folder isn't the user's.
  function checkFolderResult(res) {
    if (res?.message === "error" || res?.messsage === "error") throw new Error("This folder is not available.");
  }

  async function newFolder(presetName) {
    const name = presetName ?? await promptModal("New folder", { placeholder: "Folder name", confirm: "Create" });
    if (!name) return null;
    try {
      const { folder_id } = await api.createFolder(name);
      state.folders.push({ folder_id, folder_name: name, tags: [] });
      state.expanded.add(folder_id);
      saveExpanded();
      renderChats();
      return folder_id;
    } catch (e) {
      toast(errorText(e));
      return null;
    }
  }

  async function moveChat(chatId, folderId) {
    if ((state.folderOf.get(chatId) || "") === folderId) return;
    try {
      checkFolderResult(await api.moveChat(chatId, folderId));
      if (folderId) {
        state.folderOf.set(chatId, folderId);
        state.expanded.add(folderId);
        saveExpanded();
      } else {
        state.folderOf.delete(chatId);
      }
      renderChats();
    } catch (e) { toast(errorText(e)); }
  }

  async function moveChatDialog(chatId) {
    const choice = await moveToFolderModal(state.folders, state.folderOf.get(chatId) || "");
    if (!choice) return;
    const target = choice.newName ? await newFolder(choice.newName) : choice.folderId;
    if (target != null) moveChat(chatId, target);
  }

  async function renameFolder(f) {
    const name = await promptModal("Rename folder", { value: f.folder_name });
    if (!name || name === f.folder_name) return;
    try {
      checkFolderResult(await api.renameFolder(f.folder_id, name));
      f.folder_name = name;
      renderChats();
    } catch (e) { toast(errorText(e)); }
  }

  async function editTags(f) {
    await tagsModal(f, {
      onAdd: async (tag) => {
        checkFolderResult(await api.addFolderTag(f.folder_id, tag));
        f.tags = [...(f.tags || []), tag];
      },
      onRemove: async (tag) => {
        checkFolderResult(await api.removeFolderTag(f.folder_id, tag));
        f.tags = (f.tags || []).filter((t) => t !== tag);
      },
    });
    renderChats();
  }

  async function removeFolder(f) {
    const ok = await confirmModal("Delete folder?", `“${f.folder_name}” will be deleted. Its chats stay in your chat list.`);
    if (!ok) return;
    try {
      checkFolderResult(await api.deleteFolder(f.folder_id));
      state.folders = state.folders.filter((x) => x.folder_id !== f.folder_id);
      for (const [chatId, folderId] of state.folderOf) if (folderId === f.folder_id) state.folderOf.delete(chatId);
      state.expanded.delete(f.folder_id);
      saveExpanded();
      renderChats();
    } catch (e) { toast(errorText(e)); }
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
      state.folderOf.delete(id);
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
    const userMsg = { role: "user", text, images: files.map((f) => URL.createObjectURL(f)), fresh: true };
    const reply = {
      role: "assistant", pending: true, fresh: true,
      pendingLabel: VIDEO_MODELS.has(state.model) ? "Starting your video"
        : files.length ? "Looking at your images"
        : IMAGE_MODELS.has(state.model) ? "Creating your image" : "Thinking",
    };
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
    reply.arrived = true;
    reply.pending = false;
    renderThread();
    setSending(false);
    await afterSend(knownChats);
  }

  // Studio "Generate speech": a voice-model /ask_text call stored in the open chat.
  async function generateSpeech(text, voiceId = null, voiceModel = null) {
    const knownChats = new Set(state.chats.map(([id]) => id));
    const res = await api.askText(state.chatId, text, voiceId, voiceModel);
    if (!res?.audio) {
      throw new Error(res?.message === "error" ? "This chat is not available." : "Unexpected response from server.");
    }
    state.messages.push({ role: "user", text }, { role: "assistant", audio: res.audio, model: voiceId ? "custom:custom" : state.model });
    afterSend(knownChats);
    return res.audio;
  }

  // Generations for the studio: every audio reply paired with the text before it.
  function collectGenerations() {
    const out = [];
    state.messages.forEach((m, i) => {
      if (m.role === "assistant" && m.audio) {
        const prev = state.messages[i - 1];
        out.push({ url: m.audio, text: prev?.role === "user" ? prev.text : "", model: m.model || state.model });
      }
    });
    return out;
  }

  async function afterSend(knownChats) {
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
    else if (res.video_task_id) {
      reply.videoTask = { task_id: res.video_task_id, message_id: res.message_id, started: Date.now() };
      pollVideo(reply);
    }
    else if (res.message === "error") reply.error = "This chat is not available.";
    else if (res.message === "None") reply.error = "Account not found. Try signing in again.";
    else if (typeof res.message === "string") reply.text = res.message;
    else reply.error = "Unexpected response from server.";
  }

  // ---------- boot ----------
  applyAppearance(loadPrefs(), cachedPerks());
  picker.el.classList.add("is-loading");
  renderChats();
  renderTitle();
  renderThread();
  renderProfileBtn();
  loadProfile();
  loadChats();
  loadFolders();
  loadModel();
  textarea.focus();
  // Back from Stripe Checkout / Customer Portal.
  handleBillingReturn({
    reloadProfile: loadProfile,
    hasPlan: () => ["Starter", "Basic", "Plus", "Premium", "Max", "Elite"].some((k) => state.profile?.[k]),
  });
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
    else if (/\.(mp3|wav)(\?|$)/i.test(m.image_response)) reply.audio = m.image_response;
    else reply.image = m.image_response;
  }
  // Only video jobs leave a reply without text or media while they run.
  if (!m.response && !m.image_response && /veo|video/i.test(m.model || "")) reply.videoPending = true;
  out.push(reply);
  return out;
}

// "google/gemini-3.8-flash-tts:kore" -> "Kore voice"; own voices -> "Voice clone"
// (the message header above already says "Your voice").
function voiceLabel(model) {
  if (!model) return "Voice";
  if (model.endsWith(":custom")) return "Voice clone";
  const voice = model.includes(":") ? model.split(":").pop() : "";
  return voice ? `${voice.charAt(0).toUpperCase()}${voice.slice(1)} voice` : "Voice";
}

export function planName(p) {
  if (!p) return "";
  const plans = ["Elite", "Max", "Premium", "Plus", "Basic", "Starter"];
  return plans.find((k) => p[k]) ? `${plans.find((k) => p[k])} plan` : "Free plan";
}

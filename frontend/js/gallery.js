import { api } from "./api.js";
import { h, icon, toast, errorText, modal } from "./dom.js";
import { openLightbox } from "./lightbox.js";
import { audioCard } from "./audio-card.js";
import { modelLabel } from "./model-picker.js";

const PAGE = 200;   // backend caps /galery at 200 per request
const FILTERS = [["all", "All"], ["image", "Images"], ["video", "Videos"], ["audio", "Audio"]];

const kindOf = (url) => (/\.mp4(\?|$)/i.test(url) ? "video" : /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url) ? "audio" : "image");

function dayLabel(iso) {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/**
 * Full-screen gallery of everything the user generated: chat images, videos and audio, plus
 * video-studio clips. onOpenChat(chatId) jumps to the chat a picture came from.
 */
export function openGallery({ onOpenChat = () => {} } = {}) {
  document.querySelector(".gallery-page")?.remove();
  const st = { items: [], filter: "all", loading: true, more: false, offset: 0, error: null };
  const previousFocus = document.activeElement;

  const tabs = h("div", { class: "gal-tabs", role: "tablist" });
  const body = h("div", { class: "gal-body" });
  const count = h("span", { class: "muted small" });
  const page = h("div", { class: "gallery-page", role: "dialog", "aria-modal": "true", "aria-label": "Gallery" },
    h("header", { class: "gal-head" },
      h("button", { class: "icon-btn", type: "button", "aria-label": "Back", title: "Back (Esc)", onclick: close }, icon("back")),
      h("div", { class: "gal-title" }, h("h2", {}, "Gallery"), count),
      tabs),
    body);

  function onKey(e) {
    // The lightbox and dialogs handle Esc themselves.
    if (e.key === "Escape" && !document.querySelector(".lightbox, dialog[open]")) close();
  }

  function close() {
    document.removeEventListener("keydown", onKey);
    page.querySelectorAll("video, audio").forEach((m) => m.pause());
    page.classList.add("closing");
    setTimeout(() => page.remove(), 180);
    previousFocus?.focus?.();
  }

  const visible = () => st.items.filter((x) => st.filter === "all" || x.kind === st.filter);

  function renderTabs() {
    const counts = { all: st.items.length };
    for (const x of st.items) counts[x.kind] = (counts[x.kind] || 0) + 1;
    tabs.replaceChildren(...FILTERS.map(([key, label]) => h("button", {
      class: `gal-tab${st.filter === key ? " active" : ""}`, type: "button", role: "tab", "aria-selected": String(st.filter === key),
      onclick: () => { st.filter = key; render(); },
    }, label, !st.loading && h("span", { class: "gal-tab-count" }, String(counts[key] || 0)))));
    const n = st.items.length;
    count.textContent = st.loading ? "" : `${n}${st.more ? "+" : ""} ${n === 1 ? "item" : "items"}`;
  }

  function tile(x, images) {
    const actions = h("div", { class: "gal-actions" },
      h("a", { class: "gal-action", href: x.url, target: "_blank", rel: "noopener", download: "", "aria-label": "Download", title: "Download",
        onclick: (e) => e.stopPropagation() }, icon("download")),
      x.chat_id && h("button", { class: "gal-action", type: "button", "aria-label": "Open chat", title: "Open chat",
        onclick: (e) => { e.stopPropagation(); close(); onOpenChat(x.chat_id); } }, icon("external")));
    const caption = h("div", { class: "gal-caption" },
      x.prompt && h("p", {}, x.prompt),
      h("small", {}, x.studio ? "Video studio" : modelLabel(x.model || "")));

    if (x.kind === "audio") {
      return h("div", { class: "gal-audio" }, audioCard(x.url, { label: x.prompt ? x.prompt.slice(0, 60) : modelLabel(x.model || "") }),
        h("div", { class: "gal-audio-foot" }, h("small", { class: "muted" }, modelLabel(x.model || "")), actions));
    }
    if (x.kind === "video") {
      const video = h("video", { src: x.url, muted: true, loop: true, playsinline: true, preload: "metadata" });
      video.muted = true;
      return h("button", {
        class: "gal-tile video", type: "button", "aria-label": "Play video",
        onclick: () => openVideo(x),
        onmouseenter: () => video.play().catch(() => {}),
        onmouseleave: () => video.pause(),
      }, video, h("span", { class: "gal-play", "aria-hidden": "true" }, icon("play")), caption, actions);
    }
    const img = h("img", { src: x.url, alt: x.prompt || "Generated image", loading: "lazy", decoding: "async",
      onload: () => img.classList.add("loaded"), onerror: () => img.closest(".gal-tile")?.classList.add("broken") });
    return h("button", {
      class: "gal-tile", type: "button", "aria-label": "Open image",
      onclick: () => openLightbox(images.map((i) => ({ src: i.url, alt: i.prompt || "" })), images.indexOf(x)),
    }, img, caption, actions);
  }

  function openVideo(x) {
    modal(x.prompt?.length > 60 ? `${x.prompt.slice(0, 60)}…` : x.prompt || "Video", () =>
      h("div", { class: "stack" },
        h("video", { class: "vs-viewer", src: x.url, controls: true, autoplay: true, loop: true, playsinline: true }),
        h("div", { class: "row end" },
          x.chat_id && h("button", { class: "btn ghost", type: "button", onclick: () => { document.querySelector("dialog")?.remove(); close(); onOpenChat(x.chat_id); } }, "Open chat"),
          h("a", { class: "btn", href: x.url, target: "_blank", rel: "noopener", download: "" }, "Download"))), { wide: true });
  }

  function render() {
    renderTabs();
    if (st.loading && !st.items.length) {
      body.replaceChildren(h("div", { class: "gal-grid" },
        Array.from({ length: 12 }, (_, i) => h("div", { class: "gal-tile skel", style: `aspect-ratio:${[1, 0.75, 1.33, 1][i % 4]}` }))));
      return;
    }
    if (st.error && !st.items.length) {
      body.replaceChildren(h("div", { class: "gal-empty" }, h("p", {}, st.error),
        h("button", { class: "btn", type: "button", onclick: () => load(true) }, "Try again")));
      return;
    }
    const list = visible();
    if (!list.length) {
      const what = { all: "images, videos or audio", image: "images", video: "videos", audio: "audio" }[st.filter];
      body.replaceChildren(h("div", { class: "gal-empty" },
        h("span", { class: "gal-empty-icon" }, icon("gallery")),
        h("h3", {}, "Nothing here yet"),
        h("p", { class: "muted" }, `Everything you generate — ${what} — will show up here.`)));
      return;
    }
    // Grouped by day, newest first; images open in the lightbox with every image of the current filter.
    const images = list.filter((x) => x.kind === "image");
    const groups = new Map();
    for (const x of list) {
      const label = dayLabel(x.created_at);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(x);
    }
    body.replaceChildren(
      ...[...groups].map(([label, xs]) => h("section", { class: "gal-section" },
        h("h3", { class: "gal-day" }, label),
        h("div", { class: "gal-grid" }, xs.filter((x) => x.kind !== "audio").map((x) => tile(x, images))),
        xs.some((x) => x.kind === "audio") && h("div", { class: "gal-audio-list" }, xs.filter((x) => x.kind === "audio").map((x) => tile(x, images))))),
      st.more && h("div", { class: "gal-more" },
        h("button", { class: "btn", type: "button", disabled: st.loading, onclick: () => load(false) }, st.loading ? "Loading…" : "Load more")));
  }

  async function load(reset) {
    st.loading = true;
    st.error = null;
    if (reset) { st.items = []; st.offset = 0; }
    render();
    try {
      const [res, studio] = await Promise.all([
        api.gallery(PAGE, st.offset),
        reset ? api.videoList().catch(() => null) : null,
      ]);
      const rows = Array.isArray(res) ? res : res?.result || [];
      st.offset += rows.length;
      st.more = rows.length === PAGE;
      const fresh = rows.map((r) => ({ ...r, kind: kindOf(r.url) }));
      const clips = (studio?.result || []).filter((v) => v.status === "completed" && v.url)
        .map((v) => ({ id: `studio-${v.id}`, url: v.url, prompt: v.prompt, model: v.model, created_at: v.created_at, kind: "video", studio: true }));
      const seen = new Set();
      st.items = [...st.items, ...fresh, ...clips].filter((x) => !seen.has(x.url) && seen.add(x.url))
        .sort((a, b) => (Date.parse(b.created_at || 0) || 0) - (Date.parse(a.created_at || 0) || 0));
    } catch (e) {
      st.error = errorText(e);
      if (st.items.length) toast(st.error);
    }
    st.loading = false;
    render();
  }

  // Links are presigned and expire; if files stop loading after a while, reload the list once.
  let refreshed = false;
  const onMediaError = (e) => {
    if (refreshed || st.loading) return;
    if (e.type === "media-expired" || e.target instanceof HTMLImageElement || e.target instanceof HTMLVideoElement) {
      refreshed = true;
      load(true);
    }
  };
  page.addEventListener("error", onMediaError, true);
  page.addEventListener("media-expired", onMediaError);

  document.addEventListener("keydown", onKey);
  document.body.append(page);
  page.querySelector(".icon-btn")?.focus();
  load(true);
  return { close };
}

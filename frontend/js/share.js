import { api } from "./api.js";
import { h, icon, toast, errorText, modal, markdown } from "./dom.js";
import { fromHistory, voiceLabel } from "./chat.js";
import { modelLabel } from "./model-picker.js";
import { audioCard } from "./audio-card.js";
import { openLightbox } from "./lightbox.js";

export const SHARE_PARAM = "share";
export const shareUrl = (linkId) => `${location.origin}${location.pathname}?${SHARE_PARAM}=${encodeURIComponent(linkId)}`;

/** "Share chat" dialog: creates (or returns the existing) read-only link, copy and stop sharing. */
export function shareChatModal(chatId) {
  return modal("Share chat", (close) => {
    const field = h("input", { class: "input share-url", readonly: true, value: "", "aria-label": "Share link", onfocus: (e) => e.target.select() });
    const copyBtn = h("button", { class: "btn primary", type: "button", disabled: true, onclick: copy }, icon("copy"), h("span", {}, "Copy link"));
    const stopBtn = h("button", { class: "btn ghost danger-text", type: "button", disabled: true, onclick: stop }, "Stop sharing");
    const nativeBtn = navigator.share && h("button", { class: "btn ghost", type: "button", disabled: true,
      onclick: () => navigator.share({ title: "Veora chat", url: field.value }).catch(() => {}) }, "Share…");
    const status = h("p", { class: "muted small share-status" }, "Creating link…");
    let linkId = null;

    async function copy() {
      try {
        await navigator.clipboard.writeText(field.value);
      } catch {
        field.select();
        document.execCommand?.("copy");
      }
      copyBtn.replaceChildren(icon("check"), h("span", {}, "Copied"));
      setTimeout(() => copyBtn.replaceChildren(icon("copy"), h("span", {}, "Copy link")), 1800);
    }

    async function stop() {
      stopBtn.disabled = true;
      try {
        const res = await api.deleteShare(linkId);
        if (res?.message === "error") throw new Error("Couldn't turn off the link. Try again later.");
        toast("Link turned off. It no longer opens the chat.", "ok");
        close();
      } catch (e) {
        toast(errorText(e));
        stopBtn.disabled = false;
      }
    }

    api.createShare(chatId).then((res) => {
      if (!res?.link_id) throw new Error("Couldn't create a link for this chat.");
      linkId = res.link_id;
      field.value = shareUrl(linkId);
      [copyBtn, stopBtn, nativeBtn].forEach((b) => { if (b) b.disabled = false; });
      status.textContent = "";
      field.focus();
    }).catch((e) => { status.textContent = errorText(e); });

    return h("div", { class: "stack share-dialog" },
      h("div", { class: "share-explain" },
        h("span", { class: "share-explain-icon", "aria-hidden": "true" }, icon("external")),
        h("div", {},
          h("strong", {}, "Read-only link"),
          h("p", { class: "muted small" }, "Anyone with the link and a Veora account can read this chat, but can't write in it. Messages you add later will be visible too."))),
      h("div", { class: "row share-row" }, field, copyBtn),
      status,
      h("div", { class: "row end" }, stopBtn, nativeBtn, h("button", { class: "btn ghost", type: "button", onclick: () => close() }, "Done")));
  });
}

/** Read-only page for ?share=<link_id>. onExit() goes to the user's own chats. */
export function renderSharedChat(root, linkId, { onExit }) {
  const thread = h("div", { class: "thread shared-thread" }, sharedSkeleton());
  const page = h("div", { class: "shared-page" },
    h("header", { class: "shared-head" },
      h("div", { class: "brand small" }, h("img", { src: "logo.png", alt: "", width: "28", height: "28" }), h("span", {}, "Veora")),
      h("span", { class: "shared-badge" }, "Read only"),
      h("span", { class: "grow" }),
      h("button", { class: "btn", type: "button", onclick: onExit }, "Open my chats")),
    h("main", { class: "shared-scroll" }, thread));
  root.replaceChildren(page);

  // Images open in the lightbox with every image of the chat.
  thread.addEventListener("click", (e) => {
    const img = e.target.closest(".msg-images img, .gen-image img");
    if (!img) return;
    e.preventDefault();
    const all = [...thread.querySelectorAll(".msg-images img, .gen-image img")];
    openLightbox(all.map((el) => ({ src: el.currentSrc || el.src, alt: el.alt })), all.indexOf(img));
  });

  function notice(title, text) {
    thread.replaceChildren(h("div", { class: "welcome shared-notice" },
      h("div", { class: "welcome-logo" }, h("img", { src: "logo.png", alt: "", width: "64", height: "64" })),
      h("h1", {}, title),
      h("p", { class: "muted" }, text),
      h("button", { class: "btn primary", type: "button", onclick: onExit }, "Go to Veora")));
  }

  api.share(linkId).then((res) => {
    if (!Array.isArray(res?.result)) {
      notice("Link not found", "This link was turned off or never existed. Ask the person who sent it for a new one.");
      return;
    }
    const messages = res.result.flatMap(fromHistory).filter((m) => m.role === "user" || m.text || m.image || m.audio || m.video);
    if (!messages.length) {
      notice("Nothing to show", "This chat is empty or was deleted by its owner.");
      return;
    }
    thread.replaceChildren(
      ...messages.map(renderShared),
      h("p", { class: "shared-foot muted small" }, "Shared from Veora · read only"));
  }).catch((e) => {
    if (e.status === 401) return;   // the session ended; api.js already sent the user to sign in
    notice("Couldn't open the chat", errorText(e));
  });

  return () => page.remove();
}

function fadeImg(src, alt) {
  const done = (e) => e.target.classList.add("loaded");
  return h("img", { src, alt, loading: "lazy", class: "fade-img", onload: done, onerror: done });
}

function renderShared(m) {
  if (m.role === "user") {
    return h("div", { class: "msg user" },
      m.images?.length > 0 && h("div", { class: "msg-images" }, m.images.map((src) => h("a", { href: src, target: "_blank", rel: "noopener" }, fadeImg(src, "Attached image")))),
      m.text && h("div", { class: "bubble" }, m.text));
  }
  return h("div", { class: "msg assistant" },
    h("div", { class: "avatar" }, h("img", { src: "logo.png", alt: "" })),
    h("div", { class: "msg-body" },
      m.model && h("div", { class: "msg-model" }, modelLabel(m.model)),
      m.text && markdown(m.text),
      m.image && h("a", { href: m.image, target: "_blank", rel: "noopener", class: "gen-image" }, fadeImg(m.image, "Generated image")),
      m.audio && h("div", { class: "gen-audio" }, audioCard(m.audio, { label: voiceLabel(m.model) })),
      m.video && h("video", { src: m.video, controls: true, playsinline: true, class: "gen-video" })));
}

function sharedSkeleton() {
  return h("div", { class: "stack" }, [70, 45, 85].map((w, i) => h("div", { class: `msg ${i % 2 ? "assistant" : "user"}` },
    h("span", { class: "skel", style: `width:${w}%;height:${i % 2 ? 72 : 38}px;border-radius:14px` }))));
}

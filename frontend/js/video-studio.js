import { api } from "./api.js";
import { h, icon, toast, errorText, confirmModal, modal } from "./dom.js";
import { mark } from "./model-picker.js";
import { openPlans } from "./billing.js";
import { improveButton } from "./prompt-improve.js";

const SETTINGS_KEY = "veora_video_settings";
const MAX_FRAME_BYTES = 5 * 1024 * 1024;     // backend MAX_IMAGE_SIZE
const FRAME_TYPES = "image/jpeg,image/png,image/webp";
const POLL_MS = 6000;
const PAID_PLANS = ["Starter", "Basic", "Plus", "Premium", "Max", "Elite"];
const IDEAS = [
  "A paper boat drifting down a rainy neon street at night, cinematic, slow camera follow",
  "Golden retriever puppy running through autumn leaves in slow motion",
  "Aerial shot over turquoise ocean waves crashing on black volcanic rocks",
  "A cozy coffee shop interior, steam rising from a latte, soft morning light",
];

// Mirrors video_credit_cost in backend/api/config.py: the model's price per second at that
// resolution, in video credits of `creditUsd` each.
export function videoCost(model, duration, resolution, creditUsd = 0.75) {
  const prices = model?.price || {};
  const perSecond = prices[resolution] ?? Math.max(creditUsd / 8, ...Object.values(prices));
  return Math.max(1, Math.ceil(Math.round((perSecond * duration / creditUsd) * 1e6) / 1e6));
}

function svg(d, cls = "icon") {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("class", cls);
  el.setAttribute("aria-hidden", "true");
  for (const part of [].concat(d)) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", part);
    el.append(p);
  }
  return el;
}
const ICON = {
  film: () => svg(["M4 5h16v14H4z", "M8 5v14", "M16 5v14", "M4 9h4", "M4 15h4", "M16 9h4", "M16 15h4"]),
  image: () => svg(["M4 5h16v14H4z", "M4 16l5-5 4 4 3-3 4 4", "M15 9h.01"]),
  download: () => svg(["M12 4v11", "M7 10.5l5 5 5-5", "M5 20h14"]),
  reuse: () => svg(["M4 12a8 8 0 0 1 14-5.3", "M18 3v4h-4", "M20 12a8 8 0 0 1-14 5.3", "M6 21v-4h4"]),
  trash: () => svg(["M5 7h14", "M9 7V4h6v3", "M7 7l1 13h8l1-13"]),
  close: () => svg(["M6 6l12 12", "M18 6L6 18"]),
  sound: () => svg(["M4 9v6h4l5 4V5L8 9z", "M16.5 8.5a5 5 0 0 1 0 7", "M19 6a8.5 8.5 0 0 1 0 12"]),
  mute: () => svg(["M4 9v6h4l5 4V5L8 9z", "M17 9l5 6", "M22 9l-5 6"]),
  alert: () => svg(["M12 3l10 18H2z", "M12 10v5", "M12 18h.01"]),
  spark: () => svg(["M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"]),
};

const ratioParts = (r) => r.split(":").map(Number);
const formatElapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Video studio shown instead of the chat when a video model is selected.
 * onSelectModel(id) -> Promise (rejects to revert); onChange() reloads the profile after spending credits.
 */
export function createVideoStudio({ onSelectModel, onChange = () => {}, getProfile = () => null }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })();
  const st = {
    models: [],
    maxPrompt: 2000,
    creditUsd: 0.75,
    model: null,
    duration: saved.duration ?? 8,
    aspect: saved.aspect ?? "16:9",
    resolution: saved.resolution ?? "720p",
    audio: saved.audio ?? true,
    seed: "",
    frames: { first_frame: null, last_frame: null },   // { file, url }
    items: [],
    loaded: false,
    busy: false,
    credits: null,
    profile: null,
    visible: false,
  };
  let pollTimer = 0;
  let tickTimer = 0;

  const spec = () => st.models.find((m) => m.id === st.model) || st.models[0] || null;
  const cost = () => videoCost(spec(), st.duration, st.resolution, st.creditUsd);
  const paid = () => PAID_PLANS.some((k) => st.profile?.[k]);
  const pending = () => st.items.some((v) => v.status === "pending" || v.status === "processing");

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ duration: st.duration, aspect: st.aspect, resolution: st.resolution, audio: st.audio }));
    } catch { /* private mode */ }
  }

  // Keeps the choices valid for the selected model.
  function clampToModel() {
    const m = spec();
    if (!m) return;
    if (!m.durations.includes(st.duration)) st.duration = m.durations.reduce((a, b) => (Math.abs(b - 8) < Math.abs(a - 8) ? b : a));
    if (!m.aspect_ratios.includes(st.aspect)) st.aspect = m.aspect_ratios[0];
    if (!m.resolutions.includes(st.resolution)) st.resolution = m.resolutions.at(-1);
    if (!m.audio) st.audio = false;
  }

  // ---------- prompt ----------
  const prompt = h("textarea", {
    class: "vs-prompt-input", rows: "5", "aria-label": "Video prompt",
    placeholder: "Describe the scene: subject, action, setting, camera movement, mood…",
    oninput: renderFooter,
    onkeydown: (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } },
  });
  const counter = h("span", { class: "vs-counter" });

  // ---------- layout ----------
  const settings = h("div", { class: "vs-settings" });
  const costLine = h("div", { class: "vs-cost" });
  const genBtn = h("button", { class: "btn vs-generate", type: "button", onclick: generate });
  const footer = h("div", { class: "vs-footer" }, costLine, genBtn);
  const panel = h("aside", { class: "vs-panel" },
    h("div", { class: "vs-panel-scroll" },
      h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Prompt"),
          h("span", { class: "vs-head-right" }, counter, improveButton({ field: prompt, kind: "video", getProfile, label: "Improve" }))),
        h("div", { class: "vs-prompt-wrap" }, prompt)),
      settings),
    footer);
  const gallery = h("div", { class: "vs-gallery" });
  const galleryHead = h("div", { class: "vs-gallery-head" });
  const el = h("div", { class: "vs" }, panel, h("section", { class: "vs-main" }, galleryHead, gallery));

  // ---------- settings ----------
  function chipGroup(label, values, current, onPick, render = (v) => v) {
    return h("div", { class: "vs-field" },
      h("div", { class: "vs-field-head" }, h("span", {}, label)),
      h("div", { class: "vs-chips", role: "radiogroup", "aria-label": label }, values.map((v) => h("button", {
        class: `vs-chip${v === current ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(v === current),
        onclick: () => onPick(v),
      }, render(v)))));
  }

  function aspectIcon(r) {
    const [w, hh] = ratioParts(r);
    const scale = 18 / Math.max(w, hh);
    return h("span", { class: "vs-aspect" },
      h("i", { style: `width:${Math.round(w * scale)}px;height:${Math.round(hh * scale)}px`, "aria-hidden": "true" }), r);
  }

  function frameSlot(type, label) {
    const frame = st.frames[type];
    const input = h("input", {
      type: "file", accept: FRAME_TYPES, hidden: true,
      onchange: () => { setFrame(type, input.files[0]); input.value = ""; },
    });
    const slot = h("div", {
      class: `vs-frame${frame ? " filled" : ""}`, role: "button", tabindex: "0",
      "aria-label": frame ? `${label}: change image` : `${label}: add image`,
      onclick: () => input.click(),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } },
      ondragover: (e) => { e.preventDefault(); slot.classList.add("drag"); },
      ondragleave: () => slot.classList.remove("drag"),
      ondrop: (e) => { e.preventDefault(); slot.classList.remove("drag"); setFrame(type, e.dataTransfer.files[0]); },
    },
      input,
      frame
        ? [h("img", { src: frame.url, alt: "" }),
          h("button", { class: "vs-frame-remove", type: "button", "aria-label": `Remove ${label.toLowerCase()}`,
            onclick: (e) => { e.stopPropagation(); setFrame(type, null); } }, ICON.close())]
        : [ICON.image(), h("span", {}, label)]);
    return slot;
  }

  function setFrame(type, file) {
    const old = st.frames[type];
    if (old) URL.revokeObjectURL(old.url);
    st.frames[type] = null;
    if (file) {
      if (!FRAME_TYPES.split(",").includes(file.type)) toast("Use a JPG, PNG or WebP image.");
      else if (file.size > MAX_FRAME_BYTES) toast("Image is too large");
      else st.frames[type] = { file, url: URL.createObjectURL(file) };
    }
    renderSettings();
  }

  function renderSettings() {
    const m = spec();
    if (!m) {
      settings.replaceChildren(h("div", { class: "vs-field" }, h("span", { class: "skel" }), h("span", { class: "skel" }), h("span", { class: "skel skel-small" })));
      renderFooter();
      return;
    }
    const durations = m.durations;
    const slider = h("input", {
      class: "vs-range", type: "range", min: String(durations[0]), max: String(durations.at(-1)), step: "1",
      value: String(st.duration), "aria-label": "Duration in seconds",
      style: `--p:${((st.duration - durations[0]) / (durations.at(-1) - durations[0] || 1)) * 100}%`,
      oninput: () => {
        st.duration = Number(slider.value);
        durLabel.textContent = `${st.duration} s`;
        slider.style.setProperty("--p", `${((st.duration - durations[0]) / (durations.at(-1) - durations[0] || 1)) * 100}%`);
        saveSettings();
        renderFooter();
      },
    });
    const durLabel = h("strong", { class: "vs-dur" }, `${st.duration} s`);

    settings.replaceChildren(...[
      m.frames.length && h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Frames"), h("small", {}, "Optional")),
        h("div", { class: "vs-frames" },
          m.frames.includes("first_frame") && frameSlot("first_frame", "Start frame"),
          m.frames.includes("last_frame") && frameSlot("last_frame", "End frame")),
        h("p", { class: "vs-hint" }, "Add a photo to animate it. With an end frame the clip moves from one image to the other.")),

      h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Model")),
        h("div", { class: "vs-models", role: "radiogroup", "aria-label": "Model" }, st.models.map((x) => {
          const selected = x.id === m.id;
          return h("button", {
            class: `vs-model${selected ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(selected),
            onclick: () => pickModel(x.id),
          }, mark(x.id, "sm"), h("span", { class: "vs-model-text" }, h("strong", {}, x.name), h("small", {}, x.note)),
          // Price hint: credits for an 8-second clip (or the closest length) at the model's lowest resolution.
          h("span", { class: "ms-model-cost" }, `${videoCost(x, x.durations.reduce((a, b) => (Math.abs(b - 8) < Math.abs(a - 8) ? b : a)), x.resolutions[0], st.creditUsd)} cr`),
          selected && h("span", { class: "vs-check" }, icon("check")));
        }))),

      chipGroup("Aspect ratio", m.aspect_ratios, st.aspect, (v) => { st.aspect = v; saveSettings(); renderSettings(); }, aspectIcon),
      chipGroup("Resolution", m.resolutions, st.resolution, (v) => { st.resolution = v; saveSettings(); renderSettings(); }),

      h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Duration"), durLabel),
        slider,
        h("div", { class: "vs-range-ends" }, h("span", {}, `${durations[0]} s`), h("span", {}, `${durations.at(-1)} s`))),

      m.audio && h("label", { class: "vs-switch-row" },
        h("span", { class: "vs-switch-text" }, st.audio ? ICON.sound() : ICON.mute(),
          h("span", {}, h("strong", {}, "Sound"), h("small", {}, "Music, ambience and voices generated with the video"))),
        h("input", { type: "checkbox", class: "vs-switch", checked: st.audio,
          onchange: (e) => { st.audio = e.target.checked; saveSettings(); renderSettings(); } })),

      h("details", { class: "vs-advanced", open: Boolean(st.seed) },
        h("summary", {}, "Advanced"),
        h("label", { class: "vs-seed" },
          h("span", {}, h("strong", {}, "Seed"), h("small", {}, "Same seed and prompt give a similar result")),
          h("input", { class: "input", type: "number", min: "0", max: "2147483647", placeholder: "Random", value: st.seed,
            oninput: (e) => { st.seed = e.target.value.replace(/\D/g, "").slice(0, 10); } }))),
    ].filter(Boolean));
    renderFooter();
  }

  function renderFooter() {
    const n = prompt.value.length;
    counter.textContent = `${n} / ${st.maxPrompt}`;
    counter.classList.toggle("over", n > st.maxPrompt);
    const c = cost();
    const left = st.credits;
    const locked = st.profile && !paid();
    const short = left != null && left < c;

    costLine.replaceChildren(...[
      h("span", { class: "vs-cost-main" }, ICON.film(), `${c} video credit${c === 1 ? "" : "s"}`),
      left != null && h("small", {}, `${left} left this month`),
    ].filter(Boolean));

    genBtn.replaceChildren(st.busy ? h("span", { class: "spinner" }) : ICON.spark(),
      locked ? "Unlock video" : st.busy ? "Starting…" : "Generate video");
    genBtn.classList.toggle("upgrade", Boolean(locked || short));
    genBtn.disabled = st.busy || !spec() || (!locked && !short && (!prompt.value.trim() || n > st.maxPrompt));
    genBtn.title = short && !locked ? "Not enough video credits for these settings" : "";
  }

  async function pickModel(id) {
    if (id === st.model) return;
    const prev = st.model;
    st.model = id;
    clampToModel();
    renderSettings();
    try { await onSelectModel?.(id); } catch (e) {
      st.model = prev;
      clampToModel();
      renderSettings();
      toast(errorText(e));
    }
  }

  // ---------- generate ----------
  async function generate() {
    if (st.busy) return;
    if (st.profile && !paid()) { openPlans(st.profile); return; }
    if (st.credits != null && st.credits < cost()) {
      toast(st.credits > 0 ? "Not enough video credits for these settings. Try a shorter clip or 480p." : "You've used this month's videos.", "info");
      if (!st.credits) openPlans(st.profile);
      return;
    }
    const text = prompt.value.trim();
    if (!text || text.length > st.maxPrompt) { prompt.focus(); return; }

    const form = new FormData();
    form.append("prompt", text);
    form.append("model", spec().id);
    form.append("duration", String(st.duration));
    form.append("aspect_ratio", st.aspect);
    form.append("resolution", st.resolution);
    form.append("generate_audio", st.audio ? "true" : "false");
    if (st.seed !== "") form.append("seed", st.seed);
    for (const [type, frame] of Object.entries(st.frames)) if (frame) form.append(type, frame.file);

    st.busy = true;
    renderFooter();
    try {
      const res = await api.generateVideo(form);
      const item = res?.result;
      if (item?.id) st.items = [item, ...st.items.filter((v) => v.id !== item.id)];
      if (st.credits != null) st.credits = Math.max(0, st.credits - (res?.cost ?? cost()));
      renderGallery();
      startPolling();
      onChange();
    } catch (e) {
      toast(errorText(e));
    }
    st.busy = false;
    renderFooter();
  }

  // ---------- gallery ----------
  function card(v) {
    const [w, hh] = ratioParts(v.aspect_ratio || "16:9");
    const working = v.status === "pending" || v.status === "processing";
    const started = v.created_at ? Date.parse(v.created_at) : Date.now();
    let media;
    if (v.status === "completed" && v.url) {
      const video = h("video", { src: v.url, muted: true, loop: true, playsinline: true, preload: "metadata" });
      video.muted = true;
      media = h("button", {
        class: "vs-media", type: "button", style: `aspect-ratio:${w}/${hh}`, "aria-label": "Play video",
        onclick: () => openViewer(v),
        onmouseenter: () => video.play().catch(() => {}),
        onmouseleave: () => { video.pause(); },
      }, video, h("span", { class: "vs-badge" }, `${v.duration ?? ""}s`));
    } else if (working) {
      media = h("div", { class: "vs-media working", style: `aspect-ratio:${w}/${hh}` },
        h("div", { class: "vs-working" },
          h("span", { class: "spinner" }),
          h("strong", {}, v.status === "processing" ? "Generating…" : "In queue…"),
          h("small", { class: "vs-elapsed", "data-started": String(started) }, formatElapsed(Date.now() - started)),
          h("small", {}, "Usually takes 1–3 minutes")));
    } else {
      media = h("div", { class: "vs-media failed", style: `aspect-ratio:${w}/${hh}` },
        h("div", { class: "vs-working" }, ICON.alert(),
          h("strong", {}, v.error || "The video couldn't be generated. Please try again."),
          h("small", {}, v.cost > 1 ? `${v.cost} video credits were refunded.` : "Your video credit was refunded.")));
    }
    const model = st.models.find((m) => m.id === v.model);
    return h("article", { class: `vs-card ${v.status}`, "data-id": v.id },
      media,
      h("div", { class: "vs-card-body" },
        h("p", { class: "vs-card-prompt", title: v.prompt }, v.prompt || "—"),
        h("div", { class: "vs-meta" }, ...[
          model && h("span", {}, model.name),
          v.duration && h("span", {}, `${v.duration}s`),
          v.resolution && h("span", {}, v.resolution),
          v.aspect_ratio && h("span", {}, v.aspect_ratio),
          v.audio && h("span", { class: "vs-meta-icon", title: "With sound" }, icon("music")),
        ].filter(Boolean)),
        h("div", { class: "vs-actions" }, ...[
          v.status === "completed" && v.url && h("a", { class: "icon-btn tiny", href: v.url, target: "_blank", rel: "noopener", download: "", "aria-label": "Download", title: "Download" }, ICON.download()),
          h("button", { class: "icon-btn tiny", type: "button", "aria-label": "Use these settings", title: "Use these settings", onclick: () => reuse(v) }, ICON.reuse()),
          !working && h("button", { class: "icon-btn tiny danger-hover", type: "button", "aria-label": "Delete video", title: "Delete", onclick: () => remove(v) }, ICON.trash()),
        ].filter(Boolean))));
  }

  function renderGallery() {
    const done = st.items.filter((v) => v.status === "completed").length;
    galleryHead.replaceChildren(
      h("div", {}, h("h2", {}, "Video studio"), h("p", { class: "muted small" }, st.items.length ? `${done} ${done === 1 ? "video" : "videos"}` : "Turn a prompt or a photo into a short clip")));

    if (!st.loaded) {
      gallery.replaceChildren(...Array.from({ length: 3 }, () => h("div", { class: "vs-card skeleton" }, h("div", { class: "vs-media skel", style: "aspect-ratio:16/9" }))));
      return;
    }
    if (!st.items.length) {
      gallery.replaceChildren(h("div", { class: "vs-empty" },
        h("div", { class: "vs-empty-icon" }, ICON.film()),
        h("h3", {}, "Create your first video"),
        h("p", { class: "muted" }, "Describe a scene or add a photo, pick the format and press Generate."),
        h("div", { class: "vs-ideas" }, IDEAS.map((idea) => h("button", {
          class: "vs-idea", type: "button", onclick: () => { prompt.value = idea; renderFooter(); prompt.focus(); },
        }, idea)))));
      return;
    }
    gallery.replaceChildren(...st.items.map(card));
  }

  function openViewer(v) {
    modal(v.prompt?.length > 60 ? `${v.prompt.slice(0, 60)}…` : v.prompt || "Video", () => {
      const video = h("video", { class: "vs-viewer", src: v.url, controls: true, autoplay: true, loop: true, playsinline: true });
      return h("div", { class: "stack" }, video,
        h("div", { class: "row end" },
          h("a", { class: "btn", href: v.url, target: "_blank", rel: "noopener", download: "" }, "Download")));
    }, { wide: true });
  }

  function reuse(v) {
    if (v.model && st.models.some((m) => m.id === v.model)) pickModel(v.model);
    if (v.duration) st.duration = v.duration;
    if (v.aspect_ratio) st.aspect = v.aspect_ratio;
    if (v.resolution) st.resolution = v.resolution;
    if (v.audio != null) st.audio = v.audio;
    clampToModel();
    saveSettings();
    if (v.prompt) prompt.value = v.prompt;
    renderSettings();
    prompt.focus();
  }

  async function remove(v) {
    if (!(await confirmModal("Delete video?", "It will be removed from your studio."))) return;
    try {
      await api.deleteVideo(v.id);
      st.items = st.items.filter((x) => x.id !== v.id);
      renderGallery();
    } catch (e) { toast(errorText(e)); }
  }

  // ---------- data ----------
  async function loadModels() {
    if (st.models.length) return;
    try {
      const res = await api.videoModels();
      st.models = res?.result || [];
      st.maxPrompt = res?.max_prompt || st.maxPrompt;
      st.creditUsd = res?.credit_usd || st.creditUsd;
      if (!saved.duration && res?.defaults?.duration) st.duration = res.defaults.duration;
      if (!st.models.some((m) => m.id === st.model)) st.model = st.models[0]?.id || null;
      clampToModel();
    } catch (e) {
      if (e.status !== 401) toast(errorText(e));
    }
    renderSettings();
  }

  async function loadItems() {
    try {
      const res = await api.videoList();
      const before = new Map(st.items.map((v) => [v.id, v.status]));
      st.items = res?.result || [];
      st.loaded = true;
      // A clip that just finished: refresh it in place and tell the user.
      const finished = st.items.filter((v) => before.get(v.id) && before.get(v.id) !== v.status && !["pending", "processing"].includes(v.status));
      if (finished.some((v) => v.status === "completed")) toast("Your video is ready", "ok");
      if (finished.some((v) => v.status === "failed")) onChange();
    } catch (e) {
      st.loaded = true;
      if (e.status !== 401) toast(errorText(e));
    }
    renderGallery();
    if (pending()) startPolling(); else stopPolling();
  }

  function startPolling() {
    if (!st.visible) return;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(loadItems, POLL_MS);
    if (!tickTimer) {
      tickTimer = setInterval(() => {
        el.querySelectorAll(".vs-elapsed[data-started]").forEach((n) => { n.textContent = formatElapsed(Date.now() - Number(n.dataset.started)); });
      }, 1000);
    }
  }

  function stopPolling() {
    clearTimeout(pollTimer);
    clearInterval(tickTimer);
    pollTimer = 0;
    tickTimer = 0;
  }

  // Clip links are presigned and expire; reload the list once when one fails.
  let mediaRefreshed = false;
  gallery.addEventListener("error", (e) => {
    if (mediaRefreshed || !(e.target instanceof HTMLVideoElement)) return;
    mediaRefreshed = true;
    loadItems();
  }, true);

  renderSettings();
  renderGallery();

  return {
    el,
    setModel(id) {
      st.model = id;
      clampToModel();
      renderSettings();
    },
    setCredits(n) { st.credits = n; renderFooter(); },
    setPlan(profile) { st.profile = profile; renderFooter(); },
    show() {
      st.visible = true;
      loadModels();
      loadItems();
    },
    hide() {
      st.visible = false;
      stopPolling();
      el.querySelectorAll("video").forEach((v) => v.pause());
    },
    focus() { prompt.focus(); },
  };
}

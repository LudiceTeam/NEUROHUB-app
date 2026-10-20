import { api } from "./api.js";
import { h, icon, toast, errorText, confirmModal } from "./dom.js";
import { mark } from "./model-picker.js";
import { openPlans } from "./billing.js";
import { improveButton } from "./prompt-improve.js";
import { openLightbox } from "./lightbox.js";

const PAID_PLANS = ["Starter", "Basic", "Plus", "Premium", "Max", "Elite"];
const SETTINGS_KEY = "veora_photo_settings";
const POLL_MS = 3000;
const MAX_REF_BYTES = 5 * 1024 * 1024;   // backend MAX_IMAGE_SIZE
const REF_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IDEAS = [
  "A cozy reading nook by a rainy window, warm lamp light, photorealistic",
  "Minimal logo of a fox made of geometric shapes, orange on white",
  "Portrait of an astronaut cat, studio lighting, 85mm photo",
  "Poster for a summer jazz festival with bold lettering 'JAZZ NIGHTS'",
];

const ratioParts = (r) => r.split(":").map(Number);
const formatElapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Photo studio shown instead of the chat when an image model is selected.
 * onSelectModel(id) -> Promise (rejects to revert); onChange() reloads the profile after spending requests.
 */
export function createPhotoStudio({ onSelectModel, onChange = () => {}, getProfile = () => null }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })();
  const st = {
    models: [], ratios: ["1:1"], resolutions: { "1K": 1 }, maxVariants: 4, maxRefs: 4, maxPrompt: 2000,
    model: null, ratio: saved.ratio ?? "1:1", resolution: saved.resolution ?? "1K", count: saved.count ?? 1,
    refs: [],   // { file, url }
    items: [], loaded: false, busy: false, credits: null, profile: null, visible: false,
  };
  let pollTimer = 0;
  let tickTimer = 0;

  const spec = () => st.models.find((m) => m.id === st.model) || st.models[0] || null;
  const perImage = () => st.resolutions[st.resolution] ?? 1;
  const cost = () => perImage() * st.count;
  const paid = () => PAID_PLANS.some((k) => st.profile?.[k]);
  const pending = () => st.items.some((j) => j.status === "pending" || j.status === "processing");
  const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ratio: st.ratio, resolution: st.resolution, count: st.count })); } catch { /* private mode */ } };

  // ---------- layout ----------
  const prompt = h("textarea", {
    class: "vs-prompt-input", rows: "4", "aria-label": "Image prompt",
    placeholder: "Describe the image: subject, style, lighting, colors, camera…",
    oninput: renderFooter,
    onkeydown: (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } },
  });
  const counter = h("span", { class: "vs-counter" });
  const settings = h("div", { class: "vs-settings" });
  const costLine = h("div", { class: "vs-cost" });
  const genBtn = h("button", { class: "btn vs-generate", type: "button", onclick: generate });
  const panel = h("aside", { class: "vs-panel" },
    h("div", { class: "vs-panel-scroll" },
      h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Prompt"),
          h("span", { class: "vs-head-right" }, counter, improveButton({ field: prompt, kind: "image", getProfile, label: "Improve" }))),
        h("div", { class: "vs-prompt-wrap" }, prompt)),
      settings),
    h("div", { class: "vs-footer" }, costLine, genBtn));
  const gallery = h("div", { class: "ps-gallery" });
  const head = h("div", { class: "vs-gallery-head" });
  const el = h("div", { class: "vs ps" }, panel, h("section", { class: "vs-main" }, head, gallery));

  // ---------- reference photos ----------
  function addRefs(files) {
    for (const file of files) {
      if (st.refs.length >= st.maxRefs) { toast(`Up to ${st.maxRefs} photos.`, "info"); break; }
      if (!REF_TYPES.includes(file.type)) { toast("Use a JPG, PNG or WebP image."); continue; }
      if (file.size > MAX_REF_BYTES) { toast("Image is too large"); continue; }
      st.refs.push({ file, url: URL.createObjectURL(file) });
    }
    renderSettings();
  }

  function removeRef(i) {
    URL.revokeObjectURL(st.refs[i].url);
    st.refs.splice(i, 1);
    renderSettings();
  }

  function refsField() {
    const input = h("input", { type: "file", accept: REF_TYPES.join(","), multiple: true, hidden: true,
      onchange: () => { addRefs([...input.files]); input.value = ""; } });
    const add = st.refs.length < st.maxRefs && h("button", {
      class: "ps-ref add", type: "button", "aria-label": "Add photo",
      onclick: () => input.click(),
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("drag"); },
      ondragleave: (e) => e.currentTarget.classList.remove("drag"),
      ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove("drag"); addRefs([...e.dataTransfer.files]); },
    }, icon("plus"));
    return h("div", { class: "vs-field" },
      h("div", { class: "vs-field-head" }, h("span", {}, "Reference photos"), h("small", {}, `${st.refs.length} / ${st.maxRefs}`)),
      h("div", { class: "ps-refs" }, input,
        st.refs.map((r, i) => h("div", { class: "ps-ref" }, h("img", { src: r.url, alt: "" }),
          h("button", { class: "vs-frame-remove", type: "button", "aria-label": "Remove photo", onclick: () => removeRef(i) }, icon("close")))),
        add),
      h("p", { class: "vs-hint" }, "Add photos to edit them, or to keep a face, product or style in the new image."));
  }

  // ---------- settings ----------
  function aspectIcon(r) {
    const [w, hh] = ratioParts(r);
    const scale = 16 / Math.max(w, hh);
    return h("span", { class: "vs-aspect" }, h("i", { style: `width:${Math.round(w * scale)}px;height:${Math.round(hh * scale)}px`, "aria-hidden": "true" }), r);
  }

  function chips(label, values, current, onPick, render = (v) => v) {
    return h("div", { class: "vs-field" },
      h("div", { class: "vs-field-head" }, h("span", {}, label)),
      h("div", { class: "vs-chips", role: "radiogroup", "aria-label": label }, values.map((v) => h("button", {
        class: `vs-chip${v === current ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(v === current),
        onclick: () => onPick(v),
      }, render(v)))));
  }

  function renderSettings() {
    const m = spec();
    settings.replaceChildren(
      refsField(),
      h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Model")),
        m ? h("div", { class: "vs-models ps-models", role: "radiogroup", "aria-label": "Model" }, st.models.map((x) => {
          const selected = x.id === m.id;
          return h("button", {
            class: `vs-model${selected ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(selected),
            onclick: () => pickModel(x.id),
          }, mark(x.id, "sm"), h("span", { class: "vs-model-text" }, h("strong", {}, x.name), h("small", {}, x.note)),
          selected && h("span", { class: "vs-check" }, icon("check")));
        })) : h("span", { class: "skel" })),
      chips("Aspect ratio", st.ratios, st.ratio, (v) => { st.ratio = v; save(); renderSettings(); }, aspectIcon),
      chips("Quality", Object.keys(st.resolutions), st.resolution, (v) => { st.resolution = v; save(); renderSettings(); },
        (v) => h("span", {}, v === "1K" ? "Standard" : "High", h("small", { class: "ps-chip-sub" }, v))),
      chips("Variants", Array.from({ length: st.maxVariants }, (_, i) => i + 1), st.count, (v) => { st.count = v; save(); renderSettings(); }));
    renderFooter();
  }

  function renderFooter() {
    const n = prompt.value.length;
    counter.textContent = `${n} / ${st.maxPrompt}`;
    counter.classList.toggle("over", n > st.maxPrompt);
    const c = cost();
    const locked = st.profile && !paid();
    const short = st.credits != null && st.credits < c;
    costLine.replaceChildren(...[
      h("span", { class: "vs-cost-main" }, icon("gallery"), `${c} premium request${c === 1 ? "" : "s"}`),
      st.credits != null && h("small", {}, `${st.credits} left`),
    ].filter(Boolean));
    genBtn.replaceChildren(st.busy ? h("span", { class: "spinner" }) : icon("spark"),
      locked ? "Unlock images" : st.busy ? "Starting…" : st.count > 1 ? `Create ${st.count} images` : "Create image");
    genBtn.disabled = st.busy || !spec() || (!locked && !short && (!prompt.value.trim() || n > st.maxPrompt));
  }

  async function pickModel(id) {
    if (id === st.model) return;
    const prev = st.model;
    st.model = id;
    renderSettings();
    try { await onSelectModel?.(id); } catch (e) { st.model = prev; renderSettings(); toast(errorText(e)); }
  }

  // ---------- generate ----------
  async function generate() {
    if (st.busy) return;
    if (st.profile && !paid()) { openPlans(st.profile); return; }
    if (st.credits != null && st.credits < cost()) {
      toast(st.count > 1 ? "Not enough premium requests. Try fewer variants or Standard quality." : "Not enough premium requests for this image.", "info");
      return;
    }
    const text = prompt.value.trim();
    if (!text) { prompt.focus(); return; }
    const form = new FormData();
    form.append("prompt", text);
    form.append("model", spec().id);
    form.append("aspect_ratio", st.ratio);
    form.append("resolution", st.resolution);
    form.append("count", String(st.count));
    for (const r of st.refs) form.append("references", r.file);
    st.busy = true;
    renderFooter();
    try {
      const res = await api.generateImages(form);
      if (res?.result?.id) st.items = [res.result, ...st.items.filter((j) => j.id !== res.result.id)];
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
  function allImages() {
    return st.items.flatMap((j) => (j.urls || []).map((url) => ({ src: url, alt: j.prompt || "" })));
  }

  // Use a finished image as a reference for the next one (needs CORS on the bucket for GET).
  async function useAsReference(url) {
    if (st.refs.length >= st.maxRefs) { toast(`Up to ${st.maxRefs} photos.`, "info"); return; }
    try {
      const blob = await (await fetch(url)).blob();
      addRefs([new File([blob], "reference.png", { type: REF_TYPES.includes(blob.type) ? blob.type : "image/png" })]);
      prompt.focus();
    } catch {
      toast("Couldn't load this image. Download it and add it as a photo.");
    }
  }

  function job(j) {
    const [w, hh] = ratioParts(j.aspect_ratio || "1:1");
    const working = j.status === "pending" || j.status === "processing";
    const started = j.created_at ? Date.parse(j.created_at) : Date.now();
    const model = st.models.find((m) => m.id === j.model);
    let tiles;
    if (j.status === "completed" && j.urls?.length) {
      tiles = j.urls.map((url) => h("div", { class: "ps-tile", style: `aspect-ratio:${w}/${hh}` },
        h("img", { src: url, alt: j.prompt || "Generated image", loading: "lazy", onload: (e) => e.target.classList.add("loaded"),
          onclick: () => { const all = allImages(); openLightbox(all, all.findIndex((x) => x.src === url)); } }),
        h("div", { class: "ps-tile-actions" },
          h("button", { class: "gal-action", type: "button", title: "Use as reference", "aria-label": "Use as reference", onclick: () => useAsReference(url) }, icon("edit")),
          h("a", { class: "gal-action", href: url, target: "_blank", rel: "noopener", download: "", title: "Download", "aria-label": "Download" }, icon("download")))));
    } else if (working) {
      tiles = Array.from({ length: j.count || 1 }, (_, i) => h("div", { class: "ps-tile working", style: `aspect-ratio:${w}/${hh}` },
        i === 0 && h("div", { class: "ps-working" }, h("span", { class: "spinner" }),
          h("small", { class: "vs-elapsed", "data-started": String(started) }, formatElapsed(Date.now() - started)))));
    } else {
      tiles = [h("div", { class: "ps-failed" }, icon("alert"),
        h("span", {}, j.error || "The image couldn't be generated. Please try again."),
        h("small", { class: "muted" }, "Premium requests were refunded."))];
    }
    return h("article", { class: `ps-job ${j.status}` },
      h("div", { class: `ps-tiles n${Math.min(tiles.length, 4)}` }, tiles),
      h("div", { class: "ps-job-foot" },
        h("p", { class: "ps-prompt", title: j.prompt }, j.prompt || "—"),
        h("div", { class: "vs-meta" }, ...[
          model && h("span", {}, model.name),
          j.aspect_ratio && h("span", {}, j.aspect_ratio),
          j.resolution === "2K" && h("span", {}, "2K"),
        ].filter(Boolean)),
        h("div", { class: "vs-actions" }, ...[
          h("button", { class: "icon-btn tiny", type: "button", title: "Use these settings", "aria-label": "Use these settings", onclick: () => reuse(j) }, icon("plus")),
          !working && h("button", { class: "icon-btn tiny danger-hover", type: "button", title: "Delete", "aria-label": "Delete", onclick: () => remove(j) }, icon("trash")),
        ].filter(Boolean))));
  }

  function renderGallery() {
    const done = st.items.reduce((n, j) => n + (j.urls?.length || 0), 0);
    head.replaceChildren(h("div", {}, h("h2", {}, "Photo studio"),
      h("p", { class: "muted small" }, st.items.length ? `${done} ${done === 1 ? "image" : "images"}` : "Create and edit images with the best models")));
    if (!st.loaded) {
      gallery.replaceChildren(...Array.from({ length: 4 }, () => h("div", { class: "ps-job" }, h("div", { class: "ps-tile skel", style: "aspect-ratio:1" }))));
      return;
    }
    if (!st.items.length) {
      gallery.replaceChildren(h("div", { class: "vs-empty" },
        h("div", { class: "vs-empty-icon" }, icon("gallery")),
        h("h3", {}, "Create your first image"),
        h("p", { class: "muted" }, "Describe a picture or add a photo to edit, pick a model and press Create."),
        h("div", { class: "vs-ideas" }, IDEAS.map((idea) => h("button", {
          class: "vs-idea", type: "button", onclick: () => { prompt.value = idea; renderFooter(); prompt.focus(); },
        }, idea)))));
      return;
    }
    gallery.replaceChildren(...st.items.map(job));
  }

  function reuse(j) {
    if (j.prompt) prompt.value = j.prompt;
    if (j.aspect_ratio && st.ratios.includes(j.aspect_ratio)) st.ratio = j.aspect_ratio;
    if (j.resolution && st.resolutions[j.resolution]) st.resolution = j.resolution;
    if (j.model && st.models.some((m) => m.id === j.model)) pickModel(j.model);
    save();
    renderSettings();
    prompt.focus();
  }

  async function remove(j) {
    if (!(await confirmModal("Delete images?", "They will be removed from your photo studio."))) return;
    try {
      await api.deleteImages(j.id);
      st.items = st.items.filter((x) => x.id !== j.id);
      renderGallery();
    } catch (e) { toast(errorText(e)); }
  }

  // ---------- data ----------
  async function loadModels() {
    if (st.models.length) return;
    try {
      const res = await api.imageModels();
      st.models = res?.result || [];
      st.ratios = res?.aspect_ratios || st.ratios;
      st.resolutions = res?.resolutions || st.resolutions;
      st.maxVariants = res?.max_variants || st.maxVariants;
      st.maxRefs = res?.max_references || st.maxRefs;
      st.maxPrompt = res?.max_prompt || st.maxPrompt;
      if (!st.ratios.includes(st.ratio)) st.ratio = st.ratios[0];
      if (!st.resolutions[st.resolution]) st.resolution = Object.keys(st.resolutions)[0];
      st.count = Math.min(st.count, st.maxVariants);
      if (!st.models.some((m) => m.id === st.model)) st.model = st.models[0]?.id || null;
    } catch (e) {
      if (e.status !== 401) toast(errorText(e));
    }
    renderSettings();
  }

  async function loadItems() {
    try {
      const before = new Map(st.items.map((j) => [j.id, j.status]));
      st.items = (await api.imageList())?.result || [];
      st.loaded = true;
      const finished = st.items.filter((j) => before.get(j.id) && before.get(j.id) !== j.status && !["pending", "processing"].includes(j.status));
      if (finished.length) onChange();
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

  // Image links are presigned and expire; reload once if images stop loading.
  let refreshed = false;
  gallery.addEventListener("error", (e) => {
    if (refreshed || !(e.target instanceof HTMLImageElement)) return;
    refreshed = true;
    loadItems();
  }, true);

  renderSettings();
  renderGallery();

  return {
    el,
    setModel(id) { st.model = id; renderSettings(); },
    setCredits(n) { st.credits = n; renderFooter(); },
    setPlan(profile) { st.profile = profile; renderFooter(); },
    show() { st.visible = true; loadModels(); loadItems(); },
    hide() { st.visible = false; stopPolling(); },
    focus() { prompt.focus(); },
  };
}

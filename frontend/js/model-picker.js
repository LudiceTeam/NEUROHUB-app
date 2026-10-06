import { MODEL_GROUPS, PREMIUM_MODELS } from "./config.js";
import { h, icon } from "./dom.js";

const PROVIDERS = {
  auto: { name: "Veora", color: "linear-gradient(135deg, var(--accent), var(--accent-2))", mark: "✦" },
  openai: { name: "OpenAI", color: "#10a37f", mark: "O" },
  anthropic: { name: "Anthropic", color: "#d97757", mark: "A" },
  google: { name: "Google", color: "#4285f4", mark: "G" },
  qwen: { name: "Qwen", color: "#615ced", mark: "Q" },
  "meta-llama": { name: "Meta", color: "#0668e1", mark: "M" },
  mistralai: { name: "Mistral", color: "#fa520f", mark: "M" },
  rekaai: { name: "Reka", color: "#7c3aed", mark: "R" },
  "bytedance-seed": { name: "ByteDance", color: "#325ab4", mark: "B" },
  bytedance: { name: "ByteDance", color: "#325ab4", mark: "B" },
  "z-ai": { name: "Z.ai", color: "#1f2937", mark: "Z" },
  "x-ai": { name: "xAI", color: "#111111", mark: "X" },
  moonshotai: { name: "Moonshot", color: "#111827", mark: "K" },
  nvidia: { name: "NVIDIA", color: "#76b900", mark: "N" },
};

export const IMAGE_MODELS = new Set(MODEL_GROUPS.find(([g]) => g === "Image generation")?.[1] || []);
export const VOICE_MODELS = new Set(MODEL_GROUPS.find(([g]) => g === "Voice")?.[1] || []);

export function modelLabel(id) {
  if (!id) return "";
  if (id === "auto") return "Auto";
  // Voice models are "<model>:<voice>"; show the voice after the model name.
  const [base, voice] = VOICE_MODELS.has(id) ? id.split(/:(?=[^:]+$)/) : [id];
  const name = base.split("/").pop().replace(/:free$/, "")
    .replace(/-/g, " ")
    .replace(/\b(gpt|glm|vl|it|ui|tts)\b/gi, (w) => w.toUpperCase())
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return voice ? `${name} · ${voice.charAt(0).toUpperCase()}${voice.slice(1)}` : name;
}

function provider(id) {
  if (id === "auto") return PROVIDERS.auto;
  const key = id.split("/")[0];
  return PROVIDERS[key] || { name: key, color: "var(--muted)", mark: key[0]?.toUpperCase() || "?" };
}

function tags(id) {
  const out = [];
  if (IMAGE_MODELS.has(id)) out.push(["Image", "image"]);
  else if (VOICE_MODELS.has(id)) out.push(["Voice", "voice"]);
  else if (PREMIUM_MODELS.has(id)) out.push(["Premium", "premium"]);
  if (id.endsWith(":free")) out.push(["Free", "free"]);
  if (/thinking/.test(id)) out.push(["Reasoning", "reasoning"]);
  return out;
}

function mark(id, size = "") {
  const p = provider(id);
  return h("span", { class: `model-mark ${size}`, style: `background:${p.color}`, "aria-hidden": "true" }, p.mark);
}

// A custom dropdown for choosing the model. onSelect(id) may be async; throwing reverts the choice.
export function createModelPicker({ value = "auto", onSelect }) {
  let current = value;
  let open = false;
  let activeIndex = -1;
  let items = [];   // rendered option buttons currently visible

  const label = h("span", { class: "model-trigger-label" });
  const triggerMark = h("span", { class: "model-trigger-mark" });
  const trigger = h("button", {
    class: "model-trigger", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false",
    onclick: () => (open ? close() : show()),
  }, triggerMark, label, h("span", { class: "chevron", "aria-hidden": "true" }));

  const search = h("input", {
    class: "model-search", type: "search", placeholder: "Search models", "aria-label": "Search models",
    autocomplete: "off", spellcheck: "false",
    oninput: () => renderList(),
    onkeydown: onKey,
  });
  const list = h("div", { class: "model-list", role: "listbox", "aria-label": "Models" });
  const panel = h("div", { class: "model-panel", hidden: true },
    h("div", { class: "model-search-wrap" }, search),
    list);
  const scrim = h("div", { class: "model-scrim", hidden: true, onclick: () => close() });
  const el = h("div", { class: "model-picker" }, trigger, scrim, panel);

  function renderTrigger() {
    triggerMark.replaceChildren(mark(current, "sm"));
    label.textContent = modelLabel(current);
    trigger.title = current === "auto" ? "Auto" : current;
  }

  function option(id, desc) {
    const selected = id === current;
    const btn = h("button", {
      class: `model-option${selected ? " selected" : ""}`, type: "button", role: "option",
      "aria-selected": String(selected), "data-id": id,
      onclick: () => choose(id),
      onmousemove: () => setActive(items.indexOf(btn)),
    },
      mark(id),
      h("span", { class: "model-option-text" },
        h("span", { class: "model-option-name" }, modelLabel(id)),
        h("span", { class: "model-option-desc" }, desc)),
      h("span", { class: "model-tags" }, tags(id).map(([text, kind]) => h("span", { class: `model-tag ${kind}` }, text))),
      h("span", { class: "model-check", "aria-hidden": "true" }, selected ? "✓" : ""));
    return btn;
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const sections = [];
    for (const [group, ids] of MODEL_GROUPS) {
      const matches = ids.filter((id) => !q || id.toLowerCase().includes(q) || modelLabel(id).toLowerCase().includes(q)
        || provider(id).name.toLowerCase().includes(q) || group.toLowerCase().includes(q));
      if (!matches.length) continue;
      sections.push(h("div", { class: "model-group", role: "group", "aria-label": group },
        h("div", { class: "model-group-title" }, group === "Smart" ? "Recommended" : group),
        matches.map((id) => option(id, id === "auto" ? "Picks the best model for each request"
          : VOICE_MODELS.has(id) ? "Reads your text aloud" : id))));
    }
    list.replaceChildren(...(sections.length ? sections : [h("p", { class: "model-empty" }, "No models found")]));
    items = [...list.querySelectorAll(".model-option")];
    items.forEach((b, i) => b.style.setProperty("--i", String(Math.min(i, 14))));
    setActive(Math.max(0, items.findIndex((b) => b.dataset.id === current)), false);
  }

  function setActive(i, scroll = true) {
    items[activeIndex]?.classList.remove("active");
    activeIndex = i;
    const btn = items[i];
    if (!btn) return;
    btn.classList.add("active");
    if (scroll) btn.scrollIntoView({ block: "nearest" });
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(items.length - 1, activeIndex + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, activeIndex - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[activeIndex]) choose(items[activeIndex].dataset.id); }
    else if (e.key === "Escape") { e.preventDefault(); close(); trigger.focus(); }
  }

  function onOutside(e) { if (!el.contains(e.target)) close(); }

  function show() {
    open = true;
    search.value = "";
    renderList();
    panel.hidden = false;
    scrim.hidden = false;
    el.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside);
    items[activeIndex]?.scrollIntoView({ block: "center" });
    // Don't pop the on-screen keyboard on phones.
    if (matchMedia("(hover: hover)").matches) search.focus();
  }

  function close() {
    if (!open) return;
    open = false;
    panel.hidden = true;
    scrim.hidden = true;
    el.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside);
  }

  async function choose(id) {
    close();
    if (id === current) return;
    const prev = current;
    current = id;
    renderTrigger();
    el.classList.add("saving");
    try {
      await onSelect?.(id);
    } catch {
      current = prev;
      renderTrigger();
    } finally {
      el.classList.remove("saving");
    }
  }

  renderTrigger();
  return {
    el,
    get value() { return current; },
    setValue(id) { current = id; renderTrigger(); },
  };
}

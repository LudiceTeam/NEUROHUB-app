import { MODEL_GROUPS, PREMIUM_MODELS, FREE_MODELS, modelCredits } from "./config.js";
import { h, icon } from "./dom.js";
import { gptAvatar } from "./gpts.js";

const PROVIDERS = {
  auto: { name: "Veora", color: "linear-gradient(135deg, var(--accent), var(--accent-2))", mark: "spark" },
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
export const VIDEO_MODELS = new Set(MODEL_GROUPS.find(([g]) => g === "Video")?.[1] || []);
export const VOICE_MODELS = new Set(MODEL_GROUPS.find(([g]) => g === "Voice")?.[1] || []);

export function modelLabel(id) {
  if (!id) return "";
  if (id === "auto") return "Auto";
  if (id.endsWith(":custom")) return "Your voice";   // own cloned voice
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

// Name without the version, the version, and what the model is good for (shown in the menu).
const MODEL_INFO = {
  auto: ["Auto", "", "Picks the best model for each request"],
  "openai/gpt-5.4-mini": ["GPT Mini", "5.4", "Smart all-rounder for any task"],
  "openai/gpt-4o": ["GPT", "4o", "Reliable writing and analysis"],
  "openai/gpt-4o-mini": ["GPT Mini", "4o", "Quick everyday answers"],
  "anthropic/claude-opus-4.6": ["Claude Opus", "4.6", "Deepest reasoning and long texts"],
  "anthropic/claude-sonnet-4.6": ["Claude Sonnet", "4.6", "Best for code and writing"],
  "google/gemini-3-flash-preview": ["Gemini Flash", "3", "Fast and smart, reads photos"],
  "google/gemini-2.5-flash": ["Gemini Flash", "2.5", "Balanced speed and quality"],
  "google/gemini-2.5-flash-lite": ["Gemini Flash Lite", "2.5", "Very fast short answers"],
  "google/gemini-3.1-flash-lite-preview": ["Gemini Flash Lite", "3.1", "Fast answers, good with photos"],
  "google/gemma-3-4b-it": ["Gemma 4B", "3", "Tiny and instant"],
  "google/gemma-3-12b-it": ["Gemma 12B", "3", "Light everyday chat"],
  "google/gemma-3-27b-it": ["Gemma 27B", "3", "Open model, solid quality"],
  "google/gemma-4-26b-a4b-it": ["Gemma 26B", "4", "Efficient open model"],
  "google/gemma-4-31b-it": ["Gemma 31B", "4", "Strongest open Gemma"],
  "google/gemma-4-31b-it:free": ["Gemma 31B", "4", "Strongest open Gemma"],
  "qwen/qwen2.5-vl-72b-instruct": ["Qwen VL 72B", "2.5", "Reads documents and images"],
  "qwen/qwen3-vl-8b-instruct": ["Qwen VL 8B", "3", "Light model that sees images"],
  "qwen/qwen3-vl-8b-thinking": ["Qwen VL 8B Thinking", "3", "Thinks step by step"],
  "qwen/qwen3-vl-30b-a3b-instruct": ["Qwen VL 30B", "3", "Images, charts and screenshots"],
  "qwen/qwen3-vl-30b-a3b-thinking": ["Qwen VL 30B Thinking", "3", "Math and logic, step by step"],
  "meta-llama/llama-4-maverick": ["Llama Maverick", "4", "Creative writing and chat"],
  "meta-llama/llama-4-scout": ["Llama Scout", "4", "Fast, handles long texts"],
  "mistralai/mistral-large": ["Mistral Large", "", "Precise, detailed answers"],
  "mistralai/mistral-small-2603": ["Mistral Small", "26.03", "Fast and compact"],
  "rekaai/reka-edge": ["Reka Edge", "", "Lightweight, sees images"],
  "bytedance-seed/seed-2.0-mini": ["Seed Mini", "2.0", "Quick answers from ByteDance"],
  "bytedance/ui-tars-1.5-7b": ["UI-TARS 7B", "1.5", "Understands app screenshots"],
  "z-ai/glm-4.6v": ["GLM V", "4.6", "Vision and reasoning"],
  "moonshotai/kimi-k2.5": ["Kimi", "K2.5", "Long documents and agents"],
  "google/gemini-3-pro-image-preview": ["Gemini Pro Image", "3", "Highest-quality images"],
  "google/gemini-3.1-flash-image-preview": ["Gemini Flash Image", "3.1", "Fast image generation and edits"],
  "bytedance/seedance-2.0-fast": ["Seedance Fast", "2.0", "Video clips with sound"],
  "bytedance/seedance-2.0-mini": ["Seedance Mini", "2.0", "Cheaper draft videos"],
};

// Menu columns: [name, version, purpose].
function info(id) {
  if (MODEL_INFO[id]) return MODEL_INFO[id];
  if (VOICE_MODELS.has(id)) {
    const [base, voice] = id.split(/:(?=[^:]+$)/);
    const version = base.match(/(\d+(?:\.\d+)+)/)?.[1] || "";
    const family = /grok/.test(base) ? "Grok Voice" : /lite/.test(base) ? "Gemini Lite TTS" : "Gemini TTS";
    return [`${family} · ${voice.charAt(0).toUpperCase()}${voice.slice(1)}`, version, "Reads your text aloud"];
  }
  return [modelLabel(id), "", id];
}

// Cost per message: "×N" daily credits; models paid with premium requests or video credits show "–".
function cost(id) {
  if (id === "auto" || PREMIUM_MODELS.has(id) || IMAGE_MODELS.has(id) || VIDEO_MODELS.has(id) || VOICE_MODELS.has(id)) {
    return ["–", id === "auto" ? "Depends on the model it picks"
      : VIDEO_MODELS.has(id) ? "Uses video credits" : "Uses premium requests"];
  }
  const n = modelCredits(id);
  return [`×${n}`, `${n} credit${n === 1 ? "" : "s"} per message`];
}

// Who can use it: [label, css kind].
function access(id) {
  if (id === "auto" || FREE_MODELS.has(id)) return ["Free", "free"];
  if (PREMIUM_MODELS.has(id) || IMAGE_MODELS.has(id)) return ["Premium", "premium"];
  if (VIDEO_MODELS.has(id)) return ["Plus+", "paid"];
  return ["Paid", "paid"];
}

// What it's for: [label, css kind].
function purpose(id) {
  if (IMAGE_MODELS.has(id)) return ["Photo", "image"];
  if (VIDEO_MODELS.has(id)) return ["Video", "video"];
  if (VOICE_MODELS.has(id)) return ["Voice", "voice"];
  if (id === "auto") return ["Any task", "smart"];
  return ["Chat", "chat"];
}


export function mark(id, size = "") {
  const p = provider(id);
  return h("span", { class: `model-mark ${size}`, style: `background:${p.color}`, "aria-hidden": "true" }, p.mark === "spark" ? icon("spark") : p.mark);
}

// A custom dropdown for choosing the model. onSelect(id) may be async; throwing reverts the choice.
// isLocked(id): PLUS model the user can't pick yet; onLocked(id) runs instead of selecting it.
// gpt: { onSelect(g), onCreate(), onEdit(g), onDelete(g) } — the user's custom GPTs shown on top.
export function createModelPicker({ value = "auto", onSelect, isLocked = () => false, onLocked = () => {}, gpt = null }) {
  let current = value;
  let gpts = [];           // [{ gpt_id, gpt_name, gpt_promt }]
  let activeGpt = null;    // gpt_id when a custom GPT is on
  const activeGptObj = () => gpts.find((g) => g.gpt_id === activeGpt) || null;
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
  // Filters: what the model is for, and which company makes it. Combined with the search.
  let kindFilter = "all";
  let companyFilter = null;
  const KIND_FILTERS = [["all", "All"], ["chat", "Chat"], ["image", "Photo"], ["video", "Video"], ["voice", "Voice"]];
  const COMPANIES = [...new Set(MODEL_GROUPS.flatMap(([, ids]) => ids).filter((id) => id !== "auto").map((id) => provider(id).name))];
  const filters = h("div", { class: "model-filters" });

  function chip(label, active, onclick, lead = null) {
    return h("button", { class: `model-chip${active ? " active" : ""}`, type: "button", "aria-pressed": String(active), onclick }, lead, label);
  }

  function renderFilters() {
    filters.replaceChildren(
      h("div", { class: "model-chip-row", role: "group", "aria-label": "Type" },
        KIND_FILTERS.map(([key, label]) => chip(label, kindFilter === key, () => { kindFilter = key; renderFilters(); renderList(); }))),
      h("div", { class: "model-chip-row scroll", role: "group", "aria-label": "Company" },
        COMPANIES.map((name) => {
          const sample = MODEL_GROUPS.flatMap(([, ids]) => ids).find((id) => id !== "auto" && provider(id).name === name);
          return chip(name, companyFilter === name, () => {
            companyFilter = companyFilter === name ? null : name;
            renderFilters();
            renderList();
          }, mark(sample, "xs"));
        })));
  }

  const passesFilters = (id) => {
    if (kindFilter !== "all" && (id === "auto" || purpose(id)[1] !== kindFilter)) return false;
    if (companyFilter && (id === "auto" || provider(id).name !== companyFilter)) return false;
    return true;
  };

  const panel = h("div", { class: "model-panel", hidden: true },
    h("div", { class: "model-search-wrap" }, search, filters),
    list);
  renderFilters();
  const scrim = h("div", { class: "model-scrim", hidden: true, onclick: () => close() });
  const el = h("div", { class: "model-picker" }, trigger, scrim, panel);

  function renderTrigger() {
    const g = activeGptObj();
    if (g) {
      triggerMark.replaceChildren(gptAvatar(g, "sm"));
      label.textContent = g.gpt_name;
      trigger.title = `${g.gpt_name} · ${modelLabel(current)}`;
      return;
    }
    triggerMark.replaceChildren(mark(current, "sm"));
    label.textContent = modelLabel(current);
    trigger.title = current === "auto" ? "Auto" : current;
  }

  // ---- custom GPTs ----
  function gptOption(g) {
    const selected = g.gpt_id === activeGpt;
    const preview = (g.gpt_promt || "").replace(/\s+/g, " ").slice(0, 80);
    const row = h("div", {
      class: `model-option gpt-option${selected ? " selected" : ""}`, role: "option", tabindex: "-1",
      "aria-selected": String(selected), "data-gpt": g.gpt_id,
      onclick: () => { close(); gpt.onSelect?.(g); },
      onmousemove: () => setActive(items.indexOf(row)),
    },
      gptAvatar(g, "pick"),
      h("span", { class: "model-option-text" },
        h("span", { class: "model-option-name gpt-name" }, g.gpt_name),
        h("span", { class: "model-option-desc gpt-desc" }, preview)),
      h("span", { class: "gpt-actions" },
        h("button", { class: "icon-btn tiny", type: "button", "aria-label": "Edit GPT", title: "Edit",
          onclick: (e) => { e.stopPropagation(); close(); gpt.onEdit?.(g); } }, icon("edit")),
        h("button", { class: "icon-btn tiny danger-hover", type: "button", "aria-label": "Delete GPT", title: "Delete",
          onclick: (e) => { e.stopPropagation(); close(); gpt.onDelete?.(g); } }, icon("trash"))),
      h("span", { class: "model-check", "aria-hidden": "true" }, selected && icon("check")));
    return row;
  }

  function gptGroup(q) {
    if (!gpt) return null;
    const matches = gpts.filter((g) => !q || g.gpt_name.toLowerCase().includes(q) || "gpt".includes(q));
    if (q && !matches.length) return null;
    return h("div", { class: "model-group gpt-group", role: "group", "aria-label": "My GPTs" },
      h("div", { class: "model-group-title" }, "My GPTs"),
      matches.map(gptOption),
      h("button", { class: "gpt-create", type: "button", onclick: () => { close(); gpt.onCreate?.(); } },
        h("span", { class: "gpt-create-icon", "aria-hidden": "true" }, icon("plus")),
        h("span", { class: "model-option-text" },
          h("span", { class: "model-option-name" }, "Create a GPT"),
          h("span", { class: "model-option-desc" }, "Your own assistant with custom instructions"))));
  }

  // One row of the menu: icon · name and what it's for · version · cost | access · purpose.
  function option(id) {
    const selected = id === current && !activeGpt;
    const locked = isLocked(id);
    const [name, version, desc] = info(id);
    const [price, priceTitle] = cost(id);
    const [accessLabel, accessKind] = access(id);
    const [purposeLabel, purposeKind] = purpose(id);
    const btn = h("button", {
      class: `model-option model-row${selected ? " selected" : ""}${locked ? " locked" : ""}`, type: "button", role: "option",
      "aria-selected": String(selected), "data-id": id, title: id === "auto" ? "" : id,
      onclick: () => choose(id),
      onmousemove: () => setActive(items.indexOf(btn)),
    },
      mark(id),
      h("span", { class: "model-option-text" },
        h("span", { class: "model-option-name" }, name, /thinking/.test(id) && h("span", { class: "model-think" }, "Reasoning")),
        h("span", { class: "model-option-desc" }, desc)),
      h("span", { class: "model-version" }, version || "–"),
      h("span", { class: "model-cost", title: priceTitle }, price),
      h("span", { class: "model-sep", "aria-hidden": "true" }),
      h("span", { class: "model-access" },
        h("span", { class: `model-badge ${accessKind}${locked ? " locked" : ""}` }, locked && icon("lock"), accessLabel)),
      h("span", { class: `model-kind ${purposeKind}` }, purposeLabel),
      h("span", { class: "model-check", "aria-hidden": "true" }, selected && icon("check")));
    return btn;
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const sections = [];
    // Custom GPTs are chat assistants: shown unless the filters point elsewhere.
    const mine = (kindFilter === "all" || kindFilter === "chat") && !companyFilter ? gptGroup(q) : null;
    if (mine) sections.push(mine);
    for (const [group, ids] of MODEL_GROUPS) {
      const matches = ids.filter((id) => passesFilters(id) && (!q || id.toLowerCase().includes(q) || modelLabel(id).toLowerCase().includes(q)
        || info(id).join(" ").toLowerCase().includes(q) || provider(id).name.toLowerCase().includes(q) || group.toLowerCase().includes(q)));
      if (!matches.length) continue;
      sections.push(h("div", { class: "model-group", role: "group", "aria-label": group },
        h("div", { class: "model-group-title" }, group === "Smart" ? "Recommended" : group),
        matches.map((id) => option(id))));
    }
    list.replaceChildren(...(sections.length ? sections : [h("div", { class: "model-empty" },
      h("p", {}, "No models found"),
      (kindFilter !== "all" || companyFilter) && h("button", { class: "model-chip", type: "button",
        onclick: () => { kindFilter = "all"; companyFilter = null; renderFilters(); renderList(); } }, "Reset filters"))]));
    items = [...list.querySelectorAll(".model-option")];
    items.forEach((b, i) => b.style.setProperty("--i", String(Math.min(i, 14))));
    setActive(Math.max(0, items.findIndex((b) => (activeGpt ? b.dataset.gpt === activeGpt : b.dataset.id === current))), false);
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
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item?.dataset.gpt) item.click();
      else if (item) choose(item.dataset.id);
    }
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
    if (isLocked(id)) { onLocked(id); return; }
    // Picking the current model while a GPT is on still matters: it turns the GPT off.
    if (id === current && !activeGpt) return;
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
    refresh() { renderTrigger(); if (open) renderList(); },
    setGpts(list, active) { gpts = list; activeGpt = active; renderTrigger(); if (open) renderList(); },
  };
}

import { api } from "./api.js";
import { h, icon, toast, errorText, confirmModal } from "./dom.js";
import { mark } from "./model-picker.js";
import { openPlans } from "./billing.js";
import { improveButton } from "./prompt-improve.js";
import { audioCard } from "./audio-card.js";

const PAID_PLANS = ["Starter", "Basic", "Plus", "Premium", "Max", "Elite"];
const POLL_MS = 5000;
const SETTINGS_KEY = "veora_music_settings";
const GENRES = ["Pop", "Rock", "Hip-hop", "Electronic", "Lo-fi", "Jazz", "Classical", "Cinematic", "Ambient", "R&B"];
const MOODS = ["Happy", "Calm", "Energetic", "Sad", "Epic", "Romantic"];
const IDEAS = [
  "Upbeat summer pop song about a road trip with friends",
  "Calm lo-fi beat for studying, soft piano and vinyl crackle",
  "Epic cinematic orchestral theme for a movie trailer",
  "Warm acoustic love song with gentle guitar",
];

const formatElapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
  return x >>> 0;
}

// Each track gets its own soft gradient cover.
function cover(id, extra = "") {
  const n = hash(id);
  const a = n % 360;
  const b = (a + 40 + (n >> 8) % 80) % 360;
  return h("span", { class: `ms-cover ${extra}`.trim(), style: `background: linear-gradient(135deg, hsl(${a} 70% 58%), hsl(${b} 65% 38%))`, "aria-hidden": "true" }, icon("music"));
}

/**
 * Music studio shown instead of the chat when a music model is selected.
 * onSelectModel(id) -> Promise (rejects to revert); onChange() reloads the profile after spending requests.
 */
export function createMusicStudio({ onSelectModel, onChange = () => {}, getProfile = () => null }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })();
  const st = {
    models: [], maxPrompt: 1500, maxLyrics: 3000, model: null,
    genre: saved.genre ?? null, mood: saved.mood ?? null, vocals: saved.vocals ?? true,
    items: [], loaded: false, busy: false, credits: null, profile: null, visible: false,
    openLyrics: new Set(),
  };
  let pollTimer = 0;
  let tickTimer = 0;

  const spec = () => st.models.find((m) => m.id === st.model) || st.models[0] || null;
  const paid = () => PAID_PLANS.some((k) => st.profile?.[k]);
  const pending = () => st.items.some((t) => t.status === "pending" || t.status === "processing");
  const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ genre: st.genre, mood: st.mood, vocals: st.vocals })); } catch { /* private mode */ } };

  // ---------- inputs ----------
  const prompt = h("textarea", {
    class: "vs-prompt-input", rows: "4", "aria-label": "Music prompt",
    placeholder: "Describe the song: what it's about, tempo, instruments, the voice…",
    oninput: renderFooter,
    onkeydown: (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } },
  });
  const counter = h("span", { class: "vs-counter" });
  const lyrics = h("textarea", {
    class: "vs-prompt-input ms-lyrics", rows: "5", "aria-label": "Lyrics",
    placeholder: "Your own lyrics (optional). Leave empty and the model writes them.",
    oninput: renderFooter,
  });

  const settings = h("div", { class: "vs-settings" });
  const costLine = h("div", { class: "vs-cost" });
  const genBtn = h("button", { class: "btn vs-generate", type: "button", onclick: generate });
  const panel = h("aside", { class: "vs-panel" },
    h("div", { class: "vs-panel-scroll" },
      h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Prompt"),
          h("span", { class: "vs-head-right" }, counter, improveButton({ field: prompt, kind: "music", getProfile, label: "Improve" }))),
        h("div", { class: "vs-prompt-wrap" }, prompt)),
      settings),
    h("div", { class: "vs-footer" }, costLine, genBtn));
  const list = h("div", { class: "ms-list" });
  const head = h("div", { class: "vs-gallery-head" });
  const el = h("div", { class: "vs ms" }, panel, h("section", { class: "vs-main" }, head, list));

  // ---------- settings ----------
  function chips(label, values, current, onPick) {
    return h("div", { class: "vs-field" },
      h("div", { class: "vs-field-head" }, h("span", {}, label), h("small", {}, "Optional")),
      h("div", { class: "vs-chips", role: "radiogroup", "aria-label": label }, values.map((v) => h("button", {
        class: `vs-chip${v === current ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(v === current),
        onclick: () => onPick(v === current ? null : v),
      }, v))));
  }

  function renderSettings() {
    const m = spec();
    settings.replaceChildren(...[
      chips("Genre", GENRES, st.genre, (v) => { st.genre = v; save(); renderSettings(); }),
      chips("Mood", MOODS, st.mood, (v) => { st.mood = v; save(); renderSettings(); }),

      h("label", { class: "vs-switch-row" },
        h("span", { class: "vs-switch-text" }, icon("mic"),
          h("span", {}, h("strong", {}, "Vocals"), h("small", {}, st.vocals ? "A singer performs the lyrics" : "Instrumental, no voice"))),
        h("input", { type: "checkbox", class: "vs-switch", checked: st.vocals, onchange: (e) => { st.vocals = e.target.checked; save(); renderSettings(); } })),

      st.vocals && h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Lyrics"), h("small", {}, "Optional")),
        h("div", { class: "vs-prompt-wrap" }, lyrics)),

      h("div", { class: "vs-field" },
        h("div", { class: "vs-field-head" }, h("span", {}, "Model")),
        m ? h("div", { class: "vs-models", role: "radiogroup", "aria-label": "Model" }, st.models.map((x) => {
          const selected = x.id === m.id;
          return h("button", {
            class: `vs-model${selected ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(selected),
            onclick: () => pickModel(x.id),
          }, mark(x.id, "sm"), h("span", { class: "vs-model-text" }, h("strong", {}, x.name), h("small", {}, x.note)),
          h("span", { class: "ms-model-cost" }, `${x.cost} premium`),
          selected && h("span", { class: "vs-check" }, icon("check")));
        })) : h("span", { class: "skel" })),
    ].filter(Boolean));
    renderFooter();
  }

  function renderFooter() {
    const n = prompt.value.length;
    counter.textContent = `${n} / ${st.maxPrompt}`;
    counter.classList.toggle("over", n > st.maxPrompt);
    const cost = spec()?.cost ?? 1;
    const locked = st.profile && !paid();
    const short = st.credits != null && st.credits < cost;
    costLine.replaceChildren(...[
      h("span", { class: "vs-cost-main" }, icon("music"), `${cost} premium request${cost === 1 ? "" : "s"}`),
      st.credits != null && h("small", {}, `${st.credits} left`),
    ].filter(Boolean));
    genBtn.replaceChildren(st.busy ? h("span", { class: "spinner" }) : icon("spark"),
      locked ? "Unlock music" : st.busy ? "Starting…" : "Create music");
    genBtn.disabled = st.busy || !spec() || (!locked && !short && (!prompt.value.trim() || n > st.maxPrompt || lyrics.value.length > st.maxLyrics));
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
    const cost = spec()?.cost ?? 1;
    if (st.credits != null && st.credits < cost) { toast("Not enough premium requests for this track.", "info"); return; }
    const text = prompt.value.trim();
    if (!text) { prompt.focus(); return; }
    // Genre and mood go into the prompt in English, which the model follows best.
    const full = [text, st.genre && `Genre: ${st.genre}.`, st.mood && `Mood: ${st.mood}.`].filter(Boolean).join(" ");
    st.busy = true;
    renderFooter();
    try {
      const res = await api.generateMusic({ prompt: full, model: spec().id, instrumental: !st.vocals, lyrics: st.vocals ? lyrics.value.trim() || null : null });
      if (res?.result?.id) st.items = [res.result, ...st.items.filter((t) => t.id !== res.result.id)];
      if (st.credits != null) st.credits = Math.max(0, st.credits - (res?.cost ?? cost));
      renderList();
      startPolling();
      onChange();
    } catch (e) {
      toast(errorText(e));
    }
    st.busy = false;
    renderFooter();
  }

  // ---------- tracks ----------
  function track(t) {
    const working = t.status === "pending" || t.status === "processing";
    const started = t.created_at ? Date.parse(t.created_at) : Date.now();
    const model = st.models.find((m) => m.id === t.model);
    const title = t.prompt || "Untitled";
    const meta = [model?.name, t.instrumental ? "Instrumental" : "With vocals"].filter(Boolean);
    const showLyrics = st.openLyrics.has(t.id);

    let body;
    if (t.status === "completed" && t.url) {
      body = h("div", { class: "ms-player" }, audioCard(t.url, { label: meta.join(" · ") }));
    } else if (working) {
      body = h("div", { class: "ms-working" },
        h("span", { class: "ms-eq", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i"), h("i")),
        h("span", {}, t.status === "processing" ? "Composing…" : "In queue…"),
        h("small", { class: "vs-elapsed", "data-started": String(started) }, formatElapsed(Date.now() - started)),
        h("small", { class: "muted" }, "Usually under a minute"));
    } else {
      body = h("div", { class: "ms-failed" }, icon("alert"),
        h("span", {}, t.error || "The track couldn't be generated. Please try again."),
        h("small", { class: "muted" }, t.cost > 1 ? `${t.cost} premium requests were refunded.` : "Your premium request was refunded."));
    }

    return h("article", { class: `ms-track ${t.status}` },
      h("div", { class: "ms-track-head" },
        cover(t.id, working ? "spin" : ""),
        h("div", { class: "ms-track-text" },
          h("strong", { class: "ms-title", title }, title),
          h("small", { class: "muted" }, meta.join(" · "))),
        h("div", { class: "vs-actions" }, ...[
          t.lyrics && h("button", { class: `icon-btn tiny${showLyrics ? " active" : ""}`, type: "button", title: showLyrics ? "Hide lyrics" : "Show lyrics", "aria-label": showLyrics ? "Hide lyrics" : "Show lyrics",
            onclick: () => { showLyrics ? st.openLyrics.delete(t.id) : st.openLyrics.add(t.id); renderList(); } }, icon("edit")),
          t.url && h("a", { class: "icon-btn tiny", href: t.url, target: "_blank", rel: "noopener", download: "", title: "Download", "aria-label": "Download" }, icon("download")),
          h("button", { class: "icon-btn tiny", type: "button", title: "Use this prompt", "aria-label": "Use this prompt", onclick: () => reuse(t) }, icon("plus")),
          !working && h("button", { class: "icon-btn tiny danger-hover", type: "button", title: "Delete", "aria-label": "Delete track", onclick: () => remove(t) }, icon("trash")),
        ].filter(Boolean))),
      body,
      showLyrics && h("pre", { class: "ms-lyrics-text" }, t.lyrics));
  }

  function renderList() {
    const done = st.items.filter((t) => t.status === "completed").length;
    head.replaceChildren(h("div", {}, h("h2", {}, "Music studio"),
      h("p", { class: "muted small" }, st.items.length ? `${done} ${done === 1 ? "track" : "tracks"}` : "Turn an idea into a song")));
    if (!st.loaded) {
      list.replaceChildren(...Array.from({ length: 3 }, () => h("div", { class: "ms-track skeleton" }, h("span", { class: "skel" }), h("span", { class: "skel skel-small" }))));
      return;
    }
    if (!st.items.length) {
      list.replaceChildren(h("div", { class: "vs-empty" },
        h("div", { class: "vs-empty-icon" }, icon("music")),
        h("h3", {}, "Create your first song"),
        h("p", { class: "muted" }, "Describe the mood and the story, pick a genre and press Create."),
        h("div", { class: "vs-ideas" }, IDEAS.map((idea) => h("button", {
          class: "vs-idea", type: "button", onclick: () => { prompt.value = idea; renderFooter(); prompt.focus(); },
        }, idea)))));
      return;
    }
    list.replaceChildren(...st.items.map(track));
  }

  function reuse(t) {
    prompt.value = (t.prompt || "").replace(/\s*Genre: [^.]+\.|\s*Mood: [^.]+\./g, "").trim();
    st.vocals = !t.instrumental;
    if (t.model && st.models.some((m) => m.id === t.model)) pickModel(t.model);
    save();
    renderSettings();
    prompt.focus();
  }

  async function remove(t) {
    if (!(await confirmModal("Delete track?", "It will be removed from your music studio."))) return;
    try {
      await api.deleteMusic(t.id);
      st.items = st.items.filter((x) => x.id !== t.id);
      renderList();
    } catch (e) { toast(errorText(e)); }
  }

  // ---------- data ----------
  async function loadModels() {
    if (st.models.length) return;
    try {
      const res = await api.musicModels();
      st.models = res?.result || [];
      st.maxPrompt = res?.max_prompt || st.maxPrompt;
      st.maxLyrics = res?.max_lyrics || st.maxLyrics;
      lyrics.maxLength = st.maxLyrics;
      if (!st.models.some((m) => m.id === st.model)) st.model = st.models[0]?.id || null;
    } catch (e) {
      if (e.status !== 401) toast(errorText(e));
    }
    renderSettings();
  }

  async function loadItems() {
    try {
      const before = new Map(st.items.map((t) => [t.id, t.status]));
      st.items = (await api.musicList())?.result || [];
      st.loaded = true;
      const finished = st.items.filter((t) => before.get(t.id) && before.get(t.id) !== t.status && !["pending", "processing"].includes(t.status));
      if (finished.some((t) => t.status === "completed")) toast("Your track is ready", "ok");
      if (finished.some((t) => t.status === "failed")) onChange();
    } catch (e) {
      st.loaded = true;
      if (e.status !== 401) toast(errorText(e));
    }
    renderList();
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

  // Track links are presigned and expire; reload once if a player fails.
  let refreshed = false;
  list.addEventListener("media-expired", () => { if (!refreshed) { refreshed = true; loadItems(); } });

  renderSettings();
  renderList();

  return {
    el,
    setModel(id) { st.model = id; renderSettings(); },
    setCredits(n) { st.credits = n; renderFooter(); },
    setPlan(profile) { st.profile = profile; renderFooter(); },
    show() { st.visible = true; loadModels(); loadItems(); },
    hide() { st.visible = false; stopPolling(); el.querySelectorAll("audio").forEach((a) => a.pause()); },
    focus() { prompt.focus(); },
  };
}

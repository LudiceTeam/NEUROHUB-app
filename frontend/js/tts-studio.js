import { MODEL_GROUPS } from "./config.js";
import { h, toast, errorText } from "./dom.js";

const MAX_CHARS = 3000;   // backend MAX_TTS_CHARS
const SKIP_SECONDS = 10;
const VOICE_IDS = MODEL_GROUPS.find(([g]) => g === "Voice")?.[1] || [];

// Base speech models; voices come from the "<model>:<voice>" ids in config.js.
const BASES = {
  "google/gemini-3.8-flash-tts": { name: "Gemini 3.8 Flash TTS", mark: "G", color: "#4285f4", note: "Most natural and expressive", format: "WAV · 24 kHz" },
  "google/gemini-3.8-flash-lite-tts": { name: "Gemini 3.8 Flash Lite TTS", mark: "G", color: "#34a853", note: "Faster and lighter", format: "WAV · 24 kHz" },
  "x-ai/grok-voice-tts-1.0": { name: "Grok Voice TTS 1.0", mark: "X", color: "#111111", note: "20+ languages, auto-detected", format: "MP3" },
};
const VOICE_NOTES = { kore: "Firm", puck: "Upbeat", aoede: "Breezy", charon: "Informative" };

function splitId(id) {
  const i = id.lastIndexOf(":");
  return [id.slice(0, i), id.slice(i + 1)];
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const voiceName = (id) => cap(splitId(id)[1]);

function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
  return x >>> 0;
}

function voiceAvatar(id, size = "") {
  const n = hash(splitId(id)[1]);
  const a = n % 360;
  const b = (a + 60 + (n >> 8) % 90) % 360;
  return h("span", { class: `voice-avatar ${size}`, style: `background: radial-gradient(circle at 30% 30%, hsl(${a} 85% 70%), hsl(${b} 70% 45%))`, "aria-hidden": "true" });
}

function formatTime(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function svg(d, { fill = false, cls = "icon" } = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("class", cls);
  el.setAttribute("aria-hidden", "true");
  for (const part of [].concat(d)) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", part);
    if (fill) { p.setAttribute("fill", "currentColor"); p.setAttribute("stroke", "none"); }
    el.append(p);
  }
  return el;
}
const ICON = {
  play: () => svg("M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z", { fill: true }),
  pause: () => svg(["M7 5h3.5v14H7z", "M13.5 5H17v14h-3.5z"], { fill: true }),
  back: () => svg(["M4 12a8 8 0 1 0 2.4-5.7", "M4 4v4.5h4.5"]),
  fwd: () => svg(["M20 12a8 8 0 1 1-2.4-5.7", "M20 4v4.5h-4.5"]),
  download: () => svg(["M12 4v11", "M7 10.5l5 5 5-5", "M5 20h14"]),
  chevron: () => svg("M9 6l6 6-6 6"),
  info: () => svg(["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 8h.01"]),
  wave: () => svg(["M4 10v4", "M8 7v10", "M12 4v16", "M16 7v10", "M20 10v4"]),
};

/**
 * Text-to-speech studio shown instead of the chat when a voice model is selected.
 * onGenerate(text) -> Promise<audioUrl>; onSelectModel(id) -> Promise (rejects to revert).
 */
export function createTtsStudio({ onGenerate, onSelectModel }) {
  const st = {
    model: VOICE_IDS[0],
    generations: [],     // { url, text, model }
    current: -1,
    credits: null,
    tab: "settings",
    busy: false,
  };

  // ---------- editor ----------
  const editor = h("textarea", {
    class: "tts-editor", "aria-label": "Text to turn into speech", maxlength: String(MAX_CHARS * 2),
    placeholder: "Start typing here or paste any text you want to turn into lifelike speech…",
    oninput: renderFooter,
    onkeydown: (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); }
    },
  });
  const gens = h("div", { class: "tts-gens" });
  const credits = h("span", { class: "tts-credits" });
  const counter = h("span", { class: "tts-count" });
  const genBtn = h("button", { class: "btn tts-generate", type: "button", onclick: generate }, "Generate speech");
  const footer = h("div", { class: "tts-footer" }, credits, h("span", { class: "grow" }), counter, genBtn);
  const workspace = h("section", { class: "tts-work" }, h("div", { class: "tts-editor-wrap" }, editor), gens, footer);

  // ---------- side panel ----------
  const tabs = h("div", { class: "tts-tabs", role: "tablist" });
  const panelBody = h("div", { class: "tts-panel-body" });
  const panel = h("aside", { class: "tts-panel" }, tabs, panelBody);

  // ---------- player ----------
  const audio = new Audio();
  audio.preload = "metadata";
  const playerTitle = h("strong", {});
  const playerSub = h("small", {});
  const playBtn = h("button", { class: "tts-play-lg", type: "button", "aria-label": "Play", onclick: togglePlay }, ICON.play());
  const seek = h("input", {
    class: "tts-seek", type: "range", min: "0", max: "1000", value: "0", "aria-label": "Seek",
    oninput: () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; },
  });
  const timeNow = h("span", { class: "tts-time" }, "0:00");
  const timeEnd = h("span", { class: "tts-time" }, "0:00");
  const playerDownload = h("a", { class: "icon-btn", target: "_blank", rel: "noopener", download: "", "aria-label": "Download" }, ICON.download());
  const player = h("div", { class: "tts-player", hidden: true },
    h("div", { class: "tts-player-info" }, playerTitle, playerSub),
    h("div", { class: "tts-player-center" },
      h("div", { class: "tts-player-controls" },
        h("button", { class: "icon-btn", type: "button", "aria-label": `Back ${SKIP_SECONDS} seconds`, onclick: () => skip(-SKIP_SECONDS) }, ICON.back()),
        playBtn,
        h("button", { class: "icon-btn", type: "button", "aria-label": `Forward ${SKIP_SECONDS} seconds`, onclick: () => skip(SKIP_SECONDS) }, ICON.fwd())),
      h("div", { class: "tts-player-progress" }, timeNow, seek, timeEnd)),
    h("div", { class: "tts-player-actions" }, playerDownload));

  const el = h("div", { class: "tts" }, h("div", { class: "tts-body" }, workspace, panel), player);

  // ---------- rendering ----------
  function renderFooter() {
    const n = editor.value.length;
    counter.textContent = `${n.toLocaleString()} / ${MAX_CHARS.toLocaleString()} characters`;
    counter.classList.toggle("over", n > MAX_CHARS);
    genBtn.disabled = st.busy || !editor.value.trim() || n > MAX_CHARS;
    genBtn.textContent = st.busy ? "Generating…" : st.generations.length ? "Regenerate speech" : "Generate speech";
    credits.replaceChildren(
      h("span", { class: "tts-ring", style: `--v:${Math.min(1, (st.credits ?? 0) / 30)}` }),
      st.credits == null ? "" : `${st.credits} credit${st.credits === 1 ? "" : "s"} remaining`);
  }

  function waveform(url, played) {
    let seed = hash(url);
    const bars = [];
    for (let i = 0; i < 40; i++) {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
      const env = Math.sin((i / 39) * Math.PI) * 0.35 + 0.65;
      const height = Math.round((0.25 + (seed % 1000) / 1000 * 0.75) * env * 100);
      bars.push(h("span", { class: i / 40 < played ? "on" : "", style: `--h:${height}%` }));
    }
    return h("div", { class: "tts-wave" }, bars);
  }

  // Cards for the latest two generations, like the studio this mirrors.
  function renderGens() {
    const start = Math.max(0, st.generations.length - 2);
    const cards = st.generations.slice(start).map((g, k) => {
      const i = start + k;
      const active = i === st.current;
      const progress = active && audio.duration ? audio.currentTime / audio.duration : 0;
      const wave = waveform(g.url, progress);
      wave.addEventListener("click", (e) => {
        const r = wave.getBoundingClientRect();
        select(i, true, (e.clientX - r.left) / r.width);
      });
      return h("div", { class: `tts-card${active ? " active" : ""}`, "data-index": String(i) },
        h("span", { class: "tts-card-label" }, `Generation ${i + 1}`),
        h("button", { class: "tts-play", type: "button", "aria-label": active && !audio.paused ? "Pause" : "Play", onclick: () => (active ? togglePlay() : select(i, true)) },
          active && !audio.paused ? ICON.pause() : ICON.play()),
        wave,
        h("a", { class: "icon-btn", href: g.url, target: "_blank", rel: "noopener", download: "", "aria-label": "Download" }, ICON.download()));
    });
    if (st.busy) {
      cards.push(h("div", { class: "tts-card pending" },
        h("span", { class: "tts-card-label" }, `Generation ${st.generations.length + 1}`),
        h("span", { class: "tts-play" }, h("span", { class: "spinner" })),
        h("div", { class: "tts-wave loading" }, Array.from({ length: 40 }, (_, i) => h("span", { style: `--h:${30 + ((i * 37) % 50)}%; animation-delay:${(i % 10) * 60}ms` })))));
      if (cards.length > 2) cards.shift();
    }
    gens.replaceChildren(...cards);
    gens.hidden = !cards.length;
  }

  function updateProgress() {
    const p = audio.duration ? audio.currentTime / audio.duration : 0;
    seek.value = String(Math.round(p * 1000));
    timeNow.textContent = formatTime(audio.currentTime);
    const card = gens.querySelector(`.tts-card[data-index="${st.current}"] .tts-wave`);
    if (card) [...card.children].forEach((bar, i, all) => bar.classList.toggle("on", i / all.length < p));
  }

  function renderPlayer() {
    const g = st.generations[st.current];
    player.hidden = !g;
    if (!g) return;
    playerTitle.textContent = g.text.length > 70 ? `${g.text.slice(0, 70)}…` : g.text;
    playerSub.textContent = `Generation ${st.current + 1} · ${voiceName(g.model)}`;
    playerDownload.href = g.url;
    const playing = !audio.paused;
    playBtn.replaceChildren(playing ? ICON.pause() : ICON.play());
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  function renderTabs() {
    tabs.replaceChildren(...[["settings", "Settings"], ["history", "History"]].map(([key, label]) =>
      h("button", {
        class: `tts-tab${st.tab === key ? " active" : ""}`, type: "button", role: "tab", "aria-selected": String(st.tab === key),
        onclick: () => { st.tab = key; renderTabs(); renderPanel(); },
      }, label)));
  }

  function renderPanel() {
    panelBody.replaceChildren(st.tab === "settings" ? settingsView() : historyView());
  }

  function settingsView() {
    const [base] = splitId(st.model);
    const voices = VOICE_IDS.filter((id) => splitId(id)[0] === base);
    const bases = [...new Set(VOICE_IDS.map((id) => splitId(id)[0]))];
    const info = BASES[base] || { name: base, mark: "?", color: "var(--muted)", note: "", format: "" };

    return h("div", { class: "tts-settings" },
      h("div", { class: "tts-field" },
        h("div", { class: "tts-field-head" }, h("span", {}, "Voice")),
        h("div", { class: "tts-options", role: "radiogroup", "aria-label": "Voice" }, voices.map((id) => {
          const name = voiceName(id);
          const note = VOICE_NOTES[splitId(id)[1]];
          return h("button", {
            class: `tts-option${id === st.model ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(id === st.model),
            onclick: () => choose(id),
          }, voiceAvatar(id), h("span", { class: "tts-option-text" }, h("strong", {}, name), note && h("small", {}, note)),
          id === st.model && h("span", { class: "tts-check" }, "✓"));
        }))),
      h("p", { class: "tts-hint" }, ICON.info(), "Write in the language you want to hear — it's detected automatically."),
      h("div", { class: "tts-field" },
        h("div", { class: "tts-field-head" }, h("span", {}, "Model")),
        h("div", { class: "tts-options", role: "radiogroup", "aria-label": "Model" }, bases.map((b) => {
          const meta = BASES[b] || { name: b, mark: "?", color: "var(--muted)", note: "" };
          const selected = b === base;
          return h("button", {
            class: `tts-option${selected ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(selected),
            onclick: () => { if (!selected) choose(VOICE_IDS.find((id) => splitId(id)[0] === b)); },
          }, h("span", { class: "model-mark sm", style: `background:${meta.color}` }, meta.mark),
          h("span", { class: "tts-option-text" }, h("strong", {}, meta.name), h("small", {}, meta.note)),
          selected && h("span", { class: "tts-check" }, "✓"));
        }))),
      h("div", { class: "tts-row" }, h("span", {}, "Language"), h("span", { class: "tts-pill" }, "Auto-detect")),
      h("div", { class: "tts-row" }, h("span", {}, "Output format"), h("span", { class: "tts-pill" }, info.format)),
      h("div", { class: "tts-row" }, h("span", {}, "Cost"), h("span", { class: "tts-pill" }, "1 credit per generation")));
  }

  function historyView() {
    if (!st.generations.length) {
      return h("div", { class: "tts-empty" }, ICON.wave(), h("p", {}, "Your generations in this chat will appear here."));
    }
    return h("div", { class: "tts-history" }, st.generations.map((g, i) => i).reverse().map((i) => {
      const g = st.generations[i];
      const active = i === st.current;
      return h("div", { class: `tts-history-item${active ? " active" : ""}` },
        h("button", { class: "tts-play sm", type: "button", "aria-label": "Play", onclick: () => (active ? togglePlay() : select(i, true)) },
          active && !audio.paused ? ICON.pause() : ICON.play()),
        h("button", {
          class: "tts-history-text", type: "button", title: "Use this text",
          onclick: () => { editor.value = g.text; renderFooter(); editor.focus(); },
        }, h("span", {}, g.text), h("small", {}, `Generation ${i + 1} · ${voiceName(g.model)}`)),
        h("a", { class: "icon-btn", href: g.url, target: "_blank", rel: "noopener", download: "", "aria-label": "Download" }, ICON.download()));
    }));
  }

  // ---------- actions ----------
  async function choose(id) {
    if (!id || id === st.model) return;
    const prev = st.model;
    st.model = id;
    renderPanel();
    try {
      await onSelectModel(id);
    } catch {
      st.model = prev;
      renderPanel();
    }
  }

  async function generate() {
    const text = editor.value.trim();
    if (st.busy || !text) return;
    if (text.length > MAX_CHARS) { toast(`Voice models take up to ${MAX_CHARS.toLocaleString()} characters.`); return; }
    st.busy = true;
    renderFooter();
    renderGens();
    try {
      const url = await onGenerate(text);
      st.generations.push({ url, text, model: st.model });
      st.busy = false;
      select(st.generations.length - 1, true);
    } catch (e) {
      st.busy = false;
      toast(errorText(e));
    }
    renderFooter();
    renderGens();
    if (st.tab === "history") renderPanel();
  }

  function select(i, autoplay, at = 0) {
    const g = st.generations[i];
    if (!g) return;
    if (st.current !== i || audio.src !== g.url) {
      st.current = i;
      audio.src = g.url;
    }
    const start = () => { if (audio.duration) audio.currentTime = at * audio.duration; };
    if (audio.readyState >= 1) start(); else audio.addEventListener("loadedmetadata", start, { once: true });
    if (autoplay) audio.play().catch(() => {});
    renderGens();
    renderPlayer();
    if (st.tab === "history") renderPanel();
  }

  function togglePlay() {
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }

  function skip(sec) {
    if (audio.duration) audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + sec));
  }

  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", () => { timeEnd.textContent = formatTime(audio.duration); updateProgress(); });
  for (const ev of ["play", "pause", "ended"]) {
    audio.addEventListener(ev, () => {
      renderPlayer();
      renderGens();
      if (st.tab === "history") renderPanel();
    });
  }
  audio.addEventListener("error", () => { if (audio.src) toast("Couldn't load this audio."); });

  renderTabs();
  renderPanel();
  renderFooter();
  renderGens();

  return {
    el,
    setModel(id) {
      if (!VOICE_IDS.includes(id) || id === st.model) return;
      st.model = id;
      renderPanel();
    },
    // [{ url, text, model }] from the open chat; resets the player.
    setGenerations(list) {
      audio.pause();
      audio.removeAttribute("src");
      st.generations = list;
      st.current = -1;
      renderGens();
      renderPlayer();
      renderFooter();
      if (st.tab === "history") renderPanel();
    },
    setCredits(n) { st.credits = n; renderFooter(); },
    stop() { audio.pause(); },
    focus() { editor.focus(); },
  };
}

import { api } from "./api.js";
import { MODEL_GROUPS } from "./config.js";
import { h, toast, errorText, promptModal, confirmModal } from "./dom.js";
import { cloneVoiceModal } from "./voice-clone.js";

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

// Own (cloned) voices: generated with the backend's CLONE_TTS_MODEL; messages store "<model>:custom".
const CUSTOM_KEY = "veora_custom_voice";
const CLONE_MODEL_KEY = "veora_clone_model";
const CLONE_MARKS = { eleven: ["E", "#111111"], fish: ["F", "#1f6feb"], seed: ["S", "#325ab4"] };
const isCustomModel = (id) => typeof id === "string" && id.endsWith(":custom");
// Mirrors voices_amount in SUBSCRIPTIONS (Starter and Free have none).
const PLAN_VOICE_LIMITS = { Elite: 15, Max: 10, Premium: 5, Plus: 3, Basic: 1 };

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
  mic: () => svg(["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M5 11a7 7 0 0 0 14 0", "M12 18v3"]),
  plus: () => svg(["M12 5v14", "M5 12h14"]),
  edit: () => svg(["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"]),
  trash: () => svg(["M5 7h14", "M9 7V4h6v3", "M7 7l1 13h8l1-13"]),
};

/**
 * Text-to-speech studio shown instead of the chat when a voice model is selected.
 * onGenerate(text, voiceId|null) -> Promise<audioUrl>; onSelectModel(id) -> Promise (rejects to revert).
 */
export function createTtsStudio({ onGenerate, onSelectModel }) {
  const st = {
    model: VOICE_IDS[0],
    generations: [],     // { url, text, model }
    current: -1,
    credits: null,
    tab: "settings",
    busy: false,
    voices: [],          // own voices: { voice_id, name, link }
    voicesLoaded: false,
    customVoice: localStorage.getItem(CUSTOM_KEY) || null,
    voiceLimit: 0,
    cloneModels: [],     // [{ id, name, note, default }] from /voices/models
    cloneModel: localStorage.getItem(CLONE_MODEL_KEY) || null,
  };
  const activeCloneModel = () => st.cloneModels.find((m) => m.id === st.cloneModel)
    || st.cloneModels.find((m) => m.default) || st.cloneModels[0] || null;
  let samplePlayer = null;  // previews an own voice's sample

  const customVoice = () => st.voices.find((v) => v.voice_id === st.customVoice) || null;
  const genLabel = (g) => g.label || (isCustomModel(g.model) ? "Your voice" : voiceName(g.model));

  function setCustomVoice(id) {
    st.customVoice = id;
    try { id ? localStorage.setItem(CUSTOM_KEY, id) : localStorage.removeItem(CUSTOM_KEY); } catch { /* ignore */ }
  }

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
    playerSub.textContent = `Generation ${st.current + 1} · ${genLabel(g)}`;
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

  // ---------- own voices ----------
  function myVoicesField() {
    const head = h("div", { class: "tts-field-head" }, h("span", {}, "My voices"),
      st.voiceLimit > 0 && h("small", { class: "tts-limit" }, `${st.voices.length} / ${st.voiceLimit}`));

    if (st.voiceLimit === 0) {
      return h("div", { class: "tts-field" }, head,
        h("div", { class: "tts-clone-locked" }, h("span", { class: "tts-clone-icon" }, ICON.mic()),
          h("div", {}, h("strong", {}, "Clone your own voice"),
            h("small", {}, "Included with Basic and higher plans. Subscribe in the Veora iOS app."))));
    }

    const full = st.voices.length >= st.voiceLimit;
    const items = st.voices.map((v) => {
      const selected = v.voice_id === st.customVoice;
      const previewing = samplePlayer?.dataset.id === v.voice_id && !samplePlayer.paused;
      return h("div", { class: `tts-option own${selected ? " selected" : ""}`, role: "radio", "aria-checked": String(selected), tabindex: "0",
        onclick: () => selectCustom(v.voice_id),
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCustom(v.voice_id); } },
      },
        h("span", { class: "voice-avatar own-avatar" }, ICON.mic()),
        h("span", { class: "tts-option-text" }, h("strong", {}, v.name), h("small", {}, "Your voice")),
        h("span", { class: "own-actions" },
          h("button", { class: "icon-btn tiny", type: "button", "aria-label": previewing ? "Stop sample" : "Play sample", title: "Play sample",
            onclick: (e) => { e.stopPropagation(); previewSample(v); } }, previewing ? ICON.pause() : ICON.play()),
          h("button", { class: "icon-btn tiny", type: "button", "aria-label": "Rename voice", title: "Rename",
            onclick: (e) => { e.stopPropagation(); renameVoice(v); } }, ICON.edit()),
          h("button", { class: "icon-btn tiny danger-hover", type: "button", "aria-label": "Delete voice", title: "Delete",
            onclick: (e) => { e.stopPropagation(); deleteVoice(v); } }, ICON.trash())),
        selected && h("span", { class: "tts-check" }, "✓"));
    });

    return h("div", { class: "tts-field" }, head,
      h("div", { class: "tts-options", role: "radiogroup", "aria-label": "My voices" },
        !st.voicesLoaded ? h("p", { class: "muted small" }, "Loading your voices…") : items,
        h("button", { class: "tts-clone-btn", type: "button", disabled: full, onclick: openClone },
          ICON.plus(), full ? "Voice limit reached" : "Clone a voice")));
  }

  function selectCustom(id) {
    setCustomVoice(st.customVoice === id ? null : id);
    renderPanel();
  }

  function selectPreset(id) {
    setCustomVoice(null);
    if (id === st.model) renderPanel(); else choose(id);
  }

  function previewSample(v) {
    if (samplePlayer?.dataset.id === v.voice_id && !samplePlayer.paused) {
      samplePlayer.pause();
    } else {
      samplePlayer?.pause();
      audio.pause();
      samplePlayer = new Audio(v.link);
      samplePlayer.dataset.id = v.voice_id;
      samplePlayer.addEventListener("ended", renderPanel);
      samplePlayer.addEventListener("pause", renderPanel);
      samplePlayer.play().catch(() => toast("Couldn't play this sample."));
    }
    renderPanel();
  }

  async function openClone() {
    const created = await cloneVoiceModal();
    if (!created) return;
    await loadVoices();
    if (created.voice_id) setCustomVoice(created.voice_id);
    renderPanel();
  }

  async function renameVoice(v) {
    const name = await promptModal("Rename voice", { value: v.name });
    if (!name || name === v.name) return;
    try {
      await api.renameVoice(v.voice_id, name.slice(0, 40));
      v.name = name.slice(0, 40);
      renderPanel();
    } catch (e) { toast(errorText(e)); }
  }

  async function deleteVoice(v) {
    const ok = await confirmModal("Delete voice?", `“${v.name}” and its recording will be permanently deleted.`);
    if (!ok) return;
    try {
      await api.deleteVoice(v.voice_id);
      st.voices = st.voices.filter((x) => x.voice_id !== v.voice_id);
      if (st.customVoice === v.voice_id) setCustomVoice(null);
      renderPanel();
    } catch (e) { toast(errorText(e)); }
  }

  async function loadVoices() {
    try {
      const [res, models] = await Promise.all([api.voices(), api.voiceModels().catch(() => null)]);
      st.voices = res?.result || [];
      st.cloneModels = models?.result || [];
    } catch (e) {
      st.voices = [];
      if (e.status !== 401) toast(errorText(e));
    }
    st.voicesLoaded = true;
    if (st.customVoice && !customVoice()) setCustomVoice(null);
    renderPanel();
  }

  function settingsView() {
    const [base] = splitId(st.model);
    const voices = VOICE_IDS.filter((id) => splitId(id)[0] === base);
    const bases = [...new Set(VOICE_IDS.map((id) => splitId(id)[0]))];
    const own = customVoice();
    const info = own ? { format: "MP3" } : BASES[base] || { name: base, mark: "?", color: "var(--muted)", note: "", format: "" };

    return h("div", { class: "tts-settings" },
      myVoicesField(),
      h("div", { class: "tts-field" },
        h("div", { class: "tts-field-head" }, h("span", {}, "Voice")),
        h("div", { class: "tts-options", role: "radiogroup", "aria-label": "Voice" }, voices.map((id) => {
          const name = voiceName(id);
          const note = VOICE_NOTES[splitId(id)[1]];
          const selected = !own && id === st.model;
          return h("button", {
            class: `tts-option${selected ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(selected),
            onclick: () => selectPreset(id),
          }, voiceAvatar(id), h("span", { class: "tts-option-text" }, h("strong", {}, name), note && h("small", {}, note)),
          selected && h("span", { class: "tts-check" }, "✓"));
        }))),
      h("p", { class: "tts-hint" }, ICON.info(), "Write in the language you want to hear — it's detected automatically."),
      h("div", { class: "tts-field" },
        h("div", { class: "tts-field-head" }, h("span", {}, "Model")),
        own ? h("div", { class: "tts-options", role: "radiogroup", "aria-label": "Cloning model" },
          st.cloneModels.map((m) => {
            const selected = activeCloneModel()?.id === m.id;
            const [mark, color] = CLONE_MARKS[m.id.split("-")[0]] || ["?", "var(--muted)"];
            return h("button", {
              class: `tts-option${selected ? " selected" : ""}`, type: "button", role: "radio", "aria-checked": String(selected),
              onclick: () => {
                st.cloneModel = m.id;
                try { localStorage.setItem(CLONE_MODEL_KEY, m.id); } catch { /* ignore */ }
                renderPanel();
              },
            }, h("span", { class: "model-mark sm", style: `background:${color}` }, mark),
            h("span", { class: "tts-option-text" }, h("strong", {}, m.name), h("small", {}, m.note)),
            m.default && !selected && h("span", { class: "tts-badge" }, "Best"),
            selected && h("span", { class: "tts-check" }, "✓"));
          }),
          h("p", { class: "muted small" }, "Pick a preset voice above to switch back to the other models."))
        : h("div", { class: "tts-options", role: "radiogroup", "aria-label": "Model" }, bases.map((b) => {
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
        }, h("span", {}, g.text), h("small", {}, `Generation ${i + 1} · ${genLabel(g)}`)),
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
      const own = customVoice();
      const url = await onGenerate(text, own?.voice_id || null, own ? activeCloneModel()?.id || null : null);
      st.generations.push(own
        ? { url, text, model: "custom:custom", label: `${own.name}${activeCloneModel() ? ` · ${activeCloneModel().name.replace("ElevenLabs ", "")}` : ""}` }
        : { url, text, model: st.model });
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
    // Voice limit from the plan flags in /profile.
    setPlan(profile) {
      const plan = Object.keys(PLAN_VOICE_LIMITS).find((p) => profile?.[p]);
      st.voiceLimit = plan ? PLAN_VOICE_LIMITS[plan] : 0;
      renderPanel();
    },
    loadVoices,
    stop() { audio.pause(); samplePlayer?.pause(); },
    focus() { editor.focus(); },
  };
}

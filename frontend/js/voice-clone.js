import { api } from "./api.js";
import { h, modal, toast, errorText } from "./dom.js";

const MIN_SECONDS = 8;
const MAX_SECONDS = 45;          // longer samples are trimmed; 10–30 s works best
const MAX_UPLOAD = 50 * 1024 * 1024;
const MAX_NAME = 40;             // backend MAX_VOICE_NAME

const SCRIPTS = {
  en: "Hi! This is my voice for Veora. I'm reading this short passage in a calm, natural tone, the way I usually speak. The morning sun rises slowly over the quiet city, and the smell of fresh coffee drifts through the open window. Sometimes the simplest moments are the ones we remember most.",
  ru: "Привет! Это мой голос для Veora. Я читаю этот короткий текст спокойно и естественно, так, как обычно разговариваю. Утреннее солнце медленно поднимается над тихим городом, а через открытое окно доносится запах свежего кофе. Иногда самые простые моменты запоминаются лучше всего.",
};

function svg(paths, cls = "icon") {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("class", cls);
  el.setAttribute("aria-hidden", "true");
  for (const d of [].concat(paths)) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    el.append(p);
  }
  return el;
}
const MIC = ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M5 11a7 7 0 0 0 14 0", "M12 18v3"];
const UPLOAD = ["M12 16V4", "M7 9l5-5 5 5", "M5 20h14"];

const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Opens the "Clone a voice" dialog. Resolves with { voice_id, name } or null. */
export function cloneVoiceModal() {
  return modal("Clone your voice", (close) => {
    let mode = "record";
    let sample = null;             // { blob: WAV Blob, duration }
    let recorder = null;
    let stream = null;
    let audioCtx = null;
    let meterRaf = 0;
    let timer = 0;
    let startedAt = 0;
    let previewUrl = null;
    let scriptLang = (navigator.language || "en").startsWith("ru") ? "ru" : "en";

    const body = h("div", { class: "stack clone" });
    const pane = h("div", { class: "clone-pane" });
    const tabs = h("div", { class: "clone-tabs", role: "tablist" });

    const nameInput = h("input", { class: "input", maxlength: String(MAX_NAME), placeholder: "Voice name, e.g. My voice", oninput: refresh });
    const consent = h("input", { type: "checkbox", onchange: refresh });
    const createBtn = h("button", { class: "btn primary", type: "button", onclick: create }, "Create voice");
    const status = h("p", { class: "form-error", role: "alert" });

    // ---------- tabs ----------
    function renderTabs() {
      tabs.replaceChildren(...[["record", "Record"], ["upload", "Upload a file"]].map(([key, label]) =>
        h("button", {
          class: `clone-tab${mode === key ? " active" : ""}`, type: "button", role: "tab", "aria-selected": String(mode === key),
          onclick: () => { if (mode !== key) { stopRecording(true); mode = key; sample = null; renderPane(); refresh(); } },
        }, label)));
    }

    // ---------- panes ----------
    function renderPane() {
      renderTabs();
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      const preview = sample && previewBlock();
      if (mode === "record") pane.replaceChildren(...[recordView(), preview].filter(Boolean));
      else pane.replaceChildren(...[uploadView(), preview].filter(Boolean));
    }

    function previewBlock() {
      previewUrl = URL.createObjectURL(sample.blob);
      return h("div", { class: "clone-preview" },
        h("audio", { src: previewUrl, controls: true, preload: "metadata" }),
        h("span", { class: "muted small" }, `${formatTime(sample.duration)} · ready`));
    }

    function recordView() {
      const recording = Boolean(recorder);
      const script = h("div", { class: "clone-script" },
        h("div", { class: "clone-script-head" },
          h("span", {}, "Read this aloud"),
          h("div", { class: "clone-lang" }, ["en", "ru"].map((l) => h("button", {
            type: "button", class: scriptLang === l ? "active" : "",
            onclick: () => { scriptLang = l; renderPane(); },
          }, l.toUpperCase())))),
        h("p", {}, SCRIPTS[scriptLang]));
      const meter = h("div", { class: "clone-meter", "aria-hidden": "true" }, Array.from({ length: 28 }, () => h("span")));
      const time = h("span", { class: "clone-time" }, recording ? formatTime((performance.now() - startedAt) / 1000) : sample ? formatTime(sample.duration) : `0:00 / ${formatTime(MAX_SECONDS)}`);
      const btn = h("button", {
        class: `clone-rec${recording ? " on" : ""}`, type: "button",
        "aria-label": recording ? "Stop recording" : sample ? "Record again" : "Start recording",
        onclick: () => (recording ? stopRecording() : startRecording()),
      }, recording ? h("span", { class: "clone-stop" }) : svg(MIC));
      const hint = h("p", { class: "muted small center" },
        recording ? `Recording… stop any time after ${MIN_SECONDS} s` : sample ? "Sounds good? Name it below — or record again." : "Quiet room, normal voice, 10–30 seconds.");
      return h("div", { class: "clone-record" }, script, h("div", { class: "clone-controls" }, btn, h("div", { class: "clone-live" }, meter, time)), hint);
    }

    function uploadView() {
      const input = h("input", { type: "file", accept: "audio/*", hidden: true, onchange: () => input.files[0] && useFile(input.files[0]) });
      const drop = h("button", {
        class: "clone-drop", type: "button", onclick: () => input.click(),
        ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); },
        ondragleave: () => drop.classList.remove("over"),
        ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) useFile(f); },
      }, svg(UPLOAD), h("strong", {}, "Drop an audio file or click to choose"),
      h("span", { class: "muted small" }, `MP3, WAV, M4A… · at least ${MIN_SECONDS} s of clear speech · we use the first ${MAX_SECONDS} s`));
      return h("div", { class: "clone-upload" }, drop, input);
    }

    // ---------- recording ----------
    async function startRecording() {
      status.textContent = "";
      sample = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        status.textContent = "Microphone access was blocked. Allow it in the browser, or upload a file instead.";
        return;
      }
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        const raw = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        cleanupStream();
        if (recorder?.cancelled) { recorder = null; return; }
        recorder = null;
        await useBlob(raw);
      };
      recorder.start();
      startedAt = performance.now();
      startMeter();
      timer = setInterval(() => {
        const sec = (performance.now() - startedAt) / 1000;
        const t = pane.querySelector(".clone-time");
        if (t) t.textContent = `${formatTime(sec)} / ${formatTime(MAX_SECONDS)}`;
        if (sec >= MAX_SECONDS) stopRecording();
      }, 250);
      renderPane();
      refresh();
    }

    function stopRecording(cancel = false) {
      if (!recorder) return;
      if (!cancel && (performance.now() - startedAt) / 1000 < MIN_SECONDS) {
        status.textContent = `Keep going — at least ${MIN_SECONDS} seconds are needed.`;
        return;
      }
      clearInterval(timer);
      recorder.cancelled = cancel;
      if (recorder.state !== "inactive") recorder.stop();
      else cleanupStream();
    }

    function startMeter() {
      try {
        audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          meterRaf = requestAnimationFrame(loop);
          analyser.getByteFrequencyData(data);
          const bars = pane.querySelectorAll(".clone-meter span");
          bars.forEach((bar, i) => {
            const v = data[(i % data.length)] / 255;
            bar.style.setProperty("--v", (0.15 + v * 0.85).toFixed(2));
          });
        };
        loop();
      } catch { /* the meter is decoration only */ }
    }

    function cleanupStream() {
      clearInterval(timer);
      cancelAnimationFrame(meterRaf);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      audioCtx?.close().catch(() => {});
      audioCtx = null;
    }

    // ---------- samples ----------
    async function useFile(file) {
      status.textContent = "";
      if (file.size > MAX_UPLOAD) { status.textContent = "That file is too large. Use a shorter clip."; return; }
      await useBlob(file);
    }

    // Every sample becomes a mono 16-bit WAV of at most MAX_SECONDS: the backend accepts WAV
    // (browsers record webm/ogg/mp4 depending on the engine) and the upload stays small.
    async function useBlob(blob) {
      status.textContent = "Preparing audio…";
      try {
        const prepared = await toWav(blob);
        if (prepared.duration < MIN_SECONDS) {
          status.textContent = `That's only ${Math.round(prepared.duration)} s — we need at least ${MIN_SECONDS} s of speech.`;
          sample = null;
        } else {
          sample = prepared;
          status.textContent = "";
          if (!nameInput.value.trim()) nameInput.value = "My voice";
        }
      } catch {
        status.textContent = "Couldn't read this audio. Try an MP3 or WAV file.";
        sample = null;
      }
      renderPane();
      refresh();
    }

    function refresh() {
      createBtn.disabled = !sample || !nameInput.value.trim() || !consent.checked || Boolean(recorder);
    }

    async function create() {
      if (createBtn.disabled) return;
      createBtn.disabled = true;
      createBtn.textContent = "Creating…";
      status.textContent = "";
      try {
        const name = nameInput.value.trim();
        const file = new File([sample.blob], "voice.wav", { type: "audio/wav" });
        const res = await api.createVoice(file, name);
        toast("Your voice is ready", "ok");
        teardown();
        close({ voice_id: res?.voice_id, name });
      } catch (e) {
        status.textContent = errorText(e);
        createBtn.textContent = "Create voice";
        refresh();
      }
    }

    function teardown() {
      stopRecording(true);
      cleanupStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    }

    // Closing the dialog any other way must release the microphone too.
    queueMicrotask(() => body.closest("dialog")?.addEventListener("close", teardown, { once: true }));

    body.append(
      tabs,
      pane,
      h("label", { class: "label" }, "Name", nameInput),
      h("label", { class: "clone-consent" }, consent,
        h("span", {}, "This is my own voice, or I have the owner's permission to clone it. I won't use it to impersonate anyone.")),
      status,
      h("div", { class: "row end" },
        h("button", { class: "btn ghost", type: "button", onclick: () => { teardown(); close(null); } }, "Cancel"),
        createBtn),
    );
    renderPane();
    refresh();
    return body;
  }, { wide: true });
}

async function toWav(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = decoded.sampleRate;
    const length = Math.min(decoded.length, Math.floor(MAX_SECONDS * rate));
    const mono = new Float32Array(length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return { blob: encodeWav(mono, rate), duration: length / rate };
  } finally {
    ctx.close().catch(() => {});
  }
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

import { api } from "./api.js";
import { h, toast, errorText } from "./dom.js";

const MAX_SECONDS = 300;       // 5 min of 16 kHz mono WAV ≈ 9.6 MB, under the backend's 15 MB limit
const MIN_SECONDS = 0.6;
const SAMPLE_RATE = 16000;     // plenty for speech recognition, keeps uploads small

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
const MIC = () => svg(["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M5 11a7 7 0 0 0 14 0", "M12 18v3"]);
const CHECK = () => svg("M5 13l4 4L19 7");
const CLOSE = () => svg(["M6 6l12 12", "M18 6L6 18"]);

const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * ChatGPT-style dictation: a mic button that records, shows a live waveform and timer over the
 * composer, then transcribes through /voice_to_text and hands the text to onText.
 */
export function createVoiceInput({ composer, onText }) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let audioCtx = null;
  let raf = 0;
  let timer = 0;
  let startedAt = 0;
  let cancelled = false;

  const button = h("button", {
    class: "icon-btn mic-btn", type: "button", "aria-label": "Dictate a message", title: "Dictate",
    onclick: () => start(),
  }, MIC());

  const bars = Array.from({ length: 40 }, () => h("span"));
  const time = h("span", { class: "dict-time" }, "0:00");
  const status = h("span", { class: "dict-status" });
  const cancelBtn = h("button", { class: "icon-btn dict-cancel", type: "button", "aria-label": "Cancel recording", title: "Cancel", onclick: () => stop(true) }, CLOSE());
  const doneBtn = h("button", { class: "dict-done", type: "button", "aria-label": "Finish and transcribe", title: "Done", onclick: () => stop(false) }, CHECK());
  const bar = h("div", { class: "dictation", role: "status", "aria-live": "polite" },
    cancelBtn,
    h("span", { class: "dict-dot", "aria-hidden": "true" }),
    h("div", { class: "dict-wave", "aria-hidden": "true" }, bars),
    status, time, doneBtn);

  async function start() {
    if (recorder) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Voice input isn't supported in this browser.");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast("Microphone access was blocked. Allow it in your browser settings to dictate.");
      return;
    }
    chunks = [];
    cancelled = false;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = finish;
    recorder.start();
    startedAt = performance.now();

    composer.classList.add("dictating");
    status.textContent = "";
    time.textContent = "0:00";
    doneBtn.disabled = false;
    composer.append(bar);
    startMeter();
    timer = setInterval(() => {
      const sec = (performance.now() - startedAt) / 1000;
      time.textContent = formatTime(sec);
      if (sec >= MAX_SECONDS) stop(false);
    }, 250);
  }

  function stop(cancel) {
    if (!recorder) return;
    cancelled = cancel;
    clearInterval(timer);
    if (recorder.state !== "inactive") recorder.stop(); else finish();
  }

  async function finish() {
    const duration = (performance.now() - startedAt) / 1000;
    const type = recorder?.mimeType || "audio/webm";
    recorder = null;
    stopStream();

    if (cancelled || duration < MIN_SECONDS) { close(); return; }

    // Keep the bar while transcribing.
    status.textContent = "Transcribing…";
    bar.classList.add("busy");
    doneBtn.disabled = true;
    try {
      const wav = await toWav(new Blob(chunks, { type }));
      const res = await api.voiceToText(new File([wav], "dictation.wav", { type: "audio/wav" }));
      const text = (res?.result || "").trim();
      if (text) onText(text); else toast("Couldn't hear anything. Try again a bit closer to the mic.", "info");
    } catch (e) {
      toast(errorText(e));
    }
    close();
  }

  function close() {
    bar.classList.remove("busy");
    bar.remove();
    composer.classList.remove("dictating");
    chunks = [];
  }

  function startMeter() {
    try {
      audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const levels = new Array(bars.length).fill(0.08);
      let last = 0;
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        if (now - last < 70) return;   // scroll ~14 bars per second, like a voice memo
        last = now;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        levels.shift();
        levels.push(Math.min(1, 0.08 + peak * 1.8));
        bars.forEach((b, i) => b.style.setProperty("--v", levels[i].toFixed(2)));
      };
      raf = requestAnimationFrame(loop);
    } catch { /* the waveform is decoration only */ }
  }

  function stopStream() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    audioCtx?.close().catch(() => {});
    audioCtx = null;
  }

  return { button, isRecording: () => Boolean(recorder), cancel: () => stop(true) };
}

// Browsers record webm/ogg/mp4 depending on the engine, and file sniffing on the backend often calls
// those "video/*". A 16 kHz mono WAV is accepted everywhere and is all speech recognition needs.
async function toWav(blob) {
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try {
    decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    decodeCtx.close().catch(() => {});
  }
  const length = Math.ceil(Math.min(decoded.duration, MAX_SECONDS) * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);   // downmixes to mono and resamples
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), SAMPLE_RATE);
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
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
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

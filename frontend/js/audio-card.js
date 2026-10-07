import { h, icon } from "./dom.js";

const BARS = 48;
const SPEEDS = [1, 1.5, 2];
const cards = new Map();    // url -> card element, so re-rendering the chat keeps playback going
let playing = null;         // the one <audio> currently playing

function svg(paths, fill = false) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("class", "icon");
  el.setAttribute("aria-hidden", "true");
  for (const d of [].concat(paths)) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    if (fill) { p.setAttribute("fill", "currentColor"); p.setAttribute("stroke", "none"); }
    el.append(p);
  }
  return el;
}
const PLAY = () => svg("M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z", true);
const PAUSE = () => svg(["M7 5h3.5v14H7z", "M13.5 5H17v14h-3.5z"], true);

const formatTime = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
  return x >>> 0;
}

// Placeholder shape until (or unless) the real waveform is decoded.
function pseudoPeaks(url) {
  let seed = hash(url);
  return Array.from({ length: BARS }, (_, i) => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const env = Math.sin((i / (BARS - 1)) * Math.PI) * 0.3 + 0.7;
    return (0.2 + ((seed % 1000) / 1000) * 0.8) * env;
  });
}

async function realPeaks(url) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("fetch failed");
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const data = buffer.getChannelData(0);
    const step = Math.floor(data.length / BARS) || 1;
    const peaks = [];
    for (let b = 0; b < BARS; b++) {
      let sum = 0;
      for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i++) sum += data[i] * data[i];
      peaks.push(Math.sqrt(sum / step));
    }
    const max = Math.max(...peaks) || 1;
    return peaks.map((p) => Math.max(0.08, p / max));
  } finally {
    ctx.close().catch(() => {});
  }
}

/** A compact, styled audio player for chat messages. */
export function audioCard(url, { label = "" } = {}) {
  const cached = cards.get(url);
  if (cached) {
    cached.querySelector(".ac-label").textContent = label;
    return cached;
  }

  const audio = new Audio();
  audio.preload = "metadata";
  audio.src = url;
  let speed = 0;

  const playBtn = h("button", { class: "ac-play", type: "button", "aria-label": "Play" }, PLAY());
  const bars = pseudoPeaks(url).map((v) => h("span", { style: `--h:${(v * 100).toFixed(1)}%` }));
  const wave = h("div", { class: "ac-wave", role: "slider", tabindex: "0", "aria-label": "Seek", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, bars);
  const time = h("span", { class: "ac-time" }, "0:00");
  const speedBtn = h("button", { class: "ac-speed", type: "button", "aria-label": "Playback speed" }, "1×");
  const download = h("a", { class: "ac-icon", href: url, download: "", target: "_blank", rel: "noopener", "aria-label": "Download", title: "Download" }, icon("download"));

  const card = h("div", { class: "audio-card" },
    playBtn,
    h("div", { class: "ac-main" },
      wave,
      h("div", { class: "ac-meta" }, h("span", { class: "ac-label" }, label), time)),
    h("div", { class: "ac-side" }, speedBtn, download));

  const progress = () => (audio.duration ? audio.currentTime / audio.duration : 0);

  function paint() {
    const p = progress();
    const on = Math.round(p * BARS);
    bars.forEach((bar, i) => bar.classList.toggle("on", i < on));
    wave.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    const total = formatTime(audio.duration);
    time.textContent = audio.currentTime > 0 || !audio.paused ? `${formatTime(audio.currentTime)} / ${total}` : total;
  }

  function setPlaying(isPlaying) {
    card.classList.toggle("playing", isPlaying);
    playBtn.replaceChildren(isPlaying ? PAUSE() : PLAY());
    playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  }

  function toggle() {
    if (audio.paused) {
      if (playing && playing !== audio) playing.pause();
      playing = audio;
      audio.play().catch(() => card.classList.add("error"));
    } else {
      audio.pause();
    }
  }

  function seekTo(fraction) {
    if (!audio.duration) return;
    audio.currentTime = Math.min(1, Math.max(0, fraction)) * audio.duration;
    paint();
  }

  playBtn.addEventListener("click", toggle);
  wave.addEventListener("click", (e) => {
    const r = wave.getBoundingClientRect();
    seekTo((e.clientX - r.left) / r.width);
    if (audio.paused) toggle();
  });
  wave.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); seekTo(progress() + 0.05); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(progress() - 0.05); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  });
  speedBtn.addEventListener("click", () => {
    speed = (speed + 1) % SPEEDS.length;
    audio.playbackRate = SPEEDS[speed];
    speedBtn.textContent = `${SPEEDS[speed]}×`;
    speedBtn.classList.toggle("active", speed > 0);
  });

  audio.addEventListener("loadedmetadata", paint);
  audio.addEventListener("timeupdate", paint);
  audio.addEventListener("play", () => setPlaying(true));
  audio.addEventListener("pause", () => setPlaying(false));
  audio.addEventListener("ended", () => { setPlaying(false); audio.currentTime = 0; paint(); });
  audio.addEventListener("error", () => { card.classList.add("error"); time.textContent = "Unavailable"; });

  // Swap in the real waveform once the card scrolls into view (needs CORS on the CDN; else keep the placeholder).
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    realPeaks(url).then((peaks) => {
      peaks.forEach((v, i) => bars[i].style.setProperty("--h", `${(v * 100).toFixed(1)}%`));
      card.classList.add("real-wave");
    }).catch(() => {});
  });
  io.observe(card);

  cards.set(url, card);
  return card;
}

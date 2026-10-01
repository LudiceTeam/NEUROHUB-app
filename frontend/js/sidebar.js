import { h } from "./dom.js";

const KEY = "veora_sidebar";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const COLLAPSE_AT = 150;   // dragging narrower than this collapses the sidebar

const desktop = matchMedia("(min-width: 821px)");

// Desktop sidebar: drag the right edge to resize, drag it (almost) shut to collapse,
// double-click the edge to reset. Width and state persist in localStorage.
export function setupSidebar(shell) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ignore */ }
  let width = clamp(Number(saved.width) || DEFAULT_WIDTH);
  let collapsed = Boolean(saved.collapsed);

  const handle = h("div", {
    class: "sidebar-handle", role: "separator", tabindex: "0",
    "aria-orientation": "vertical", "aria-label": "Resize sidebar",
    "aria-valuemin": String(MIN_WIDTH), "aria-valuemax": String(MAX_WIDTH),
    title: "Drag to resize · double-click to reset",
  });
  shell.append(handle);

  function apply() {
    shell.style.setProperty("--sidebar-w", `${width}px`);
    shell.classList.toggle("sidebar-collapsed", collapsed);
    handle.setAttribute("aria-valuenow", String(collapsed ? 0 : width));
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ width, collapsed })); } catch { /* ignore */ }
  }

  function setCollapsed(value) {
    collapsed = value;
    apply();
    save();
  }

  // ---- drag ----
  let startX = 0;
  let startWidth = 0;
  let moved = false;

  handle.addEventListener("pointerdown", (e) => {
    if (!desktop.matches || e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startWidth = collapsed ? 0 : width;
    moved = false;
    shell.classList.add("resizing");
  });

  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    const next = startWidth + (e.clientX - startX);
    if (Math.abs(e.clientX - startX) > 2) moved = true;
    if (next < COLLAPSE_AT) {
      collapsed = true;
    } else {
      collapsed = false;
      width = clamp(next);
    }
    apply();
  });

  const endDrag = (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    shell.classList.remove("resizing");
    // A plain click on the edge of a collapsed sidebar opens it.
    if (!moved && collapsed) collapsed = false;
    apply();
    save();
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  handle.addEventListener("dblclick", () => {
    width = DEFAULT_WIDTH;
    setCollapsed(false);
  });

  handle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (collapsed) { if (e.key === "ArrowRight") setCollapsed(false); return; }
      const next = width + (e.key === "ArrowRight" ? 16 : -16);
      if (next < MIN_WIDTH) { setCollapsed(true); return; }
      width = clamp(next);
      apply();
      save();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCollapsed(!collapsed);
    }
  });

  apply();
  active = { toggle: () => setCollapsed(!collapsed), collapse: () => setCollapsed(true), expand: () => setCollapsed(false) };
  return active;
}

// Registered once; drives whichever sidebar was set up last (the app re-renders after sign-in).
let active = null;
document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd + Shift + S toggles the sidebar, like ChatGPT.
  if (active && desktop.matches && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    active.toggle();
  }
});

function clamp(w) {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
}

import { h, icon, toast } from "./dom.js";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Fullscreen image viewer with zoom (wheel, pinch, double-click), pan, and
 * navigation between images. items: [{ src, alt }].
 */
export function openLightbox(items, startIndex = 0) {
  if (!items.length) return;
  let index = Math.min(Math.max(0, startIndex), items.length - 1);
  let scale = 1;
  let x = 0;
  let y = 0;
  const pointers = new Map();
  let gesture = null;       // { type: "pan"|"pinch"|"swipe", ... }
  let lastTap = 0;
  const previousFocus = document.activeElement;

  const img = h("img", { class: "lb-img", alt: "", draggable: "false" });
  const spinner = h("span", { class: "spinner lb-spinner", "aria-hidden": "true" });
  const stage = h("div", { class: "lb-stage" }, spinner, img);
  const counter = h("span", { class: "lb-counter" });
  const zoomLabel = h("button", { class: "lb-zoom-label", type: "button", title: "Reset zoom (0)", onclick: () => zoomTo(1) }, "100%");
  const prevBtn = h("button", { class: "lb-nav prev", type: "button", "aria-label": "Previous image", onclick: () => go(-1) }, icon("chevron"));
  const nextBtn = h("button", { class: "lb-nav next", type: "button", "aria-label": "Next image", onclick: () => go(1) }, icon("chevron"));
  const closeBtn = h("button", { class: "lb-btn", type: "button", "aria-label": "Close (Esc)", title: "Close (Esc)", onclick: close }, icon("close"));

  const toolbar = h("div", { class: "lb-toolbar" },
    counter,
    h("div", { class: "lb-tools" },
      h("button", { class: "lb-btn", type: "button", "aria-label": "Zoom out", title: "Zoom out (−)", onclick: () => zoomBy(1 / 1.5) }, h("span", { class: "lb-glyph" }, "−")),
      zoomLabel,
      h("button", { class: "lb-btn", type: "button", "aria-label": "Zoom in", title: "Zoom in (+)", onclick: () => zoomBy(1.5) }, h("span", { class: "lb-glyph" }, "+")),
      h("span", { class: "lb-sep" }),
      h("button", { class: "lb-btn", type: "button", "aria-label": "Download", title: "Download", onclick: download }, icon("download")),
      h("button", { class: "lb-btn", type: "button", "aria-label": "Open original", title: "Open original", onclick: () => window.open(items[index].src, "_blank", "noopener") }, icon("external")),
      closeBtn));

  const root = h("div", { class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": "Image viewer" },
    toolbar, stage, prevBtn, nextBtn);

  // ---------- transform ----------
  function apply(animate = false) {
    img.classList.toggle("animate", animate);
    img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    root.classList.toggle("zoomed", scale > 1.01);
  }

  // Keeps the image from being dragged away from the viewport.
  function clampPan() {
    const rect = stage.getBoundingClientRect();
    const w = img.offsetWidth * scale;
    const hgt = img.offsetHeight * scale;
    const maxX = Math.max(0, (w - rect.width) / 2);
    const maxY = Math.max(0, (hgt - rect.height) / 2);
    x = Math.min(maxX, Math.max(-maxX, x));
    y = Math.min(maxY, Math.max(-maxY, y));
  }

  // Zoom keeping the point (px, py) — relative to the stage center — fixed on screen.
  function zoomAt(nextScale, px = 0, py = 0, animate = false) {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const ratio = s / scale;
    x = px - (px - x) * ratio;
    y = py - (py - y) * ratio;
    scale = s;
    if (scale === 1) { x = 0; y = 0; }
    clampPan();
    apply(animate);
  }
  const zoomBy = (factor) => zoomAt(scale * factor, 0, 0, true);
  const zoomTo = (s) => zoomAt(s, 0, 0, true);

  function centerPoint(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    return [clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2)];
  }

  // ---------- navigation ----------
  function show(i) {
    index = (i + items.length) % items.length;
    scale = 1; x = 0; y = 0;
    apply();
    root.classList.add("loading");
    img.classList.remove("ready");
    img.onload = () => { root.classList.remove("loading"); img.classList.add("ready"); };
    img.onerror = () => { root.classList.remove("loading"); toast("Couldn't load this image."); };
    img.src = items[index].src;
    img.alt = items[index].alt || "";
    counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : "";
    prevBtn.hidden = nextBtn.hidden = items.length < 2;
  }
  const go = (delta) => { if (items.length > 1) show(index + delta); };

  async function download() {
    const { src } = items[index];
    const name = src.split("/").pop().split("?")[0] || "image";
    try {
      // Cross-origin links ignore the download attribute, so go through a blob.
      const blob = await (await fetch(src, { mode: "cors" })).blob();
      const url = URL.createObjectURL(blob);
      const a = h("a", { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(src, "_blank", "noopener");
    }
  }

  // ---------- input ----------
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [px, py] = centerPoint(e.clientX, e.clientY);
    // Trackpad pinch sends ctrl+wheel with small deltas; scale it up a bit.
    const speed = e.ctrlKey ? 0.01 : 0.0015;
    zoomAt(scale * Math.exp(-e.deltaY * speed), px, py);
  }, { passive: false });

  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = {
        type: "pinch",
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale,
        mid: centerPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
        x, y,
      };
      return;
    }

    // Double click / double tap toggles zoom at that point.
    const now = performance.now();
    if (now - lastTap < 280) {
      lastTap = 0;
      const [px, py] = centerPoint(e.clientX, e.clientY);
      zoomAt(scale > 1.01 ? 1 : DOUBLE_TAP_SCALE, px, py, true);
      gesture = null;
      return;
    }
    lastTap = now;

    gesture = scale > 1.01
      ? { type: "pan", startX: e.clientX, startY: e.clientY, x, y }
      : { type: "swipe", startX: e.clientX, startY: e.clientY, moved: false, onImage: e.target === img };
  });

  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;

    if (gesture.type === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gesture.scale * (dist / gesture.dist)));
      const [mx, my] = gesture.mid;
      const ratio = next / gesture.scale;
      const [cx, cy] = centerPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      scale = next;
      x = mx - (mx - gesture.x) * ratio + (cx - mx);
      y = my - (my - gesture.y) * ratio + (cy - my);
      if (scale === 1) { x = 0; y = 0; }
      clampPan();
      apply();
    } else if (gesture.type === "pan") {
      x = gesture.x + (e.clientX - gesture.startX);
      y = gesture.y + (e.clientY - gesture.startY);
      clampPan();
      apply();
    } else if (gesture.type === "swipe") {
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) gesture.moved = true;
      // Follow the finger a little for feedback.
      x = Math.abs(dx) > Math.abs(dy) ? dx * 0.6 : 0;
      y = Math.abs(dy) > Math.abs(dx) && dy > 0 ? dy * 0.6 : 0;
      root.style.setProperty("--lb-fade", String(Math.max(0.35, 1 - Math.max(0, y) / 400)));
      apply();
    }
  });

  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture?.type === "pinch") {
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        gesture = { type: "pan", startX: p.x, startY: p.y, x, y };
      } else {
        gesture = null;
        if (scale < 1.02) zoomTo(1);
      }
      return;
    }
    if (gesture?.type === "swipe") {
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;
      root.style.removeProperty("--lb-fade");
      if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) && items.length > 1) { go(dx < 0 ? 1 : -1); gesture = null; return; }
      // A plain click on the dark backdrop (not the image) closes the viewer.
      if (!gesture.moved && !gesture.onImage) { close(); return; }
      x = 0; y = 0;
      apply(true);
    }
    gesture = null;
  };
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.5); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.5); }
    else if (e.key === "0") { e.preventDefault(); zoomTo(1); }
    else if (e.key === "Tab") {
      // Keep focus inside the viewer.
      const focusables = [...root.querySelectorAll("button:not([hidden])")];
      const i = focusables.indexOf(document.activeElement);
      e.preventDefault();
      focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length]?.focus();
    }
  }

  const onResize = () => { clampPan(); apply(); };

  function close() {
    document.removeEventListener("keydown", onKey, true);
    removeEventListener("resize", onResize);
    document.documentElement.classList.remove("lb-open");
    root.classList.add("closing");
    setTimeout(() => root.remove(), 180);
    previousFocus?.focus?.();
  }

  document.addEventListener("keydown", onKey, true);
  addEventListener("resize", onResize);
  document.documentElement.classList.add("lb-open");
  document.body.append(root);
  show(index);
  closeBtn.focus();
}

// Extra motion for the landing page: 3D card tilt, magnetic buttons, scroll
// parallax, a hero spotlight and a scroll progress bar. Pointer effects only run
// on devices with a precise pointer; everything is skipped for reduced motion.
export function enhanceLanding(page) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  // ---- scroll: parallax + progress bar (one rAF per frame) ----
  const progress = document.createElement("div");
  progress.className = "fx-progress";
  page.querySelector(".l-nav")?.append(progress);
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      page.style.setProperty("--sy", String(scrollY));
      page.style.setProperty("--progress", String(max > 0 ? scrollY / max : 0));
    });
  };
  on(window, "scroll", onScroll, { passive: true });
  onScroll();

  if (!finePointer) return () => cleanups.forEach((fn) => fn());

  // ---- 3D tilt on cards ----
  for (const card of page.querySelectorAll(".l-card, .l-plan, .l-steps li, .l-group")) {
    card.classList.add("fx-tilt");
    on(card, "pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--ry", `${(px * 7).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${(-py * 7).toFixed(2)}deg`);
      card.classList.add("fx-tilting");
    });
    on(card, "pointerleave", () => {
      card.classList.remove("fx-tilting");
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    });
  }

  // ---- magnetic primary buttons ----
  for (const btn of page.querySelectorAll(".l-btn.primary")) {
    btn.classList.add("fx-magnet");
    on(btn, "pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.setProperty("--tx", `${(dx * 0.18).toFixed(1)}px`);
      btn.style.setProperty("--ty", `${(dy * 0.28).toFixed(1)}px`);
    });
    on(btn, "pointerleave", () => {
      btn.style.setProperty("--tx", "0px");
      btn.style.setProperty("--ty", "0px");
    });
  }

  // ---- spotlight following the cursor across the hero ----
  const hero = page.querySelector(".l-hero");
  if (hero) {
    hero.classList.add("fx-spotlight");
    on(hero, "pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--hx", `${e.clientX - r.left}px`);
      hero.style.setProperty("--hy", `${e.clientY - r.top}px`);
      hero.classList.add("fx-lit");
    });
    on(hero, "pointerleave", () => hero.classList.remove("fx-lit"));
  }

  return () => cleanups.forEach((fn) => fn());
}

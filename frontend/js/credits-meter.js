import { h } from "./dom.js";
import { PLANS, FREE_PLAN } from "./plans.js";

// Daily credit limit of the user's plan (the backend refills Requests to this every day).
export function dailyLimit(profile) {
  return PLANS.find((p) => profile?.[p.name])?.requests ?? FREE_PLAN.requests;
}

/**
 * Thin progress bar of today's credits. variant "compact" (under the composer) adds
 * the Pro requests and videos as quiet text; "card" is for the account dialog.
 */
export function creditsMeter(profile, variant = "compact") {
  const left = Math.max(0, Number(profile?.Requests) || 0);
  const limit = Math.max(left, dailyLimit(profile));
  const ratio = limit ? left / limit : 0;
  const level = left === 0 ? "empty" : ratio < 0.2 ? "low" : "ok";
  const bar = h("span", {
    class: `credits-bar ${level}`, role: "progressbar", "aria-label": "Credits today",
    "aria-valuemin": "0", "aria-valuemax": String(limit), "aria-valuenow": String(left),
  }, h("span", { style: `width:${(ratio * 100).toFixed(1)}%` }));

  if (variant === "card") {
    return h("div", { class: "stat credits-stat" },
      h("span", {}, "Credits today"),
      h("strong", {}, String(left), h("small", {}, ` / ${limit}`)),
      bar);
  }
  const premium = Number(profile?.["Nano Requests"]) || 0;
  const videos = Number(profile?.["Video Credits"]) || 0;
  return h("div", { class: "credits-meter" },
    bar,
    h("span", { class: "credits-text" }, `${left} of ${limit} credits today`),
    premium > 0 && h("span", { class: "credits-extra" }, `${premium} Pro request${premium === 1 ? "" : "s"}`),
    videos > 0 && h("span", { class: "credits-extra" }, `${videos} video${videos === 1 ? "" : "s"}`));
}

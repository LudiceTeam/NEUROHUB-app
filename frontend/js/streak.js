import { api } from "./api.js";
import { h, toast, errorText } from "./dom.js";
import { openPlans } from "./billing.js";

const REWARD_DAYS = 30;                          // backend gives a free month of Starter at 30 days
const RESUME_PLANS = ["Plus", "Premium", "Max", "Elite"];   // /streak/resume refuses Starter and Basic

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * /streak/get only moves the streak when a message is sent, so a stale row still shows the old number.
 * Here a streak counts as alive only if the last active day was today or yesterday.
 */
export function streakInfo(s) {
  if (!s || s.streak == null) return null;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const last = String(s.last_updated || "").slice(0, 10);
  const doneToday = last >= isoDay(today);
  const alive = doneToday || last === isoDay(yesterday);
  const streak = alive ? Number(s.streak) || 0 : 0;
  const record = Math.max(Number(s.record) || 0, streak);
  return { streak, record, alive, doneToday, canResume: record > streak && record > 1 };
}

export const canResumeStreak = (profile) => RESUME_PLANS.some((k) => profile?.[k]);

/** Streak block for the account dialog: current streak, record, 30-day reward, and restore with Plus. */
export function streakCard(state, { onChange = () => {} } = {}) {
  const card = h("section", { class: "streak-card loading" },
    h("div", { class: "streak-main" }, h("span", { class: "skel" }), h("span", { class: "skel skel-small" })));

  function render(info) {
    card.classList.remove("loading");
    if (!info) { card.replaceChildren(h("p", { class: "muted small" }, "Send a message to start your streak.")); return; }
    const free = !["Starter", "Basic", ...RESUME_PLANS].some((k) => state.profile?.[k]);
    const progress = Math.min(info.streak, REWARD_DAYS);

    card.replaceChildren(...[
      h("div", { class: "streak-main" },
        h("span", { class: `streak-flame${info.doneToday ? "" : " out"}`, "aria-hidden": "true" }, "🔥"),
        h("div", { class: "stack tight grow" },
          h("strong", { class: "streak-count" }, `${info.streak} ${dayWord(info.streak)}`),
          h("span", { class: "muted small" }, info.doneToday
            ? "You're on fire — come back tomorrow to keep it going."
            : info.alive ? "Send a message today to keep your streak." : "Send a message to start a new streak.")),
        h("div", { class: "streak-record", title: "Your best streak" },
          h("span", { "aria-hidden": "true" }, "🏆"), h("strong", {}, String(info.record)), h("small", {}, "Best"))),

      free && h("div", { class: "streak-reward" },
        h("div", { class: "streak-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(REWARD_DAYS), "aria-valuenow": String(progress) },
          h("span", { style: `width:${(progress / REWARD_DAYS) * 100}%` })),
        h("span", { class: "muted small" }, info.streak >= REWARD_DAYS
          ? "30 days! Starter is yours free for a month."
          : `${REWARD_DAYS - info.streak} more days to get Starter free for a month`)),

      info.canResume && resumeBox(info),
    ].filter(Boolean));
  }

  function resumeBox(info) {
    const allowed = canResumeStreak(state.profile);
    const btn = h("button", {
      class: `btn ${allowed ? "primary" : "plus-btn"}`, type: "button",
      onclick: async () => {
        if (!allowed) { openPlans(state.profile); return; }
        btn.disabled = true;
        try {
          await api.resumeStreak();
          toast(`Streak restored: ${info.record} ${dayWord(info.record)} 🔥`, "ok");
          await load();
          onChange();
        } catch (e) {
          toast(errorText(e));
          btn.disabled = false;
        }
      },
    }, allowed ? "Restore streak" : "Restore with Plus");
    return h("div", { class: "streak-resume" },
      h("div", { class: "stack tight grow" },
        h("strong", {}, `Get your ${info.record}-day streak back`),
        h("span", { class: "muted small" }, allowed
          ? "Your plan lets you restore your best streak."
          : "Restoring a lost streak is included with Plus, Premium, Max and Elite.")),
      btn);
  }

  async function load() {
    try { render(streakInfo(await api.streak())); }
    catch { render(null); }
  }

  load();
  return card;
}

function dayWord(n) { return n === 1 ? "day" : "days"; }

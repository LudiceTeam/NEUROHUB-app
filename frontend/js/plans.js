// Paid plans: one place for prices (rubles per 30 days) and limits.
// Limits mirror SUBSCRIPTIONS in backend/api/config.py.
export const FREE_PLAN = { requests: 25 };

export const PLANS = [
  { id: "starter", name: "Starter", rub: 499, requests: 40, premium: 8, videos: 0, voices: 0, photos: 3, note: "Unlock every model" },
  { id: "basic", name: "Basic", rub: 890, requests: 80, premium: 18, videos: 0, voices: 1, photos: 5, note: "For everyday chats" },
  { id: "plus", name: "Plus", rub: 1890, requests: 150, premium: 40, videos: 2, voices: 3, photos: 5, note: "Add video & voices", popular: true },
  { id: "premium", name: "Premium", rub: 2990, requests: 260, premium: 75, videos: 4, voices: 5, photos: 5, note: "For power users" },
  { id: "max", name: "Max", rub: 5990, requests: 520, premium: 150, videos: 8, voices: 10, photos: 5, note: "For heavy creators" },
  { id: "elite", name: "Elite", rub: 12990, requests: 1100, premium: 330, videos: 18, voices: 15, photos: 5, note: "No compromises" },
];

// Everything a plan gives besides the daily credits and monthly Pro requests, best perks last.
// Mirrors the backend gates: themes from Basic (appearance.js), prompt improver and streak restores
// from Plus (/prompt/improve, /streak/resume), no watermark from Plus (WATERMARK_PLANS),
// web search from Premium (WEB_SEARCH_PLANS).
const RANK = Object.fromEntries(PLANS.map((p, i) => [p.id, i]));
const from = (plan, id) => RANK[plan.id] >= RANK[id];

export function planFeatures(plan, modelCount = "30+") {
  return [
    `All ${modelCount} models`,
    "Images, music & voice-over",
    `${plan.photos} photos per message`,
    plan.videos ? `${plan.videos} video${plan.videos === 1 ? "" : "s"} / month` : null,
    plan.voices ? `${plan.voices} cloned voice${plan.voices === 1 ? "" : "s"}` : null,
    from(plan, "basic") && "Custom themes & message colors",
    from(plan, "plus") && "Prompt improver",
    from(plan, "plus") && "Restore a lost streak",
    from(plan, "plus") ? "Images without watermark" : "Images with a small watermark",
    from(plan, "premium") && "Web search with sources",
  ].filter(Boolean);
}

// "1 890 ₽": thin space between thousands, the ruble sign never wraps away from the number.
export const rubles = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;

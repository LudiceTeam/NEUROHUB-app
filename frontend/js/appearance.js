// Themes and message colors. System/Light/Dark are free; custom themes and bubble
// colors need Basic or a higher plan. Preferences live in this browser.
const PREFS_KEY = "veora_appearance";
const PERKS_KEY = "veora_perks";
const PERK_PLANS = ["Basic", "Plus", "Premium", "Max", "Elite"];   // Starter is below Basic

export const BASE_THEMES = [
  { id: "system", name: "System", preview: ["#ffffff", "#0b0b10", "#8b7dff"] },
  { id: "light", name: "Light", preview: ["#ffffff", "#f6f6f9", "#6d5dfc"] },
  { id: "dark", name: "Dark", preview: ["#0b0b10", "#181822", "#8b7dff"] },
];

export const CUSTOM_THEMES = [
  {
    id: "midnight", name: "Midnight", base: "dark", preview: ["#0a0f1f", "#141d36", "#5b8cff"],
    vars: {
      "--bg": "#0a0f1f", "--bg-soft": "#121a30", "--bg-elev": "#141d36", "--sidebar": "#0c1326", "--border": "#1f2a48",
      "--text": "#e6ecff", "--muted": "#8f9bbf", "--accent": "#5b8cff", "--accent-2": "#8a6bff", "--user-bubble": "#1d2a50",
      "--code-bg": "#0f1730", "--hl-bg": "#0d1429", "--hl-head": "#131c38",
    },
  },
  {
    id: "aurora", name: "Aurora", base: "dark", preview: ["#071613", "#10261f", "#2ed3a1"],
    vars: {
      "--bg": "#071613", "--bg-soft": "#0e221d", "--bg-elev": "#10261f", "--sidebar": "#0a1b17", "--border": "#1c3a32",
      "--text": "#e3f6ef", "--muted": "#8bb3a6", "--accent": "#2ed3a1", "--accent-2": "#4fb6ff", "--user-bubble": "#13362c",
      "--code-bg": "#0b1d18", "--hl-bg": "#0a1a16", "--hl-head": "#10261f",
    },
  },
  {
    id: "sunset", name: "Sunset", base: "dark", preview: ["#160d12", "#26161e", "#ff7a59"],
    vars: {
      "--bg": "#160d12", "--bg-soft": "#22141b", "--bg-elev": "#26161e", "--sidebar": "#1b1016", "--border": "#3a2230",
      "--text": "#fbe9ef", "--muted": "#c49aa9", "--accent": "#ff7a59", "--accent-2": "#ff4f8b", "--user-bubble": "#3a1d2a",
      "--code-bg": "#1d1117", "--hl-bg": "#1a0f15", "--hl-head": "#26161e",
    },
  },
  {
    id: "rose", name: "Rosé", base: "light", preview: ["#fff8fa", "#fde0ea", "#e0457b"],
    vars: {
      "--bg": "#fff8fa", "--bg-soft": "#fdeef3", "--bg-elev": "#ffffff", "--sidebar": "#fbeef2", "--border": "#f3d5df",
      "--text": "#2a1520", "--muted": "#8f6676", "--accent": "#e0457b", "--accent-2": "#f08a5d", "--user-bubble": "#fde0ea",
      "--code-bg": "#fbeef2", "--hl-bg": "#fff5f8", "--hl-head": "#fbe6ee",
    },
  },
  {
    id: "paper", name: "Paper", base: "light", preview: ["#faf7f0", "#efe6d2", "#b5651d"],
    vars: {
      "--bg": "#faf7f0", "--bg-soft": "#f2ede1", "--bg-elev": "#fffdf8", "--sidebar": "#f3eee2", "--border": "#e4dccb",
      "--text": "#2b261c", "--muted": "#7d7461", "--accent": "#b5651d", "--accent-2": "#d4893b", "--user-bubble": "#efe6d2",
      "--code-bg": "#f3eee2", "--hl-bg": "#fbf8f1", "--hl-head": "#f0e9da",
    },
  },
];

export const BUBBLES = [
  { id: "default", name: "Theme default", value: null },
  { id: "violet", name: "Violet", value: "linear-gradient(135deg, #7c6cff, #b65cf0)", text: "#ffffff" },
  { id: "ocean", name: "Ocean", value: "linear-gradient(135deg, #2563eb, #06b6d4)", text: "#ffffff" },
  { id: "emerald", name: "Emerald", value: "linear-gradient(135deg, #059669, #34d399)", text: "#ffffff" },
  { id: "sunset", name: "Sunset", value: "linear-gradient(135deg, #f97316, #ec4899)", text: "#ffffff" },
  { id: "rose", name: "Rose", value: "#e11d48", text: "#ffffff" },
  { id: "gold", name: "Gold", value: "linear-gradient(135deg, #ca8a04, #f59e0b)", text: "#1c1300" },
  { id: "graphite", name: "Graphite", value: "#374151", text: "#f9fafb" },
  { id: "mint", name: "Mint", value: "#d1fae5", text: "#064e3b" },
];

export function hasPerks(profile) {
  return PERK_PLANS.some((plan) => Boolean(profile?.[plan]));
}

export function loadPrefs() {
  try {
    return { theme: "system", bubble: "default", ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { theme: "system", bubble: "default" };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// Last known subscription state, so custom looks apply before /profile answers.
export function cachedPerks() {
  try { return localStorage.getItem(PERKS_KEY) === "1"; } catch { return false; }
}

export function cachePerks(value) {
  try { value ? localStorage.setItem(PERKS_KEY, "1") : localStorage.removeItem(PERKS_KEY); } catch { /* ignore */ }
}

let appliedVars = [];

// Locked choices fall back to defaults without touching the saved prefs,
// so they come back if the user subscribes again.
export function applyAppearance(prefs, perks) {
  const root = document.documentElement;
  for (const name of appliedVars) root.style.removeProperty(name);
  appliedVars = [];

  const custom = perks ? CUSTOM_THEMES.find((t) => t.id === prefs.theme) : null;
  if (custom) {
    root.dataset.theme = custom.base;
    setVars(custom.vars);
  } else if (prefs.theme === "light" || prefs.theme === "dark") {
    root.dataset.theme = prefs.theme;
  } else {
    delete root.dataset.theme;
  }

  const bubble = perks ? BUBBLES.find((b) => b.id === prefs.bubble && b.value) : null;
  if (bubble) setVars({ "--user-bubble": bubble.value, "--user-bubble-text": bubble.text });
}

export function resetAppearance() {
  applyAppearance({ theme: "system", bubble: "default" }, false);
}

function setVars(vars) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
    appliedVars.push(name);
  }
}

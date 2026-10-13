import { api } from "./api.js";
import { h, toast, errorText } from "./dom.js";
import { openPlans } from "./billing.js";

const PLANS = ["Plus", "Premium", "Max", "Elite"];   // /prompt/improve refuses Free, Starter and Basic
const UNDO_MS = 12000;

function svg(d) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("class", "icon");
  el.setAttribute("aria-hidden", "true");
  for (const part of [].concat(d)) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", part);
    el.append(p);
  }
  return el;
}
const SPARK = () => svg(["M10 3l1.8 4.7L16.5 9.5l-4.7 1.8L10 16l-1.8-4.7L3.5 9.5l4.7-1.8z", "M18 14l.9 2.1 2.1.9-2.1.9L18 20l-.9-2.1-2.1-.9 2.1-.9z"]);
const UNDO = () => svg(["M9 14L4 9l5-5", "M4 9h10a6 6 0 0 1 0 12h-3"]);

// Replaces the text through the editing API when possible, so Ctrl/Cmd+Z brings the old prompt back too.
function replaceText(field, text) {
  field.focus();
  field.select();
  const ok = document.execCommand?.("insertText", false, text);
  if (!ok || field.value !== text) field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.setSelectionRange(text.length, text.length);
}

/**
 * ✨ button that rewrites the prompt in `field` through /prompt/improve.
 * kind: "chat" | "image" | "video" (or a function returning one); getProfile() for the Plus check.
 */
export function improveButton({ field, kind = "chat", getProfile = () => null, label = "" }) {
  let busy = false;
  let previous = null;
  let undoTimer = 0;

  const text = label ? h("span", {}, label) : null;
  const btn = h("button", {
    class: `improve-btn${label ? " labeled" : " icon-btn"}`, type: "button",
    "aria-label": "Improve prompt", title: "Improve prompt with AI",
    onclick: () => (previous != null ? undo() : improve()),
  }, SPARK(), text);

  function setUndo(on) {
    clearTimeout(undoTimer);
    btn.classList.toggle("undo", on);
    btn.replaceChildren(on ? UNDO() : SPARK(), label ? h("span", {}, on ? "Undo" : label) : null);
    btn.setAttribute("aria-label", on ? "Undo improvement" : "Improve prompt");
    btn.title = on ? "Bring back your original prompt" : "Improve prompt with AI";
    if (on) undoTimer = setTimeout(() => { previous = null; setUndo(false); }, UNDO_MS);
  }

  function undo() {
    replaceText(field, previous);
    previous = null;
    setUndo(false);
  }

  async function improve() {
    if (busy) return;
    const source = field.value.trim();
    if (source.length <= 4) {
      toast(source ? "Prompt is too short" : "Write a prompt first, then improve it.", "info");
      field.focus();
      return;
    }
    const profile = getProfile();
    if (profile && !PLANS.some((k) => profile[k])) {
      toast("Prompt improvement is included with Plus and higher.", "info");
      openPlans(profile);
      return;
    }
    busy = true;
    btn.classList.add("busy");
    btn.disabled = true;
    field.classList.add("improving");
    field.readOnly = true;
    try {
      const res = await api.improvePrompt(source, typeof kind === "function" ? kind() : kind);
      const improved = (res?.result || "").trim();
      if (!improved) throw new Error("Couldn't improve the prompt");
      // The user may have kept typing; only replace what was sent.
      if (field.value.trim() === source) {
        previous = field.value;
        field.readOnly = false;
        replaceText(field, improved);
        setUndo(true);
      }
    } catch (e) {
      toast(errorText(e));
    }
    busy = false;
    btn.classList.remove("busy");
    btn.disabled = false;
    field.classList.remove("improving");
    field.readOnly = false;
  }

  // Typing after an improvement keeps the new text; the undo button goes back to ✨.
  field.addEventListener("input", (e) => {
    if (previous != null && e.isTrusted) { previous = null; setUndo(false); }
  });

  return btn;
}

import { h, modal } from "./dom.js";
import { lang } from "./i18n.js";

const MAX_NAME = 60;       // backend MAX_GPT_NAME
const MAX_PROMPT = 4000;   // backend MAX_GPT_PROMPT

// Starting points for a new GPT. The instructions go into the user's own text field,
// so they're written in the interface language directly.
const TEMPLATES = {
  en: [
    ["🌍", "Translator", "Translate everything I send into English, or into Russian if it's already in English. Keep the tone and formatting, and reply with the translation only."],
    ["🧑‍💻", "Code reviewer", "You are a senior software engineer. Review the code I send: first point out bugs, security issues and unclear parts, then suggest concrete improvements with short code examples."],
    ["🎓", "English tutor", "You are a friendly English tutor. Answer in simple English, gently correct my mistakes and explain each correction in one short sentence."],
    ["✍️", "Copywriter", "You are a marketing copywriter. Write short, punchy, benefit-focused copy and offer three variants for every request."],
  ],
  ru: [
    ["🌍", "Переводчик", "Переводи всё, что я присылаю, на английский, а если текст уже на английском — на русский. Сохраняй тон и форматирование, отвечай только переводом."],
    ["🧑‍💻", "Ревьюер кода", "Ты опытный разработчик. Проверяй код, который я присылаю: сначала укажи ошибки, уязвимости и непонятные места, затем предложи конкретные улучшения с короткими примерами кода."],
    ["🎓", "Репетитор английского", "Ты дружелюбный репетитор английского. Отвечай на простом английском, мягко исправляй мои ошибки и объясняй каждое исправление одним коротким предложением."],
    ["✍️", "Копирайтер", "Ты маркетинговый копирайтер. Пиши коротко, ярко и с акцентом на пользу, предлагай три варианта на каждый запрос."],
  ],
};

/** Create / edit dialog. Resolves with { name, prompt } or null. */
export function gptEditor(existing = null) {
  return modal(existing ? "Edit GPT" : "Create a GPT", (close) => {
    const name = h("input", { class: "input", maxlength: String(MAX_NAME), placeholder: "Name, e.g. Travel planner", value: existing?.gpt_name || "" });
    const prompt = h("textarea", {
      class: "input gpt-prompt", rows: "8", maxlength: String(MAX_PROMPT),
      placeholder: "Instructions: who the assistant is, how it should answer, what to focus on…",
    });
    prompt.value = existing?.gpt_promt || "";
    const counter = h("span", { class: "gpt-counter" });
    const save = h("button", { class: "btn primary", type: "submit" }, existing ? "Save" : "Create");
    const refresh = () => {
      counter.textContent = `${prompt.value.length} / ${MAX_PROMPT}`;
      save.disabled = !name.value.trim() || !prompt.value.trim();
    };
    name.addEventListener("input", refresh);
    prompt.addEventListener("input", refresh);
    refresh();
    setTimeout(() => name.focus());

    const templates = !existing && h("div", { class: "gpt-templates" },
      h("span", { class: "muted small" }, "Start from a template"),
      h("div", { class: "gpt-template-row" }, (TEMPLATES[lang] || TEMPLATES.en).map(([emoji, title, text]) => h("button", {
        class: "gpt-template", type: "button",
        onclick: () => { name.value = title; prompt.value = text; refresh(); prompt.focus(); },
      }, h("span", { "aria-hidden": "true" }, emoji), title))));

    return h("form", {
      class: "stack gpt-editor",
      onsubmit: (e) => {
        e.preventDefault();
        if (save.disabled) return;
        close({ name: name.value.trim(), prompt: prompt.value.trim() });
      },
    },
      templates,
      h("label", { class: "label" }, "GPT name", name),
      h("label", { class: "label" }, h("span", { class: "gpt-label-row" }, "Instructions", counter), prompt),
      h("p", { class: "muted small" }, "These instructions are added to every message while the GPT is on."),
      h("div", { class: "row end" },
        h("button", { class: "btn ghost", type: "button", onclick: () => close(null) }, "Cancel"),
        save));
  }, { wide: true });
}

// Stable gradient per GPT for its avatar.
export function gptAvatar(gpt, size = "") {
  let x = 0;
  for (const ch of gpt.gpt_id) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const a = x % 360;
  return h("span", {
    class: `gpt-avatar ${size}`.trim(), "aria-hidden": "true",
    style: `background: linear-gradient(135deg, hsl(${a} 75% 60%), hsl(${(a + 50) % 360} 70% 45%))`,
  }, (gpt.gpt_name || "?").trim().charAt(0).toUpperCase());
}

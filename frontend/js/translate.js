import { api } from "./api.js";

const LANG_KEY = "veora_translate_lang";
const CHUNK = 4000;   // Google's endpoint behind /translate rejects very long queries

export const LANGUAGES = [
  ["en", "English"], ["ru", "Русский"], ["uk", "Українська"], ["kk", "Қазақша"],
  ["es", "Español"], ["de", "Deutsch"], ["fr", "Français"], ["it", "Italiano"],
  ["pt", "Português"], ["pl", "Polski"], ["tr", "Türkçe"], ["ar", "العربية"],
  ["hi", "हिन्दी"], ["zh-CN", "中文"], ["ja", "日本語"], ["ko", "한국어"],
];

export function languageName(code) {
  return LANGUAGES.find(([c]) => c === code)?.[1] || code;
}

// Last choice, else the browser language if we support it, else English.
export function preferredLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) return saved;
  } catch { /* ignore */ }
  const browser = (navigator.language || "en").split("-")[0];
  return LANGUAGES.some(([c]) => c === browser) ? browser : "en";
}

export function setPreferredLanguage(code) {
  try { localStorage.setItem(LANG_KEY, code); } catch { /* ignore */ }
}

// Translates prose but leaves fenced code blocks untouched, keeping the
// surrounding whitespace so the markdown structure survives.
export async function translateMarkdown(text, lang) {
  const parts = text.split(/(```[\s\S]*?(?:```|$))/g);
  const out = [];
  for (const part of parts) {
    if (!part.trim() || part.startsWith("```")) {
      out.push(part);
      continue;
    }
    const lead = part.match(/^\s*/)[0];
    const trail = part.match(/\s*$/)[0];
    const pieces = [];
    for (const chunk of chunks(part.trim())) pieces.push(await api.translate(chunk, lang));
    out.push(lead + pieces.join("\n\n") + trail);
  }
  return out.join("");
}

// Splits on paragraph boundaries so each request stays under the limit.
function chunks(text) {
  if (text.length <= CHUNK) return [text];
  const result = [];
  let current = "";
  for (const para of text.split(/\n{2,}/)) {
    if (current && current.length + para.length + 2 > CHUNK) {
      result.push(current);
      current = "";
    }
    if (para.length > CHUNK) {
      for (let i = 0; i < para.length; i += CHUNK) result.push(para.slice(i, i + CHUNK));
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) result.push(current);
  return result;
}

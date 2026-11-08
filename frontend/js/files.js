import { h, icon } from "./dom.js";

// Documents the chat can read (mirrors DOC_EXTENSIONS in backend/api/file_text.py). Their text goes to the
// model through /files/read; limits mirror MAX_DOCS / MAX_DOC_SIZE in backend/api/config.py.
export const DOC_EXTENSIONS = [
  "pdf", "docx", "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "html", "htm", "css", "log", "ini", "toml", "sql",
  "py", "js", "ts", "jsx", "tsx", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "sh",
];
export const MAX_DOCS = 3;
export const MAX_DOC_SIZE = 10 * 1024 * 1024;
export const DOC_ACCEPT = DOC_EXTENSIONS.map((e) => `.${e}`).join(",");

const ext = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
export const isDocFile = (file) => DOC_EXTENSIONS.includes(ext(file.name));

// A sent message keeps the file text after the user's words as <file name="...">…</file> blocks
// (see attach_files in api.py). Split them off so the bubble shows the words and file chips only.
const FILE_BLOCK = /\n*<file name="([^"]*)">\n[\s\S]*?\n<\/file>/g;
export function splitFiles(text) {
  if (!text || !text.includes("<file name=")) return { text, files: [] };
  const files = [...text.matchAll(FILE_BLOCK)].map((m) => m[1]);
  return { text: text.replace(FILE_BLOCK, "").trim(), files };
}

function fileIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4");
  svg.append(p);
  return svg;
}

/** File card: icon, name and type ("PDF", "DOCX"…); `onRemove` adds a × button (composer previews). */
export function fileChip(name, onRemove = null) {
  return h("div", { class: "file-chip", title: name },
    h("span", { class: "file-chip-icon" }, fileIcon()),
    h("span", { class: "file-chip-text" }, h("strong", {}, name), h("small", {}, (ext(name) || "file").toUpperCase())),
    onRemove && h("button", { type: "button", "aria-label": "Remove file", onclick: onRemove }, icon("close")));
}

export const fileChips = (names) => names.length > 0 && h("div", { class: "msg-files" }, names.map((n) => fileChip(n)));

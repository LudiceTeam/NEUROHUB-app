import { h, icon, modal, toast, errorText } from "./dom.js";

// Resolves with { folderId } (an existing folder, or "" for none), { newName } for a new folder, or null.
export function moveToFolderModal(folders, currentId = "") {
  return modal("Move to folder", (close) => {
    const newName = h("input", { class: "input", placeholder: "New folder name", maxlength: "60" });
    const option = (id, label, iconName) => h("button", {
      class: `folder-option${id === currentId ? " selected" : ""}`, type: "button",
      onclick: () => close(id === currentId ? null : { folderId: id }),
    }, icon(iconName), h("span", {}, label), id === currentId && h("span", { class: "tts-check" }, "✓"));

    return h("div", { class: "stack" },
      h("div", { class: "folder-options" },
        folders.map((f) => option(f.folder_id, f.folder_name, "folder")),
        currentId && option("", "Remove from folder", "close")),
      h("form", {
        class: "row",
        onsubmit: (e) => {
          e.preventDefault();
          const name = newName.value.trim();
          if (name) close({ newName: name });
        },
      }, newName, h("button", { class: "btn", type: "submit" }, icon("folderPlus"), "Create")));
  });
}

// Tag editor; changes are saved immediately through onAdd/onRemove (both async).
export function tagsModal(folder, { onAdd, onRemove }) {
  return modal(`Tags · ${folder.folder_name}`, () => {
    const tags = [...(folder.tags || [])];
    const list = h("div", { class: "tag-list" });
    const input = h("input", { class: "input", placeholder: "Add a tag and press Enter", maxlength: "30" });

    function render() {
      list.replaceChildren(...(tags.length ? tags.map((tag) => h("span", { class: "tag-chip" }, tag,
        h("button", {
          type: "button", "aria-label": `Remove ${tag}`,
          onclick: async () => {
            try {
              await onRemove(tag);
              tags.splice(tags.indexOf(tag), 1);
              render();
            } catch (e) { toast(errorText(e)); }
          },
        }, icon("close")))) : [h("p", { class: "muted small" }, "No tags yet.")]));
    }

    const form = h("form", {
      class: "row",
      onsubmit: async (e) => {
        e.preventDefault();
        const tag = input.value.trim();
        if (!tag || tags.includes(tag)) { input.value = ""; return; }
        try {
          await onAdd(tag);
          tags.push(tag);
          input.value = "";
          render();
        } catch (err) { toast(errorText(err)); }
      },
    }, input, h("button", { class: "btn", type: "submit" }, "Add"));

    render();
    setTimeout(() => input.focus());
    return h("div", { class: "stack" }, list, form);
  });
}

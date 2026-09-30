import { api, deviceId } from "./api.js";
import { h, modal, toast, errorText, confirmModal } from "./dom.js";
import { planName } from "./chat.js";

export function openProfile(state, { logout, onChange }) {
  return modal("Account", (close) => {
    const p = state.profile || {};
    const body = h("div", { class: "stack profile" });

    // Avatar + name
    const avatarInput = h("input", {
      type: "file", accept: "image/*", hidden: true,
      onchange: async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        try {
          await api.changeAvatar(file);
          await onChange();
          avatar.replaceChildren(avatarImg(state.profile));
          toast("Avatar updated", "ok");
        } catch (e) { toast(errorText(e)); }
      },
    });
    const avatar = h("button", { class: "avatar-lg", type: "button", title: "Change avatar", onclick: () => avatarInput.click() }, avatarImg(p));

    const nameInput = h("input", { class: "input", value: p.Name || "", maxlength: "60", "aria-label": "Name" });
    const nameForm = h("form", {
      class: "row",
      onsubmit: async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name || name === p.Name) return;
        try {
          await api.changeName(name);
          await onChange();
          toast("Name updated", "ok");
        } catch (err) { toast(errorText(err)); }
      },
    }, nameInput, h("button", { class: "btn", type: "submit" }, "Save"));

    body.append(
      h("div", { class: "profile-head" }, avatar, avatarInput,
        h("div", { class: "stack tight grow" }, nameForm, h("span", { class: "muted" }, p.Email || ""))),
    );

    // Plan + usage
    const streak = h("strong", {}, "—");
    body.append(h("div", { class: "stats" },
      stat("Plan", planName(p).replace(" plan", "")),
      stat("Requests", p.Requests ?? 0),
      stat("Premium requests", p["Nano Requests"] ?? 0),
      h("div", { class: "stat" }, h("span", {}, "Streak"), streak)));
    if (p["Date End"]) body.append(h("p", { class: "muted small" }, `Subscription active until ${formatDate(p["Date End"])}. Manage it in the Veora iOS app.`));

    api.streak()
      .then((s) => { streak.textContent = s?.streak != null ? `${s.streak} 🔥` : "0"; })
      .catch(() => { streak.textContent = "—"; });

    // Devices
    const devices = h("ul", { class: "devices" }, h("li", { class: "muted" }, "Loading…"));
    body.append(h("h3", {}, "Signed-in devices"), devices);
    loadDevices(devices);

    body.append(h("div", { class: "row end" },
      h("button", { class: "btn danger", type: "button", onclick: () => { close(); logout(); } }, "Sign out")));
    return body;
  }, { wide: true });
}

async function loadDevices(list) {
  try {
    const items = (await api.devices()) || [];
    const current = deviceId();
    if (!items.length) { list.replaceChildren(h("li", { class: "muted" }, "No devices")); return; }
    list.replaceChildren(...items.map((d) => h("li", {},
      h("div", {},
        h("strong", {}, d.device_name || "Unknown device"),
        d.device_id === current && h("span", { class: "badge" }, "This device"),
        h("small", { class: "muted" }, `Last active ${formatDate(d.last_online)}`)),
      d.device_id !== current && h("button", {
        class: "btn ghost small", type: "button",
        onclick: async () => {
          if (!(await confirmModal("Sign out device?", `${d.device_name || "This device"} will be signed out.`, { confirm: "Sign out" }))) return;
          try { await api.deleteDevice(d.device_id); loadDevices(list); } catch (e) { toast(errorText(e)); }
        },
      }, "Sign out"))));
  } catch (e) {
    list.replaceChildren(h("li", { class: "muted" }, errorText(e)));
  }
}

function avatarImg(p) {
  const pic = p?.["Profile Picture"];
  return pic ? h("img", { src: pic, alt: "Avatar" }) : h("span", { class: "initials" }, (p?.Name || "?").slice(0, 1).toUpperCase());
}

function stat(label, value) {
  return h("div", { class: "stat" }, h("span", {}, label), h("strong", {}, String(value)));
}

function formatDate(value) {
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

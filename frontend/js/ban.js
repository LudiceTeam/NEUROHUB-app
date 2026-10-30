import { h, icon } from "./dom.js";
import { languageSwitch, lang } from "./i18n.js";
import { CONTACT_EMAIL } from "./legal.js";

// "2026-11-06" -> local midnight of that day (new Date("2026-11-06") would be UTC midnight).
function parseDay(value) {
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Full-screen notice for a banned account: when access comes back, how to reach support, log out. */
export function renderBanned(root, info, { onLogout }) {
  const until = parseDay(info.unban_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(1, Math.round((until - today) / 86400000));
  const date = until.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", year: "numeric" });

  const card = h("div", { class: "auth-card ban-card" },
    h("div", { class: "brand" }, h("img", { src: "logo.png", alt: "", width: "56", height: "56" }), h("span", {}, "Veora")),
    h("div", { class: "ban-badge" }, icon("lock")),
    h("h1", {}, "Account restricted"),
    h("p", { class: "muted" }, "Your account has been temporarily restricted for breaking the terms of use. "
      + "Chats, images and your profile are unavailable until the restriction ends."),
    h("dl", { class: "ban-info" },
      h("div", {}, h("dt", {}, "Access returns"), h("dd", {}, date)),
      h("div", {}, h("dt", {}, "Time left"), h("dd", {}, `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`)),
    ),
    h("p", { class: "muted ban-help" }, "Think this is a mistake? Write to ",
      h("a", { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL), "."),
    h("button", { class: "btn block", type: "button", onclick: onLogout }, "Sign out"),
  );

  root.replaceChildren(h("main", { class: "auth" }, languageSwitch("auth-lang"), h("div", { class: "auth-stack" }, card)));
}

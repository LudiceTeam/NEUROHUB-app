import { startI18n } from "./i18n.js";
import { tokens, setOnLogout } from "./api.js";
import { renderLogin } from "./auth.js";
import { renderApp } from "./chat.js";
import { renderLanding } from "./landing.js";
import { resetAppearance, cachePerks } from "./appearance.js";

const root = document.getElementById("app");
let cleanup = null;

// Signed out: landing page, or #login / #signup for the auth screens. Signed in: the app.
function start() {
  cleanup?.();
  cleanup = null;
  scrollTo(0, 0);

  if (tokens.access || tokens.refresh) {
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    renderApp(root, logout);
    return;
  }

  const route = location.hash.slice(1);
  if (route === "login" || route === "signup") {
    renderLogin(root, start, { mode: route, onBack: () => { location.hash = ""; } });
  } else {
    cleanup = renderLanding(root, {
      onLogin: () => { location.hash = "login"; },
      onSignup: () => { location.hash = "signup"; },
    });
  }
}

function logout() {
  tokens.clear();
  cachePerks(false);
  resetAppearance();
  document.querySelectorAll("dialog").forEach((d) => d.remove());
  history.replaceState(null, "", location.pathname + location.search);
  start();
}

addEventListener("hashchange", () => {
  if (!(tokens.access || tokens.refresh)) start();
});

setOnLogout(logout);
startI18n();   // before the first render, so nothing flashes in English
start();

import { startI18n } from "./i18n.js";
import { tokens, setOnLogout } from "./api.js";
import { renderLogin } from "./auth.js";
import { renderApp } from "./chat.js";
import { renderLanding } from "./landing.js";
import { resetAppearance, cachePerks } from "./appearance.js";
import { renderSharedChat, SHARE_PARAM } from "./share.js";
import { toast } from "./dom.js";
import { renderLegal, LEGAL_ROUTES } from "./legal.js";

const root = document.getElementById("app");
let cleanup = null;

// Signed out: landing page, or #login / #signup for the auth screens. Signed in: the app.
function start() {
  cleanup?.();
  cleanup = null;
  scrollTo(0, 0);

  // ?share=<link_id>: a read-only shared chat. Viewing needs an account, so guests sign in first
  // and land back on the shared chat (the parameter stays in the URL through the login).
  // #offer, #privacy, #refund: legal documents, open for everyone (signed in or not).
  const legal = location.hash.slice(1);
  onLegal = LEGAL_ROUTES.has(legal);
  if (onLegal) {
    cleanup = renderLegal(root, legal, { onBack: leaveLegal });
    return;
  }

  const shareId = new URLSearchParams(location.search).get(SHARE_PARAM);
  if (shareId) {
    if (tokens.access || tokens.refresh) {
      cleanup = renderSharedChat(root, shareId, { onExit: leaveShare });
    } else {
      renderLogin(root, start, { mode: "login", onBack: leaveShare });
      toast("Sign in to view the shared chat.", "info");
    }
    return;
  }

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

let onLegal = false;
function leaveLegal() {
  history.replaceState(null, "", location.pathname + location.search);
  start();
}

function leaveShare() {
  history.replaceState(null, "", location.pathname);
  start();
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
  if (!(tokens.access || tokens.refresh) || onLegal || LEGAL_ROUTES.has(location.hash.slice(1))) start();
});

setOnLogout(logout);
startI18n();   // before the first render, so nothing flashes in English
start();

import { tokens, setOnLogout } from "./api.js";
import { renderLogin } from "./auth.js";
import { renderApp } from "./chat.js";

const root = document.getElementById("app");

function start() {
  if (tokens.access || tokens.refresh) renderApp(root, logout);
  else renderLogin(root, start);
}

function logout() {
  tokens.clear();
  document.querySelectorAll("dialog").forEach((d) => d.remove());
  start();
}

setOnLogout(logout);
start();

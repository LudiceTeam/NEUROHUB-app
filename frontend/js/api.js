import { config } from "./config.js";

const KEYS = { access: "veora_access", refresh: "veora_refresh", device: "veora_device_id" };

export const tokens = {
  get access() { return localStorage.getItem(KEYS.access); },
  get refresh() { return localStorage.getItem(KEYS.refresh); },
  set({ access_token, refresh_token }) {
    localStorage.setItem(KEYS.access, access_token);
    localStorage.setItem(KEYS.refresh, refresh_token);
  },
  clear() {
    localStorage.removeItem(KEYS.access);
    localStorage.removeItem(KEYS.refresh);
  },
};

export function deviceId() {
  let id = localStorage.getItem(KEYS.device);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEYS.device, id);
  }
  return id;
}

export function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `Web · ${browser}${os ? ` on ${os}` : ""}`;
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

let onLogout = () => {};
export function setOnLogout(fn) { onLogout = fn; }

async function raw(path, { method = "GET", body, form, auth = true, apiKey = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  if (apiKey && config.API_KEY) headers["X-API-KEY"] = config.API_KEY;

  const res = await fetch(config.API_BASE + path, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data?.error ?? res.statusText);
  return data;
}

let refreshing = null;
function refreshTokens() {
  refreshing ??= raw("/refresh", {
    method: "POST",
    body: { refresh_token: tokens.refresh },
    auth: false,
    apiKey: true,
  })
    .then((data) => tokens.set(data))
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function request(path, opts = {}) {
  try {
    return await raw(path, opts);
  } catch (e) {
    const canRefresh = e instanceof ApiError && e.status === 401 && opts.auth !== false && tokens.refresh;
    if (!canRefresh) throw e;
    try {
      await refreshTokens();
    } catch {
      tokens.clear();
      onLogout();
      throw e;
    }
    return raw(path, opts);
  }
}

const post = (path, body, extra) => request(path, { method: "POST", body, ...extra });

export const api = {
  // auth
  sendCode: (email) => post("/send/code", { email }, { auth: false }),
  checkCode: (email, code) => post("/check/code", {
    email, code: Number(code), device_id: deviceId(), device_name: deviceName(),
  }, { auth: false }),
  googleAuth: (idToken) => post("/auth/google", {
    id_token: idToken, method: "site", device_id: deviceId(), device_name: deviceName(),
  }, { auth: false }),

  // profile
  profile: () => request("/profile"),
  changeName: (new_name) => post("/change/name", { new_name }),
  changeAvatar: (file) => {
    const form = new FormData();
    form.append("avatar", file);
    return request("/change_avatar", { method: "POST", form });
  },
  streak: () => request("/streak/get", { apiKey: true }),
  devices: () => request("/get/user/devices", { apiKey: true }),
  deleteDevice: (device_id) => post("/delete/device", { device_id }),

  // models
  getModel: () => request("/get_model_name", { apiKey: true }),
  changeModel: (model_name) => post("/change_model", { model_name }),

  // chats
  chats: () => post("/get_user_chats"),
  messages: (chat_id) => post("/get_chat_messages", { chat_id }),
  renameChat: (chat_id, new_name) => post("/chat/rename", { chat_id, new_name }),
  pinChat: (chat_id, pin_value) => post("/chat/pin", { chat_id, pin_value }),
  deleteChat: (chat_id) => post("/delete/chat", { chat_id }),

  askText: (chat_id, text) => post("/ask_text", { chat_id, request: text }),
  askPhoto: (chat_id, text, files) => {
    const form = new FormData();
    if (chat_id) form.append("chat_id_form", chat_id);
    if (text) form.append("request_text", text);
    for (const f of files) form.append("image_list", f);
    return request("/ask_photo", { method: "POST", form });
  },
};

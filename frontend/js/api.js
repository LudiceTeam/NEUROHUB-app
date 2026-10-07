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
    // HTTP/2 responses have no statusText, so an empty or non-JSON error body needs a fallback.
    super(typeof detail === "string" && detail ? detail : `Request failed (${status})`);
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
    // Only a rejected access token should trigger a refresh; a 401 for a missing
    // X-API-KEY ("Invalid API key") says nothing about the session.
    const tokenRejected = e instanceof ApiError && e.status === 401
      && ["Token expired", "Could not validate credentials"].includes(e.message);
    if (!tokenRejected || opts.auth === false || !tokens.refresh) throw e;
    try {
      await refreshTokens();
    } catch (refreshError) {
      // Network or server trouble keeps the session; a refused refresh ends it.
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        tokens.clear();
        onLogout();
      }
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

  // folders
  folders: () => request("/user/folders", { apiKey: true }),
  createFolder: (folder_name, folder_tags = []) => post("/folder/create", { folder_name, folder_tags }),
  folderChats: (folder_id) => post("/folder/get/chats", { folder_id }),
  // folder_id "" takes the chat out of its folder.
  moveChat: (chat_id, folder_id) => post("/folder/add_or_delte/chat", { chat_id, folder_id }),
  renameFolder: (folder_id, name) => post("/folder/rename", { folder_id, name }),
  deleteFolder: (folder_id) => post("/folder/delete", { folder_id }),
  addFolderTag: (folder_id, tag) => post("/folder/tag/add", { folder_id, tag }),
  removeFolderTag: (folder_id, tag) => post("/folder/tag/remove", { folder_id, tag }),

  // Returns the translated text as a plain string.
  translate: (text, target_language) => post("/translate", { text, target_language }),

  // voice_id: one of the user's own voices — the text is spoken in that voice with voice_model.
  askText: (chat_id, text, voice_id = null, voice_model = null) => post("/ask_text", {
    chat_id, request: text, ...(voice_id ? { voice_id, voice_model } : {}),
  }),

  // own (cloned) voices
  voices: () => request("/voices/get"),
  voiceModels: () => request("/voices/models"),
  // transcript: what is said in the sample (the backend transcribes it when missing).
  createVoice: (file, name, transcript = null) => {
    const form = new FormData();
    form.append("voice_file", file);
    form.append("name", name);
    form.append("agree", "true");
    if (transcript) form.append("transcript", transcript);
    return request("/voice/create", { method: "POST", form });
  },
  renameVoice: (voice_id, new_name) => post("/voice/rename", { voice_id, new_name }),
  deleteVoice: (voice_id) => request("/voice/delete", { method: "DELETE", body: { voice_id } }),
  askPhoto: (chat_id, text, files) => {
    const form = new FormData();
    if (chat_id) form.append("chat_id_form", chat_id);
    if (text) form.append("request_text", text);
    for (const f of files) form.append("image_list", f);
    return request("/ask_photo", { method: "POST", form });
  },
};

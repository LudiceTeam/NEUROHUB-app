export const config = {
  // "/api" goes through serve.py (or a reverse proxy in production).
  // Set to "https://api.nexi.center" only if the backend has CORS enabled for this site.
  API_BASE: "/api",

  // Value of the backend X-API-KEY env var. Needed for /refresh, /get_model_name,
  // /streak/get and /get/user/devices. Anything here is visible to site visitors.
  API_KEY: "",

  // Web OAuth client ID — the same value as GOOGLE_CLIENT_ID_SITE on the backend.
  // Client IDs are public; web.nexi.center must be in its "Authorized JavaScript origins".
  GOOGLE_CLIENT_ID: "962589409407-fakiji2ntktqrajott08keggldq75g1o.apps.googleusercontent.com",
};

// Mirrors backend/api/config.py. Video models are omitted: /change_model rejects them.
export const MODEL_GROUPS = [
  ["Smart", ["auto"]],
  ["OpenAI", ["openai/gpt-5.4-mini", "openai/gpt-4o", "openai/gpt-4o-mini"]],
  ["Anthropic", ["anthropic/claude-opus-4.6", "anthropic/claude-sonnet-4.6"]],
  ["Google Gemini", [
    "google/gemini-3-flash-preview",
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001",
    "google/gemini-2.0-flash-lite-001",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash-lite-preview-09-2025",
    "google/gemini-3.1-flash-lite-preview",
  ]],
  ["Google Gemma", [
    "google/gemma-3-4b-it",
    "google/gemma-3-4b-it:free",
    "google/gemma-3-12b-it",
    "google/gemma-3-12b-it:free",
    "google/gemma-3-27b-it",
    "google/gemma-3-27b-it:free",
    "google/gemma-4-26b-a4b-it",
    "google/gemma-4-31b-it",
    "google/gemma-4-31b-it:free",
  ]],
  ["Qwen", [
    "qwen/qwen2.5-vl-7b-instruct",
    "qwen/qwen2.5-vl-72b-instruct",
    "qwen/qwen3-vl-8b-instruct",
    "qwen/qwen3-vl-8b-thinking",
    "qwen/qwen3-vl-30b-a3b-instruct",
    "qwen/qwen3-vl-30b-a3b-thinking",
  ]],
  ["Meta", [
    "meta-llama/llama-3.2-11b-vision-instruct",
    "meta-llama/llama-3.2-90b-vision-instruct",
    "meta-llama/llama-4-maverick",
    "meta-llama/llama-4-scout",
  ]],
  ["Mistral", ["mistralai/mistral-large", "mistralai/pixtral-12b", "mistralai/mistral-small-2603"]],
  ["Other", [
    "rekaai/reka-edge",
    "bytedance-seed/seed-2.0-mini",
    "bytedance/ui-tars-1.5-7b",
    "z-ai/glm-4.6v",
    "moonshotai/kimi-k2.5",
    "nvidia/nemotron-nano-12b-vl",
  ]],
  ["Image generation", ["google/gemini-3-pro-image-preview", "google/gemini-3.1-flash-image-preview"]],
];

export const PREMIUM_MODELS = new Set([
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-4o",
  "mistralai/mistral-large",
  "google/gemini-3-pro-image-preview",
  "google/gemini-3.1-flash-image-preview",
]);

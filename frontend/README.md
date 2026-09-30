# Veora Web

Web client for the Veora API (`backend/api/api.py`). Plain HTML/CSS/ES modules, no build step.

## Run locally

```bash
python3 frontend/serve.py                          # http://localhost:5173, API -> https://api.nexi.center
API_URL=http://127.0.0.1:8000 python3 frontend/serve.py   # against a local backend
```

`serve.py` serves the static files and proxies `/api/*` to the backend, because the backend has no CORS middleware.

## Configure — `js/config.js`

| Key | What |
| --- | --- |
| `API_BASE` | `/api` (through the proxy). Use the full API URL only if the backend enables CORS for the site's domain. |
| `API_KEY` | Backend `X-API-KEY`. Required for token refresh, current model, streak and devices. It ends up public in the browser. |
| `GOOGLE_CLIENT_ID` | Backend `GOOGLE_CLIENT_ID_SITE`. Empty hides the Google button. The site origin must be allowed in the Google Cloud OAuth client. |

The model list in `config.js` mirrors `backend/api/config.py`. Update both when models change.

## Features

- Sign in with an email code or Google (`method: "site"`); JWT refresh on `401`
- Chats: list, open, rename, pin, delete; new chat is created on the first message
- Text chat with markdown/code rendering, image attachments (up to 5, 5 MB each, paste or drag & drop)
- Image generation results; video results from history
- Model picker (`/change_model`)
- Account: name, avatar, plan, request quotas, streak, signed-in devices, sign out

## Deploy

Any static host works if requests to `/api/*` are proxied to the API (e.g. nginx `location /api/ { proxy_pass https://api.nexi.center/; }`),
or enable CORS on the backend and set `API_BASE` to the API URL.

## Known backend limitations

- `GET /videos/task/status` takes a JSON body, which browsers can't send with GET, so the site can't poll video status.
  The video appears in history only after something else (the iOS app) has polled it.
- `/ask_text` and `/ask_photo` don't return the new `chat_id`; the site finds it by diffing the chat list.
- `/get_user_chats` doesn't say which chats are pinned; the site remembers pins locally.

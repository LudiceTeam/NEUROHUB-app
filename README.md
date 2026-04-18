<div align="center">

# Nexi

### All AI in One Place

*Access 40+ world-class AI models through a single, beautifully unified API*

---

[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.14-3776AB?style=flat-square&logo=python)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-async-336791?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-cache-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![AWS S3](https://img.shields.io/badge/AWS-S3-FF9900?style=flat-square&logo=amazonaws)](https://aws.amazon.com/s3)

</div>

---

## What is Nexi?

**Nexi** is a production-grade AI aggregator backend that gives your users instant access to the best AI models in the world — Google Gemini, OpenAI GPT, Anthropic Claude, Meta Llama, Mistral, and 35+ more — through a single, unified API. No juggling multiple providers, no separate billing, no fragmented experiences.

One app. All AI.

---

## Features

- **40+ AI Models** — Switch between models from Google, OpenAI, Anthropic, Meta, Mistral, Qwen, and more in a single request
- **Vision & Image Generation** — Send images for analysis or generate images with supported models
- **Encrypted Chat History** — All messages are encrypted at rest with Fernet symmetric encryption
- **Multi-Provider Auth** — Sign in with Google, Apple, or Email (6-digit code)
- **Subscription Tiers** — Free, Basic, and Premium plans managed via Apple App Store
- **Request Quotas** — Smart daily quota system with automatic resets
- **File Storage** — AWS S3 + CloudFront CDN for avatars and images
- **Request Signing** — HMAC-SHA256 signature verification on all endpoints
- **Rate Limiting** — 20 requests/minute per endpoint via SlowAPI

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.135 (async) |
| Language | Python 3.14 |
| Server | Uvicorn (ASGI) |
| Database | PostgreSQL + SQLAlchemy 2.0 (asyncpg) |
| Cache | Redis |
| AI Gateway | OpenRouter (proxy for 40+ models) |
| Auth | JWT, Google OAuth2, Apple Sign-In |
| Encryption | Fernet (messages), bcrypt (passwords) |
| Storage | AWS S3 + CloudFront CDN |
| Email | Resend API |
| Billing | Apple App Store Server API |
| Rate Limiting | SlowAPI |

---

## AI Models

Nexi routes requests through **OpenRouter**, giving access to:

| Provider | Models |
|---|---|
| **Google** | Gemini 3 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash, Gemma series |
| **OpenAI** | GPT-4o, GPT-4o mini, GPT-4.1 mini |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet 4.6 |
| **Meta** | Llama 3.2 Vision, Llama 4 Scout, Llama 4 Maverick |
| **Mistral** | Mistral Large, Pixtral 12B |
| **Qwen** | Qwen 3, Qwen 2.5 Vision, Qwen VL |
| **Others** | Kimi, NVIDIA Nemotron, Reka Flash, GLM-4, Seed-Vision |

---

## API Reference

All endpoints require:
- `Authorization: Bearer <access_token>`
- `X-Signature: <hmac_sha256_of_body>`
- `X-Timestamp: <unix_timestamp>` (within 300 seconds)

---

### Authentication

#### `POST /auth/google`
Sign in with Google OAuth.

```json
Request:  { "token": "google_id_token" }
Response: { "access_token": "...", "refresh_token": "...", "new_user": true }
```

#### `POST /auth/apple`
Sign in with Apple.

```json
Request:  { "identity_token": "apple_jwt", "user_id": "...", "email": "..." }
Response: { "access_token": "...", "refresh_token": "...", "new_user": true }
```

#### `POST /send/code`
Send a 6-digit email verification code (valid for 2 minutes).

```json
Request:  { "email": "user@example.com" }
Response: { "detail": "Code sent" }
```

#### `POST /check/code`
Verify email code and create/login user.

```json
Request:  { "email": "user@example.com", "code": "123456" }
Response: { "access_token": "...", "refresh_token": "...", "new_user": false }
```

#### `POST /refresh`
Exchange a refresh token for a new access token.

```json
Request:  { "refresh_token": "..." }
Response: { "access_token": "..." }
```

---

### AI Chat

#### `POST /ask_text`
Send a text message to the user's selected AI model.

```json
Request:
{
  "chat_id": "uuid",
  "message": "Explain quantum computing",
  "new_chat": false,
  "chat_name": ""
}

Response:
{
  "response": "Quantum computing is...",
  "requests_left": 8,
  "chat_id": "uuid"
}
```

#### `POST /ask_photo`
Send up to **7 images** with a text prompt (max 20 MB total, supports JPEG/PNG/WebP).

```json
Request (multipart/form-data):
  message: "What's in these images?"
  chat_id: "uuid"
  new_chat: false
  images: [file1, file2, ...]

Response:
{
  "response": "I can see...",
  "requests_left": 7,
  "chat_id": "uuid"
}
```

---

### Chat Management

#### `POST /get_user_chats`
Retrieve all chat sessions for the authenticated user.

```json
Response:
{
  "chats": [
    { "chat_id": "uuid", "chat_name": "Quantum Computing", "created_at": "2026-04-19T..." }
  ]
}
```

#### `POST /get_chat_messages`
Get all messages in a specific chat (decrypted).

```json
Request:  { "chat_id": "uuid" }
Response:
{
  "messages": [
    { "role": "user", "content": "...", "images": [], "model_name": "gemini-3-pro" },
    { "role": "assistant", "content": "...", "images": [] }
  ]
}
```

#### `POST /delete/chat`
Permanently delete a chat and all its messages.

```json
Request:  { "chat_id": "uuid" }
Response: { "detail": "Chat deleted" }
```

---

### Model Selection

#### `POST /change_model`
Switch the user's active AI model.

```json
Request:  { "model_name": "claude-opus-4-5" }
Response: { "detail": "Model changed" }
```

#### `GET /get_model_name`
Get the user's currently selected model.

```json
Response: { "model_name": "google/gemini-flash-1.5" }
```

#### `GET /get_or_write_model_stats`
Get aggregated model usage statistics across all users.

```json
Response:
{
  "stats": {
    "google/gemini-flash-1.5": 1420,
    "gpt-4o": 893,
    "claude-opus-4-5": 512
  }
}
```

---

### User Profile

#### `POST /profile`
Get full user profile including subscription status and quota.

```json
Response:
{
  "email": "user@example.com",
  "name": "Ivan",
  "avatar_url": "https://cdn.nexi.app/avatars/...",
  "sub": true,
  "basic_sub": false,
  "requests": 10,
  "nano_req": 15,
  "sub_expires_at": "2026-05-19T..."
}
```

#### `POST /get_user_avatar_name`
Lightweight endpoint — returns just avatar URL and display name.

```json
Response: { "avatar_url": "https://cdn.nexi.app/...", "name": "Ivan" }
```

#### `POST /change_avatar`
Upload a new avatar (max 5 MB, JPEG/PNG/WebP). Stored in S3, served via CloudFront.

```
Request (multipart/form-data): avatar: <file>
Response: { "avatar_url": "https://cdn.nexi.app/avatars/..." }
```

---

### Subscription & Billing

#### `POST /billing/apple/validate`
Validate an Apple App Store purchase and activate subscription.

```json
Request:  { "transaction_id": "...", "product_id": "com.nexi.premium" }
Response: { "detail": "Subscription activated", "tier": "premium" }
```

#### `POST /webhook/apple/notification`
Apple server-to-server webhook for subscription lifecycle events (renewal, expiration, refund).

> This endpoint is called by Apple — not by your client.

---

### Utilities

#### `POST /translate`
Translate text using Google Translate.

```json
Request:  { "text": "Привет мир", "target_lang": "en" }
Response: { "translated": "Hello world" }
```

#### `GET /`
Health check.

```json
Response: { "status": "ok" }
```

---

## Subscription Tiers

| Feature | Free | Basic | Premium |
|---|:---:|:---:|:---:|
| Daily text requests | 10 | 25 | Unlimited |
| Image generation requests/day | 1 | 3 | 15 |
| Access to all 40+ models | ✓ | ✓ | ✓ |
| Chat history | ✓ | ✓ | ✓ |
| Vision (image input) | ✓ | ✓ | ✓ |

> Quotas reset daily. Premium subscribers never hit a text request limit.

---

## Security

- **Request Signing** — Every request is verified with HMAC-SHA256 using a shared secret and timestamp to prevent replay attacks
- **JWT Tokens** — Short-lived access tokens (5 min) + long-lived refresh tokens (30 days)
- **Message Encryption** — All chat messages and AI responses are encrypted with Fernet before being stored in PostgreSQL
- **Rate Limiting** — 20 requests/minute per IP per endpoint
- **OAuth2** — Delegated authentication via Google and Apple (no passwords stored)

---

## Project Structure

```
nexi/
├── backend/
│   ├── api/
│   │   ├── api.py              # All FastAPI routes
│   │   ├── auth.py             # JWT token creation
│   │   ├── config.py           # DB connection pools
│   │   ├── psw_hash.py         # Fernet message encryption
│   │   ├── s3_client.py        # AWS S3 operations
│   │   ├── apple_client.py     # Apple App Store client
│   │   └── .env                # API secrets
│   └── database/
│       ├── main_database/      # Users & subscriptions
│       ├── messages_database/  # Chat messages
│       ├── chats_database/     # Chat sessions
│       ├── jwt_database/       # Refresh tokens
│       ├── email_code_db/      # Email verification
│       ├── transaction_db/     # Apple transactions
│       ├── ai_choose_db/       # User model preferences
│       ├── stats_db/           # Usage statistics
│       └── model_stats_redis/  # Redis cache client
```

---

## Environment Variables

```env
# JWT
SECRET_KEY=
REFRESH_SECRET_KEY=
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=5
REFRESH_TOKEN_EXPIRE_DAYS=30

# OAuth
GOOGLE_CLIENT_ID=

# AI
OPEN_AI=                        # OpenRouter API key

# Email
EMAIL_API_KEY=                  # Resend API key
EMAIL_FROM=

# Security
HASH_MESSAGES_KEY=              # Fernet key
X-API-KEY=                      # Internal API key

# AWS
AWS_ACCESS_KEY=
AWS_SECRET_KEY=
AWS_REGION=eu-north-1
BUCKET_NAME=
CLOUD_FRONT_DOMAIN=

# Apple
APPLE_ISSUER_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
APPLE_BUNDLE_ID=
APPLE_ENVIRONMENT=Production

# Database
DB_USER=
DB_PASSWORD=
DB_HOST=localhost
DB_PORT=5432
```

---

<div align="center">

Built with love using **FastAPI** · **PostgreSQL** · **Redis** · **AWS** · **OpenRouter**

*Nexi — All AI in One Place*

</div>

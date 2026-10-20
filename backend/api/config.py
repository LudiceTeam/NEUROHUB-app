import math
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
from typing import List
#from backend.database.custom_gpt_select_db.select_core import get_user_gpt
#from backend.database.custom_gpt_db.custom_core import get_gpt_settings
#from backend.api.psw_hash import decrypt


load_dotenv()


database_url = f"postgresql+asyncpg://postgres.{os.getenv('PROJECT_REF')}:{os.getenv('DB_PASSWORD')}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"

database_url_test = f"postgresql+asyncpg://postgres:{os.getenv('DB_PASSWORD')}@localhost:5432/postgres"

async_engine = create_async_engine(
    database_url,
    pool_size=5,          
    max_overflow=5,       
    pool_recycle=3600,    
    pool_pre_ping=True,     
    echo=False,
    connect_args={"ssl": "require"},
)



AsyncSessionLocal = sessionmaker(
    async_engine, 
    class_=AsyncSession,
    expire_on_commit=False
)



# Limits per plan:
#   requests      regular requests, refilled every day
#   nano_req      premium requests (top models, images, voice), refilled every 30 days
#   video         video generations, refilled every 30 days
#   voices_amount own (cloned) voices
# Sized so that even a user who spends everything with long chats stays profitable.
FREE_PLAN = {"requests": 25, "nano_req": 0, "video": 0, "photos": 1}

# Daily limits are counted in credits: every request costs what the model really costs.
# 1 credit = the worst-case cost of a fast model (~$0.0024 with the caps below). Models not listed
# here cost 1 credit. Top models (expensive_models), images and voice use monthly premium requests;
# video uses monthly video credits.
MODEL_CREDITS = {
    "openai/gpt-5.4-mini": 5,
    "google/gemini-3-flash-preview": 4,
    "qwen/qwen3-vl-30b-a3b-thinking": 4,
    "google/gemini-2.5-flash": 3,
    "moonshotai/kimi-k2.5": 3,
    "qwen/qwen2.5-vl-72b-instruct": 3,
    "google/gemini-3.1-flash-lite-preview": 2,
    "z-ai/glm-4.6v": 2,
}

def model_credits(model:str) -> int:
    return MODEL_CREDITS.get(model, 1)

FREE_DEFAULT_MODEL = "openai/gpt-4o-mini"
PAID_DEFAULT_MODEL = "google/gemini-3-flash-preview"

# Cost caps that the limits above are calculated with.
MAX_OUTPUT_TOKENS = 1500
MAX_HISTORY_CHARS = 24000   # ~6k tokens of chat history in the prompt

SUBSCRIPTIONS = {
    "basic": {
        "days": 30,
        "requests": 80,
        "nano_req": 18,
        "column": "basic_sub",
        "price_id" : "price_1UNyNk09Iu3h8elKIY8aiV1R",
        "voices_amount" : 1,
        "video" : 0,
        "photos" : 5
    },

    "premium" : {
        "days" : 30,
        "requests" : 260,
        "nano_req" : 75,
        "column" : "premium_sub",
        "price_id" : "price_1UNyOd09Iu3h8elKFjVksdgq",
        "voices_amount" : 5,
        "video" : 4,
        "photos" : 5
    },

    "starter": {
        "days": 30,
        "requests": 40,
        "nano_req": 8,
        "column": "starter_sub",
        "price_id" : "price_1UNyNK09Iu3h8elKeRemRDeO",
        "voices_amount" : 0,
        "video" : 0,
        "photos" : 3
    },

    "plus": {
        "days": 30,
        "requests": 150,
        "nano_req": 40,
        "column": "plus_sub",
        "price_id" : "price_1UNyOC09Iu3h8elKr559huKI",
        "voices_amount" : 3,
        "video" : 2,
        "photos" : 5
    },
    
    "max" : {
        "days" : 30,
        "requests" : 520,
        "nano_req" : 150,
        "column" : "max_sub",
        "price_id" : "price_1UNyPJ09Iu3h8elKBAZoItva",
        "voices_amount" : 10,
        "video" : 8,
        "photos" : 5
    },

    "elite" : {
        "days" : 30,
        "requests" : 1100,
        "nano_req" : 330,
        "column" : "elite_sub",
        "price_id" : "price_1UNyPe09Iu3h8elK65JJMUkc",
        "voices_amount" : 15,
        "video" : 18,
        "photos" : 5
    }
}


models = [
    "auto",

    # ===== OPENAI =====
    "openai/gpt-6-luna",
    "openai/gpt-6.1-sol",
    "openai/gpt-5.4-mini",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",

    # ===== ANTHROPIC =====
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",

    # ===== GOOGLE GEMINI =====
    "google/gemini-3-flash-preview",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-lite",
    "google/gemini-3.1-flash-lite-preview",

    # ===== GOOGLE GEMMA =====
    "google/gemma-3-4b-it",
    "google/gemma-3-12b-it",
    "google/gemma-3-27b-it",
    "google/gemma-4-26b-a4b-it",
    "google/gemma-4-31b-it",
    "google/gemma-4-31b-it:free",

    # ===== QWEN =====
    "qwen/qwen2.5-vl-72b-instruct",
    "qwen/qwen3-vl-8b-instruct",
    "qwen/qwen3-vl-30b-a3b-instruct",
    "qwen/qwen3-vl-30b-a3b-thinking",

    # ===== META =====
    "meta-llama/llama-4-maverick",
    "meta-llama/llama-4-scout",

    # ===== MISTRAL =====
    "mistralai/mistral-large",
    "mistralai/mistral-small-2603",

    # ===== OTHER =====
    "rekaai/reka-edge",
    "bytedance-seed/seed-2.0-mini",
    "bytedance/ui-tars-1.5-7b",
    "z-ai/glm-4.6v",
    "moonshotai/kimi-k2.5",
]


expensive_models = [
    "openai/gpt-6.1-sol",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-4o",
    "mistralai/mistral-large",
]


# The free plan gets every 1-credit model (fast and cheap); everything else is PLUS.
FREE_MODELS = [m for m in models if m != "auto" and m not in expensive_models and model_credits(m) == 1]


image_generation_models = [
    "google/gemini-3-pro-image-preview",
    "google/gemini-3.1-flash-image-preview",
    "google/gemini-3.1-flash-lite-image",
    "openai/gpt-image-2",
    "black-forest-labs/flux.2-pro",
    "bytedance-seed/seedream-4.5",
    "x-ai/grok-imagine-image-quality",
    "qwen/qwen-image-3",
    "recraft/recraft-v4.1",
]
# Reasoning models: they think before answering, so they get a larger token budget and a fixed effort
# (higher effort = more tokens = more cost per answer).
REASONING_MODELS = {
    "openai/gpt-6-luna": "low",
    "openai/gpt-6.1-sol": "medium",
}

# YooKassa: plan prices in rubles for 30 days (mirror frontend/js/plans.js).
PLAN_PRICES_RUB = {"starter": 499, "basic": 890, "plus": 1890, "premium": 2990, "max": 5990, "elite": 12990}
PLAN_TITLES = {"starter": "Starter", "basic": "Basic", "plus": "Plus", "premium": "Premium", "max": "Max", "elite": "Elite"}
RENEWAL_RETRIES = 3          # failed auto-renewal attempts (one a day) before the plan ends

# Photo studio: every image model goes through OpenRouter's Images API (POST /api/v1/images).
# One image costs 1 premium request (2 at high resolution).
IMAGE_MODEL_SPECS = {
    "google/gemini-3-pro-image-preview": {"name": "Nano Banana Pro", "note": "Best quality, understands complex scenes"},
    "google/gemini-3.1-flash-image-preview": {"name": "Nano Banana 2", "note": "Fast, great at editing photos"},
    "google/gemini-3.1-flash-lite-image": {"name": "Nano Banana Lite", "note": "Cheapest and fastest"},
    "openai/gpt-image-2": {"name": "GPT Image 2", "note": "Photorealism and precise edits"},
    "black-forest-labs/flux.2-pro": {"name": "FLUX.2 Pro", "note": "Top-tier detail and style"},
    "bytedance-seed/seedream-4.5": {"name": "Seedream 4.5", "note": "Vivid images and posters"},
    "x-ai/grok-imagine-image-quality": {"name": "Grok Imagine", "note": "Bold, creative images"},
    "qwen/qwen-image-3": {"name": "Qwen Image 3", "note": "Clean text and lettering"},
    "recraft/recraft-v4.1": {"name": "Recraft 4.1", "note": "Logos, icons and design"},
}
IMAGE_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"]
IMAGE_RESOLUTIONS = {"1K": 1, "2K": 2}      # resolution -> premium requests per image
IMAGE_MAX_VARIANTS = 4
IMAGE_MAX_REFERENCES = 4
MAX_IMAGE_PROMPT = 2000

# These return only an image (no text part), so they need modalities ["image"].
IMAGE_ONLY_MODELS = {
    "openai/gpt-image-2",
    "black-forest-labs/flux.2-pro",
    "bytedance-seed/seedream-4.5",
    "x-ai/grok-imagine-image-quality",
    "qwen/qwen-image-3",
    "recraft/recraft-v4.1",
}

# Video studio models and the settings OpenRouter accepts for each (GET /api/v1/videos/models).
VIDEO_MODEL_SPECS = {
    "bytedance/seedance-2.0-fast": {
        "price": {"480p": 0.04, "720p": 0.091},
        "name": "Seedance 2.0 Fast",
        "note": "Fast, sharp motion, with sound",
        "resolutions": ["480p", "720p"],
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        "durations": list(range(4, 16)),
        "frames": ["first_frame", "last_frame"],
        "audio": True,
    },
    "bytedance/seedance-2.0-mini": {
        "price": {"480p": 0.034, "720p": 0.076},
        "name": "Seedance 2.0 Mini",
        "note": "Lighter and cheaper, great for drafts",
        "resolutions": ["480p", "720p"],
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        "durations": list(range(4, 16)),
        "frames": ["first_frame", "last_frame"],
        "audio": True,
    },
}
VIDEO_MODEL_SPECS.update({
    "google/veo-3.1-lite": {
        "price": {"720p": 0.05, "1080p": 0.08},
        "name": "Veo 3.1 Lite",
        "note": "Google quality with sound, great value",
        "resolutions": ["720p", "1080p"],
        "aspect_ratios": ["16:9", "9:16"],
        "durations": [4, 6, 8],
        "frames": ["first_frame", "last_frame"],
        "audio": True,
    },
    "kwaivgi/kling-v3.0-std": {
        "price": {"720p": 0.126},
        "name": "Kling 3.0",
        "note": "Lifelike motion, animates photos of people",
        "resolutions": ["720p"],
        "aspect_ratios": ["16:9", "9:16", "1:1"],
        "durations": list(range(3, 16)),
        "frames": ["first_frame", "last_frame"],
        "audio": True,
    },
    "alibaba/wan-3.0": {
        "price": {"480p": 0.05, "720p": 0.10, "1080p": 0.20},
        "name": "Wan 3.0",
        "note": "Long clips up to 15 s, up to 1080p",
        "resolutions": ["480p", "720p", "1080p"],
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
        "durations": list(range(2, 16)),
        "frames": ["first_frame", "last_frame"],
        "audio": True,
    },
    "x-ai/grok-imagine-video-1.5-lite": {
        "price": {"480p": 0.02, "720p": 0.03, "1080p": 0.14},
        "name": "Grok Imagine Video",
        "note": "Fastest and cheapest, for quick ideas",
        "resolutions": ["480p", "720p", "1080p"],
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
        "durations": list(range(2, 16)),
        "frames": ["first_frame"],
        "audio": False,
    },
})
video_generation_models = list(VIDEO_MODEL_SPECS)
# Music studio (Google Lyria 3 on OpenRouter). Paid with premium requests: OpenRouter charges
# $0.04 per 30-second clip and $0.08 per full song.
MUSIC_MODEL_SPECS = {
    "google/lyria-3-clip-preview": {
        "name": "Lyria 3 Clip",
        "note": "30-second clips, quick ideas",
        "cost": 1,
    },
    "google/lyria-3-pro-preview": {
        "name": "Lyria 3 Pro",
        "note": "Full songs with vocals",
        "cost": 2,
    },
}
music_generation_models = list(MUSIC_MODEL_SPECS)
MAX_MUSIC_PROMPT = 1500
MAX_MUSIC_LYRICS = 3000

# What a video sent from the chat gets (the studio lets the user pick).
VIDEO_DEFAULTS = {"duration": 8, "aspect_ratio": "9:16", "resolution": "720p", "generate_audio": True}
MAX_VIDEO_PROMPT = 2000


# One video credit is worth this much OpenRouter spend; a clip costs as many credits as it needs.
VIDEO_CREDIT_USD = 0.75


def video_credit_cost(model:str, duration:int, resolution:str) -> int:
    """Video credits for one clip, from the model's price per second at that resolution."""
    prices = VIDEO_MODEL_SPECS.get(model, {}).get("price") or {}
    per_second = prices.get(resolution) or max(prices.values(), default = VIDEO_CREDIT_USD / 8)
    return max(1, math.ceil(round(per_second * duration / VIDEO_CREDIT_USD, 6)))


# Text-to-speech models (OpenRouter /audio/speech). Every entry is one voice of a speech
# model: the key is what the user picks and what is stored as model_name, the value is
# what gets sent to OpenRouter. All of these handle Russian and English.
# Gemini TTS on OpenRouter only returns raw PCM (16-bit LE, 24 kHz, mono), which the API
# wraps into WAV; models without "format" return mp3.
GEMINI_PCM = {"format": "pcm", "sample_rate": 24000}

tts_models = {
    "google/gemini-3.8-flash-tts:kore": {"model": "google/gemini-3.8-flash-tts", "voice": "Kore", **GEMINI_PCM},
    "google/gemini-3.8-flash-tts:puck": {"model": "google/gemini-3.8-flash-tts", "voice": "Puck", **GEMINI_PCM},
    "google/gemini-3.8-flash-lite-tts:aoede": {"model": "google/gemini-3.8-flash-lite-tts", "voice": "Aoede", **GEMINI_PCM},
    "google/gemini-3.8-flash-lite-tts:charon": {"model": "google/gemini-3.8-flash-lite-tts", "voice": "Charon", **GEMINI_PCM},
    "x-ai/grok-voice-tts-1.0:eve": {"model": "x-ai/grok-voice-tts-1.0", "voice": "eve"},
    "x-ai/grok-voice-tts-1.0:rex": {"model": "x-ai/grok-voice-tts-1.0", "voice": "rex"},
}

MAX_TTS_CHARS = 3000

# Models for the user's own (cloned) voices.
#  - "openrouter": stateless cloning, the sample (and its transcript) is sent with every request.
#  - "elevenlabs": the sample is cloned once into an ElevenLabs Instant Voice Clone, then reused.
#    Only available when ELEVENLABS_API_KEY is set.
CLONE_MODELS = {
    "eleven-v4": {"provider": "elevenlabs", "model_id": "eleven_v4", "name": "ElevenLabs Eleven v4", "note": "Most realistic"},
    "eleven-v4-turbo": {"provider": "elevenlabs", "model_id": "eleven_v4_turbo", "name": "ElevenLabs Eleven v4 Turbo", "note": "Realistic and faster"},
    "fish-s2.1-pro": {"provider": "openrouter", "model": "fish-audio/s2.1-pro", "name": "Fish Audio S2.1 Pro", "note": "Natural, uses your transcript"},
}
# Used when the request names no (or an unavailable) model: the first available in this order.
CLONE_MODEL_PREFERENCE = ["eleven-v4", "fish-s2.1-pro", "eleven-v4-turbo"]





def generate_promt_for_image_models(
    request: str,
    current_chat_messages: List,
    custom_model_prompt: str | None = None
) -> str:

    custom_role = ""

    if custom_model_prompt:
        custom_role = f"""
====================
CUSTOM MODEL ROLE:
{custom_model_prompt}
====================

Follow this custom role/instruction while generating the image,
unless it conflicts with higher-priority safety rules.
"""

    prompt = f"""
You are an advanced AI image generation model.

{custom_role}

Generate a real image based on the user's request and conversation context.

Conversation context:
{current_chat_messages}

Current user request:
{request}

Rules:
- Generate the actual image, not a rewritten prompt.
- Keep consistency with previous messages if needed.
- Preserve characters, style, colors, mood, or scene continuity from the conversation.
- Automatically choose appropriate composition, lighting, details, textures, and visual style.
- If the user implies a style (realistic, anime, cyberpunk, retro, cinematic, minimalist, logo, 3D render, etc.), apply it naturally.
- Do not explain anything.
- Do not return a text description.
- Generate only the image.
"""

    return prompt


def gennerate_promt_for_video_generation(
    request: str,
    current_chat_messages: List,
    custom_model_prompt: str | None = None
) -> str:

    custom_role = ""

    if custom_model_prompt:
        custom_role = f"""
====================
CUSTOM MODEL ROLE:
{custom_model_prompt}
====================

Follow this custom role/instruction while generating the video,
unless it conflicts with higher-priority safety rules.
"""

    prompt = f"""
You are an advanced AI video generation model.

{custom_role}

Generate a high-quality cinematic video based on the user's request and conversation context.

Conversation context:
{current_chat_messages}

Current user request:
{request}

Rules:
- Generate the actual video, not a rewritten prompt.
- Maintain visual consistency with previous messages if needed.
- Preserve characters, appearance, clothing, environments, colors, mood, and scene continuity from the conversation.
- Automatically choose appropriate camera movement, composition, lighting, motion, atmosphere and realism.
- Maintain temporal consistency between frames.
- Avoid flickering, distortion, unstable anatomy, or inconsistent objects.
- Do not explain anything.
- Do not return a text description.
- Generate only the video.
"""

    return prompt
 


def generate_main_promt(
    current_chat_messages: List,
    user_facts: str,
    current_message: str,
    custom_model_prompt: str | None = None
) -> str:

    custom_role = ""

    if custom_model_prompt:
        custom_role = f"""
====================
CUSTOM MODEL ROLE:
{custom_model_prompt}
====================

Follow the custom model role above when answering the user.
"""

    promt = f"""
You are a smart AI assistant inside an application. Your task is to help the user as accurately, usefully, and safely as possible, taking into account the conversation context.

{custom_role}

====================
CONVERSATION CONTEXT:
{current_chat_messages}
====================

====================
MAIN FACTS ABOUT USER:
{user_facts}
====================

CURRENT USER MESSAGE:
{current_message}

====================
RULES:

1. CONTEXT:
- Always consider the conversation history.
- Do not ignore previous messages if they affect the response.
- Maintain logical continuity in the dialogue.

2. LANGUAGE:
- Respond in the same language as the user.
- If the language is unclear, use English.
- Do not mix languages unnecessarily.

3. ACCURACY:
- Do not invent facts.
- If you are unsure — say it directly.
- Do not make up non-existent APIs, functions, or data.

4. USEFULNESS:
- Provide clear, practical answers.
- If it's code — it must be working.
- If the task is complex — break it down into steps.

5. STYLE:
- Be clear and to the point.
- Avoid unnecessary verbosity.
- If the user asks for a short answer — keep it short.

6. HANDLING AMBIGUITY:
- If the request is unclear — ask a clarifying question.
- Do not make assumptions without basis.

7. SAFETY:
- Do not assist with harmful or illegal activities.

====================

TASK:
Answer the user's current message as helpfully, accurately, and context-aware as possible.

ANSWER:
"""

    return promt
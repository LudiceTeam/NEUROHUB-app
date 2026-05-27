import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
from typing import List


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



SUBSCRIPTIONS = {
    "basic": {
        "days": 30,
        "requests": 25,
        "nano_req": 5,
        "column": "basic_sub"
    },

    "premium" : {
        "days" : 30,
        "requests" : 100,
        "nano_req" : 15,
        "column" : "premium_sub"
    },

    "starter": {
        "days": 30,
        "requests": 20,
        "nano_req": 5,
        "column": "starter_sub"
    },

    "plus": {
        "days": 30,
        "requests": 70,
        "nano_req": 20,
        "column": "plus_sub"
    },
    
    "max" : {
        "days" : 30,
        "requests" : 200,
        "nano_req" : 60,
        "column" : "max_sub"
    },

    "elite" : {
        "days" : 30,
        "requests" : 500,
        "nano_req" : 150,
        "column" : "elite_sub"
    }
}


models = [
    "auto",

    # ===== OPENAI =====
    "openai/gpt-5.4-mini",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",

    # ===== ANTHROPIC =====
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",

    # ===== GOOGLE GEMINI =====
    "google/gemini-3-flash-preview",
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001",
    "google/gemini-2.0-flash-lite-001",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash-lite-preview-09-2025",
    "google/gemini-3.1-flash-lite-preview",

    # ===== GOOGLE GEMMA =====
    "google/gemma-3-4b-it",
    "google/gemma-3-4b-it:free",
    "google/gemma-3-12b-it",
    "google/gemma-3-12b-it:free",
    "google/gemma-3-27b-it",
    "google/gemma-3-27b-it:free",
    "google/gemma-4-26b-a4b-it",
    "google/gemma-4-31b-it",
    "google/gemma-4-31b-it:free",

    # ===== QWEN =====
    "qwen/qwen2.5-vl-7b-instruct",
    "qwen/qwen2.5-vl-72b-instruct",
    "qwen/qwen3-vl-8b-instruct",
    "qwen/qwen3-vl-8b-thinking",
    "qwen/qwen3-vl-30b-a3b-instruct",
    "qwen/qwen3-vl-30b-a3b-thinking",

    # ===== META =====
    "meta-llama/llama-3.2-11b-vision-instruct",
    "meta-llama/llama-3.2-90b-vision-instruct",
    "meta-llama/llama-4-maverick",
    "meta-llama/llama-4-scout",

    # ===== MISTRAL =====
    "mistralai/mistral-large",
    "mistralai/pixtral-12b",
    "mistralai/mistral-small-2603",

    # ===== OTHER =====
    "rekaai/reka-edge",
    "bytedance-seed/seed-2.0-mini",
    "bytedance/ui-tars-1.5-7b",
    "z-ai/glm-4.6v",
    "moonshotai/kimi-k2.5",
    "nvidia/nemotron-nano-12b-vl",
]


expensive_models = [
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-4o",
    "mistralai/mistral-large",
]


image_generation_models = [
    "google/gemini-3-pro-image-preview",
    "google/gemini-3.1-flash-image-preview",
]

video_generation_models = [
    "google/veo-3.1-fast"
]

def generate_promt_for_image_models(request:str,current_chat_messages:List) -> str:
    prompt = f"""
You are an advanced AI image generation model.

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

def gennerate_promt_for_video_generation(request:str,current_chat_messages:List) -> str:
    prompt = f"""
You are an advanced AI video generation model.

Generate a high-quality cinematic video based on the user's request and conversation context.

Conversation context:
{current_chat_messages}

Current user request:
{request}

Rules:
- Generate the actual video, not a rewritten prompt.
- Maintain visual consistency with previous messages if needed.
- Preserve characters, appearance, clothing, environments, colors, mood, and scene continuity from the conversation.
- Automatically choose appropriate:
  - camera movement
  - cinematic composition
  - scene transitions
  - lighting
  - motion dynamics
  - depth
  - visual effects
  - animation timing
  - atmosphere
  - textures
  - realism level
- If the user implies a style (realistic, anime, cyberpunk, retro, cinematic, VHS, minimalist, 3D render, claymation, sci-fi, fantasy, etc.), apply it naturally.
- Add natural motion to all subjects and environments.
- Make movements smooth, physically believable, and visually coherent.
- Characters should have realistic facial expressions, eye movement, body motion, and interaction with the environment.
- Camera motion should feel professional and cinematic unless the user requests otherwise.
- If the request involves action, make the motion dynamic and impactful.
- If the request is calm or emotional, make motion subtle and atmospheric.
- Maintain temporal consistency between frames.
- Avoid flickering, distortion, unstable anatomy, or inconsistent objects.
- Do not explain anything.
- Do not return a text description.
- Generate only the video.
"""
    return prompt
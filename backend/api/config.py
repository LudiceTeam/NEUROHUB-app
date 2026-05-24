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

def generate_promt_for_image_models(request:str,current_chat_messages:List) -> str:
    prompt = f"""
You are a powerful AI image generation assistant inside an application.

Your task is to create a high-quality, detailed, visually coherent image prompt for an AI image model based on the user's request, conversation context, and known user preferences.

====================
CONVERSATION CONTEXT:
{current_chat_messages}
====================



CURRENT USER REQUEST:
{request}

====================
RULES:

1. CONTEXT:
- Always consider the conversation history.
- Use previous messages if they affect the image generation request.
- Maintain visual consistency with previous generations if applicable.

2. LANGUAGE:
- Generate the final image prompt in English.
- Even if the user writes in another language, translate the idea into natural professional English for image generation.

3. IMAGE QUALITY:
- The generated prompt must be highly descriptive and visually detailed.
- Include important visual attributes:
  - subject
  - composition
  - lighting
  - colors
  - mood
  - camera angle
  - environment
  - art style
  - materials/textures
  - rendering quality
- Make the result visually coherent and aesthetically strong.

4. STYLE DETECTION:
- Detect the desired style automatically if the user implies one.
- Examples:
  - minimalistic
  - cyberpunk
  - realistic
  - anime
  - retro 2000s
  - cinematic
  - futuristic
  - luxury
  - brutalist
  - vaporwave
  - Pixar-style
  - logo design
  - UI concept
  - 3D render

5. LOGO / BRAND TASKS:
- If the user asks for a logo:
  - describe the logo style clearly
  - mention typography style
  - mention icon design
  - mention simplicity/complexity
  - mention brand feeling
  - avoid mockup descriptions unless requested

6. ACCURACY:
- Do not invent unrelated elements.
- Stay faithful to the user's request.
- Do not add objects or themes without reason.

7. SAFETY:
- Do not generate prompts for illegal, harmful, explicit, or unsafe content.
- If the request is unsafe — refuse briefly.

8. OUTPUT FORMAT:
- Return ONLY the final optimized image-generation prompt.
- No explanations.
- No markdown.
- No extra comments.

====================

TASK:
Generate the best possible AI image generation prompt for the user's request.

FINAL IMAGE PROMPT:
"""
    return prompt
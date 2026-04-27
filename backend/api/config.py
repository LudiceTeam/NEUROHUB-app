import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os


load_dotenv()


database_url = f"postgresql+asyncpg://postgres.{os.getenv('PROJECT_REF')}:{os.getenv('DB_PASSWORD')}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"

database_url_test = f"postgresql+asyncpg://postgres:{os.getenv('DB_PASSWORD')}@localhost:5432/postgres"

async_engine = create_async_engine(
    database_url,
    pool_size=20,          
    max_overflow=50,       
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


models = [
    "auto",
    "google/gemini-3-flash-preview",
    "google/gemini-2.5-flash",
    "openai/gpt-5.4-mini",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemma-4-26b-a4b-it",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",
    "mistralai/mistral-large",
    "google/gemini-3-pro-image-preview",

    # ===== GOOGLE (дешевые + норм) =====
    "google/gemini-2.0-flash-001",
    "google/gemini-2.0-flash-lite-001",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash-lite-preview-09-2025",
    "google/gemini-2.5-flash-image-preview",
    "google/gemini-3.1-flash-lite-preview",
    "google/gemini-3.1-flash-image-preview",

    # ===== GEMMA (очень дешевые) =====
    "google/gemma-3-4b-it",
    "google/gemma-3-4b-it:free",
    "google/gemma-3-12b-it",
    "google/gemma-3-12b-it:free",
    "google/gemma-3-27b-it",
    "google/gemma-3-27b-it:free",
    "google/gemma-4-31b-it",
    "google/gemma-4-31b-it:free",

    # ===== QWEN (топ за дешево) =====
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
    "mistralai/pixtral-12b",
    "mistralai/mistral-small-2603",

    # ===== ДРУГИЕ ДЕШЕВЫЕ =====
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
    "google/gemini-2.5-flash-image-preview",
    "google/gemini-3.1-flash-image-preview",
]


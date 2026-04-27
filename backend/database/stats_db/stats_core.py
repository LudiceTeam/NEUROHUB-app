from backend.database.stats_db.stats_models import metadata_obj,stats_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional
from sqlalchemy import select,func
from datetime import datetime,timezone
from backend.database.messages_database.messages_core import count_model_messages
from backend.api.config import database_url,async_engine

logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

async def get_date_last_update():
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(stats_table.c.updated_at)
            res = await conn.execute(stmt)
            return res.scalar_one_or_none()
        except Exception:
            logger.exception("STATS SQL ERROR")
            return ""



async def write_models_stats(models_stats:dict):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = stats_table.update().values(
                    model_usage = models_stats,
                    updated_at = datetime.now(timezone.utc)
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("STATS SQL ERROR")
                return

async def get_models_stats() -> dict:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(stats_table.c.model_usage)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            if data is not None:
                return data
            return {}
        except Exception:
            logger.exception("STATS SQL ERROR")
            return {}



models_default = {
    "google/gemini-3-flash-preview": 0,
    "google/gemini-2.5-flash": 0,
    "openai/gpt-5.4-mini": 0,
    "openai/gpt-4o": 0,
    "openai/gpt-4o-mini": 0,
    "google/gemma-4-26b-a4b-it": 0,
    "anthropic/claude-opus-4.6": 0,
    "anthropic/claude-sonnet-4.6": 0,
    "mistralai/mistral-large": 0,
    "google/gemini-3-pro-image-preview": 0,

    "google/gemini-2.0-flash-001": 0,
    "google/gemini-2.0-flash-lite-001": 0,
    "google/gemini-2.5-flash-lite": 0,
    "google/gemini-2.5-flash-lite-preview-09-2025": 0,
    "google/gemini-2.5-flash-image-preview": 0,
    "google/gemini-3.1-flash-lite-preview": 0,
    "google/gemini-3.1-flash-image-preview": 0,

    "google/gemma-3-4b-it": 0,
    "google/gemma-3-4b-it:free": 0,
    "google/gemma-3-12b-it": 0,
    "google/gemma-3-12b-it:free": 0,
    "google/gemma-3-27b-it": 0,
    "google/gemma-3-27b-it:free": 0,
    "google/gemma-4-31b-it": 0,
    "google/gemma-4-31b-it:free": 0,

    "qwen/qwen2.5-vl-7b-instruct": 0,
    "qwen/qwen2.5-vl-72b-instruct": 0,
    "qwen/qwen3-vl-8b-instruct": 0,
    "qwen/qwen3-vl-8b-thinking": 0,
    "qwen/qwen3-vl-30b-a3b-instruct": 0,
    "qwen/qwen3-vl-30b-a3b-thinking": 0,

    "meta-llama/llama-3.2-11b-vision-instruct": 0,
    "meta-llama/llama-3.2-90b-vision-instruct": 0,
    "meta-llama/llama-4-maverick": 0,
    "meta-llama/llama-4-scout": 0,

    "mistralai/pixtral-12b": 0,
    "mistralai/mistral-small-2603": 0,

    "rekaai/reka-edge": 0,
    "bytedance-seed/seed-2.0-mini": 0,
    "bytedance/ui-tars-1.5-7b": 0,
    "z-ai/glm-4.6v": 0,
    "moonshotai/kimi-k2.5": 0,
    "nvidia/nemotron-nano-12b-vl": 0,
}


async def write_default():
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = stats_table.insert().values(
                    model_usage = models_default,
                    updated_at = datetime.now(timezone.utc)
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("STATS SQL ERROR")
                return


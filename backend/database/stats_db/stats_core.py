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
from backend.api.config import database_url 

logger = logging.getLogger(__name__)


load_dotenv()

async_engine = create_async_engine(
    database_url,
    pool_size=20,          
    max_overflow=50,       
    pool_recycle=3600,    
    pool_pre_ping=True,     
    echo=False
)



AsyncSessionLocal = sessionmaker(
    async_engine, 
    class_=AsyncSession,
    expire_on_commit=False
)

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

async def get_date_last_update(main_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(stats_table.c.last_update).where(stats_table.c.main_id == main_id)
            res = await conn.execute(stmt)
            return res.scalar_one()
        except Exception:
            logger.exception("STATS SQL ERROR")
            return ""



async def update_models_stats() -> dict:
    async with AsyncSession(async_engine) as conn:
        try:

            models = [
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
            ]   
            
            result_dict = {}

            for model in models:
                count = await count_model_messages(model)
                result_dict[model] = count
            
            return result_dict
            
        except Exception:
            logger.exception("STATS SQL ERROR")
            return {}
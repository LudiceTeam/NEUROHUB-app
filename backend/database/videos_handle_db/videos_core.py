from backend.database.videos_handle_db.videos_models import metadata_obj,videos_table
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


async def create_video_task(
        id:str,
        url:str
        user_id:str
) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                pass
            except Exception:
                logger.exception("VIDEOS SQL EXCEPTION")



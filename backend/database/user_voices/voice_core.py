from backend.database.user_voices.voice_models import voices_table,metadata_obj
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional,Dict
from sqlalchemy import select,func,text
from sqlalchemy.dialects.postgresql import insert
from backend.api.config import database_url,async_engine
from datetime import datetime,timezone,timedelta

logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

# For an existing voices_table: create_all doesn't add new columns to it.
async def migrate_table():
    async with async_engine.begin() as conn:
        await conn.execute(text("ALTER TABLE voices_table ADD COLUMN IF NOT EXISTS transcript VARCHAR"))
        await conn.execute(text("ALTER TABLE voices_table ADD COLUMN IF NOT EXISTS eleven_voice_id VARCHAR"))

async def create_voice(user_id:str,name:str,link:str,agree:bool,transcript:Optional[str] = None) -> str | None:
    """Returns the new voice_id, or None on error."""
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                voice_id:str = str(uuid.uuid4())
                stmt = insert(voices_table).values(
                    user_id = user_id,
                    name = name,
                    voice_id = voice_id,
                    link = link,
                    agree = agree,
                    transcript = transcript
                )
                res = await conn.execute(stmt)
                return voice_id if res.rowcount > 0 else None
            except Exception:
                logger.exception("VOICES SQL ERROR")
                return None

async def delete_voice(voice_id:str) -> None:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = voices_table.delete().where(
                    voices_table.c.voice_id == voice_id
                )
                await conn.execute(stmt)
                return None
            except Exception:
                logger.exception("VOICES SQL ERROR")
                return None

async def get_user_voices(user_id:str) -> List[Dict] | None:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(voices_table).where(
                voices_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            data = [dict(row) for row in res.mappings().all()]
            return data
        except Exception:
            logger.exception("VOICES SQL ERROR")
            return None

async def rename_voice(voice_id:str,new_name:str) -> None:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = voices_table.update().where(
                    voices_table.c.voice_id == voice_id
                ).values(
                    name = new_name
                )
                await conn.execute(stmt)
                return None
            except Exception:
                logger.exception("VOICES SQL ERROR")
                return None

async def get_user_voices_amount(user_id:str) -> int | None:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = select(func.count()).where(
                    voices_table.c.user_id == user_id
                )
                res = await conn.execute(stmt)
                count:int  = res.scalar_one()
                return count
            except Exception:
                logger.exception("VOICES SQL ERROR")
                return None

async def set_eleven_voice_id(voice_id:str,eleven_voice_id:str) -> None:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = voices_table.update().where(
                    voices_table.c.voice_id == voice_id
                ).values(
                    eleven_voice_id = eleven_voice_id
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("VOICES SQL ERROR")

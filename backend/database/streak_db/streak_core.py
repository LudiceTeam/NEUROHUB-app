from backend.database.streak_db.streak_models import metadata_obj,streak_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional,Dict
from sqlalchemy import select,func,text
from datetime import datetime,timezone,timedelta
from backend.api.psw_hash import decrypt,encrypt
from backend.api.config import database_url,async_engine
from sqlalchemy.dialects.postgresql import insert

logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

async def migrate_streak_table():
    async with async_engine.begin() as conn:
        await conn.execute(text("ALTER TABLE streak_table ADD COLUMN IF NOT EXISTS record INTEGER DEFAULT 0"))

        

async def create_user_streak(user_id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(streak_table).values(
                    user_id = user_id,
                    streak = 1,
                    last_updated = datetime.now().date(),
                    record = 1,
                ).on_conflict_do_nothing(
                    index_elements=[streak_table.c.user_id]
                )
                res = await conn.execute(stmt)
                return res.rowcount > 0
            except Exception:
                logger.exception("STREAK SQL ERROR")
                return False

async def plus_one_streak_day(user_id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                date = datetime.now().date()
                yesterday = date - timedelta(days = 1)
                
                stmt = streak_table.update().where(
                    streak_table.c.user_id == user_id,
                    streak_table.c.last_updated == yesterday
                ).values(
                    streak = streak_table.c.streak + 1, 
                    last_updated = date,
                )
                res = await conn.execute(stmt)
                return res.rowcount > 0
            except Exception:
                logger.exception("STREAK SQL ERROR")
                return False

async def reset_streak(user_id:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                date = datetime.now().date()
                yesterday = date - timedelta(days = 1)
                
                stmt = streak_table.update().where(
                    streak_table.c.user_id == user_id,
                    streak_table.c.last_updated != yesterday,
                    streak_table.c.last_updated != date,
                    streak_table.c.streak != 1,
                ).values(
                    last_updated = date,
                    streak = 1
                )
                await conn.execute(stmt)
                return
            except Exception:
                logger.exception("STREAK SQL ERROR")
                return

async def get_user_streak_data(user_id:str) -> dict:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(
                streak_table.c.streak,
                streak_table.c.last_updated,
                streak_table.c.record
            ).where(
                streak_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            data = res.fetchone()
            if data == {}:
                return {}
            
            return dict(data._mapping)
            
        except Exception:
            logger.exception("STREAK SQL ERROR")
            return {}

async def write_record(user_id:str) -> None:
    try:
        async with AsyncSession(async_engine) as conn:
            async with conn.begin():
                stmt = streak_table.update().where(
                    streak_table.c.user_id == user_id,
                    streak_table.c.streak > streak_table.c.record
                ).values(
                    record = streak_table.c.streak
                )
                await conn.execute(stmt)
                return None
    except Exception:
        logger.exception("STREAK SQL ERROR")
        return None

async def resume_streak(user_id:str) -> None:
    try:
        async with AsyncSession(async_engine) as conn:
            async with conn.begin():
                # Today counts as done, so the next message neither resets it nor skips a day.
                stmt = streak_table.update().where(
                    streak_table.c.user_id == user_id,
                    streak_table.c.record > 1
                ).values(
                    streak = streak_table.c.record,
                    last_updated = datetime.now().date()
                )
                await conn.execute(stmt)
                return None
    except Exception:
        logger.exception("STREAK SQL ERROR")
        return None

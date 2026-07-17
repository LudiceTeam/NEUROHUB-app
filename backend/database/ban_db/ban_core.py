from backend.database.ban_db.ban_models import metadata_obj,ban_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional
from sqlalchemy import select,func
from datetime import datetime,timezone,timedelta,UTC
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
        
        
async def ban_user(user_id:str,ban_days:int) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                if ban_days <= 0:
                    return False
                
                date_now = datetime.now(UTC).date()
                unban_date = date_now + timedelta(days = ban_days)
                stmt = insert(ban_table).values(
                    user_id = user_id,
                    unban_date = unban_date
                ).on_conflict_do_update(
                    index_elements = [ban_table.c.user_id],
                    set_ = {
                        "unban_date" : unban_date
                    }
                )
                await conn.execute(stmt)
                return True
            except Exception:
                logger.exception("BAN SQL ERROR")
                return False



async def get_ban_info(user_id:str) -> dict | None:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(
                ban_table.c.unban_date,
                ban_table.c.user_id
            ).where(ban_table.c.user_id == user_id)
            res = await conn.execute(stmt)
            data = res.mappings().first()
            return dict(data) if data is not None else None
        except Exception:
            logger.exception("BAN SQL ERROR")
            return None

async def unban_user(user_id:str) -> None:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = ban_table.delete().where(
                    ban_table.c.user_id == user_id
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("BAN SQL ERROR")
                return None
                
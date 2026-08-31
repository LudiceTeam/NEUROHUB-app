from backend.database.custom_gpt_select_db.select_models import select_table,metadata_obj
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional,Dict
from sqlalchemy import select,func
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


async def select_user_custom_gpt(user_id:str,gpt_id:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(select_table).values(
                    user_id = user_id,
                    gpt_id = gpt_id
                ).on_conflict_do_update(
                    index_elements=[select_table.c.user_id],
                    set_ ={
                        "gpt_id":gpt_id
                    }
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("SELECT CUSTOM GPT ERROR")
                return

async def get_user_gpt(user_id:str) -> str | None:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(select_table.c.gpt_id).where(
                select_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return str(data) if data is not None else None
        except Exception:
            logger.exception("SELECT CUSTOM GPT ERROR")
            return None


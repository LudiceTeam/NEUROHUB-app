from backend.database.facts_db.facts_models import facts_table,metadata_obj
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

logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)




async def create_fact_data(user_id:str,facts:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(facts_table).values(
                    user_id = user_id,
                    fact = facts
                ).on_conflict_do_update(
                    index_elements=[facts_table.c.user_id],
                    set_={
                        "fact":facts
                    }
                )
                res = await conn.execute(stmt)
                return True if res.rowcount > 0 else False
            except Exception:
                logger.exception("FACTS SQL ERROR")
                return False


async def update_user_fact(user_id:str,fact:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = facts_table.update().where(facts_table.c.user_id == user_id).values(
                    fact = fact
                )
                res = await conn.execute(stmt)
                return True if res.rowcount() > 0 else False
            except Exception:
                logger.exception("FACTS SQL ERROR")
                return False

async def get_user_fact(user_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            pass
        except Exception:
            logger.exception("FACTS SQL ERROR")
            return ""

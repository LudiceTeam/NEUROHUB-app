from backend.database.links_db.links_models import links_table,metadata_obj
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
from backend.api.psw_hash import encrypt_memory,decrypt_memory

logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

async def create_link(
        user_id:str,
        chat_id:str
) -> str:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                link_id = str(uuid.uuid4())
                stmt = links_table.insert().values(
                    user_id = user_id,
                    chat_id = chat_id,
                    link_id = link_id
                )
                result = await conn.execute(stmt)
                return link_id if result.rowcount > 0 else ""
            except Exception:
                logger.exception("LINKS SQL ERROR")
                return ""

async def get_chat_id_by_link(link_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(
                links_table.c.chat_id
            ).where(
                links_table.c.link_id == link_id
            )
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else ""
        except Exception:
                logger.exception("LINKS SQL ERROR")
                return ""
            
async def get_link_id_by_chat_id(chat_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(
                links_table.c.link_id
            ).where(
                links_table.c.chat_id == chat_id
            )
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else ""
        except Exception:
                logger.exception("LINKS SQL ERROR")
                return ""

async def delete_link(link_id:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = links_table.delete().where(
                    links_table.c.link_id == link_id 
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("LINKS SQL ERROR")
                return ""
                
            

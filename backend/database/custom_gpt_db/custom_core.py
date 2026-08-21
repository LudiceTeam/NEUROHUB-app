from backend.database.custom_gpt_db.custom_models import metadata_obj,custom_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional,Dict
from sqlalchemy import select,func
from datetime import datetime,timezone,timedelta
from backend.api.psw_hash import decrypt,encrypt
from backend.api.config import async_engine


logger = logging.getLogger(__name__)


CUSTOM_GPT_ENCODE_KEY = os.getenv("CUSTOM_GPT_ENCODE")

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)


async def create_custom_gpt(user_id:str,gpt_name:str,gpt_promt:str) -> str:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                gpt_id = str(uuid.uuid4())
                stmt = custom_table.insert().values(
                    user_id = user_id,
                    gpt_id = gpt_id,
                    gpt_promt = encrypt(gpt_promt,CUSTOM_GPT_ENCODE_KEY),
                    gpt_name = encrypt(gpt_name,CUSTOM_GPT_ENCODE_KEY),
                )
                await conn.execute(stmt)
                return gpt_id
            except Exception:
                logger.exception("CUSTOM GPT SQL ERROR")
                return ""


async def get_user_custom_gpts(user_id:str) -> List:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(custom_table.c.gpt_id,custom_table.c.gpt_name,custom_table.c.gpt_promt).where(
                custom_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            data = res.mappings().all()
            return data
        except Exception:
            logger.exception("CUSTOM GPT SQL ERROR")
            return []

async def change_gpt_name(gpt_id:str,new_name:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = custom_table.update().where(
                    custom_table.c.gpt_id == gpt_id
                ).values(
                    gpt_name = new_name
                )
                await conn.execute(stmt)
                return
            except Exception:
                logger.exception("CUSTOM GPT SQL ERROR")
                return

async def change_gpt_promt(gpt_id:str,new_promt:str):
     async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = custom_table.update().where(
                    custom_table.c.gpt_id == gpt_id
                ).values(
                    gpt_promt = new_promt
                )
                await conn.execute(stmt)
                return
            except Exception:
                logger.exception("CUSTOM GPT SQL ERROR")
                return
async def delete_gpt(gpt_id:str):
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = custom_table.delete().where(
                custom_table.c.gpt_id == gpt_id
            )
            await conn.execute(stmt)
            return
        except Exception:
            logger.exception("CUSTOM GPT SQL ERROR")
            return
#test this table
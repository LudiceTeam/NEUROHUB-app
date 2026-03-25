from chats_models import metadata_obj,chats_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
from typing import List
from sqlalchemy import select
import uuid


logger = logging.getLogger(__name__)


load_dotenv()

async_engine = create_async_engine(
    f"postgresql+asyncpg://{os.getenv("DB_USER")}:{os.getenv("DB_PASSWORD")}@localhost:5432/main_database",
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


async def create_chat(email:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = chats_table.insert().values(
                    email = email,
                    chat_id = str(uuid.uuid4())
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("CHATS SQL ERROR")
                return
            
async def is_chat_exists(chat_id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(chats_table.c.chat_id).where(chats_table.c.chat_id == chat_id)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()

            return True if data is not None else False
        except Exception:
            logger.exception("CHATS SQL ERROR")
            return False

async def delete_chat(chat_id:str) -> bool:
    if not await is_chat_exists(chat_id):
        return False
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = chats_table.delete().where(chats_table.c.chat_id == chat_id)
                await conn.execute(stmt)
                return True
            except Exception:
                logger.exception("CHATS SQL ERROR")
                return False


async def get_user_chats(email:str) -> List[str]:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(chats_table.c.chat_id).where(chats_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.fetchall()

            result:List[str] = []

            for dt in data:
                result.append(dt[0])
            
            return result
        except Exception:
            logger.exception("CHATS SQL ERROR")
            return [] 


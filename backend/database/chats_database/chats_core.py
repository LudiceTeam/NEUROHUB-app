from backend.database.chats_database.chats_models import metadata_obj,chats_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
from typing import List
from sqlalchemy import select
import uuid
from sqlalchemy.dialects.postgresql import insert
from datetime import datetime,timezone
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


async def create_chat(email:str) -> str:

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                chat_id = str(uuid.uuid4())
                stmt = insert(chats_table).values(
                    email = email,
                    chat_id = chat_id,
                    created_at = datetime.now(timezone.utc)
                ).on_conflict_do_nothing(
                    index_elements=[chats_table.c.chat_id]
                )
                await conn.execute(stmt)

                return chat_id
            except Exception:
                logger.exception("CHATS SQL ERROR")
                return
            

async def delete_chat(chat_id:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = chats_table.delete().where(chats_table.c.chat_id == chat_id)
                await conn.execute(stmt)
            except Exception:
                logger.exception("CHATS SQL ERROR")
                return


async def get_user_chats(email:str) -> List[str]:

    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(chats_table.c.chat_id).where(chats_table.c.email == email).order_by(chats_table.c.created_at.desc())
            res = await conn.execute(stmt)
            data = res.fetchall()

            result:List[str] = []

            for dt in data:
                result.append(dt[0])
            
            return result # just chat_id list
        except Exception:
            logger.exception("CHATS SQL ERROR")
            return [] 


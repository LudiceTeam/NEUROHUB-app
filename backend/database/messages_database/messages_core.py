from backend.database.messages_database.messages_models import metadata_obj,messages_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List
from sqlalchemy import select
from datetime import datetime,timezone
from backend.api.psw_hash import decrypt

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


async def create_message(user_id:str,chat_id:str,message:str,response:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = messages_table.insert().values(
                    user_id = user_id,
                    chat_id = chat_id,
                    message_id = str(uuid.uuid4()),
                    message_text = message,
                    response = response,
                    created_at = datetime.now(timezone.utc)
                )
                await conn.execute(stmt)

            except Exception:
                logger.exception("MESSAGES SQL ERROR")
                return

async def get_chat_messages(chat_id:str) -> List[str]:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(messages_table.c.message_text).where(messages_table.c.chat_id == chat_id)
            res = await conn.execute(stmt)
            data = res.fetchall()

            result:List[str] = []

            for dt in data:
                result.append(dt[0])
            
            return result
        except Exception:
            logger.exception("MESSAGES SQL ERROR")
            return []

async def delete_chat_messages(chat_id:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = messages_table.delete().where(messages_table.c.chat_id == chat_id)
                await conn.execute(stmt)
            except Exception:
                logger.exception("MESSAGE SQL ERROR")
                return

async def get_chat_first_message(chat_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(messages_table.c.message_text).where(messages_table.c.chat_id == chat_id).order_by(messages_table.c.created_at.desc()).limit(1)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            
            if data is not None:
                decoded_message = decrypt(data)
                if len(decoded_message) > 14:
                    return decoded_message[:14] + "..."
                return decoded_message
            return ""
        except Exception:
            logger.exception("MESSAGES SQL ERROR")
            return ""
        
async def get_chat_messages_for_front_end(chat_id:str) -> List:

    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(messages_table.c.message_text,messages_table.c.response).where(messages_table.c.chat_id == chat_id)
            res = await conn.execute(stmt)
            data = res.fetchall()
            result:List = []
            for msg,resp in data:
                result.append(
                    {
                        "message" : decrypt(msg),
                        "response": decrypt(resp)
                    }
                )
            return result
        except Exception:
            logger.exception()
            return []
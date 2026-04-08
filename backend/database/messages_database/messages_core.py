from backend.database.messages_database.messages_models import metadata_obj,messages_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional
from sqlalchemy import select
from datetime import datetime,timezone
from backend.api.psw_hash import decrypt,encrypt

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


def encode_images_base64(images:List[str]) -> List[str]:
    new_coded_list = []

    for image in images:
        coded_image = encrypt(image)
        new_coded_list.append(coded_image)
    
    return new_coded_list


def decode_images_list_base64(images:List[str]) -> List[str]:

    new_decoded_list = []

    for image in images:
        decoded_image = decrypt(image)
        new_decoded_list.append(decoded_image)
    
    return new_decoded_list



async def create_message(user_id:str,chat_id:str,message:str | None,response:str | None,image:Optional[List[str]] = None,image_response: Optional[str] = None):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = messages_table.insert().values(
                    user_id = user_id,
                    chat_id = chat_id,
                    message_id = str(uuid.uuid4()),
                    message_text = message,
                    response = response,
                    image_message = encode_images_base64(image) if image is not None else None,
                    image_response = encrypt(image_response) if image_response is not None else None,
                    created_at = datetime.now(timezone.utc)
                )
                await conn.execute(stmt)

            except Exception:
                logger.exception("MESSAGES SQL ERROR")
                return

async def get_chat_messages(chat_id:str) -> List[str]:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(messages_table.c.message_text).where(messages_table.c.chat_id == chat_id).order_by(messages_table.c.created_at.asc())
            res = await conn.execute(stmt)
            data = res.fetchall()

            result:List[str] = []

            for dt in data:
                result.append(dt[0])
            
            if len(result) > 20:
                return result[-20:]
            
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
            stmt = select(messages_table.c.message_text).where(messages_table.c.chat_id == chat_id).order_by(messages_table.c.created_at.asc()).limit(1)
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
            stmt = select(messages_table.c.message_text,messages_table.c.response,messages_table.c.image_message,messages_table.c.image_response).where(messages_table.c.chat_id == chat_id).order_by(messages_table.c.created_at.asc())
            res = await conn.execute(stmt)
            data = res.fetchall()
            result:List = []
            for msg,resp,image_mes,image_resp in data:
                result.append(
                    {
                        "message" : decrypt(msg) if msg is not None else None,
                        "response": decrypt(resp) if resp is not None else None,
                        "image_message" : decode_images_list_base64(image_mes) if image_mes is not None else None,
                        "image_response" : decrypt(image_resp) if image_resp is not None else None
                    }
                )
            return result
        except Exception:
            logger.exception("MESSAGES SQL ERROR")
            return []
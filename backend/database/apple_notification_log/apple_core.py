from sqlalchemy import text,select,and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from datetime import datetime,timedelta
from typing import List,Literal
from sqlalchemy.orm import sessionmaker
import asyncpg
import os
from dotenv import load_dotenv
from backend.database.apple_notification_log.apple_models import metadata_obj,apple_table
import asyncio
import atexit
from sqlalchemy import func
import logging
from sqlalchemy.dialects.postgresql import insert
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
    echo=False,
    connect_args={"ssl": "require"},
)



AsyncSessionLocal = sessionmaker(
    async_engine, 
    class_=AsyncSession,
    expire_on_commit=False
)


# ---- INIT ---- 

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():   
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)


async def create_new_log(
    notification_type:str,
    notification_id:str,
    subtype:str,
    raw_payload:str
) -> str:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(apple_table).values(
                    notification_uuid = notification_id,
                    notification_type = notification_type,
                    subtype = subtype,
                    raw_payload = raw_payload,
                    created_at = str(datetime.now(timezone.utc)),
                ).on_conflict_do_nothing(
                    index_elements=[apple_table.c.notification_uuid]
                )
                await conn.execute(stmt)
                return notification_id
            except Exception:
                logger.exception("APPLE NOTIFICATION LOG SQL ERROR")
                return ""   


async def is_notification_exists(uuid:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(apple_table.c.notification_uuid).where(apple_table.c.notification_uuid == uuid)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return True if data is not None else False
        except Exception:
            logger.exception("APPLE NOTIFICATION LOG SQL ERROR")
            return False
        

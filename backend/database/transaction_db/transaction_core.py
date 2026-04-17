from sqlalchemy import text,select,and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from datetime import datetime,timedelta
from typing import List
from sqlalchemy.orm import sessionmaker
import asyncpg
import os
from dotenv import load_dotenv
from backend.database.transaction_db.transaction_models import metadata_obj,transaction_table
import asyncio
import atexit
from sqlalchemy.dialects.postgresql import insert
import logging
from backend.api.config import database_url 

#backend.database.ai_choose_database.

logger = logging.getLogger(__name__)


load_dotenv()


async_engine = create_async_engine(
    database_url,
    pool_size=20,           # Размер пула соединений
    max_overflow=50,        # Максимальное количество соединений
    pool_recycle=3600,      # Пересоздавать соединения каждый час
    pool_pre_ping=True,     # Проверять соединение перед использованием
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

async def create_new_trasacrion(
    transaction_id:str,
    original_transaction_id:str,
    user_id:str,
    product_id:str,
    expires_date:datetime,
    raw_payload:str
) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(transaction_table).values(
                    transaction_id = transaction_id,
                    original_transaction_id = original_transaction_id,
                    user_id = user_id,
                    product_id = product_id,
                    expires_date = expires_date,
                    raw_payload = raw_payload
                ).on_conflict_do_nothing(
                    index_elements=[transaction_table.c.transaction_id]
                )
                res = await conn.execute(stmt)
                if res.rowcount == 0:
                    return False
                
                return True
            
            except Exception:
                logger.exception("TRANSACTION SQL ERROR")
                return False
            

async def is_transaction_exists(transaction_id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(transaction_table.c.transaction_id).where(transaction_table.c.transaction_id == transaction_id)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return True if data is not None else False
        except Exception:
            logger.exception("TRANSACTION SQL ERROR")
            return False
        
async def get_user_by_original_transaction_id(original_transaction_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(transaction_table.c.user_id).where(transaction_table.c.original_transaction_id == original_transaction_id)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else ""
        except Exception:
            logger.exception("TRANSACTION SQL ERROR")
            return ""
        

async def update_transaction(
        original_transaction_id:str,
        transaction_id:str,
        product_id:str,
        expires_date:str,

) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = transaction_table.update().where(
                    transaction_table.c.original_transaction_id == original_transaction_id
                ).values(
                    transaction_id = transaction_id,
                    product_id = product_id,
                    expires_date = expires_date
                )
                await conn.execute(stmt)
                return True
            except Exception:
                logger.exception("TRANSACTION SQL ERROR")
                return False
from sqlalchemy import text,select,and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from datetime import datetime,timedelta
from typing import List,Literal
from sqlalchemy.orm import sessionmaker
import asyncpg
import os
from dotenv import load_dotenv
from jwt_models import metadata_obj,jwt_table
import asyncio
import atexit
from sqlalchemy import func
import logging



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


# ---- INIT ---- 

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)


async def is_user_exists(email:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(jwt_table.c.email).where(jwt_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data is not None
        except Exception:
            logger.exception("JWT SQL ERROR")
            return False


async def create_refresh_token(email:str,token:str) -> bool:
    if await is_user_exists(email):
        return False
    async with AsyncSession(async_engine) as conn:
        pass
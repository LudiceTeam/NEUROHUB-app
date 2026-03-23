from sqlalchemy import text,select,and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from datetime import datetime,timedelta
from typing import List,Literal
from sqlalchemy.orm import sessionmaker
import asyncpg
import os
from dotenv import load_dotenv
from main_models import metadata_obj,main_table
import asyncio
import atexit
from sqlalchemy import func
import logging
#backend.database.


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
        
async def is_user_exists(email:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.email).where(main_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            if data is not None:
                return True
            return False
        except Exception as e:
            logger.exception(f"Error : {e}")
            return False
        
        
async def create_user(email:str,provider_id:str,provider:str = Literal["apple","google"]) -> bool:
    if await is_user_exists(email):
        return False
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.insert().values(
                    provider_id = provider_id,
                    provider = provider,
                    email = email,
                    sub = False,
                    date = "",
                    requests = 20
                )
                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception(f"Error : {e}")
                return False
            

async def subscribe(email:str) -> bool:

    if not await is_user_exists(email):
        return False
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                pass
            except Exception as e:
                logger.exception(f"Error : {e}")
                return False


#asyncio.run(drop_table())

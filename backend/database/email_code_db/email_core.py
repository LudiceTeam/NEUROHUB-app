from sqlalchemy import text,select,and_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from datetime import datetime,timedelta
from typing import List,Literal
from sqlalchemy.orm import sessionmaker
import asyncpg
import os
from dotenv import load_dotenv
from backend.database.email_code_db.email_models import metadata_obj,email_table
import asyncio
import atexit
from sqlalchemy import func
import logging
from datetime import datetime,timezone
from backend.api.config import database_url 
#backend.database.email_code_db.


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


# ---- INIT ---- 

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)
        

async def is_code_exists(email:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(email_table.c.email).where(email_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            if data is not None:
                return True
            return False
        except Exception as e:
            logger.exception(f"EMAIL SQL Error")
            return False
        
async def create_code(email:str,code:int) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                expires_at = datetime.now(timezone.utc) + timedelta(minutes = 2)
                stmt = insert(email_table).values(
                    email = email,
                    code = code,
                    expires_at = expires_at
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=[email_table.c.email],
                    set_={
                        "code": code,
                        "expires_at": expires_at
                    }
                )

                await conn.execute(stmt)
                return True
            except Exception:
                logger.exception("EMAIL SQL ERROR")
                return False
            
            
async def delete_line(email:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = email_table.delete().where(email_table.c.email == email)
                await conn.execute(stmt)
            except Exception:
                logger.exception("EMAIL SQL ERROR")
                return

async def check_code(email:str,code:int) -> bool:    
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(email_table.c.code,email_table.c.expires_at).where(email_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.fetchone()
            
            code_db,expires_at = data
            
            if code_db != code:
                return False
            
            now = datetime.now(timezone.utc)
            
            if now > expires_at:
                await delete_line(email)
                return False
            
            await delete_line(email)
            return True
        except Exception:
            logger.exception("EMAIL SQL ERROR")
            return False
    

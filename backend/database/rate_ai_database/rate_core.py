from backend.database.rate_ai_database.rate_models import metadata_obj,rate_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import insert
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



# create or update rate
async def create_rate(user_id:str,model_name:str,rating:int) -> Optional[str]:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                new_rate_id = str(uuid.uuid4())
                stmt = insert(rate_table).values(
                    user_id = user_id,
                    model_name = model_name,
                    rate = rating,
                    rate_id = new_rate_id,

                ).on_conflict_do_update(
                    index_elements = [rate_table.c.user_id,rate_table.c.model_name],
                    set_ = {
                        "rate": rating,
                    }
                ).returning(rate_table.c.rate_id)
                
                result = await conn.execute(stmt)
                rate_id = result.scalar_one_or_none()
                return rate_id
            except Exception:
                logger.exception("RATE SQL ERROR")
                return
            
async def count_model_rate(model_name:str) -> Optional[int]:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(rate_table.c.rate).where(rate_table.c.model_name == model_name)
            res = await conn.execute(stmt)
            data = res.fetchall()
            rates:List[int] = []
            for dt in data:
                rates.append(dt[0])
            
            rate_sum = 0
            for rate in rates:
                rate_sum += rate
            
            model_rate = rate_sum / len(rates)

            return round(model_rate)

        except Exception as e:
            logger.exception("RATE SQL ERROR")
            return 

async def get_user_all_models_rate(user_id:str) -> List:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(rate_table.c.model_name,rate_table.c.rate).where(rate_table.c.user_id == user_id)
            res = await conn.execute(stmt)
            data = res.mappings().all()
            return data
        except Exception:
            logger.exception("RATE SQL ERROR")
            return []
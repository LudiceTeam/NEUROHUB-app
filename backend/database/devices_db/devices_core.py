from backend.database.devices_db.devices_models import metadata_obj,devices_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional
from sqlalchemy import select,func
from datetime import datetime,timezone
from backend.api.psw_hash import decrypt,encrypt
from backend.api.config import database_url 
from sqlalchemy.dialects.postgresql import insert

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

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

async def create_new_device(user_id:str,device_name:str,token:str,device_id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(devices_table).values(
                    user_id = user_id,
                    device_id = device_id,
                    device_name = device_name,
                    token = token,
                    last_online = datetime.now(timezone.utc)
                ).on_conflict_do_nothing(
                    index_elements=[devices_table.c.device_id]
                )
                result = await conn.execute(stmt)
                if result.rowcount == 0:
                    return False
                return True
            except Exception:
                logger.exception("DEVICES SQL ERROR")
                return False

async def delete_device(device_id:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = devices_table.delete().where(
                    devices_table.c.device_id == device_id
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("DEVICES SQL ERROR")
                return


async def get_user_devices(user_id:str) -> List:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(devices_table.c.device_id,devices_table.c.device_name).where(
                devices_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            data = res.fetchall()
            
            result = []
            for device in data:
                result.append(
                    {
                        "device_id" : device[0],
                        "device_name" : device[1]
                    }
                )
            return result
        except Exception:
            logger.exception("DEVICES SQL ERROR")
            return []

async def get_device_token(device_id:str) -> str:
    pass
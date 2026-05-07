from backend.database.folders_db.folders_models import metadata_obj,folders_table
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
from backend.api.config import database_url,async_engine

logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)


async def create_folder(user_id:str,name:str,tags:Optional[List[str]] = None) -> str:
    try:
        async with AsyncSession(async_engine) as conn:
            async with conn.begin():
                folder_id = str(uuid.uuid4())
                stmt = folders_table.insert().values(
                    folder_id = folder_id,
                    user_id = user_id,
                    folder_name = name,
                    tags = tags if tags is not None else []
                )
                await conn.execute(stmt)
                return folder_id        
    except Exception:
        logger.exception("FOLDERS SQL ERROR")
        return ""


async def get_user_folders(user_id:str) -> List:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = select(folders_table.c.folder_id,folders_table.c.folder_name,folders_table.c.tags).where(
                    folders_table.c.user_id == user_id
                )
                result = await conn.execute(stmt)
                data = result.mappings().all()
                return data
            except Exception:
                logger.exception("FOLDERS SQL ERROR")
                return []

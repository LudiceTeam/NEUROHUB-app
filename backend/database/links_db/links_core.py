from backend.database.links_db.links_models import links_table_table,metadata_obj
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional,Dict
from sqlalchemy import select,func
from sqlalchemy.dialects.postgresql import insert
from backend.api.config import database_url,async_engine
from datetime import datetime,timezone,timedelta
from backend.api.psw_hash import encrypt_memory,decrypt_memory

logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

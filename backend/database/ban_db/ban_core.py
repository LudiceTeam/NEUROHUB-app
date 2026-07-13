from backend.database.ban_db.ban_models import metadata_obj,ban_table
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
from sqlalchemy.dialects.postgresql import insert

logger = logging.getLogger(__name__)






async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)
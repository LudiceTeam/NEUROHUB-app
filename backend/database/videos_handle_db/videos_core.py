from backend.database.videos_handle_db.videos_models import metadata_obj,videos_table
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import asyncio
import logging
import uuid
from typing import List,Optional
from sqlalchemy import select,func,text
from datetime import datetime,timezone
from backend.database.messages_database.messages_core import count_model_messages
from backend.api.config import database_url,async_engine
from sqlalchemy.dialects.postgresql import insert
logger = logging.getLogger(__name__)




async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

async def migrate_videos_table():
    async with async_engine.begin() as conn:
        # The table may not exist yet on a fresh database; create_all skips existing tables.
        await conn.run_sync(metadata_obj.create_all)
        for column in ("prompt VARCHAR", "model VARCHAR", "duration INTEGER", "aspect_ratio VARCHAR",
                       "resolution VARCHAR", "audio BOOLEAN", "cost INTEGER", "error VARCHAR",
                       "in_studio BOOLEAN DEFAULT FALSE", "created_at TIMESTAMPTZ"):
            await conn.execute(text(f"ALTER TABLE videos_table ADD COLUMN IF NOT EXISTS {column}"))


async def create_video_task(
        id:str,
        user_id:str,
        prompt:str,
        model:str = None,
        duration:int = None,
        aspect_ratio:str = None,
        resolution:str = None,
        audio:bool = None,
        cost:int = 1,
        in_studio:bool = False
) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(videos_table).values(
                    id = id,
                    video_url = "",
                    user_id = user_id,
                    status = "pending",
                    prompt = prompt,
                    model = model,
                    duration = duration,
                    aspect_ratio = aspect_ratio,
                    resolution = resolution,
                    audio = audio,
                    cost = cost,
                    in_studio = in_studio,
                    created_at = datetime.now(timezone.utc)
                )
                res = await conn.execute(stmt)
                return res.rowcount > 0
            except Exception:
                logger.exception("VIDEOS SQL EXCEPTION")
                return False

async def update_video_status(video_id:str,status:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = videos_table.update().where(
                    videos_table.c.id == video_id
                ).values(
                    status = status
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("VIDEOS SQL ERROR")
                return

async def get_video_status(video_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(videos_table.c.status).where(
                videos_table.c.id == video_id
            )
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else ""
        except Exception:
            logger.exception("VIDEOS SQL ERROR")
            return ""

async def get_user_tasks(user_id:str) -> List:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(videos_table).where(
                videos_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            data = res.mappings().all()
            return data
        except Exception:
            logger.exception("VIDEOS SQL ERROR")
            return []


async def set_video_result(video_id:str, status:str, url:str = None, error:str = None):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                values = {"status": status}
                if url is not None:
                    values["video_url"] = url
                if error is not None:
                    values["error"] = error[:300]
                await conn.execute(videos_table.update().where(videos_table.c.id == video_id).values(**values))
            except Exception:
                logger.exception("VIDEOS SQL ERROR")


async def get_studio_videos(user_id:str, limit:int = 60) -> List:
    """The user's studio clips, newest first."""
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(videos_table).where(
                videos_table.c.user_id == user_id,
                videos_table.c.in_studio.is_(True)
            ).order_by(videos_table.c.created_at.desc()).limit(limit)
            res = await conn.execute(stmt)
            return [dict(row) for row in res.mappings().all()]
        except Exception:
            logger.exception("VIDEOS SQL ERROR")
            return []


async def delete_user_video(user_id:str, video_id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                res = await conn.execute(videos_table.delete().where(
                    videos_table.c.id == video_id,
                    videos_table.c.user_id == user_id
                ))
                return res.rowcount > 0
            except Exception:
                logger.exception("VIDEOS SQL ERROR")
                return False

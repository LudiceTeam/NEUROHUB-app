from backend.database.music_db.music_models import metadata_obj,music_table
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime,timezone
from typing import List
from backend.api.config import async_engine
import logging

logger = logging.getLogger(__name__)


async def migrate_music_table():
    # create_all only adds missing tables, so this is safe on every start.
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)


async def create_music_task(id:str, user_id:str, prompt:str, model:str, instrumental:bool, cost:int, lyrics:str | None = None) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                await conn.execute(music_table.insert().values(
                    id = id, user_id = user_id, status = "pending", file_key = None, prompt = prompt, lyrics = lyrics,
                    model = model, instrumental = instrumental, cost = cost, created_at = datetime.now(timezone.utc)
                ))
                return True
            except Exception:
                logger.exception("MUSIC SQL ERROR")
                return False


async def set_music_result(id:str, status:str, file_key:str = None, lyrics:str = None, error:str = None):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                values = {"status": status}
                if file_key is not None:
                    values["file_key"] = file_key
                if lyrics is not None:
                    values["lyrics"] = lyrics
                if error is not None:
                    values["error"] = error[:300]
                await conn.execute(music_table.update().where(music_table.c.id == id).values(**values))
            except Exception:
                logger.exception("MUSIC SQL ERROR")


async def get_user_music(user_id:str, limit:int = 60) -> List:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(music_table).where(music_table.c.user_id == user_id).order_by(music_table.c.created_at.desc()).limit(limit)
            res = await conn.execute(stmt)
            return [dict(row) for row in res.mappings().all()]
        except Exception:
            logger.exception("MUSIC SQL ERROR")
            return []


async def get_music_track(user_id:str, id:str) -> dict | None:
    async with AsyncSession(async_engine) as conn:
        try:
            res = await conn.execute(select(music_table).where(music_table.c.id == id, music_table.c.user_id == user_id))
            row = res.mappings().first()
            return dict(row) if row else None
        except Exception:
            logger.exception("MUSIC SQL ERROR")
            return None


async def delete_music_track(user_id:str, id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                res = await conn.execute(music_table.delete().where(music_table.c.id == id, music_table.c.user_id == user_id))
                return res.rowcount > 0
            except Exception:
                logger.exception("MUSIC SQL ERROR")
                return False

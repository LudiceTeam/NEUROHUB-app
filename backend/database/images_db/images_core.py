from backend.database.images_db.images_models import metadata_obj,images_table
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime,timezone
from typing import List
from backend.api.config import async_engine
import json
import logging

logger = logging.getLogger(__name__)


async def migrate_images_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)


async def create_image_job(id:str, user_id:str, prompt:str, model:str, aspect_ratio:str, resolution:str, count:int, cost:int) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                await conn.execute(images_table.insert().values(
                    id = id, user_id = user_id, status = "pending", file_keys = "[]", prompt = prompt, model = model,
                    aspect_ratio = aspect_ratio, resolution = resolution, count = count, cost = cost,
                    created_at = datetime.now(timezone.utc)
                ))
                return True
            except Exception:
                logger.exception("IMAGES SQL ERROR")
                return False


async def set_image_job_result(id:str, status:str, file_keys:List | None = None, cost:int | None = None, error:str | None = None):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                values = {"status": status}
                if file_keys is not None:
                    values["file_keys"] = json.dumps(file_keys)
                if cost is not None:
                    values["cost"] = cost
                if error is not None:
                    values["error"] = error[:300]
                await conn.execute(images_table.update().where(images_table.c.id == id).values(**values))
            except Exception:
                logger.exception("IMAGES SQL ERROR")


async def get_user_image_jobs(user_id:str, limit:int = 60) -> List:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(images_table).where(images_table.c.user_id == user_id).order_by(images_table.c.created_at.desc()).limit(limit)
            res = await conn.execute(stmt)
            return [dict(row) for row in res.mappings().all()]
        except Exception:
            logger.exception("IMAGES SQL ERROR")
            return []


async def get_image_job(user_id:str, id:str) -> dict | None:
    async with AsyncSession(async_engine) as conn:
        try:
            res = await conn.execute(select(images_table).where(images_table.c.id == id, images_table.c.user_id == user_id))
            row = res.mappings().first()
            return dict(row) if row else None
        except Exception:
            logger.exception("IMAGES SQL ERROR")
            return None


async def delete_image_job(user_id:str, id:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                res = await conn.execute(images_table.delete().where(images_table.c.id == id, images_table.c.user_id == user_id))
                return res.rowcount > 0
            except Exception:
                logger.exception("IMAGES SQL ERROR")
                return False

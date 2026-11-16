"""Numbers for the bot's "Health" screen: activity by day and how often generations fail (no message text)."""
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.config import async_engine
from backend.database.images_db.images_models import images_table
from backend.database.messages_database.messages_models import messages_table
from backend.database.music_db.music_models import music_table
from backend.database.videos_handle_db.videos_models import videos_table

JOB_TABLES = {"🖼 Картинки": images_table, "🎬 Видео": videos_table, "🎵 Музыка": music_table}


async def activity(days:int) -> list:
    """[(date, users, messages)] for the last `days` days, oldest first."""
    since = datetime.now(timezone.utc) - timedelta(days = days)
    day = func.date(messages_table.c.created_at)
    async with AsyncSession(async_engine) as conn:
        rows = await conn.execute(
            select(day, func.count(func.distinct(messages_table.c.user_id)), func.count())
            .where(messages_table.c.created_at >= since)
            .group_by(day).order_by(day)
        )
        return [tuple(r) for r in rows]


async def jobs(days:int) -> dict:
    """{kind: (Counter of statuses, Counter of error texts)} for images, videos and music."""
    since = datetime.now(timezone.utc) - timedelta(days = days)
    result = {}
    async with AsyncSession(async_engine) as conn:
        for kind, table in JOB_TABLES.items():
            rows = await conn.execute(
                select(table.c.status, table.c.error, func.count())
                .where(table.c.created_at >= since)
                .group_by(table.c.status, table.c.error)
            )
            statuses, errors = Counter(), Counter()
            for status, error, count in rows:
                statuses[status or "pending"] += count
                if status == "failed":
                    errors[error or "без текста"] += count
            result[kind] = (statuses, errors)
    return result

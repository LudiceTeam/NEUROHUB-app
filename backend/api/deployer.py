from backend.api.config import async_engine

from backend.database.main_database.main_core import metadata_obj as m1
from backend.database.chats_database.chats_core import metadata_obj as m2
from backend.database.jwt_database.jwt_core import metadata_obj as m3
from backend.database.messages_database.messages_core import metadata_obj as m4
from backend.database.ai_choose_db.ai_core import metadata_obj as m5
from backend.database.apple_notification_log.apple_core import metadata_obj as m6
from backend.database.transaction_db.transaction_core import metadata_obj as m7
from backend.database.email_code_db.email_core import metadata_obj as m8
from backend.database.stats_db.stats_core import metadata_obj as m9
from backend.database.devices_db.devices_core import metadata_obj as m10

from backend.database.stats_db.stats_core import write_default

import asyncio


all_metadata = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10]

async def create_all():
    async with async_engine.begin() as conn:
        for meta in all_metadata:
            await conn.run_sync(meta.create_all)

    await async_engine.dispose()


async def drop_all():
    async with async_engine.begin() as conn:
        for meta in all_metadata:
            await conn.run_sync(meta.drop_all)

    await async_engine.dispose()

if __name__ == "__main__":
    pass
    #asyncio.run(write_default())
    #asyncio.run(create_all())
    #syncio.run(drop_all())


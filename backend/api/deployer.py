from backend.database.main_database.main_core import create_table as cr1
from  backend.database.chats_database.chats_core import create_table as cr2
from backend.database.jwt_database.jwt_core import create_table as cr3
from backend.database.messages_database.messages_core import create_table as cr4
from typing import Callable
import asyncio

function_arr = [cr1,cr2,cr3,cr4]


async def create_all():
    for func in function_arr:
        await func()

if __name__ == "__main__":
    asyncio.run(create_all())


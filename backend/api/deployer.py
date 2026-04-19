from backend.database.main_database.main_core import create_table as cr1
from  backend.database.chats_database.chats_core import create_table as cr2
from backend.database.jwt_database.jwt_core import create_table as cr3
from backend.database.messages_database.messages_core import create_table as cr4
from backend.database.ai_choose_db.ai_core import create_table as cr5
from backend.database.apple_notification_log.apple_core import create_table as cr6
from backend.database.transaction_db.transaction_core import create_table as cr7
from backend.database.rate_ai_database.rate_core import create_table as cr8
from backend.database.stats_db.stats_core import create_table as cr9,write_default


from backend.database.main_database.main_core import drop_table as dr1
from  backend.database.chats_database.chats_core import drop_table as dr2
from backend.database.jwt_database.jwt_core import drop_table  as dr3
from backend.database.messages_database.messages_core import drop_table as dr4
from backend.database.ai_choose_db.ai_core import drop_table as dr5
from backend.database.apple_notification_log.apple_core import drop_table  as dr6
from backend.database.transaction_db.transaction_core import drop_table as dr7
from backend.database.rate_ai_database.rate_core import drop_table as dr8
from backend.database.stats_db.stats_core import drop_table as dr9

import asyncio




function_arr = [cr1,cr2,cr3,cr4,cr5,cr6,cr7,cr8,cr9]

function_arr_drop = [dr1,dr2,dr3,dr4,dr5,dr6,dr7,dr8,dr9]

async def drop_all():
    for func in function_arr_drop:
        await func()


async def create_all():
    for func in function_arr:
        await func()

if __name__ == "__main__":
    pass
    #asyncio.run(write_default())
    #asyncio.run(drop_all())
    #asyncio.run(create_all())

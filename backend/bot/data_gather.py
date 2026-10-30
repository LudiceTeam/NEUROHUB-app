from backend.database.messages_database.messages_core import get_chat_messages_2
from backend.database.chats_database.chats_core import get_user_chats
import os
from dotenv import load_dotenv
from backend.api.psw_hash import decrypt 
from typing import Dict 
import asyncio
from backend.database.main_database.main_core import get_all_user_state



async def get_all_user_messages(user_id:str) -> Dict | None:
    """{chat_id: [{"message_text", "response"}, ...]}, newest chats first (last 20 messages per chat)."""
    user_chats = await get_user_chats(
        user_id = user_id
    )
    result = {}
    for chat_id in user_chats:
        result[chat_id] = await get_chat_messages_2(
            chat_id = chat_id
        )
    return result




async def get_user_full_info(user_id:str) -> Dict:
    user_profile = await get_all_user_state(
        user_id = user_id
    )

    user_messages = await get_all_user_messages(
        user_id = user_id
    )

    return {
        "profile" : user_profile,
        "messages" : user_messages
    }


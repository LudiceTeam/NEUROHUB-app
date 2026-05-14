from backend.database.messages_database.messages_core import get_chat_messages_2
from backend.database.chats_database.chats_core import get_chats_order
import os
from dotenv import load_dotenv
import logging
from openai import AsyncOpenAI
from typing import List


logger = logging.getLogger(__name__)

async def gather_user_main_information(user_id:str,client:AsyncOpenAI) -> str | List:
    try:
        user_chats = await get_chats_order(
            user_id = user_id
        )
        total_data:List[str] = []

        if len(user_chats) <= 4:
            return ""
        for chat_id in user_chats:

            chat_messages = await get_chat_messages_2(
                chat_id = chat_id
            )

            total_data.append(chat_messages)
        
        if total_data > 20:
            new_data:List[str] = []
            for i in range(len(total_data)):
                if i % 2 == 0:
                    new_data.append(total_data[i])
            return new_data
        return total_data
        
    except Exception:
        logger.exception("GATHER ERROR")
        return ""
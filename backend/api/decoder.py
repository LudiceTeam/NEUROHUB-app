from backend.database.messages_database.messages_core import get_chat_messages_2
from backend.database.chats_database.chats_core import get_user_chats
import os
from dotenv import load_dotenv
from backend.api.psw_hash import decrypt 
from typing import Dict 
import asyncio


load_dotenv()


DECODING_KEY = os.getenv("HASH_MESSAGES_KEY")

async def get_all_user_messages(user_id:str) -> Dict | None:
    user_chats = await get_user_chats(
        user_id = user_id
    )
    for chat_id in user_chats:
        chat_messages = await get_chat_messages_2(
            chat_id = chat_id
        )
        print(f"[+] CHAT ID : {chat_id}")
        for message in chat_messages:
            print(f"[+] MESSAGE : {message}")


if __name__ == "__main__":
    asyncio.run(get_all_user_messages(
        user_id = ""
    ))

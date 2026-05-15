from backend.database.messages_database.messages_core import get_chat_messages_2
from backend.database.chats_database.chats_core import get_chats_order
import os
from dotenv import load_dotenv
import logging
from openai import AsyncOpenAI
from typing import List


logger = logging.getLogger(__name__)

async def gather_user_main_information(user_id:str) -> str | List:
    try:
        user_chats = await get_chats_order(
            user_id = user_id
        )
        total_data:List[List] = []

        if len(user_chats) <= 4:
            return ""
        for chat_id in user_chats:

            chat_messages = await get_chat_messages_2(
                chat_id = chat_id
            )

            total_data.append(chat_messages)
        
        if total_data > 20:
            new_data:List[List] = []
            for i in range(len(total_data)):
                if i % 2 == 0:
                    new_data.append(total_data[i])
            return new_data
        return total_data
        
    except Exception:
        logger.exception("GATHER ERROR")
        return ""

async def summarize_user_message_history(message_history:List,client:AsyncOpenAI) -> str:
    promt = f"""Analyze the user’s messages and generate a 
    detailed profile based only on their communication, behavior, interests, technical discussions, questions, and writing style.
    Output the result as one continuous plain-text paragraph without headings, bullet points, markdown, or formatting. 
    Describe the user’s apparent personality, technical level, programming experience, preferred technologies, current projects, problem-solving style, goals, habits, communication tone, devices they use, and areas of interest. 
    Infer useful traits carefully from context, but do not invent unrealistic details. The profile should sound like an internal AI memory/persona summary created from long-term conversation history.
    User Messages : {message_history}

"""
    response = await client.chat.completions.create(
        model="google/gemini-2.5-flash",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": promt
                    }
                ]
            }
        ]
    )

    text = response.choices[0].message.content
    return (text or "").strip()


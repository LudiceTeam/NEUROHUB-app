from backend.database.messages_database.messages_core import get_chat_messages_2
from backend.database.chats_database.chats_core import get_chats_order
from backend.database.facts_db.facts_core import get_user_fact
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

        if len(user_chats) <= 5:
            return ""
        for chat_id in user_chats:

            chat_messages = await get_chat_messages_2(
                chat_id = chat_id
            )

            total_data.append(chat_messages)
        
        if len(total_data) > 20:
            new_data:List[List] = []
            for i in range(len(total_data)):
                if i % 2 == 0:
                    new_data.append(total_data[i])
            return new_data
        return total_data
        
    except Exception:
        logger.exception("GATHER ERROR")
        return ""

async def summarize_user_message_history(message_history:List,user_previous_fact:str,client:AsyncOpenAI) -> str:
    promt = f"""
You are maintaining a long-term memory profile for an AI assistant.

Your task is to update the existing user profile using the new conversation history.

Existing user profile:
{user_previous_fact}

New user messages:
{message_history}

Instructions:
- Treat the existing profile as the primary source of truth.
- Preserve all existing facts unless the new messages clearly contradict or update them.
- Add newly discovered long-term facts, preferences, interests, skills, projects, goals, habits, devices, and communication patterns.
- If new information expands an existing fact, merge it naturally instead of repeating it.
- Remove or replace outdated facts only when the new messages clearly indicate they are no longer true.
- Infer useful long-term characteristics only when strongly supported by the conversation.
- Never invent unsupported facts.
- Ignore temporary events, one-time requests, greetings, or short-lived information that is unlikely to matter in future conversations.
- Focus only on information that would help an AI assistant provide better responses in future chats.

Return only the updated profile as one continuous plain-text paragraph.
Do not use headings, bullet points, markdown, numbering, or explanations.
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


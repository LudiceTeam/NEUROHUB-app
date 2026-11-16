"""What do people use Veora for? An anonymous topic report, without anyone reading the chats.

    python -m scripts.message_topics [days=14] [sample=600]

Takes a random sample of user messages from the last `days`, decrypts them in memory, strips emails,
phone numbers, links and attached file text, and lets a cheap model put each one into a topic.
Only numbers and short generic themes are printed: no message text, no user ids. That keeps it
within "improving the Service with anonymized statistics" from the privacy policy.
"""
import asyncio
import json
import os
import random
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.config import async_engine
from backend.api.psw_hash import decrypt
from backend.database.messages_database.messages_models import messages_table

MODEL = "google/gemini-2.5-flash-lite"
BATCH = 40
TOPICS = [
    "study and homework", "code and programming", "work and business texts", "creative writing",
    "image generation", "video generation", "music", "voice-over", "translation", "health and body",
    "relationships and personal advice", "questions about facts", "fun and small talk",
    "documents and files", "questions about Veora itself", "other",
]

FILE_BLOCK = re.compile(r'<file name="[^"]*">.*?</file>', re.S)
SCRUB = [
    (re.compile(r"\S+@\S+\.\w+"), "[email]"),
    (re.compile(r"\+?\d[\d\s()\-]{8,}\d"), "[phone]"),
    (re.compile(r"https?://\S+"), "[link]"),
]


def clean(text:str) -> str:
    text = FILE_BLOCK.sub("[file]", text)
    for pattern, repl in SCRUB:
        text = pattern.sub(repl, text)
    return text.strip()[:400]


async def sample_messages(days:int, size:int) -> tuple:
    since = datetime.now(timezone.utc) - timedelta(days = days)
    async with AsyncSession(async_engine) as conn:
        rows = (await conn.execute(
            select(messages_table.c.message_text, messages_table.c.model_name)
            .where(messages_table.c.created_at >= since)
        )).all()
    models = Counter(row.model_name or "unknown" for row in rows)
    key = os.getenv("HASH_MESSAGES_KEY")
    texts = []
    for row in random.sample(rows, min(size, len(rows))):
        try:
            text = clean(decrypt(row.message_text, key)) if row.message_text else ""
        except Exception:
            continue
        if text:
            texts.append(text)
    return texts, models, len(rows)


async def classify(client:AsyncOpenAI, batch:list) -> dict:
    numbered = "\n".join(f"{i}. {t}" for i, t in enumerate(batch))
    response = await client.chat.completions.create(
        model = MODEL,
        response_format = {"type": "json_object"},
        messages = [{"role": "user", "content": (
            "Classify each user message sent to an AI assistant app. Topics: " + ", ".join(TOPICS) + ".\n"
            'Answer with JSON: {"topics": [topic for each message, in order], "wishes": [up to 5 short generic '
            "things users want or complain about, never quoting a message and never mentioning names, places or "
            'personal details], "language": {"ru": count, "en": count, "other": count}}\n\n' + numbered
        )}],
    )
    try:
        return json.loads(response.choices[0].message.content)
    except Exception:
        return {}


async def main() -> None:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 600
    texts, models, total = await sample_messages(days, size)
    client = AsyncOpenAI(base_url = "https://openrouter.ai/api/v1", api_key = os.getenv("OPEN_AI"))

    batches = [texts[i:i + BATCH] for i in range(0, len(texts), BATCH)]
    results = await asyncio.gather(*(classify(client, b) for b in batches))
    del texts

    topics, languages, wishes = Counter(), Counter(), []
    for r in results:
        topics.update(t if t in TOPICS else "other" for t in r.get("topics", []))
        languages.update({k: int(v) for k, v in (r.get("language") or {}).items() if str(v).isdigit()})
        wishes += [w for w in r.get("wishes", []) if isinstance(w, str)]

    print(f"\nMessages in the last {days} days: {total} (sample: {sum(topics.values())})\n")
    print("Topics:")
    for topic, n in topics.most_common():
        print(f"  {n / max(1, sum(topics.values())):6.1%}  {topic}")
    print("\nLanguages:", dict(languages))
    print("\nTop models:")
    for model, n in models.most_common(12):
        print(f"  {n:6}  {model}")

    # The per-batch wishes overlap; one more call merges them into a short list.
    if wishes:
        merged = await client.chat.completions.create(model = MODEL, messages = [{"role": "user", "content": (
            "Merge these notes about what users of an AI app want or complain about into at most 10 short "
            "bullet points in Russian, most frequent first. No names or personal details.\n\n" + "\n".join(wishes)
        )}])
        print("\nWhat users want / complain about:\n" + merged.choices[0].message.content)


if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import os
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher
from aiogram.types import Message



load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

dp = Dispatcher()



@dp.message()
async def print_user_id(message: Message):
    user = message.from_user
    print(f"[+] TELEGRAM ID : {user.id} | @{user.username} | {user.full_name}")
    await message.answer(f"Your Telegram ID: {user.id}")


async def main():
    bot = Bot(token = TELEGRAM_BOT_TOKEN)
    print("[+] BOT STARTED")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

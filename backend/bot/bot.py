import asyncio
import os
from datetime import datetime
from html import escape
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder


# The keys live next to the API (backend/api/.env), not in backend/bot.
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

from backend.api.config import SUBSCRIPTIONS, PLAN_PRICES_RUB, PLAN_TITLES
from backend.database.main_database.main_core import get_all_table, count_users, get_all_user_state
from backend.database.stats_db.stats_core import get_models_stats
from backend.database.ban_db.ban_core import ban_user, get_ban_info, unban_user
from backend.bot.data_gather import get_all_user_messages


TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

ADMIN_IDS = {
    int(x) for x in os.getenv("TELEGRAM_ADMIN_IDS", "").strip("[] ").replace(" ", "").split(",") if x
}

PAGE_SIZE = 8
MAX_TEXT = 4000          # Telegram's limit is 4096 characters per message
BAN_DAYS = [1, 7, 30]

dp = Dispatcher()


class Menu(CallbackData, prefix = "m"):
    action:str


class UsersPage(CallbackData, prefix = "p"):
    kind:str     # "all" | "paid"
    page:int


class UserCard(CallbackData, prefix = "u"):
    user_id:str


class UserAction(CallbackData, prefix = "a"):
    action:str   # "msgs" | "ban" | "unban"
    user_id:str
    days:int = 0


class Search(StatesGroup):
    query = State()


# ---------- helpers ----------

def is_admin(user_id:int) -> bool:
    return user_id in ADMIN_IDS


def user_plan(user:dict) -> str | None:
    """Plan key ("basic", "elite"...) or None for the free plan."""
    for name, plan in SUBSCRIPTIONS.items():
        if user.get(plan["column"]):
            return name
    return None


def plan_title(user:dict) -> str:
    plan = user_plan(user)
    return PLAN_TITLES.get(plan, plan) if plan else "Free"


def short(text, limit:int = 300) -> str:
    text = str(text or "").strip()
    return escape(text if len(text) <= limit else text[:limit] + "…")


def chunks(text:str, size:int = MAX_TEXT) -> list:
    parts = []
    while text:
        cut = text.rfind("\n", 0, size) if len(text) > size else len(text)
        cut = cut if cut > 0 else size
        parts.append(text[:cut])
        text = text[cut:].lstrip("\n")
    return parts


def main_menu():
    kb = InlineKeyboardBuilder()
    kb.button(text = "📊 Статистика", callback_data = Menu(action = "stats"))
    kb.button(text = "🤖 Модели", callback_data = Menu(action = "models"))
    kb.button(text = "👥 Все пользователи", callback_data = UsersPage(kind = "all", page = 0))
    kb.button(text = "💎 Подписчики", callback_data = UsersPage(kind = "paid", page = 0))
    kb.button(text = "🔍 Найти пользователя", callback_data = Menu(action = "search"))
    kb.adjust(2, 2, 1)
    return kb.as_markup()


def back_menu():
    kb = InlineKeyboardBuilder()
    kb.button(text = "⬅️ Меню", callback_data = Menu(action = "home"))
    return kb.as_markup()


async def show(target:Message | CallbackQuery, text:str, markup = None):
    """Edits the message when a button was pressed, sends a new one otherwise."""
    if isinstance(target, CallbackQuery):
        try:
            await target.message.edit_text(text, reply_markup = markup)
        except Exception:
            await target.message.answer(text, reply_markup = markup)
        await target.answer()
    else:
        await target.answer(text, reply_markup = markup)


# ---------- access ----------

@dp.message(lambda m: not is_admin(m.from_user.id))
async def not_admin_message(message:Message):
    user = message.from_user
    print(f"[+] TELEGRAM ID : {user.id} | @{user.username} | {user.full_name}")
    await message.answer(f"Нет доступа. Ваш Telegram ID: <code>{user.id}</code>")


@dp.callback_query(lambda c: not is_admin(c.from_user.id))
async def not_admin_callback(callback:CallbackQuery):
    await callback.answer("Нет доступа", show_alert = True)


# ---------- menu ----------

@dp.message(Command("start", "menu"))
async def start(message:Message, state:FSMContext):
    await state.clear()
    await message.answer("<b>Veora · мониторинг</b>\nВыберите раздел:", reply_markup = main_menu())


@dp.callback_query(Menu.filter(F.action == "home"))
async def home(callback:CallbackQuery, state:FSMContext):
    await state.clear()
    await show(callback, "<b>Veora · мониторинг</b>\nВыберите раздел:", main_menu())


@dp.callback_query(Menu.filter(F.action == "stats"))
async def stats(callback:CallbackQuery):
    users = await get_all_table()
    if users is None:
        return await show(callback, "⚠️ Не удалось прочитать базу", back_menu())
    total = await count_users() or len(users)

    by_plan = {name: 0 for name in SUBSCRIPTIONS}
    by_provider = {}
    active_today = 0
    today = str(datetime.now().date())
    for user in users:
        plan = user_plan(user)
        if plan:
            by_plan[plan] += 1
        provider = user.get("provider") or "email"
        by_provider[provider] = by_provider.get(provider, 0) + 1
        # last_refil_date is updated on the first request of the day, so it marks today's active users.
        if user.get("last_refil_date") == today:
            active_today += 1

    paid = sum(by_plan.values())
    mrr = sum(count * PLAN_PRICES_RUB.get(name, 0) for name, count in by_plan.items())
    conversion = paid / total * 100 if total else 0
    mrr_text = f"{mrr:,}".replace(",", " ")

    plans_text = "\n".join(
        f"  • {PLAN_TITLES.get(name, name)}: <b>{count}</b>"
        for name, count in sorted(by_plan.items(), key = lambda x: PLAN_PRICES_RUB.get(x[0], 0))
    )
    providers_text = "\n".join(f"  • {escape(str(p))}: <b>{c}</b>" for p, c in sorted(by_provider.items(), key = lambda x: -x[1]))

    text = (
        "📊 <b>Статистика</b>\n\n"
        f"👥 Пользователей: <b>{total}</b>\n"
        f"🔥 Активны сегодня: <b>{active_today}</b>\n"
        f"💎 Платных: <b>{paid}</b> ({conversion:.1f}%)\n"
        f"🆓 Бесплатных: <b>{total - paid}</b>\n"
        f"💰 MRR (оценка): <b>{mrr_text} ₽</b>\n\n"
        f"<b>По тарифам:</b>\n{plans_text}\n\n"
        f"<b>Вход через:</b>\n{providers_text}"
    )

    kb = InlineKeyboardBuilder()
    kb.button(text = "🔄 Обновить", callback_data = Menu(action = "stats"))
    kb.button(text = "⬅️ Меню", callback_data = Menu(action = "home"))
    await show(callback, text, kb.as_markup())


@dp.callback_query(Menu.filter(F.action == "models"))
async def models_stats(callback:CallbackQuery):
    data = await get_models_stats() or {}
    used = sorted(((m, c) for m, c in data.items() if c), key = lambda x: -x[1])
    if not used:
        return await show(callback, "🤖 Статистики по моделям пока нет", back_menu())
    total = sum(c for _, c in used)
    lines = [f"{i}. <code>{escape(m)}</code> — <b>{c}</b> ({c / total * 100:.0f}%)" for i, (m, c) in enumerate(used[:25], 1)]
    text = f"🤖 <b>Модели</b> (всего запросов: {total})\n\n" + "\n".join(lines)
    await show(callback, text, back_menu())


# ---------- users ----------

def users_keyboard(users:list, kind:str, page:int):
    kb = InlineKeyboardBuilder()
    start_at = page * PAGE_SIZE
    for user in users[start_at:start_at + PAGE_SIZE]:
        label = f"{plan_title(user)} · {user.get('email') or user.get('name') or user['user_id']}"
        kb.button(text = label[:60], callback_data = UserCard(user_id = user["user_id"]))
    kb.adjust(1)

    nav = InlineKeyboardBuilder()
    pages = max(1, (len(users) + PAGE_SIZE - 1) // PAGE_SIZE)
    if page > 0:
        nav.button(text = "◀️", callback_data = UsersPage(kind = kind, page = page - 1))
    nav.button(text = f"{page + 1}/{pages}", callback_data = UsersPage(kind = kind, page = page))
    if page < pages - 1:
        nav.button(text = "▶️", callback_data = UsersPage(kind = kind, page = page + 1))
    nav.button(text = "⬅️ Меню", callback_data = Menu(action = "home"))
    kb.attach(nav)
    return kb.as_markup()


@dp.callback_query(UsersPage.filter())
async def users_list(callback:CallbackQuery, callback_data:UsersPage):
    users = await get_all_table()
    if users is None:
        return await show(callback, "⚠️ Не удалось прочитать базу", back_menu())
    if callback_data.kind == "paid":
        users = [u for u in users if user_plan(u)]
        # The most expensive plans first.
        users.sort(key = lambda u: -PLAN_PRICES_RUB.get(user_plan(u), 0))
        title = f"💎 <b>Подписчики</b>: {len(users)}"
    else:
        title = f"👥 <b>Все пользователи</b>: {len(users)}"
    if not users:
        return await show(callback, title + "\n\nПока никого нет", back_menu())
    page = min(callback_data.page, (len(users) - 1) // PAGE_SIZE)
    await show(callback, title, users_keyboard(users, callback_data.kind, page))


async def user_card_text(user_id:str) -> str | None:
    user = await get_all_user_state(user_id = user_id)
    if not user:
        return None
    ban = await get_ban_info(user_id = user_id)
    banned = ban is not None and ban["unban_date"] > datetime.now().date()
    plan = user_plan(user)
    return (
        "👤 <b>Пользователь</b>\n\n"
        f"Имя: <b>{short(user.get('name'), 60)}</b>\n"
        f"Email: <code>{short(user.get('email'), 80)}</code>\n"
        f"Вход через: {short(user.get('provider') or 'email', 20)}\n"
        f"ID: <code>{escape(user_id)}</code>\n\n"
        f"💎 Тариф: <b>{plan_title(user)}</b>" + (f" (до {short(user.get('date'), 20)})" if plan and user.get("date") else "") + "\n"
        f"💬 Кредиты сегодня: <b>{user.get('requests')}</b>\n"
        f"⭐️ Pro-запросы: <b>{user.get('nano_req')}</b>\n"
        f"🎬 Видео-кредиты: <b>{user.get('video_credits')}</b>\n"
        f"📅 Последняя активность: {short(user.get('last_refil_date'), 20)}\n\n"
        + (f"🚫 <b>Забанен до {ban['unban_date']}</b>" if banned else "✅ Не забанен")
    )


def user_card_keyboard(user_id:str):
    kb = InlineKeyboardBuilder()
    kb.button(text = "💬 Сообщения", callback_data = UserAction(action = "msgs", user_id = user_id))
    for days in BAN_DAYS:
        kb.button(text = f"🚫 Бан {days} д.", callback_data = UserAction(action = "ban", user_id = user_id, days = days))
    kb.button(text = "✅ Разбан", callback_data = UserAction(action = "unban", user_id = user_id))
    kb.button(text = "🔄 Обновить", callback_data = UserCard(user_id = user_id))
    kb.button(text = "⬅️ Меню", callback_data = Menu(action = "home"))
    kb.adjust(1, len(BAN_DAYS), 1, 2)
    return kb.as_markup()


async def send_user_card(target:Message | CallbackQuery, user_id:str):
    text = await user_card_text(user_id)
    if text is None:
        return await show(target, "Пользователь не найден", back_menu())
    await show(target, text, user_card_keyboard(user_id))


@dp.callback_query(UserCard.filter())
async def user_card(callback:CallbackQuery, callback_data:UserCard):
    await send_user_card(callback, callback_data.user_id)


@dp.callback_query(UserAction.filter(F.action == "ban"))
async def ban(callback:CallbackQuery, callback_data:UserAction):
    ok = await ban_user(user_id = callback_data.user_id, ban_days = callback_data.days)
    print(f"[+] BAN : {callback_data.user_id} for {callback_data.days} days by {callback.from_user.id} -> {ok}")
    await callback.answer(f"Забанен на {callback_data.days} д." if ok else "Ошибка бана", show_alert = not ok)
    await send_user_card(callback, callback_data.user_id)


@dp.callback_query(UserAction.filter(F.action == "unban"))
async def unban(callback:CallbackQuery, callback_data:UserAction):
    await unban_user(user_id = callback_data.user_id)
    print(f"[+] UNBAN : {callback_data.user_id} by {callback.from_user.id}")
    await callback.answer("Разбанен")
    await send_user_card(callback, callback_data.user_id)


@dp.callback_query(UserAction.filter(F.action == "msgs"))
async def user_messages(callback:CallbackQuery, callback_data:UserAction):
    print(f"[+] MESSAGES VIEWED : {callback_data.user_id} by {callback.from_user.id}")
    chats = await get_all_user_messages(user_id = callback_data.user_id) or {}
    await callback.answer()
    if not chats:
        return await callback.message.answer("💬 Сообщений нет", reply_markup = back_menu())

    lines = [f"💬 <b>Чатов: {len(chats)}</b> (последние сообщения, новые чаты сверху)\n"]
    for chat_id, messages in list(chats.items())[:5]:
        lines.append(f"\n<b>— Чат</b> <code>{escape(chat_id)}</code>")
        for m in messages[-5:]:
            lines.append(f"🧑 {short(m.get('message_text'))}")
            if m.get("response"):
                lines.append(f"🤖 {short(m.get('response'))}")
    for part in chunks("\n".join(lines)):
        await callback.message.answer(part)
    await callback.message.answer("⬆️ Конец", reply_markup = user_card_keyboard(callback_data.user_id))


# ---------- search ----------

@dp.callback_query(Menu.filter(F.action == "search"))
async def search_start(callback:CallbackQuery, state:FSMContext):
    await state.set_state(Search.query)
    await show(callback, "🔍 Отправьте email, его часть, имя или user_id", back_menu())


@dp.message(Search.query)
async def search_query(message:Message, state:FSMContext):
    query = (message.text or "").strip().lower()
    if not query:
        return await message.answer("Отправьте текст для поиска")
    users = await get_all_table() or []
    found = [
        u for u in users
        if query == str(u.get("user_id")).lower()
        or query in str(u.get("email") or "").lower()
        or query in str(u.get("name") or "").lower()
    ]
    if not found:
        return await message.answer("Никого не нашёл. Попробуйте ещё раз или вернитесь в меню.", reply_markup = back_menu())
    await state.clear()
    if len(found) == 1:
        return await send_user_card(message, found[0]["user_id"])
    kb = InlineKeyboardBuilder()
    for user in found[:20]:
        label = f"{plan_title(user)} · {user.get('email') or user.get('name') or user['user_id']}"
        kb.button(text = label[:60], callback_data = UserCard(user_id = user["user_id"]))
    kb.button(text = "⬅️ Меню", callback_data = Menu(action = "home"))
    kb.adjust(1)
    more = f" (показаны первые 20)" if len(found) > 20 else ""
    await message.answer(f"🔍 Найдено: <b>{len(found)}</b>{more}", reply_markup = kb.as_markup())


@dp.message()
async def fallback(message:Message):
    await message.answer("Выберите раздел:", reply_markup = main_menu())


async def main():
    if not ADMIN_IDS:
        print("[!] TELEGRAM_ADMIN_IDS is empty: nobody can use the bot. Message it to see your ID.")
    bot = Bot(token = TELEGRAM_BOT_TOKEN, default = DefaultBotProperties(parse_mode = "HTML"))
    print("[+] BOT STARTED")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

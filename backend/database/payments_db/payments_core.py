from backend.database.payments_db.payments_models import metadata_obj,yk_payments_table,yk_subscriptions_table
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import select
from datetime import datetime,timezone,date
from typing import List
from backend.api.config import async_engine
import logging

logger = logging.getLogger(__name__)


async def migrate_payments_tables():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)


# ---- payments ----

async def save_payment(payment_id:str, user_id:str, plan:str, amount:str, kind:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            await conn.execute(insert(yk_payments_table).values(
                payment_id = payment_id, user_id = user_id, plan = plan, amount = amount, kind = kind,
                status = "pending", processed = False, created_at = datetime.now(timezone.utc)
            ).on_conflict_do_nothing(index_elements = [yk_payments_table.c.payment_id]))


async def get_payment(payment_id:str) -> dict | None:
    async with AsyncSession(async_engine) as conn:
        res = await conn.execute(select(yk_payments_table).where(yk_payments_table.c.payment_id == payment_id))
        row = res.mappings().first()
        return dict(row) if row else None


async def claim_payment(payment_id:str, status:str) -> bool:
    """Marks a payment as handled; True only for the first caller, so a plan is never applied twice."""
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            res = await conn.execute(yk_payments_table.update().where(
                yk_payments_table.c.payment_id == payment_id,
                yk_payments_table.c.processed.is_(False)
            ).values(processed = True, status = status))
            return res.rowcount > 0


async def set_payment_status(payment_id:str, status:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            await conn.execute(yk_payments_table.update().where(yk_payments_table.c.payment_id == payment_id).values(status = status))


# ---- subscriptions ----

async def get_subscription(user_id:str) -> dict | None:
    async with AsyncSession(async_engine) as conn:
        res = await conn.execute(select(yk_subscriptions_table).where(yk_subscriptions_table.c.user_id == user_id))
        row = res.mappings().first()
        return dict(row) if row else None


async def upsert_subscription(user_id:str, **values):
    values["updated_at"] = datetime.now(timezone.utc)
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            await conn.execute(insert(yk_subscriptions_table).values(user_id = user_id, **values).on_conflict_do_update(
                index_elements = [yk_subscriptions_table.c.user_id], set_ = values))


async def due_subscriptions(today:date) -> List[dict]:
    """Active subscriptions whose paid period is over."""
    async with AsyncSession(async_engine) as conn:
        res = await conn.execute(select(yk_subscriptions_table).where(
            yk_subscriptions_table.c.status == "active",
            yk_subscriptions_table.c.period_end <= today
        ))
        return [dict(row) for row in res.mappings().all()]

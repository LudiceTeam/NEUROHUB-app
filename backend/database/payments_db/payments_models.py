from sqlalchemy import Column,Table,MetaData,String,Integer,Boolean,Date,DateTime


metadata_obj = MetaData()

# Every YooKassa payment we create (first payments and renewals).
yk_payments_table = Table(
    "yk_payments_table",
    metadata_obj,
    Column("payment_id",String,primary_key=True,unique=True),
    Column("user_id",String,index=True),
    Column("plan",String),
    Column("amount",String),
    Column("kind",String),             # initial | renewal
    Column("status",String),           # pending | succeeded | canceled
    Column("processed",Boolean),       # the plan was already turned on / renewed for this payment
    Column("created_at",DateTime(timezone=True))
)

# One row per user with a YooKassa subscription.
yk_subscriptions_table = Table(
    "yk_subscriptions_table",
    metadata_obj,
    Column("user_id",String,primary_key=True,unique=True),
    Column("plan",String),
    Column("payment_method_id",String),   # saved card for auto-renewal
    Column("card_title",String),          # e.g. "Bank card *4444"
    Column("auto_renew",Boolean),
    Column("status",String),              # active | ended
    Column("period_end",Date),            # the plan is paid up to this day
    Column("retries",Integer),            # failed renewal attempts in a row
    Column("last_attempt",Date),
    Column("updated_at",DateTime(timezone=True))
)

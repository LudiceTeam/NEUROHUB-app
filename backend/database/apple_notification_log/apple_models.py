from sqlalchemy import Table,Column,MetaData,String,DateTime,Integer,JSON

metadata_obj = MetaData()

apple_table = Table(
    "apple_notification_log",
    metadata_obj,
    Column("notification_uuid",String,primary_key = True,unique = True),
    Column("notification_type",String),
    Column("subtype",String),
    Column("raw_payload",JSON),
    Column("created_at",DateTime(timezone=True)),
    Column("status",String)
)
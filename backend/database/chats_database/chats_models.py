from sqlalchemy import Table,Column,String,MetaData,DateTime


metadata_obj = MetaData()


chats_table = Table(
    "chats_table",
    metadata_obj,
    Column("user_id",String),
    Column("email",String),
    Column("chat_id",String,primary_key = True),
    Column("created_at",DateTime(timezone=True))
)
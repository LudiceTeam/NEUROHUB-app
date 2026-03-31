from sqlalchemy import Table,Column,MetaData,String,DateTime  


metadata_obj = MetaData()

messages_table = Table(
    "messages_table",
    metadata_obj,
    Column("email",String),
    Column("chat_id",String),
    Column("message_id",String,primary_key=True),
    Column("message_text",String),
    Column("response",String),
    Column("created_at",DateTime(timezone=True))
)
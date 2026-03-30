from sqlalchemy import Table,Column,MetaData,String,Date


metadata_obj = MetaData()

messages_table = Table(
    "messages_table",
    metadata_obj,
    Column("email",String),
    Column("chat_id",String),
    Column("message_id",String,primary_key=True),
    Column("message_text",String),
    Column("response",String),
    Column("creted_at",Date)
)
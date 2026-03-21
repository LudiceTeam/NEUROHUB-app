from sqlalchemy import Table,Column,String,MetaData


metadata_obj = MetaData()


chats_table = Table(
    "chats_table",
    metadata_obj,
    Column("email",String),
    Column("chat_id",String,primary_key = True)
)
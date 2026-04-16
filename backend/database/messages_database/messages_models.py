from sqlalchemy import Table,Column,MetaData,String,DateTime,ARRAY  


metadata_obj = MetaData()

messages_table = Table(
    "messages_table",
    metadata_obj,
    Column("user_id",String),
    Column("chat_id",String),
    Column("message_id",String,primary_key=True),
    Column("message_text",String),
    Column("response",String),
    Column("image_message",ARRAY(String)),
    Column("image_response",String),
    Column("created_at",DateTime(timezone=True)),
    Column("model_name",String)
)
from sqlalchemy import Table,Column,MetaData,String,Boolean

metadata_obj = MetaData()

links_table = Table(
    "links_table",
    metadata_obj,
    Column("chat_id",String,primary_key=True,unique=True),
    Column("link_id",String),
    Column("user_id",String),
    #Column("read_only",Boolean)
)
from sqlalchemy import MetaData,Table,Column,String

metadata_obj = MetaData()

custom_table = Table(
    "custom_table",
    metadata_obj,
    Column("user_id",String),
    Column("gpt_name",String),
    Column("gpt_id",String,primary_key=True,unique=True),
    Column("gpt_promt",String)
)
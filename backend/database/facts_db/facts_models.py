from sqlalchemy import MetaData,Table,Column,String

metadata_obj = MetaData()

facts_table = Table(
    "user_facts_table",
    metadata_obj,
    Column("user_id",String,primary_key=True,unique=True),
    Column("fact",String)
)
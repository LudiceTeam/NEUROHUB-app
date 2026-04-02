from sqlalchemy import Table,Column,String,MetaData


metadata_obj = MetaData()

ai_table = Table(
    "ai_choose_table",
    metadata_obj,
    Column("user_id",String,primary_key = True,unique=True),
    Column("ai_name",String)
)
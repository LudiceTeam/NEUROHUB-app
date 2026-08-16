from sqlalchemy import Table,Column,MetaData,String


metadata_obj = MetaData()


select_table = Table(
    "custom_gpt_table",
    metadata_obj,
    Column("user_id",String,primary_key=True,unique=True),
    Column("gpt_id",String)
)
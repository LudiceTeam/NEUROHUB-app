from sqlalchemy import Table,Column,MetaData,String,Integer,Boolean,Date


metadata_obj = MetaData()

main_table = Table(
    "main_app_table",
    metadata_obj,
    Column("provider_id",String,primary_key = True),
    Column("provider",String),
    Column("email",String),
    Column("sub",Boolean),
    Column("date",Date)
)
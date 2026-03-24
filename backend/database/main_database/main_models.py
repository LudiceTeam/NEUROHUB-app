from sqlalchemy import Table,Column,MetaData,String,Integer,Boolean,Date


metadata_obj = MetaData()

main_table = Table(
    "main_app_table",
    metadata_obj,
    Column("provider_id",String,primary_key = True),
    Column("provider",String),
    Column("email",String),
    Column("sub",Boolean),
    Column("basic_sub",Boolean),
    Column("date",String),
    Column("last_refil_date",String),
    Column("requests",Integer),
    Column("nano_req",Integer)
)
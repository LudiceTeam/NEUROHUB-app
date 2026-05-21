from sqlalchemy import Table,Column,MetaData,String,Integer,Boolean,Date


metadata_obj = MetaData()

main_table = Table(
    "main_app_table",
    metadata_obj,
    Column("provider_id",String,primary_key = True,unique=True),
    Column("user_id",String,primary_key = True,unique=True),
    Column("provider",String),
    Column("email",String),
    Column("name",String),
    Column("profile_pict",String),

    Column("premium_sub",Boolean),
    Column("basic_sub",Boolean),
    Column("starter_sub",Boolean),
    Column("plus_sub",Boolean),
    Column("max_sub",Boolean),
    Column("elite_sub",Boolean),

    Column("date",String),
    Column("last_refil_date",String),
    Column("requests",Integer),
    Column("nano_req",Integer)
)
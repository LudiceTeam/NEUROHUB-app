from sqlalchemy import Table,Column,MetaData,String,DateTime

metadata_obj = MetaData()

devices_table = Table(
    "devices_table",
    metadata_obj,
    Column("user_id",String),
    Column("device_id",String,unique=True,primary_key=True),
    Column("device_name",String),
    Column("last_online",DateTime(timezone=True))
)
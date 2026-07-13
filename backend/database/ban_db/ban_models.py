from sqlalchemy import Table,Column,MetaData,String,DateTime

metadata_obj = MetaData()

ban_table = Table(
    "ban_table",
    metadata_obj,
    Column("user_id",String,unique=True,primary_key=True),
    Column("unban_date",DateTime(timezone=True))
)
from sqlalchemy import Table,Column,MetaData,String,Integer,Date
from datetime import datetime


metadata_obj = MetaData()

streak_table = Table(
    "streak_table",
    metadata_obj,
    Column("user_id",String,primary_key=True,unique=True),
    Column("streak",Integer),# days of streak
    Column("last_updated",Date, default=datetime.now().date)
)
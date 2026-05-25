from sqlalchemy import Column,Table,MetaData,String


metadata_obj = MetaData()

videos_table = Table(
    "videos_table",
    metadata_obj,
    Column("id",String,primary_key=True,unique=True),
    Column("user_id",String),
    Column("status",String),
    Column("video_url",String)
)
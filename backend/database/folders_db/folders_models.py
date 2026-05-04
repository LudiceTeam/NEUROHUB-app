from sqlalchemy import MetaData,Table,Column,String,ARRAY


metadata_obj = MetaData()

folders_table = Table(
    "folders_table",
    metadata_obj,
    Column("folder_id",String,primary_key=True,unique=True),
    Column("user_id",String),
    Column("folder_name",String),
    Column("tags",ARRAY(String))
)
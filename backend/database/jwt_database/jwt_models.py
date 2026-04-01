from sqlalchemy import Table,Column,MetaData,String


metadata_obj = MetaData()

jwt_table = Table(
    "neurohub_app_jwt",
    metadata_obj,
    Column("user_id",String,primary_key = True),
    Column("token",String)
)
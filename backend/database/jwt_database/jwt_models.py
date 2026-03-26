from sqlalchemy import Table,Column,MetaData,String


metadata_obj = MetaData()

jwt_table = Table(
    "neurohub_app_jwt",
    metadata_obj,
    Column("email",String,primary_key = True),
    Column("resfresh_token",String)
)
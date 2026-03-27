from sqlalchemy import Table,MetaData,Column,String,Integer,TIMESTAMP


metadata_obj = MetaData()

email_table = Table(
    "email_code_table",
    metadata_obj,
    Column("email",String,primary_key=True),
    Column("code",Integer),
    Column("expires_at",TIMESTAMP)
)
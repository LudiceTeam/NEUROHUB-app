from sqlalchemy import Table,Column,MetaData,String,DateTime,Integer

metadata_obj = MetaData()

transaction_table = Table(
    "transaction_table",
    metadata_obj,
    Column("transaction_id",String,primary_key = True,unique = True),
    Column("original_transaction_id",String),
    Column("user_id",String),
    Column("product_id",String),
    Column("expires_date",DateTime(timezone=True)),
    Column("raw_payload",String)
)
from sqlalchemy import Table,Column,MetaData,String,Integer,UniqueConstraint


metadata_obj = MetaData()

rate_table = Table(
    "models_rate_table",
    metadata_obj,
    Column("user_id",String),
    Column("model_name",String),
    Column("rate",Integer),
    Column("rate_id",String,primary_key = True,unique = True),
    UniqueConstraint("user_id", "model_name", name="uq_user_model_rate")
)
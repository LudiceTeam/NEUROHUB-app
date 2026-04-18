from sqlalchemy import Table,Column,MetaData,String,Integer,JSON,DateTime

metadata_obj = MetaData()

stats_table = Table(
    "stats_table",
    metadata_obj,
    Column("model_usage", JSON, nullable=False, default=dict),
    Column("updated_at",DateTime(timezone=True)),
)
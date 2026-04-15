from sqlalchemy import Table,Column,MetaData,String

metadata_obj = MetaData()

stats_table = Table(
    "stats_table",
    metadata_obj,
    Column()
)
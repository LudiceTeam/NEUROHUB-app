from sqlalchemy import Column,Table,MetaData,String,Integer,DateTime


metadata_obj = MetaData()

# One row per photo-studio request; a request can make several variants.
images_table = Table(
    "images_table",
    metadata_obj,
    Column("id",String,primary_key=True,unique=True),
    Column("user_id",String,index=True),
    Column("status",String),           # pending | processing | completed | failed
    Column("file_keys",String),        # JSON list of object keys in the private bucket
    Column("prompt",String),           # encrypted with HASH_MESSAGES_KEY
    Column("model",String),
    Column("aspect_ratio",String),
    Column("resolution",String),
    Column("count",Integer),           # variants asked for
    Column("cost",Integer),            # premium requests taken (failed variants are refunded)
    Column("error",String),
    Column("created_at",DateTime(timezone=True))
)

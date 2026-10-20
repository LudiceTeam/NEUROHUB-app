from sqlalchemy import Column,Table,MetaData,String,Integer,Boolean,DateTime


metadata_obj = MetaData()

music_table = Table(
    "music_table",
    metadata_obj,
    Column("id",String,primary_key=True,unique=True),
    Column("user_id",String,index=True),
    Column("status",String),           # pending | processing | completed | failed
    Column("file_key",String),         # object key in the private bucket
    Column("prompt",String),           # encrypted with HASH_MESSAGES_KEY
    Column("lyrics",String),           # encrypted; lyrics the model returned (or the user's own)
    Column("model",String),
    Column("instrumental",Boolean),
    Column("cost",Integer),            # premium requests taken (refunded on failure)
    Column("error",String),
    Column("created_at",DateTime(timezone=True))
)

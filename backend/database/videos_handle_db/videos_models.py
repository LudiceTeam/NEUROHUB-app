from sqlalchemy import Column,Table,MetaData,String,Integer,Boolean,DateTime


metadata_obj = MetaData()

videos_table = Table(
    "videos_table",
    metadata_obj,
    Column("id",String,primary_key=True,unique=True),
    Column("user_id",String),
    Column("status",String),
    Column("video_url",String),
    Column("prompt",String),          # encrypted with HASH_MESSAGES_KEY
    Column("model",String),
    Column("duration",Integer),
    Column("aspect_ratio",String),
    Column("resolution",String),
    Column("audio",Boolean),
    Column("cost",Integer),           # video credits taken (refunded on failure)
    Column("error",String),
    Column("in_studio",Boolean),      # made in the video studio (chat videos live in their chat)
    Column("created_at",DateTime(timezone=True))
)
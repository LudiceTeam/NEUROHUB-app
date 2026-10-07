from sqlalchemy import Table,Column,String,MetaData,Boolean


metadata_obj = MetaData()

voices_table = Table(
    "voices_table",
    metadata_obj,
    Column("user_id",String),
    Column("voice_id",String,unique = True,primary_key=True),
    Column("name",String),
    Column("link",String),
    Column("agree",Boolean),
    Column("transcript",String,nullable = True),       # encrypted text of the sample, improves cloning
    Column("eleven_voice_id",String,nullable = True)   # ElevenLabs Instant Voice Clone, created on first use
)
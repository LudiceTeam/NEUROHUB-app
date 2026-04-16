from sqlalchemy import Table,Column,MetaData,String,Integer

metadata_obj = MetaData()

stats_table = Table(
    "stats_table",
    metadata_obj,
    Column("google/gemini-3-flash-preview",Integer),
    Column("google/gemini-2.5-flash",Integer),
    Column("openai/gpt-5.4-mini",Integer),
    Column("openai/gpt-4o",Integer),
    Column("openai/gpt-4o-mini",Integer),
    Column("google/gemma-4-26b-a4b-it",Integer),
    Column("anthropic/claude-opus-4.6",Integer),
    Column("anthropic/claude-sonnet-4.6",Integer),
    Column("mistralai/mistral-large",Integer),
    Column("google/gemini-3-pro-image-preview",Integer),
    Column("main_id",String,primary_key=True),
    Column("updated_at",String)
)
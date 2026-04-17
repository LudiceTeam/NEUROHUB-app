import os
from dotenv import load_dotenv


load_dotenv()


database_url = f"postgresql+asyncpg://{os.getenv("DB_USER")}:{os.getenv("DB_PASSWORD")}@localhost:5432/main_database"

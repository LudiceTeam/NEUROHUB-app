from sqlalchemy import text,select,and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.dialects.postgresql import insert
from datetime import datetime,timedelta
from typing import List,Literal
from sqlalchemy.orm import sessionmaker
import asyncpg
import os
from dotenv import load_dotenv
from backend.database.main_database.main_models import metadata_obj,main_table
import asyncio
import atexit
from sqlalchemy import func
import logging
import uuid
#backend.database.


logger = logging.getLogger(__name__)

load_dotenv()


async_engine = create_async_engine(
    f"postgresql+asyncpg://{os.getenv("DB_USER")}:{os.getenv("DB_PASSWORD")}@localhost:5432/main_database",
    pool_size=20,          
    max_overflow=50,       
    pool_recycle=3600,    
    pool_pre_ping=True,     
    echo=False
)



AsyncSessionLocal = sessionmaker(
    async_engine, 
    class_=AsyncSession,
    expire_on_commit=False
)


# ---- INIT ---- 

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)
        

async def get_user_id_by_provider(provider_id:str,provider:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.user_id).where(
                main_table.c.provider == provider,
                main_table.c.provider_id == provider_id
            )
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else ""
        except Exception:
            logger.exception("MAIN SQL ERROR")
            return "" 
        
async def create_user(user_id:str,name:str,email:str,provider_id:str = None, provider:str = None,avatar_url:str = None ) -> bool | str:
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = insert(main_table).values(
                    provider_id = provider_id,
                    provider = provider,
                    email = email,
                    user_id = user_id,
                    name = name,
                    profile_pict = avatar_url,
                    sub = False,
                    basic_sub = False,
                    date = "",
                    last_refil_date = str(datetime.now().date()),
                    requests = 10,
                    nano_req = 1
                ).on_conflict_do_nothing(
                    index_elements=[main_table.c.provider_id]
                )
                result = await conn.execute(stmt)
                if result.rowcount == 0:
                    if provider_id is not None:
                        user_id = await get_user_id_by_provider(
                            provider = provider,
                            provider_id=provider_id
                        )
                        return user_id
                    
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False
            

# ---- HELPERS ----

def transform_date_to_int(date:str) -> int:
        dt:str = ""
        for tm in str(date).split('-'):
            dt += tm
        return int(dt)

async def get_user_state(user_id: str) -> dict:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(
                main_table.c.email,
                main_table.c.sub,
                main_table.c.basic_sub,
                main_table.c.date,
                main_table.c.last_refil_date,
                main_table.c.requests,
                main_table.c.nano_req
            ).where(main_table.c.user_id == user_id)

            res = await conn.execute(stmt)
            row = res.fetchone()

            if row is None:
                return {}

            return dict(row._mapping)

        except Exception:
            logger.exception("MAIN SQL ERROR")
            return {}
        
async def get_user_data_for_jwt(user_id:str) -> dict:
    
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.name,main_table.c.provider).where(main_table.c.user_id == user_id)
            res = await conn.execute(stmt)
            data = res.fetchone()

            if not data:
                return {}
            
            name,provider = data

            return {
                "user_id":user_id,
                "name":name,
                "provider":provider
            }


        except Exception:
            logger.exception("MAIN SQL ERROR")
            return {}


# function to check user sub date end to unsub
def check_date_for_sub(datetime_now_str:str,user_end_data:str) -> bool:
    datetime_now_int = transform_date_to_int(datetime_now_str)


    user_end_data_int = transform_date_to_int(user_end_data)

    if datetime_now_int < user_end_data_int:
        return False
    
    return True

#function to check user last refil day to refil today
def check_date_for_refil(datetime_now_str:str,user_last_refil_data:str) -> bool:
    datetime_now_int =  transform_date_to_int(datetime_now_str)

    user_last_data_int = transform_date_to_int(user_last_refil_data)

    if datetime_now_int <= user_last_data_int:
        return False

    return True




# ---- PREMIUM SUB ----
async def subscribe_premium(user_id:str) -> bool:
    user = await get_user_state(user_id)

    if not user:
        return False

    if user["sub"]:
        return False

    if user["basic_sub"]:
        return False
    
    date = datetime.now().date() + timedelta(days = 30)
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    sub = True,
                    date = str(date),
                    last_refil_date = str(datetime.now().date()),
                    nano_req = 15
                )

                result = await conn.execute(stmt)
                if result.rowcount == 0:
                    return False
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False



async def unsub_func_premium(user_id:str) -> bool:
    user = await get_user_state(user_id)

    if not user:
        return False
    
    if not user["sub"]:
        return False

    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    date_check_result:bool = check_date_for_sub(datetime_now_str,user["date"])


    if not date_check_result:
        return False


    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    sub=False,
                    date="",
                    nano_req = 1,
                    requests = 10,
                    last_refil_date = str(datetime.now().date())
                )


                result = await conn.execute(stmt)
                if result.rowcount == 0:
                    return False
                
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False







# ---- REQUESTS ----


async def refil_nano_requests(user_id:str) -> bool:
    user = await get_user_state(user_id)

    if not user:
        return False
    
    amount = 1

    if user["sub"]:
        amount = 15
    
    elif user["basic_sub"]:
        amount = 3

    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    result_date:bool = check_date_for_refil(datetime_now_str,user["last_refil_date"])

    if not result_date:
        return False

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    nano_req = amount,
                    last_refil_date = str(datetime.now().date())
                )
                result = await conn.execute(stmt)
                if result.rowcount == 0:
                    return False
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False
            

async def refil_normal_requests(user_id:str) -> bool:

    user = await get_user_state(user_id)

    if not user:
        return False
    

    amount = 10

    if user["sub"]:
        return False 
    
    elif user["basic_sub"]:
        amount = 25 
    
    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    result_date:bool = check_date_for_refil(datetime_now_str,user["last_refil_date"])

    if not result_date:
        return False

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    requests = amount,
                    last_refil_date = str(datetime.now().date())
                )
                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False


        

async def minus_one_req(user_id:str):
    user = await get_user_state(user_id)

    if not user:
        return
    
    
    if user["sub"]:
        return
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    requests = main_table.c.requests -1
                )
                await conn.execute(stmt)
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return


async def minus_one_req_nano(user_id: str):

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    nano_req = main_table.c.nano_req - 1
                )
                await conn.execute(stmt)
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return


        
# ---- BASIC SUB ----



async def subscribe_basic(user_id:str) -> bool:
    user = await get_user_state(user_id)

    if not user:
        return False
    
    if user["sub"]:
        return False 
    
    if user["basic_sub"]:
        return False
    
    date = datetime.now().date() + timedelta(days = 30)
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    date = str(date),
                    last_refil_date = str(datetime.now().date()),
                    nano_req = 3,
                    requests = 25,
                    basic_sub = True
                )
                result = await conn.execute(stmt)
                if result.rowcount == 0:
                    return False
                return True
            except Exception as e:
                logger.exception("MAIN SQL ERROR")
                return False

async def unsub_basic(user_id:str) -> bool:
    
    user = await get_user_state(user_id)

    if not user:
        return False
    
    if not user["basic_sub"]:
        return False
    
    if user["sub"]:
        return False
    
    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    date_check_result:bool = check_date_for_sub(datetime_now_str,user["date"])


    if not date_check_result:
        return False

    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    date = "",
                    last_refil_date = str(datetime.now().date()),
                    nano_req = 1,
                    requests = 10,
                    basic_sub = False
                )
                result = await conn.execute(stmt)
                if result.rowcount == 0:
                    return False
                return True
            except Exception:
                logger.exception("MAIN SQL ERROR")
                return False
            


async def profile(user_id:str) -> dict:
    
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.sub,main_table.c.basic_sub,main_table.c.date,main_table.c.requests, main_table.c.nano_req,main_table.c.email).where(main_table.c.user_id == user_id)

            res = await conn.execute(stmt)

            data = res.fetchone()

            if data is None:
                return {}

            sub,basic_sub,date,requests,nano_req,email = data


            return {
                "email":email,
                "Premium":sub,
                "Basic":basic_sub,
                "Date End": date,
                "Requests":requests,
                "Nano requests":nano_req

            }

        except Exception:
            logger.exception("MAIN SQL ERROR")
            return {}

async def get_user_avatar_and_name(user_id:str) -> dict:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = main_table.select(main_table.c.name,main_table.c.profile_pict).where(main_table.c.user_id == user_id)
            res = await conn.execute(stmt)
            data = res.fetchone()
            if not data:
                return {}
            
            name,avatar = data
            return {
                "name":name,
                "avatar":avatar
            }
        except Exception:
            logger.exception("MAIN SQL ERROR")
            return {}

async def get_user_email_by_user_id(user_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = main_table.select(main_table.c.email).where(main_table.c.user_id == user_id)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else ""
        except Exception:
            logger.exception("MAIN SQL ERROR")
            return ""
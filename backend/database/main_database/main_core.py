from sqlalchemy import text,select,and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
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
        
async def is_user_exists(email:str) -> bool:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.email).where(main_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            if data is not None:
                return True
            return False
        except Exception as e:
            logger.exception(f"MAIN SQL Error")
            return False
        
        
async def create_user(email:str,provider_id:str,provider:str = Literal["apple","google"]) -> bool:
    if await is_user_exists(email):
        return False
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.insert().values(
                    provider_id = provider_id,
                    provider = provider,
                    email = email,
                    sub = False,
                    basic_sub = False,
                    date = "",
                    last_refil_date = str(datetime.now().date()),
                    requests = 10,
                    nano_req = 1
                )
                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False
            

# ---- HELPERS ----

async def transform_date_to_int(date:str) -> int:
        dt:str = ""
        for tm in str(date).split('-'):
            dt += tm
        return int(dt)

async def get_user_sub_date_end(email:str) -> str:
    if not await is_user_exists(email):
        return ""
    
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.date).where(main_table.c.email == email)

            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()

            return data
        except Exception as e:
            logger.exception("MAIN SQL ERROR")
            return ""


async def get_user_last_refil_date(email: str) -> str:
    if not await is_user_exists(email):
        return ""

    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.last_refil_date).where(main_table.c.email == email)

            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()

            return data
        except Exception as e:
            logger.exception("MAIN SQL ERROR")
            return ""


# function to check user sub date end to unsub
async def check_date_for_sub(email:str,datetime_now_str:str) -> bool:
    datetime_now_int = await transform_date_to_int(datetime_now_str)


    user_end_data = await get_user_sub_date_end(email)

    user_end_data_int = await transform_date_to_int(user_end_data)

    if datetime_now_int < user_end_data_int:
        return False
    
    return True

#function to check user last refil day to refil today
async def check_date_for_refil(email:str,datetime_now_str:str) -> bool:
    datetime_now_int = await transform_date_to_int(datetime_now_str)
    user_last_data = await get_user_last_refil_date(email)

    user_last_data_int = await transform_date_to_int(user_last_data)

    if datetime_now_int < user_last_data_int:
        return False

    return True




# ---- PREMIUM SUB ----
async def subscribe_premium(email:str) -> bool:

    if not await is_user_exists(email):
        return False


    if await is_user_subbed(email):
        return False

    if await is_user_subbed_basic(email):
        return False
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    sub = True,
                    date = str(datetime.now().date()),
                    last_refil_date = str(datetime.now().date()),
                    nano_req = 15
                )

                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False



async def unsub_func_premium(email:str) -> bool:
    if not await is_user_exists(email):
        return False


    if not await is_user_subbed(email):
        return False

    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    date_check_result:bool = await check_date_for_sub(email,datetime_now_str)


    if not date_check_result:
        return False


    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    sub=False,
                    date="",
                    nano_req = 3,
                    requests = 20,
                    last_refil_date = str(datetime.now().date())
                )

                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False


async def is_user_subbed(email:str) -> bool:
    if not await is_user_exists(email):
        return False

    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.sub).where(main_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()

            return data if data is not None else False
        except Exception as e:
            logger.exception(f"MAIN SQL Error")
            return False





# ---- REQUESTS ----


async def refil_nano_requests(email:str,amount:int) -> bool:
    if not await is_user_exists(email):
        return False




    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    result_date:bool = await check_date_for_refil(email,datetime_now_str)

    if result_date:
        return False

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    nano_req = amount,
                    last_refil_date = str(datetime.now().date())
                )
                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False
            

async def refil_normal_requests(email:str,amount:int) -> bool:
    if not await is_user_exists(email):
        return False


    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    result_date:bool = await check_date_for_refil(email,datetime_now_str)

    if result_date:
        return False

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    requests = amount,
                    last_refil_date = str(datetime.now().date())
                )
                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False

async def get_user_req_amount_all_requests(email:str) -> dict:
    if not await is_user_exists(email):
        return {}

    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.requests,main_table.c.nano_req).where(main_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.fetchone()

            requests,nano_req = data

            return {
                "requests":requests,
                "nano_requests":nano_req
            }
            
        except Exception as e:
            logger.exception(f"MAIN SQL Error")
            return {}
        

async def minus_one_req(email:str):
    if not await is_user_exists(email):
        return
    
    if is_user_subbed(email):
        return
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    requests = main_table.c.requests -1
                )
                await conn.execute(stmt)
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return


async def minus_one_req_nano(email: str):
    if not await is_user_exists(email):
        return

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    nano_req = main_table.c.nano_req - 1
                )
                await conn.execute(stmt)
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return


async def does_user_have_requests(email:str) -> bool | None:

    if not await is_user_exists(email):
        return False
    
    if is_user_subbed(email):
        return
    
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.requests).where(main_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data != 0
        except Exception as e:
            logger.exception("MAIN SQL ERROR")
            return 
    

async def does_user_have_nano_requests(email:str) -> bool | None:

    if not await is_user_exists(email):
        return False
        
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.nano_req).where(main_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data != 0
        except Exception as e:
            logger.exception("MAIN SQL ERROR")
            return 
        
# ---- BASIC SUB ----

async def is_user_subbed_basic(email:str) -> bool:
    if not await is_user_exists(email):
        return False
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.basic_sub).where(main_table.c.email == email)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else False
        except Exception:
            logger.exception("MAIN SQL ERROR")
            return False


async def subscribe_basic(email:str) -> bool:
    if not await is_user_exists(email):
        return False
    
    if await is_user_subbed(email):
        return False 
    
    if await is_user_subbed_basic(email):
        return False
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    date = str(datetime.now().date()),
                    last_refil_date = str(datetime.now().date()),
                    nano_req = 3,
                    requests = 25
                )
                await conn.execute(stmt)
                return True
            except Exception as e:
                logger.exception("MAIN SQL ERROR")
                return False

async def unsub_basic(email:str) -> bool:

    if not await is_user_exists(email):
        return False
    
    if not await is_user_subbed_basic(email):
        return False
    
    if await is_user_subbed(email):
        return False
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.email == email).values(
                    date = "",
                    last_refil_date = str(datetime.now().date()),
                    nano_req = 1,
                    requests = 10
                )
                await conn.execute(stmt)
                return True
            except Exception:
                logger.exception("MAIN SQL ERROR")
                return False
            


async def profile(email:str) -> dict[str]:
    if not await is_user_exists(email):
        return {}
    
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.sub,main_table.c.basic_sub,main_table.c.date,main_table.c.requests, main_table.c.nano_req).where(main_table.c.email == email)

            res = await conn.execute(stmt)

            data = res.fetchone()


            sub,basic_sub,date,requests,nano_req = data


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


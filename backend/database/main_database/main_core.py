from sqlalchemy import text,select,and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.dialects.postgresql import insert
from datetime import datetime,timedelta
from typing import List,Literal,Dict
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from backend.database.main_database.main_models import metadata_obj,main_table
import asyncio
import atexit
from sqlalchemy import func
import logging
import uuid
from backend.api.config import database_url,async_engine,SUBSCRIPTIONS,FREE_PLAN
#backend.database.


logger = logging.getLogger(__name__)




# ---- INIT ---- 

async def drop_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.drop_all)

async def create_table():
    async with async_engine.begin() as conn:
        await conn.run_sync(metadata_obj.create_all)

# For the existing table: create_all doesn't add new columns.
async def migrate_table():
    async with async_engine.begin() as conn:
        await conn.execute(text("ALTER TABLE main_app_table ADD COLUMN IF NOT EXISTS video_credits INTEGER DEFAULT 0"))
        await conn.execute(text("ALTER TABLE main_app_table ADD COLUMN IF NOT EXISTS last_premium_refil VARCHAR DEFAULT ''"))
        

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

async def get_user_id_by_email(email:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.user_id).where(main_table.c.email == email)
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
                    premium_sub = False,
                    basic_sub = False,
                    starter_sub = False,
                    plus_sub = False,
                    max_sub = False,
                    elite_sub = False,
                    date = "",
                    last_refil_date = str(datetime.now().date()),
                    requests = FREE_PLAN["requests"],
                    nano_req = FREE_PLAN["nano_req"],
                    video_credits = FREE_PLAN["video"],
                    last_premium_refil = str(datetime.now().date())
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
                    elif provider == "email" and provider_id is None:
                        user_id = await get_user_id_by_email(email)
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
                main_table.c.premium_sub,
                main_table.c.starter_sub,
                main_table.c.plus_sub,
                main_table.c.max_sub,
                main_table.c.elite_sub,
                main_table.c.basic_sub,
                main_table.c.date,
                main_table.c.last_refil_date,
                main_table.c.requests,
                main_table.c.nano_req,
                main_table.c.video_credits,
                main_table.c.last_premium_refil
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




# ---- SUBSCRIBTIONS ----
async def subscribe(user_id:str,sub_type:str) -> bool:
    user = await get_user_state(user_id)

    sub_data = SUBSCRIPTIONS.get(sub_type)

    if not sub_data:
        return False

    if (not user or any([
            user["premium_sub"],
            user["basic_sub"],
            user["starter_sub"],
            user["plus_sub"],
            user["max_sub"],
            user["elite_sub"]
        ])
    ):
        return False

    
    date = datetime.now().date() + timedelta(days = 30)
    
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                values = {
                    "date": str(date),
                    "last_refil_date" : str(datetime.now().date()),
                    "nano_req" : sub_data["nano_req"],
                    "requests" : sub_data["requests"],
                    "video_credits" : sub_data.get("video", 0),
                    "last_premium_refil" : str(datetime.now().date()),
                    sub_data["column"] : True
                }

                stmt = (
                    main_table.update().where(
                        main_table.c.user_id == user_id
                    ).values(
                        **values
                    )
                )
                result = await conn.execute(stmt)
                return result.rowcount > 0
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False



async def unsubscribe(user_id:str,sub_type:str,force:bool = False) -> bool:
    """force=True ends the plan right away (e.g. Stripe canceled it) instead of only after its end date."""
    user = await get_user_state(user_id)

    sub_data = SUBSCRIPTIONS.get(sub_type)

    if not sub_data:
        return False
    
    sub_column = sub_data["column"]

    if not user or not user[sub_column]:
        return False

    datetime_now = datetime.now().date()

    datetime_now_str = str(datetime_now)

    date_check_result:bool = check_date_for_sub(datetime_now_str,user["date"])


    if not date_check_result and not force:
        return False


    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                values = {
                    "date": "",
                    "last_refil_date" : str(datetime.now().date()),
                    "nano_req" : FREE_PLAN["nano_req"],
                    "requests" : FREE_PLAN["requests"],
                    "video_credits" : FREE_PLAN["video"],
                    "last_premium_refil" : str(datetime.now().date()),
                    sub_data["column"] : False
                }

                stmt = (
                    main_table.update().where(
                        main_table.c.user_id == user_id
                    ).values(
                        **values
                    )
                )
                result = await conn.execute(stmt)
                return result.rowcount > 0
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return False


async def renew_sub(user_id:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    date = str(datetime.now().date() + timedelta(days = 30))
                )   
                await conn.execute(stmt)
            except Exception as e:
                logger.exception(f"MAIN SQL Error")
                return




# ---- REQUESTS ----


async def refil_all_requests(user_id:str) -> bool:
    """Every day: regular requests back to the plan's daily amount.
    Every 30 days: premium requests and video credits back to the plan's monthly amount."""
    user = await get_user_state(user_id)

    if not user:
        return False

    plan = FREE_PLAN
    for sub_data in SUBSCRIPTIONS.values():
        if user.get(sub_data["column"]):
            plan = sub_data
            break

    today = datetime.now().date()
    values = {}

    if check_date_for_refil(str(today), user["last_refil_date"]):
        values["requests"] = plan["requests"]
        values["last_refil_date"] = str(today)

    last_premium = user.get("last_premium_refil") or ""
    try:
        premium_due = not last_premium or (today - datetime.strptime(last_premium, "%Y-%m-%d").date()).days >= 30
    except ValueError:
        premium_due = True
    if premium_due:
        values["nano_req"] = plan["nano_req"]
        values["video_credits"] = plan.get("video", 0)
        values["last_premium_refil"] = str(today)

    if not values:
        return False

    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(**values)
                result = await conn.execute(stmt)
                return result.rowcount > 0
            except Exception:
                logger.exception("MAIN SQL Error")
                return False


async def minus_one_req(user_id:str):
    user = await get_user_state(user_id)

    if not user:
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


    


async def minus_one_video(user_id: str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    video_credits = main_table.c.video_credits - 1
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("MAIN SQL Error")


async def plus_one_video(user_id: str):
    """Refund: gives back the video credit of a failed generation."""
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(main_table.c.user_id == user_id).values(
                    video_credits = main_table.c.video_credits + 1
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("MAIN SQL Error")


async def profile(user_id:str) -> dict:
    
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.profile_pict,
                          main_table.c.name,
                          main_table.c.premium_sub,
                          main_table.c.basic_sub,
                          main_table.c.starter_sub,
                          main_table.c.plus_sub,
                          main_table.c.max_sub,
                          main_table.c.elite_sub,
                          main_table.c.date,
                          main_table.c.requests,
                          main_table.c.nano_req,
                          main_table.c.email,
                          main_table.c.video_credits).where(main_table.c.user_id == user_id)

            res = await conn.execute(stmt)

            data = res.fetchone()

            if data is None:
                return {}

            avatar,name,premium_sub,basic_sub,starter_sub,plus_sub,max_sub,elite_sub,date,requests,nano_req,email,video_credits = data


            return {
                "Name":name,
                "Profile Picture":avatar,
                "Email":email,
                "Premium":premium_sub,
                "Starter": starter_sub,
                "Plus" : plus_sub,
                "Max" : max_sub,
                "Elite" : elite_sub,
                "Basic":basic_sub,
                "Date End": date,
                "Requests":requests,
                "Nano Requests":nano_req,
                "Video Credits":video_credits or 0

            }

        except Exception:
            logger.exception("MAIN SQL ERROR")
            return {}

async def get_user_avatar_and_name(user_id:str) -> dict:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.name,main_table.c.profile_pict).where(main_table.c.user_id == user_id)
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
            stmt = select(main_table.c.email).where(main_table.c.user_id == user_id)
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            return data if data is not None else ""
        except Exception:
            logger.exception("MAIN SQL ERROR")
            return ""


async def update_user_avatar(user_id:str,avatar_url:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(
                    main_table.c.user_id == user_id
                ).values(
                    profile_pict = avatar_url
                )
                
                await conn.execute(stmt)

            except Exception:
                logger.exception("MAIN SQL ERROR")
                return

async def get_user_profile_pict_url(user_id:str) -> str:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(main_table.c.profile_pict).where(
                main_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            data = res.scalar_one_or_none()
            
            return data if data is not None else ""
        except Exception:
            logger.exception("MAIN SQL ERROR")
            return ""

async def change_name(user_id:str,new_name:str):
    async with AsyncSession(async_engine) as conn:
        async with conn.begin():
            try:
                stmt = main_table.update().where(
                    main_table.c.user_id == user_id
                ).values(
                    name = new_name
                )
                await conn.execute(stmt)
            except Exception:
                logger.exception("MAIN SQL ERROR")
                return


async def get_user_plan(user_id:str) -> Dict | None:
    async with AsyncSession(async_engine) as conn:
        try:
            stmt = select(
                main_table.c.premium_sub,
                main_table.c.starter_sub,
                main_table.c.plus_sub,
                main_table.c.max_sub,
                main_table.c.elite_sub,
                main_table.c.basic_sub,
            ).where(
                main_table.c.user_id == user_id
            )
            res = await conn.execute(stmt)
            row = res.fetchone()
            if row is None:
                return {}
            
            return dict(row._mapping)
            
        except Exception:
            logger.exception("MAIN SQL ERORR")
            return None


from fastapi import Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile,Form
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from pydantic import BaseModel,EmailStr
import uvicorn
import json
import hmac
import asyncio
import os
from dotenv import load_dotenv
import time
from slowapi import Limiter,_rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import timedelta
from typing import Optional,Dict
import logging
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from backend.api.auth import create_access_token,create_refresh_token
from backend.database.main_database.main_core import create_user,subscribe,unsubscribe,minus_one_req,minus_one_req_nano,profile,get_user_data_for_jwt,get_user_state,get_user_email_by_user_id,get_user_avatar_and_name,renew_sub,refil_all_requests,update_user_avatar,get_user_profile_pict_url,change_name,get_user_plan,minus_one_video,plus_one_video,minus_requests,migrate_table as migrate_main_table
from backend.database.jwt_database.jwt_core import create_refresh_token_db,get_user_refresh_token,update_refresh_token,delete_jwt_tokens
from backend.database.email_code_db.email_core import create_code,check_code
from backend.database.chats_database.chats_core import create_chat,delete_chat,get_user_chats,update_chat_last_message_date,get_chats_order,add_chat_to_folder,get_folder_chats,delete_folder,delete_chat_from_folder,update_chat_name,get_chat_name,pin_unpin_chat,get_pinned_chats_order
from backend.database.ai_choose_db.ai_core import create_default_user_model_name,get_user_model_name,change_user_model_name
from backend.database.messages_database.messages_core import create_message,get_chat_messages,get_chat_first_message,delete_chat_messages,get_chat_messages_for_front_end,count_model_messages,get_today_models_usage,get_total_models_usage,get_chat_messages_2,update_image_response_url,set_message_response
from backend.database.apple_notification_log.apple_core import create_new_log,is_notification_exists
from backend.database.transaction_db.transaction_core import create_new_trasacrion,is_transaction_exists,get_user_by_original_transaction_id,update_transaction
from backend.database.stats_db.stats_core import write_models_stats,get_date_last_update,get_models_stats
from backend.database.devices_db.devices_core import create_new_device,delete_device,get_user_devices,get_device_token,update_device_token,update_last_online
from backend.database.folders_db.folders_core import create_folder,get_user_folders,rename_folder,delete_folder_folder_core,add_tag,remove_tag
from backend.database.facts_db.facts_core import create_fact_data,update_user_fact,get_user_fact,check_last_gather
from backend.api.memory import gather_user_main_information,summarize_user_message_history
from backend.database.links_db.links_core import create_link,get_chat_id_by_link,get_link_id_by_chat_id,delete_link,does_chat_have_link,get_user_links
from backend.database.videos_handle_db.videos_core import create_video_task,update_video_status,get_video_status,get_user_tasks
from backend.api.psw_hash import encrypt,decrypt
from backend.database.model_stats_redis.redis_cli import RedisClient
from backend.api.redis_lock import check_login_limit,register_failed_login,reset_login_limit
from backend.database.streak_db.streak_core import create_user_streak,plus_one_streak_day,reset_streak,get_user_streak_data,migrate_streak_table,write_record,resume_streak
from backend.database.ban_db.ban_core import ban_user,get_ban_info,unban_user
from backend.database.custom_gpt_db.custom_core import create_custom_gpt,get_user_custom_gpts,change_gpt_name,change_gpt_promt,delete_gpt,get_custom_gpts_ids,get_gpt_settings
from backend.database.custom_gpt_select_db.select_core import select_user_custom_gpt,get_user_gpt,unselect_user_custom_gpt
from backend.database.user_voices.voice_core import create_voice,delete_voice,get_user_voices,rename_voice,get_user_voices_amount,set_eleven_voice_id,migrate_table as migrate_voices_table
from backend.api.config import models,expensive_models,image_generation_models,video_generation_models,tts_models,MAX_TTS_CHARS,CLONE_MODELS,CLONE_MODEL_PREFERENCE,MAX_OUTPUT_TOKENS,FREE_MODELS,FREE_DEFAULT_MODEL,PAID_DEFAULT_MODEL,FREE_PLAN,model_credits,SUBSCRIPTIONS,generate_promt_for_image_models,gennerate_promt_for_video_generation,generate_main_promt
import aiohttp
import random
from openai import AsyncOpenAI
import openai
from typing import List,Union,Literal
import base64
import re
import io
import wave
from jose.exceptions import ExpiredSignatureError, JWTError
import uuid
from appstoreserverlibrary.api_client import APIException
from appstoreserverlibrary.signed_data_verifier import SignedDataVerifier
from appstoreserverlibrary.models.Environment import Environment
from backend.api.apple_client import get_apple_api_client
from backend.api.s3_client import S3Client
from datetime import datetime,timezone
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import tempfile
from rq import Queue
import magic
import stripe
import secrets

logger = logging.getLogger(__name__)

load_dotenv()

cloud_front_domain = os.getenv("CLOUD_FRONT_DOMAIN")


AWS_CLIENT = S3Client(
    access_key=os.getenv("AWS_ACCESS_KEY"),
    secret_key=os.getenv("AWS_SECRET_KEY"),
    endpoint_url=f"https://s3.{os.getenv('AWS_REGION')}.amazonaws.com",
    bucket_name=os.getenv("BUCKET_NAME"),
    cloud_front_domain=os.getenv("CLOUD_FRONT_DOMAIN")
)


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_ID_SITE = os.getenv("GOOGLE_CLIENT_ID_SITE")



CUSTOM_GPT_ENCODE_KEY = os.getenv("CUSTOM_GPT_ENCODE")


stripe.api_key = os.getenv("STRIPE_API_KEY")


app = FastAPI()


@app.on_event("startup")
async def run_migrations():
    # Adds columns that create_all can't add to existing tables. Safe to run every start (IF NOT EXISTS).
    for migrate in (migrate_main_table, migrate_voices_table, migrate_streak_table):
        try:
            await migrate()
        except Exception:
            logger.exception("MIGRATION ERROR")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["api.nexi.center"]
)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def safe_get(req: Request):
    try:
        api = req.headers.get("X-API-KEY")
        if not api:
            raise HTTPException(status_code=401, detail="Invalid API key")

        if not await asyncio.to_thread(hmac.compare_digest, api, os.getenv("X-API-KEY")):
            raise HTTPException(status_code=401, detail="Invalid API key")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid api key")


# --- ROUTES ---
@app.get("/")
@limiter.limit("10/minute")
async def main(request:Request):
    return "VEORA-API"



class AuthGoogle(BaseModel):
    device_id:Optional[str] = None
    device_name:Optional[str] = None
    id_token:str
    method:Literal["site","app"]

@app.post("/auth/google")
@limiter.limit("20/minute")
async def auth_google_handler(request:Request,req:AuthGoogle):

    try:
        main_google_client_id = GOOGLE_CLIENT_ID if  req.method == "app" else GOOGLE_CLIENT_ID_SITE
        idinfo = id_token.verify_oauth2_token(
            req.id_token,
            google_requests.Request(),
            main_google_client_id
        )
    except Exception:
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid google token")

    issuer = idinfo.get("iss")
    if issuer not in ["accounts.google.com", "https://accounts.google.com"]:
        raise HTTPException(status_code=401, detail="Invalid token issuer")

    google_sub = idinfo.get("sub")
    email = idinfo.get("email")
    email_verified = idinfo.get("email_verified", False)
    name = idinfo.get("name", "")
    picture = idinfo.get("picture", "")

    if not google_sub:
        raise HTTPException(status_code=401, detail="Google sub not found")

    if email and not email_verified:
        raise HTTPException(status_code=401, detail="Email is not verified")


    user_id_main = str(uuid.uuid4())
    # default sql data
    user_id_try = await create_user(
        user_id = user_id_main,
        name = name,
        email = email,
        provider_id = google_sub,
        provider = "google",
        avatar_url=picture
    )


    if type(user_id_try) == str:
        user_id_main = user_id_try
        
    else:
        await create_default_user_model_name(
            user_id = user_id_main
        )
        
        await create_user_streak(
            user_id = user_id_main
        )


    user_data = {
        "user_id":user_id_main,
        "name":name,
        "device_id":req.device_id,
        "provider":"google"
    }

    acces_token:str = create_access_token(user_data)
    refresh_token:str = create_refresh_token(user_data)

    try_create_refresh = await create_new_device(user_id_main,req.device_name,refresh_token,req.device_id)

    if not try_create_refresh:
        await update_device_token(
            req.device_id,
            refresh_token
        )

    return {
        "user_id":user_id_main,
        "access_token":acces_token,
        "refresh_token":refresh_token,
        "token_type":"bearer"
    }


async def send_new_login(device_name:str,email:str):
    url =  "https://api.resend.com/emails"
    headers = {
            "Authorization": f"Bearer {os.getenv('EMAIL_API_KEY')}",
            "Content-Type": "application/json"
        }

    payload = {
        "from": os.getenv("EMAIL_FROM"),
        "to": [email],
        "subject": "VEORA New Login Detected ",
        "html": f"""
        <div style="font-family: Arial, sans-serif; background-color:#f5f5f5; padding:40px; color:#111111;"> <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; padding:30px; text-align:center; border:1px solid #e5e7eb;">

    <h1 style="color:#111111; letter-spacing:2px;">VEORA</h1>

    <h2 style="margin-top:20px; color:#1f2937;">New Login Detected</h2>

    <p style="color:#4b5563; font-size:16px;">
        A new login to your VEORA account was detected.
    </p>

    <div style="
        margin:30px 0;
        padding:18px 25px;
        background:#f9fafb;
        border-radius:10px;
        border:1px solid #e5e7eb;
    ">
        <p style="margin:0; color:#6b7280; font-size:14px;">
            Device
        </p>

        <p style="margin:8px 0 0; color:#111111; font-size:20px; font-weight:bold;">
            {device_name}
        </p>
    </div>

    <p style="color:#6b7280;">
        If this was you, no action is required.
    </p>

    <p style="margin-top:20px; color:#9ca3af; font-size:14px;">
        If you don't recognize this login, we recommend securing your account immediately.
    </p>

</div>

</div>
        """
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status >= 400:
                text = await resp.text()
                raise Exception(f"Ошибка отправки: {text}")



    




APPLE_ISSUER = os.getenv("APPLE_ISSUER")
APPLE_KEYS_URL = os.getenv("APPLE_KEYS_URL")
APPLE_AUDIENCE = os.getenv("APPLE_BUNDLE_ID")


class AuthApple(BaseModel):
    device_name:Optional[str] = None
    device_id:Optional[str] = None
    identity_token:str

@app.post("/auth/apple")
@limiter.limit("20/minute")
async def auth_apple_handler(request:Request,req:AuthApple):

    async with aiohttp.ClientSession() as session:
        async with session.get(APPLE_KEYS_URL) as resp:
            json_data = await resp.json()
            try:

                header = jwt.get_unverified_header(req.identity_token)
                key = next(
                k for k in json_data["keys"]
                if k["kid"] == header["kid"]
                )
                payload = jwt.decode(
                    req.identity_token,
                    key,
                    algorithms=["RS256"],
                    audience=APPLE_AUDIENCE,
                    issuer=APPLE_ISSUER
                )

            except Exception:
                raise HTTPException(401, "Invalid Apple token")

    apple_sub = payload.get("sub")
    email = payload.get("email")



    if not apple_sub:
        raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail =  "Invalid payload")

    email_parts = email.split("@")

    user_id_main = str(uuid.uuid4())


    user_id_try = await create_user(
        user_id = user_id_main,
        name = email_parts[0],
        email = email,
        provider_id = apple_sub,
        provider = "apple",
        avatar_url=None
    )
    

    if type(user_id_try) == str:
        user_id_main = user_id_try
    else:    
        await create_default_user_model_name(
            user_id = user_id_main
        )
        
        await create_user_streak(
            user_id = user_id_main
        )


    user_data = {
        "user_id":user_id_main,
        "name":email_parts[0],
        "device_id":req.device_id,
        "provider":"apple"
    }

    acces_token:str = create_access_token(user_data)
    refresh_token:str = create_refresh_token(user_data)

    try_create_refresh = await create_new_device(user_id_main,req.device_name,refresh_token,req.device_id)

    if not try_create_refresh:
        await update_device_token(
            req.device_id,
            refresh_token
        )

    return {
        "user_id":user_id_main,
        "access_token":acces_token,
        "refresh_token":refresh_token,
        "token_type":"bearer"
    }




async def send_email_code(email: str, code: str):
    url = "https://api.resend.com/emails"

    headers = {
        "Authorization": f"Bearer {os.getenv('EMAIL_API_KEY')}",
        "Content-Type": "application/json"
    }

    payload = {
    "from": os.getenv("EMAIL_FROM"),
    "to": [email],
    "subject": "VEORA Login Verification",
    "html": f"""
    <div style="font-family: Arial, sans-serif; background-color:#f5f5f5; padding:40px; color:#111111;">
        <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; padding:30px; text-align:center; border:1px solid #e5e7eb;">

            <h1 style="color:#111111; letter-spacing:2px;">VEORA</h1>

            <h2 style="margin-top:20px; color:#1f2937;">Login Verification</h2>

            <p style="color:#4b5563; font-size:16px;">
                We received a request to log in to your account.
                Please use the verification code below to proceed.
            </p>

            <div style="margin:30px 0;">
                <span style="
                    display:inline-block;
                    font-size:32px;
                    letter-spacing:8px;
                    padding:15px 25px;
                    background:#111111;
                    border-radius:10px;
                    color:#ffffff;
                    font-weight:bold;
                ">
                    {code}
                </span>
            </div>

            <p style="color:#6b7280;">
                This code is valid for <b>2 minutes</b>.
            </p>

            <p style="margin-top:20px; color:#9ca3af; font-size:14px;">
                If you didn’t request this, you can safely ignore this email.
            </p>

        </div>
    </div>
    """
}

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status >= 400:
                text = await resp.text()
                raise Exception(f"Ошибка отправки: {text}")

async def send_email_sub_over(email: str):
    url = "https://api.resend.com/emails"

    headers = {
        "Authorization": f"Bearer {os.getenv('EMAIL_API_KEY')}",
        "Content-Type": "application/json"
    }

    payload = {
    "from": os.getenv("EMAIL_FROM"),
    "to": [email],
    "subject": "Your VEORA Subscription Has Ended",
    "html": f"""
    <div style="font-family: Arial, sans-serif; background-color:#f5f5f5; padding:40px; color:#111111;">
        <div style="max-width:650px; margin:0 auto; background:#ffffff; border-radius:16px; padding:35px; border:1px solid #e5e7eb;">

            <h1 style="text-align:center; color:#111111; letter-spacing:2px;">VEORA</h1>

            <h2 style="margin-top:25px; text-align:center; color:#1f2937;">Subscription Expired</h2>

            <p style="margin-top:20px; color:#4b5563; font-size:16px; line-height:1.6;">
                We wanted to let you know that your VEORA subscription has officially come to an end.
            </p>

            <p style="color:#4b5563; font-size:16px; line-height:1.6;">
                We truly appreciate the time you spent with us. During your subscription, you had access to advanced AI tools,
                powerful features, and an enhanced experience designed to boost your productivity and creativity.
            </p>

            <p style="color:#4b5563; font-size:16px; line-height:1.6;">
                We hope VEORA helped you achieve your goals, whether it was building projects, exploring new ideas,
                or simply making your workflow faster and smarter.
            </p>

            <p style="color:#6b7280; font-size:15px; line-height:1.6;">
                If you wish to continue using premium features, you can renew your subscription at any time.
                We’ll be happy to have you back.
            </p>

            <p style="margin-top:25px; color:#9ca3af; font-size:14px;">
                Thank you for choosing VEORA
            </p>

        </div>
    </div>
    """
}
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status >= 400:
                text = await resp.text()
                raise Exception(f"Ошибка отправки: {text}")

class AuthWithEmail(BaseModel):
    email:EmailStr


@app.post("/send/code")
@limiter.limit("20/minute")
async def send_code(request:Request,req:AuthWithEmail):

    try:


        await check_login_limit(req.email)

        code = secrets.randbelow(900000) + 100000
        try_create_code = await create_code(req.email,code)
        if not try_create_code:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Code already sent")


        await send_email_code(req.email,code)

    except HTTPException:
        raise
    except Exception:
        logger.exception("API ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

class Verify_Code(BaseModel):
    device_name:Optional[str] = None
    device_id:Optional[str] = None
    email:EmailStr
    code:int

@app.post("/check/code")
@limiter.limit("20/minute")
async def check_code_router(request:Request,req:Verify_Code):

    try:

        await check_login_limit(req.email)
        email_parts = req.email.split("@")

        check_result = await check_code(req.email,req.code)

        if not check_result:
            await register_failed_login(req.email)
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid code")


        await reset_login_limit(req.email)
        # default sql data
        user_id_main = str(uuid.uuid4())


        user_id_try = await create_user(
            user_id = user_id_main,
            name = email_parts[0],
            email = req.email,
            provider_id = req.email,
            provider = "email",
            avatar_url=None
        )


        if type(user_id_try) == str:
            user_id_main = user_id_try
        else:

            await create_default_user_model_name(
                user_id = user_id_main
            )
            
            await create_user_streak(
                user_id = user_id_main
            )



        user_data = {
            "user_id":user_id_main,
            "name":email_parts[0],
            "device_id":req.device_id,
            "provider":"email"
        }

        acces_token:str = create_access_token(user_data)
        refresh_token:str = create_refresh_token(user_data)

        try_create_refresh = await create_new_device(user_id_main,req.device_name,refresh_token,req.device_id)

        if not try_create_refresh:
            await update_device_token(
                req.device_id,
                refresh_token
            )

        return {
            "user_id":user_id_main,
            "access_token":acces_token,
            "refresh_token":refresh_token,
            "token_type":"bearer"
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("API ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


class RefreshToken(BaseModel):
    refresh_token:str

@app.post("/refresh",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def refresh_token_api(request:Request,req:RefreshToken):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Invalid refresh token",
    )

    try:
        payload = jwt.decode(req.refresh_token, os.getenv("REFRESH_SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
        user_id: str = payload.get("user_id")
        device_id:str = payload.get("device_id")


        if user_id is None or device_id is None:
            raise credentials_exception

        stored_token = await get_device_token(device_id)
        if stored_token != req.refresh_token:
            raise credentials_exception

        user_data = await get_user_data_for_jwt(user_id)

        if user_data == {} or not user_data.get("provider"):
            raise credentials_exception

        user_data["device_id"] = device_id

    except JWTError:
        raise credentials_exception


    new_access_token = create_access_token(user_data)

    new_refresh_token = create_refresh_token(user_data)

    await update_device_token(device_id,new_refresh_token)


    return {
        "user_id":user_id,
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }

async def get_current_user(token: str = Header(..., alias="Authorization")) -> dict:
    """
    Проверяет access token и возвращает данные пользователя.
    Токен должен передаваться в формате: "Bearer <token>"
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Проверяем формат токена
        if not token.startswith("Bearer "):
            raise credentials_exception

        # Извлекаем сам токен
        token = token.replace("Bearer ", "")

        # Декодируем токен
        payload = jwt.decode(
            token,
            os.getenv("SECRET_KEY"),
            algorithms=[os.getenv("ALGORITHM")]
        )

        user_id: str = payload.get("user_id")
        device_id: str = payload.get("device_id")
        if user_id is None or device_id is None:
            raise credentials_exception

        return {
            "user_id":user_id,
            "device_id":device_id
        }


    except ExpiredSignatureError:
        # Токен истек - клиент должен использовать refresh
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exception




# ----- BAN LOGIC -----

class BanUser(BaseModel):
    user_id:str
    days:int


@limiter.limit("20/minute")
@app.post("/user/ban")
async def ban_user_handler(request:Request,req:BanUser,user_data:dict = Depends(get_current_user)):
    try:
        allowed_users = os.getenv("ALLOWED_USERS")
        if user_data["user_id"] not in allowed_users:
            raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
        result = await ban_user(
            user_id = req.user_id,
            ban_days = req.days
        )
        return {
            "message" : "ok"
        } if result else {
            "message" : "error"
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.get("/profile")
@limiter.limit("20/minute")
async def profile_hadnler(request:Request,user_data:dict = Depends(get_current_user)):
    user_id = user_data["user_id"]
    
    ban_info = await get_ban_info(
        user_id = user_id
    )
    
    if ban_info is not None:
        if ban_info["unban_date"] > datetime.now().date():
            raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
        else:
            await unban_user(
                user_id = user_id
            )
            
    try:
        await refil_all_requests(user_id)

        profile_dict = await profile(user_id)

        await update_last_online(user_data["device_id"])

        return profile_dict

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



def plan_of(user_state:dict) -> dict:
    for plan in SUBSCRIPTIONS.values():
        if user_state.get(plan["column"]):
            return plan
    return FREE_PLAN


def has_paid_plan(user_state:dict) -> bool:
    return any(user_state.get(plan["column"]) for plan in SUBSCRIPTIONS.values())


def chat_models_for(paid:bool) -> List[str]:
    """Models Auto may pick: free users only get FREE_MODELS."""
    if not paid:
        return list(FREE_MODELS)
    return [m for m in models if m != "auto"] + expensive_models + image_generation_models + video_generation_models


async def pick_auto_model(request:str, photo:bool, paid:bool) -> str:
    allowed = chat_models_for(paid)
    for _ in range(3):
        try:
            choice = await decide_whick_model_is_the_best_for_request(request, photo, allowed)
        except Exception:
            logger.exception("AUTO ROUTER ERROR")
            break
        if choice in allowed:
            return choice
    return PAID_DEFAULT_MODEL if paid else FREE_DEFAULT_MODEL


async def decide_whick_model_is_the_best_for_request(request:str,photo:bool,allowed:List[str] | None = None) -> str:
    all_models = allowed or (models[1:] + expensive_models + image_generation_models + video_generation_models)
    promt = f"Which model is the best for this request: {request} ? Choose from this list: {all_models}. Answer only with model name without any other words."

    if photo:
        promt += " Also user request has a photo in it."

    response = await client.chat.completions.create(
        model="google/gemini-2.5-flash",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": promt
                    }
                ]
            }
        ]
    )

    text = response.choices[0].message.content
    return (text or "").strip()



OPEN_AI_KEY = os.getenv("OPEN_AI")


client = AsyncOpenAI(
    api_key=OPEN_AI_KEY,
    base_url="https://openrouter.ai/api/v1",
    timeout=120.0,
    max_retries=2
)



# --- VIDEOS ---


class VideoStatus(BaseModel):
    task_id:str
    message_id:str


# GET (with a JSON body) is what the iOS app sends; browsers can't put a body on GET, so POST works too.
@app.get("/videos/task/status")
@app.post("/videos/task/status")
@limiter.limit("30/minute")
async def check_videos_status_hadler(request:Request,req:VideoStatus,user_data:dict = Depends(get_current_user)):

    try:
        
        user_id = user_data["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
            
        user_tasks = await get_user_tasks(
            user_id = user_data["user_id"]
        )
        if req.task_id not in {str(task["id"]) for task in user_tasks}:
            return {
                "message" : "error"
            }

        task_status = await get_video_status(
            video_id = req.task_id
        )
        result = {"status": task_status}
        # The background job already saved the URL into the message; this lets the client show it right away.
        if task_status == "completed":
            result["url"] = f"https://{cloud_front_domain}/{req.task_id}.mp4"
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


OPENROUTER_URL = "https://openrouter.ai/api/v1"
VIDEO_TIMEOUT_SECONDS = 15 * 60
_video_jobs:set = set()   # references to running jobs so asyncio doesn't garbage-collect them


def start_video_task(**kwargs) -> None:
    job = asyncio.create_task(process_video_task(**kwargs))
    _video_jobs.add(job)
    job.add_done_callback(_video_jobs.discard)


async def process_video_task(task_id:str, prompt:str | List, model:str, message_id:str, user_id:str) -> str:
    """Generates a video with OpenRouter (POST /videos, poll, download), stores it in S3 and writes the
    URL into the chat message. On failure the message gets an error text and the video credit is refunded."""
    headers = {"Authorization": f"Bearer {OPEN_AI_KEY}"}
    try:
        if isinstance(prompt, list):
            request, images_list = prompt[0], prompt[1]
        else:
            request, images_list = prompt, None

        await update_video_status(video_id = task_id, status = "processing")

        body = {
            "model": model,
            "prompt": request,
            "duration": 8,
            "aspect_ratio": "9:16",
            "resolution": "720p",
        }
        # Image-to-video: the first attached photo becomes the first frame.
        if images_list:
            body["frame_images"] = [{
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{images_list[0]}"},
                "frame_type": "first_frame",
            }]

        async with aiohttp.ClientSession(timeout = aiohttp.ClientTimeout(total = 120)) as session:
            async with session.post(f"{OPENROUTER_URL}/videos", json = body, headers = headers) as response:
                if response.status >= 300:
                    raise Exception(f"Video job create error {response.status}: {await response.text()}")
                job = await response.json()

            polling_url = job.get("polling_url") or f"{OPENROUTER_URL}/videos/{job['id']}"
            deadline = time.monotonic() + VIDEO_TIMEOUT_SECONDS
            while True:
                await asyncio.sleep(5)
                async with session.get(polling_url, headers = headers) as response:
                    job = await response.json()
                job_status = job.get("status")
                if job_status == "completed":
                    break
                if job_status in ("failed", "cancelled", "expired"):
                    raise Exception(f"Video job {job_status}: {job.get('error')}")
                if time.monotonic() > deadline:
                    raise Exception("Video job timed out")

            # The content URLs aren't presigned: download with the API key.
            content_url = (job.get("unsigned_urls") or [f"{OPENROUTER_URL}/videos/{job['id']}/content?index=0"])[0]
            async with session.get(content_url, headers = headers, timeout = aiohttp.ClientTimeout(total = 300)) as response:
                if response.status != 200:
                    raise Exception(f"Video download error {response.status}")
                video_bytes = await response.read()

        url = await AWS_CLIENT.upload_file(
            file_path = f"{task_id}.mp4",
            file_data = video_bytes,
            content_type = "video/mp4"
        )
        del video_bytes

        await update_image_response_url(message_id = message_id, new_url = url)
        await update_video_status(video_id = task_id, status = "completed")
        return url

    except Exception:
        logger.exception("VIDEO GENERATION ERROR")
        await update_video_status(video_id = task_id, status = "failed")
        await plus_one_video(user_id)
        await set_message_response(message_id, "⚠️ The video couldn't be generated. Your video credit was refunded — please try again.")
        return ""


async def ask_chat_gpt(request: str | List, user_model:str) -> str | bytes:
    try:
        req = ""
        images_base64 = None
        if isinstance(request, list):
            req = request[0]
            images_base64 = request[1]

        else:
            req = request


        content = [
                        {
                            "type": "text",
                            "text": req
                        }
                    ]

        if images_base64:
            for image in images_base64:

                content.append(
                    {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image}"
                            }
                    }
                )




        if user_model in image_generation_models:
            response = await client.chat.completions.create(
            model=user_model,
            messages=[
                {
                    "role": "user",
                    "content": content
                }
            ],
            extra_body={
                "modalities": ["image", "text"],  # КЛЮЧЕВОЙ ПАРАМЕТР!
            }
        )
            #print(response.model_dump())
            message = response.choices[0].message
            if hasattr(message, 'images') and message.images:
                img_dict = message.images[0]
                if 'image_url' in img_dict:
                    img_data = img_dict['image_url']  # <-- ВОТ ТАК ПРАВИЛЬНО!

                    true_img_data = img_data["url"]

                    if ',' in true_img_data:
                        base64_str = true_img_data.split(',')[1]
                    else:
                        base64_str = true_img_data


                    image_bytes = base64.b64decode(base64_str)
                    return image_bytes
            return "No image in response"



        response = await client.chat.completions.create(  # <-- ВАЖНО: используем chat.completions
            model=user_model,  # <-- ПРАВИЛЬНОЕ имя модели
            messages=[
                {"role": "user", "content": content}
            ],
            # Caps the cost of one answer (plan limits are calculated with it).
            # Thinking models spend part of it on reasoning, so they get more room.
            max_tokens = MAX_OUTPUT_TOKENS * 2 if "thinking" in user_model else MAX_OUTPUT_TOKENS
        )


        result = response.choices[0].message.content.strip()
        if not result:
            return "No text result."

        return result

    except TimeoutError:
        return "Generation took too long. Try again."

    except openai.NotFoundError as e:
        print(f"ERROR : {e}")
        return "This model doesn`t support image input"

    except Exception as e:
        #print(f"OpenAI SDK error: {e}")
        logger.exception("OpenAI SDK error")
        return "Some error happened. Try again."



def decrypt_gpt_field(value:str) -> str:
    # Older edits were stored unencrypted; show those as they are instead of failing.
    try:
        return decrypt(value, CUSTOM_GPT_ENCODE_KEY)
    except Exception:
        return value


async def get_user_custom_model_promt(user_id:str) -> str | None:
    user_gpt_id = await get_user_gpt(
        user_id = user_id
    )
    if user_gpt_id is None:
        return None
    gpt_details = await get_gpt_settings(
        gpt_id = user_gpt_id
    )
    if not gpt_details:
        # The selected GPT was deleted: fall back to the regular assistant.
        await unselect_user_custom_gpt(user_id)
        return None
    return decrypt_gpt_field(gpt_details["gpt_promt"])


def clean_text_for_speech(text:str) -> str:
    # Markdown symbols and code would be read out loud, so strip them before TTS.
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+", "", text, flags=re.M)
    text = re.sub(r"(\*\*|__|~~|\*)", "", text)
    return re.sub(r"\s+", " ", text).strip()


def pcm_to_wav(pcm:bytes, sample_rate:int) -> bytes:
    # Raw 16-bit little-endian mono PCM -> playable WAV file.
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return buffer.getvalue()


# ----- own voices: model choice + ElevenLabs -----

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_URL = "https://api.elevenlabs.io/v1"


def clone_model_available(key:str) -> bool:
    model = CLONE_MODELS.get(key)
    if model is None:
        return False
    return model["provider"] != "elevenlabs" or bool(ELEVENLABS_API_KEY)


def pick_clone_model(requested:str | None) -> str:
    if requested and clone_model_available(requested):
        return requested
    return next(k for k in CLONE_MODEL_PREFERENCE if clone_model_available(k))


async def eleven_create_voice(label:str, sample_url:str) -> str:
    """Clones the sample into an ElevenLabs Instant Voice Clone and returns its voice_id."""
    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(sample_url) as response:
            if response.status != 200:
                raise Exception(f"Voice sample download failed: {response.status}")
            sample = await response.read()
            content_type = response.headers.get("Content-Type", "audio/mpeg")
        form = aiohttp.FormData()
        form.add_field("name", label)
        form.add_field("remove_background_noise", "true")
        form.add_field("files", sample, filename = "sample." + sample_url.rsplit(".", 1)[-1], content_type = content_type)
        async with session.post(f"{ELEVENLABS_URL}/voices/add", data = form, headers = {"xi-api-key": ELEVENLABS_API_KEY}) as response:
            if response.status != 200:
                raise Exception(f"ElevenLabs voice clone error: {await response.text()}")
            return (await response.json())["voice_id"]


async def eleven_text_to_speech(text:str, eleven_voice_id:str, model_id:str) -> bytes:
    timeout = aiohttp.ClientTimeout(total=120)
    payload = {
        "text": text,
        "model_id": model_id,
        # High similarity keeps the clone close to the sample; a little style adds life.
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.9, "style": 0.15, "use_speaker_boost": True}
    }
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{ELEVENLABS_URL}/text-to-speech/{eleven_voice_id}?output_format=mp3_44100_128",
            json = payload,
            headers = {"xi-api-key": ELEVENLABS_API_KEY}
        ) as response:
            if response.status != 200:
                raise Exception(f"ElevenLabs TTS error: {await response.text()}")
            return await response.read()


async def eleven_delete_voice(eleven_voice_id:str) -> None:
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        async with session.delete(f"{ELEVENLABS_URL}/voices/{eleven_voice_id}", headers = {"xi-api-key": ELEVENLABS_API_KEY}) as response:
            if response.status not in (200, 404):
                raise Exception(f"ElevenLabs delete error: {await response.text()}")


async def text_to_speech(text:str, tts_model:str, reference_url:str | None = None,
                         transcript:str | None = None, clone_model:str | None = None) -> tuple[bytes, str, str]:
    """Returns (audio bytes, file extension, content type).
    With reference_url the text is spoken in the cloned voice from that sample (OpenRouter models)."""
    if reference_url:
        settings = {}
        audio_format = "mp3"
        references = [{"type": "input_audio", "input_audio": {"url": reference_url}}]
        # Fish Audio uses the sample's transcript to clone much more accurately (Seed ignores it).
        if transcript:
            references.append({"type": "text", "text": transcript})
        payload = {
            "model": CLONE_MODELS[clone_model]["model"],
            "input": text,
            "response_format": audio_format,
            "input_references": references
        }
    else:
        settings = tts_models[tts_model]
        audio_format = settings.get("format", "mp3")
        payload = {
            "model": settings["model"],
            "input": text,
            "voice": settings["voice"],
            "response_format": audio_format
        }
    headers = {
        "Authorization": f"Bearer {OPEN_AI_KEY}",
        "Content-Type": "application/json"
    }
    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            "https://openrouter.ai/api/v1/audio/speech",
            json=payload,
            headers=headers
        ) as response:
            if response.status != 200:
                error = await response.text()
                raise Exception(
                    f"OpenRouter TTS error: {error}"
                )
            audio = await response.read()

    if audio_format == "pcm":
        return pcm_to_wav(audio, settings["sample_rate"]), "wav", "audio/wav"
    return audio, "mp3", "audio/mpeg"


class AskText(BaseModel):
    chat_id:Optional[str] = None
    request:Optional[str] = None
    voice_id:Optional[str] = None      # the user's own voice from /voices/get; forces text-to-speech
    voice_model:Optional[str] = None   # key of CLONE_MODELS for voice_id (see /voices/models)

@app.post("/ask_text")
@limiter.limit("20/minute")
async def ask_text_handler(request:Request,req:AskText,user_data_jwt:dict = Depends(get_current_user)):



    try:

        user_id = user_data_jwt["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )

        device_id = user_data_jwt["device_id"]



        user_data = await get_user_state(user_id)

        if user_data == {}:
            return {
                "message":"None"
            }

        await update_last_online(device_id)

        await refil_all_requests(user_id)


        chat_id = req.chat_id

        if req.chat_id is None:
            chat_id = await create_chat(user_id)
        else:
            user_chats = await get_user_chats(user_id)
            
            if req.chat_id not in user_chats:
                return {
                    "message":"error"
                }


        current_chat_messages = await get_chat_messages_2(
            chat_id = chat_id
        )


        user_facts = await get_user_fact(
            user_id = user_id
        )

        user_custom_gpt_promt = await get_user_custom_model_promt(
            user_id = user_id
        )

        promt = generate_main_promt(
            current_chat_messages = current_chat_messages,
            user_facts = user_facts,
            current_message = str(req.request),
            custom_model_prompt = user_custom_gpt_promt
        )
        

        user_model = await get_user_model_name(user_id)
        paid = has_paid_plan(user_data)
        # A model removed from the catalog (or by OpenRouter) falls back to Auto instead of failing.
        if user_model != "auto" and user_model not in (models + expensive_models + image_generation_models + video_generation_models) and user_model not in tts_models:
            user_model = "auto"
        # Free plan: PLUS models quietly fall back to Auto among the free models (older apps keep working).
        if not paid and user_model != "auto" and user_model not in FREE_MODELS:
            user_model = "auto"
        if user_model == "auto":
            user_model = await pick_auto_model(req.request or "", False, paid)


        if user_model == "auto" and req.request == None:
            user_model = PAID_DEFAULT_MODEL if paid else FREE_DEFAULT_MODEL

        if user_model in tts_models or req.voice_id:
            # Voice models read the user's text as is; the chat history isn't used.
            reference_url = None
            own_voice = None
            clone_key = None
            if req.voice_id:
                if not paid:
                    raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Upgrade required")
                user_voices = await get_user_voices(user_id = user_id) or []
                own_voice = next((v for v in user_voices if v["voice_id"] == req.voice_id), None)
                if own_voice is None:
                    raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Voice not found")
                reference_url = decrypt(own_voice["link"],VOICE_ENCODING_KEY)
                clone_key = pick_clone_model(req.voice_model)
                clone = CLONE_MODELS[clone_key]
                user_model = f"{clone.get('model') or 'elevenlabs/' + clone['model_id']}:custom"

            text_to_voice = clean_text_for_speech(req.request or "")
            if not text_to_voice:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Nothing to voice")
            if len(text_to_voice) > MAX_TTS_CHARS:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Text is too long")

            if user_data["nano_req"] <= 0:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")

            try:
                if clone_key and CLONE_MODELS[clone_key]["provider"] == "elevenlabs":
                    # The ElevenLabs clone is created on first use and kept for next time.
                    eleven_voice_id = own_voice.get("eleven_voice_id")
                    if not eleven_voice_id:
                        eleven_voice_id = await eleven_create_voice(f"veora-{own_voice['voice_id']}", reference_url)
                        await set_eleven_voice_id(own_voice["voice_id"], eleven_voice_id)
                    audio_bytes = await eleven_text_to_speech(text_to_voice, eleven_voice_id, CLONE_MODELS[clone_key]["model_id"])
                    audio_ext, audio_type = "mp3", "audio/mpeg"
                else:
                    transcript = decrypt(own_voice["transcript"],VOICE_ENCODING_KEY) if own_voice and own_voice.get("transcript") else None
                    audio_bytes, audio_ext, audio_type = await text_to_speech(text_to_voice,user_model,reference_url,transcript,clone_key)
            except Exception:
                logger.exception("TTS ERROR")
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Error while generating")

            url = await AWS_CLIENT.upload_file(
                file_path = f"{uuid.uuid4()}.{audio_ext}",
                file_data = audio_bytes,
                content_type = audio_type
            )

            encrypted_message = encrypt(req.request,os.getenv("HASH_MESSAGES_KEY"))

            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = None,
                image_response = url,
                model_name = user_model
            )

            await minus_one_req_nano(user_id)
            await update_chat_last_message_date(chat_id)

            try_streak_increase = await plus_one_streak_day(
                user_id = user_id
            )
            await write_record(user_id = user_id)

            if not try_streak_increase:
                await reset_streak(
                    user_id = user_id
                )

            return {
                "audio": url
            }

        if user_model in video_generation_models:
            # Videos have their own monthly credits (one video costs as much as ~30 premium answers).
            if (user_data.get("video_credits") or 0) <= 0:
               raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "No video credits")

            encrypted_message = encrypt(req.request,os.getenv("HASH_MESSAGES_KEY"))

            promt_for_video_model = gennerate_promt_for_video_generation(
                request = str(req.request),
                current_chat_messages = current_chat_messages
            )

            task_id = str(uuid.uuid4())

            # The message is created first; the background job fills in the video URL (or an error) itself.
            message_id = await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = None,
                image_response = None,
                model_name = user_model
            )
            await create_video_task(id = task_id, user_id = user_id, prompt = str(req.request)[:2000])
            await minus_one_video(user_id)

            start_video_task(
                task_id = task_id,
                prompt = promt_for_video_model,
                model = user_model,
                message_id = message_id,
                user_id = user_id
            )
            await update_chat_last_message_date(chat_id)
            
            
            # INCREASING THE STREAK
            try_streak_increase = await plus_one_streak_day(
                user_id = user_id
            )
            await write_record(user_id = user_id)
            if not try_streak_increase:
                await reset_streak(
                    user_id = user_id
                )
            

            return {
                "video_task_id" : task_id,
                "message_id" : message_id
            }


        if user_model in image_generation_models:

            user_nano_req = user_data["nano_req"]
            if user_nano_req <= 0:
               raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")


            encrypted_message = encrypt(req.request,os.getenv("HASH_MESSAGES_KEY"))

            promt_for_image_model = generate_promt_for_image_models(
                request = str(req.request),
                current_chat_messages = current_chat_messages,
                custom_model_prompt = user_custom_gpt_promt
            )

            response = await ask_chat_gpt(promt_for_image_model,user_model)

            if type(response) != bytes:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Error while generating")


            url = await AWS_CLIENT.upload_file(
                file_path = str(uuid.uuid4()) + ".jpg",
                file_data = response
            )

            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = None,
                image_response = url,
                model_name = user_model
            )

            await minus_one_req_nano(user_id)
            await update_chat_last_message_date(chat_id)
            
            # UNCREASING THE STREAK 
            try_streak_increase = await plus_one_streak_day(
                user_id = user_id
            )
            await write_record(user_id = user_id)
            if not try_streak_increase:
                await reset_streak(
                    user_id = user_id
                )
                
                
                
            return {
                "image": url
            } #  либо текст, либо url картинки
        expensive_models_full = expensive_models + image_generation_models + video_generation_models
        # Daily credits: every model costs its weight (MODEL_CREDITS).
        credits = model_credits(user_model)
        if user_model not in expensive_models_full and (user_data["requests"] or 0) < credits:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests" if (user_data["requests"] or 0) <= 0 else "Not enough credits")


        if user_model in expensive_models_full:
            user_nano_req = user_data["nano_req"]
            if user_nano_req <= 0:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")


        response = await ask_chat_gpt(promt,user_model)

        if response in ["No image in response","Generation took to long. Try again.","Some error happened.","This model doesnt support image input"]:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Error while generating")

        if user_model in expensive_models_full:
            user_nano_req = user_data["nano_req"]
            await minus_one_req_nano(user_id)

        else:
            await minus_requests(user_id, credits)

        encrypted_message = encrypt(req.request,os.getenv("HASH_MESSAGES_KEY"))
        encrypted_response = encrypt(response,os.getenv("HASH_MESSAGES_KEY"))

        await create_message(
            user_id = user_id,
            chat_id = chat_id,
            message = encrypted_message,
            response = encrypted_response,
            model_name = user_model
        )

        await update_chat_last_message_date(chat_id)
        await write_record(user_id = user_id)
        try_streak_increase = await plus_one_streak_day(
                user_id = user_id
            )
        if not try_streak_increase:
            await reset_streak(
                user_id = user_id
            )

        return {
            "message":response
        }


    except HTTPException:
        raise
    except Exception as e:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


MAX_IMAGE_SIZE = 5 * 1024 * 1024

@app.post("/ask_photo")
@limiter.limit("20/minute")
async def ask_photo_handler(request:Request,chat_id_form: Optional[str] = Form(None),
    request_text:Optional[str] = Form(None),image_list:List[UploadFile] = File(...),user_data_jwt:dict = Depends(get_current_user)):



    try:
        
        user_id = user_data_jwt["user_id"]
        device_id = user_data_jwt["device_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        if len(image_list) > 5:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "To many photos")



        user_data = await get_user_state(user_id)

        if user_data == {}:
            return {
                "message":"None"
            }

        await update_last_online(device_id)
        await refil_all_requests(user_id)



        chat_id = chat_id_form
        true_request = request_text if request_text is not None else ""


        if chat_id_form is None:
            chat_id:str = await create_chat(user_id)
        else:
            user_chats = await get_user_chats(user_id)
            
            if chat_id_form not in user_chats:
                return {
                    "message":"error"
                }


        user_model = await get_user_model_name(user_id)
        paid = has_paid_plan(user_data)
        # A model removed from the catalog (or by OpenRouter) falls back to Auto instead of failing.
        if user_model != "auto" and user_model not in (models + expensive_models + image_generation_models + video_generation_models) and user_model not in tts_models:
            user_model = "auto"
        # Free plan: PLUS models quietly fall back to Auto among the free models (older apps keep working).
        if not paid and user_model != "auto" and user_model not in FREE_MODELS:
            user_model = "auto"
        if user_model == "auto":
            user_model = await pick_auto_model(true_request or "", True, paid)



        expensive_full_models = image_generation_models + expensive_models + video_generation_models
        if user_model == "auto" and true_request == "":
            user_model = PAID_DEFAULT_MODEL if paid else FREE_DEFAULT_MODEL

        if user_model in tts_models:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Voice models don't accept images")

        if (user_model in image_generation_models or user_model in expensive_models) and user_data["nano_req"] <= 0:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesn`t have requests")

        credits = model_credits(user_model)
        if len(image_list) > plan_of(user_data).get("photos", 5):
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Too many photos for your plan")
        if (user_data["requests"] or 0) < credits and user_model not in expensive_full_models:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesn`t have requests")




        url_list = []
        image_base64_list = []
        image_bytes_sum = 0

        for image in image_list:
            
            image_bytes = await image.read(MAX_IMAGE_SIZE + 1)

            mime = magic.from_buffer(image_bytes[:8192], mime=True)
            if mime not in ALLOWED_IMAGE_CONTENT_TYPES:
                raise HTTPException(status_code=400, detail="Unsupported file type")

            if len(image_bytes) > MAX_IMAGE_SIZE:
                raise HTTPException(status_code=413, detail="Image too large")

            image_bytes_sum += len(image_bytes)

            if image_bytes_sum > 20 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Images too large")

            image_base64_list.append(
                base64.b64encode(image_bytes).decode("utf-8")
            )

            url = await AWS_CLIENT.upload_file(
                file_path=str(uuid.uuid4()) + ".jpg",
                file_data=image_bytes
            )
            url_list.append(url)

            del image_bytes



        # OLD VERSION
        #current_chat_messages = await get_chat_messages(chat_id)
        #decoded_messages = []
        #for message in current_chat_messages:
            #decoded_messages.append(decrypt(message))

       # message_history:str = "\n".join(decoded_messages)
        current_chat_messages = await get_chat_messages_2(
            chat_id = chat_id
        )

        user_facts = await get_user_fact(
            user_id = user_id
        )

        user_custom_gpt_promt = await get_user_custom_model_promt(
            user_id = user_id
        )

        promt = generate_main_promt(
            current_chat_messages = current_chat_messages,
            user_facts = user_facts,
            current_message = true_request,
            custom_model_prompt = user_custom_gpt_promt
        )
                
        

        if user_model in image_generation_models:

            user_nano_req = user_data["nano_req"]
            if user_nano_req <= 0:
               raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesn`t have requests")


            promt_for_image_model = generate_promt_for_image_models(
                request = true_request,
                current_chat_messages = current_chat_messages,
                custom_model_prompt = user_custom_gpt_promt
            )

            response = await ask_chat_gpt([promt_for_image_model,image_base64_list],user_model)



            if type(response) != bytes:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Error while generating")


            encrypted_message = encrypt(true_request,os.getenv("HASH_MESSAGES_KEY"))

            response_image_url = await AWS_CLIENT.upload_file(
                    file_path = str(uuid.uuid4()) + ".jpg",
                    file_data = response
                )

            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = None,
                image = url_list,
                image_response = None,
                model_name = user_model
            )

            await minus_one_req_nano(user_id)
            await update_chat_last_message_date(chat_id)
            
            
            try_streak_increase = await plus_one_streak_day(
                user_id = user_id
            )
            await write_record(user_id = user_id)

            if not try_streak_increase:
                await reset_streak(
                    user_id = user_id
                )

            return {
                "image":response_image_url
            } #  либо текст, либо url картинки

        if user_model in video_generation_models:
            # Videos have their own monthly credits (one video costs as much as ~30 premium answers).
            if (user_data.get("video_credits") or 0) <= 0:
               raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "No video credits")

            encrypted_message = encrypt(true_request,os.getenv("HASH_MESSAGES_KEY"))

            promt_for_video_model = gennerate_promt_for_video_generation(
                request = str(true_request),
                current_chat_messages = current_chat_messages,
                custom_model_prompt = user_custom_gpt_promt
            )

            task_id = str(uuid.uuid4())

            # The message is created first; the background job fills in the video URL (or an error) itself.
            message_id = await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = None,
                image = url_list,
                image_response = None,
                model_name = user_model
            )
            await create_video_task(id = task_id, user_id = user_id, prompt = str(true_request)[:2000])
            await minus_one_video(user_id)

            start_video_task(
                task_id = task_id,
                prompt = [promt_for_video_model,image_base64_list],
                model = user_model,
                message_id = message_id,
                user_id = user_id
            )
            await update_chat_last_message_date(chat_id)
            
            
            try_streak_increase = await plus_one_streak_day(
                user_id = user_id
            )
            await write_record(user_id = user_id)

            if not try_streak_increase:
                await reset_streak(
                    user_id = user_id
                )

            return {
                "video_task_id":task_id,
                "message_id" : message_id
            } #  либо текст, либо url картинк


        response = await ask_chat_gpt([promt,image_base64_list],user_model)

        if response in ["No image in response","Generation took to long. Try again.","Some error happened.","This model doesnt support image input"]:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Error while generating")

        if user_model in expensive_models:
            await minus_one_req_nano(user_id)
        else:
            await minus_requests(user_id, credits)


        encrypted_message = encrypt(true_request,os.getenv("HASH_MESSAGES_KEY"))

        encrypted_response = encrypt(response,os.getenv("HASH_MESSAGES_KEY"))

        await create_message(
            user_id = user_id,
            chat_id = chat_id,
            message = encrypted_message,
            response = encrypted_response,
            image =  url_list,
            model_name = user_model
        )
        await update_chat_last_message_date(chat_id)
        
        try_streak_increase = await plus_one_streak_day(
                user_id = user_id
            )
        await write_record(user_id = user_id)
        if not try_streak_increase:
            await reset_streak(
                user_id = user_id
            )

        return {
            "message":response
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

    finally:
        for image in image_list:
            await image.close()




@app.post("/get_user_chats")
@limiter.limit("20/minute")
async def get_user_chats_handler(request:Request,user_data:dict = Depends(get_current_user)):



    try:

        user_id = user_data["user_id"]
        device_id = user_data["device_id"]
        
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )

        user_chats = await get_chats_order(user_id)

        pinned_chats = await get_pinned_chats_order(
            user_id = user_id
        )# a list for pinned chats

        # so here is an algorithm that removes all the pinned chats from the user_chat array.
        # and then we add them back to fix the order
        # bc all the pinned chats shall go first
        # thats how it works
        if pinned_chats != []:
            for chat_id in user_chats:
                if chat_id in pinned_chats:
                    user_chats.remove(chat_id)
            user_chats = pinned_chats + user_chats
        
            




        if user_chats == []:
            return {}

        result = {}

        await update_last_online(device_id)

        # chat_id and its first message as in Veora app
        for chat_id in user_chats:
            chat_name = await get_chat_name(chat_id)
            if chat_name != "":
                result[chat_id] = chat_name
            else:
                result[chat_id] = await get_chat_first_message(chat_id)


        return result

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

class ChatId(BaseModel):
    chat_id :str

@app.post("/delete/chat")
@limiter.limit("20/minute")
async def delete_chat_handler(request:Request,req:ChatId,user_data:dict = Depends(get_current_user)):


    try:
        user_id = user_data["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
                
        user_chats = await get_user_chats(user_id)

        if req.chat_id not in user_chats:
            return {
                "message":"error"
            }


        chat_photos_url = await get_chat_messages_for_front_end(req.chat_id)

        # deleting from aws

        for message_context in chat_photos_url:
            if message_context["image_message"] is not None:
                for url in message_context["image_message"]:
                    await AWS_CLIENT.delete_file(url)
            if message_context["image_response"] is not None:
                await AWS_CLIENT.delete_file(message_context["image_response"])

        await delete_chat(user_id,req.chat_id)
        await delete_chat_messages(req.chat_id)

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

class RenameChat(BaseModel):
    chat_id:str
    new_name:str

@app.post("/chat/rename")
@limiter.limit("20/minute")
async def rename_chat_handler(
    request:Request,
    req:RenameChat,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        user_chats = await get_chats_order(user_data["user_id"])
        if req.chat_id not in user_chats:
            return {
                "message" : "error"
            }

        await update_chat_name(
            chat_id = req.chat_id,
            name = req.new_name
        )

        return {
            "message" : "ok"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.post("/get_chat_messages")
@limiter.limit("20/minute")
async def get_chat_messages_handler(request:Request,req:ChatId,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        user_chats = await get_user_chats(user_id)

        if req.chat_id not in user_chats:
            return {
                "message":"error"
            }

        result = await get_chat_messages_for_front_end(req.chat_id)
        return {
            "result":result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



class PinUnpinChat(BaseModel):
    chat_id:str
    pin_value:bool



@limiter.limit("20/minute")
@app.post("/chat/pin")
async def pin_unpin_chat_handler(request:Request,req:PinUnpinChat,user_data:dict = Depends(get_current_user)):
    
    try:
        user_id = user_data["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        user_chats = await get_user_chats(user_id)

        if req.chat_id not in user_chats:
            return {
                "message":"error"
            }

        await pin_unpin_chat(
            chat_id = req.chat_id,
            value = req.pin_value
        )
        return {
            "message" : "ok"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")




class ChooseModel(BaseModel):
    model_name:str

@app.post("/change_model")
@limiter.limit("20/minute")
async def change_model_handler(request:Request,req:ChooseModel,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        total_models = models + expensive_models + image_generation_models + video_generation_models + list(tts_models)
        if req.model_name not in total_models:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid model name")
        if req.model_name != "auto" and req.model_name not in FREE_MODELS and not has_paid_plan(await get_user_state(user_id)):
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Upgrade required")

        device_id = user_data["device_id"]
        await update_last_online(device_id)
        await change_user_model_name(user_id,req.model_name)
        return {
            "message":"Model changed"
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

@app.get("/get_model_name",dependencies = [Depends(safe_get)])
@limiter.limit("20/minute")
async def get_model_name_handler(request:Request,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        model_name = await get_user_model_name(user_id)
        return {
            "model_name":model_name
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



@app.post("/get_user_avatar_name")
@limiter.limit("20/minute")
async def get_user_avatar_name_handler(request:Request,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        result = await get_user_avatar_and_name(user_id)
        return result
    except HTTPException:
        raise
    except Exception:
         raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")




async def translate_google(text: str, target: str) -> str:
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": "auto",
        "tl": target,
        "dt": "t",
        "q": text,
    }

    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as response:
            data = await response.json()
            return "".join(chunk[0] for chunk in data[0] if chunk and chunk[0])

    return "Error while translating"



class TranslateText(BaseModel):
    text:str
    target_language:str

@app.post("/translate")
@limiter.limit("20/minute")
async def translate_handler(request:Request,req:TranslateText,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        result_text:str = await translate_google(req.text,req.target_language)

        return result_text

    except HTTPException:
        raise
    except Exception:
        logger.exception("TRANSLATION ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

#holowknight540@gmail.com


ALLOWED_IMAGE_CONTENT_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/heic",
    "image/heif",
    "image/avif",
]

@app.post("/change_avatar")
@limiter.limit("20/minute")
async def change_avatar_handler(request:Request,avatar:UploadFile = File(...),user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        file_bytes = await avatar.read(MAX_IMAGE_SIZE + 1)

        if len(file_bytes) > MAX_IMAGE_SIZE:
            raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Image too large"
                )


        mime = magic.from_buffer(file_bytes[:8192], mime=True)

        if mime not in ALLOWED_IMAGE_CONTENT_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsupported file type"
                )

        user_old_url = await get_user_profile_pict_url(user_data["user_id"])

        if user_old_url != "":
            await AWS_CLIENT.delete_file(user_old_url)


        ext = avatar.filename.split(".")[-1].lower()

        filename = f"{uuid.uuid4()}.{ext}"

        url = await AWS_CLIENT.upload_file(filename, file_bytes)

        await update_user_avatar(user_data["user_id"], url)

        del file_bytes

        return {
            "message":"Avatar changed"
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

try:
    REDIS_CLIENT = RedisClient(
        "localhost",
        6379
    )
except Exception as e:
    print("REDIS IS NOT CONNECTED")

@app.get("/get_or_write_model_stats",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def get_or_write_model_stats_handler(request:Request,user_data:dict = Depends(get_current_user)):

    models_count_dict = {}

    last_update_day = await get_date_last_update()

    today = datetime.now(timezone.utc)

    if last_update_day is not None and last_update_day >= today:
        result_stats = await get_models_stats()
        return {
            "stats":result_stats
        }

    try:

        for model in models:
            model_amount = await count_model_messages(model)
            models_count_dict[model] = model_amount

        await write_models_stats(models_count_dict)

        return {
            "stats" : models_count_dict
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

# --- STREAK ---

@app.get("/streak/get",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def get_user_streak_handler(request:Request,user_data:dict = Depends(get_current_user)):
    
    try:
        user_id = user_data["user_id"]
        
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        user_streak_data = await get_user_streak_data(
            user_id = user_data["user_id"]
        )
        if user_streak_data != {}:
            if user_streak_data["streak"] == 30:
                await subscribe(
                    user_id = user_data["user_id"],
                    sub_type = "starter"
                )
            
        return user_streak_data
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

@app.get("/streak/resume")
@limiter.limit("20/minute")
async def resume_streak_handler(request:Request,user_data:dict = Depends(get_current_user)):
    try:
        user_id = user_data["user_id"]
                
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        user_plan = await get_user_plan(user_id = user_id) or {}
        if any(user_plan.values()):
            if user_plan["starter_sub"] or user_plan["basic_sub"]:
                raise HTTPException(
                    status_code = status.HTTP_400_BAD_REQUEST,
                    detail = "Invalid subscribtion type"
                )
            await resume_streak(
                user_id = user_id
            )
            return {
                "message" : "Ok"
            }
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail = "Not subscribed"
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
    


class DeleteDevice(BaseModel):
    device_id:str

@app.post("/delete/device")
@limiter.limit("20/minute")
async def delete_device_api(request:Request,req:DeleteDevice,
                        user_data:dict = Depends(get_current_user)):


    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        user_devices = await get_user_devices(user_data["user_id"])
        seen:bool = False
        for device_data in user_devices:
            if device_data["device_id"] == req.device_id:
                seen = True

        if not seen:
            return {
                "message" : "error"
            }

        await delete_device(req.device_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

@app.get("/get/user/devices",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def get_user_devices_api(request:Request,
                           user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        user_devices = await get_user_devices(user_data["user_id"])
        return user_devices
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



class ChangeName(BaseModel):
    new_name:str

@app.post("/change/name")
@limiter.limit("20/minute")
async def change_name_handle(
        request:Request,
        req:ChangeName,
        user_data:dict = Depends(get_current_user)

):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        await change_name(
            user_id = user_data["user_id"],
            new_name = req.new_name
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

class CreateFolder(BaseModel):
    folder_name:str
    folder_tags:Optional[List] = []

@app.post("/folder/create")
@limiter.limit("20/minute")
async def create_folder_handler(
    request:Request,
    req:CreateFolder,
    user_data:dict = Depends(get_current_user)
):


    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        folder_id = await create_folder(
            user_id = user_data["user_id"],
            name = req.folder_name,
            tags = req.folder_tags
        )
        if folder_id == "":
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Error")

        return {
            "folder_id" : folder_id
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.get("/user/folders",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def get_user_folders_handler(
    request:Request,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        user_folders:List = await get_user_folders(
            user_id = user_data["user_id"]
        )

        return {
            "result" : user_folders
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


class FolderAddDeleteChat(BaseModel):
    chat_id:str
    folder_id:str

@app.post("/folder/add_or_delte/chat")
@limiter.limit("20/minute")
async def add_chat_to_folder_or_delete(
    request:Request,
    req:FolderAddDeleteChat,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        user_chats = await get_user_chats(
            user_data["user_id"]
        )

        user_folders = await get_user_folders(
            user_data["user_id"]
        )

        seen:bool = False

        for folder_data in user_folders:
            if folder_data["folder_id"] == req.folder_id:
                seen = True

        # folder_id == "" means "remove from folder", so there is no folder to own.
        if req.chat_id not in user_chats or (req.folder_id != "" and not seen):
            return {
                "message" : "error"
            }

        if req.folder_id == "":
            await delete_chat_from_folder(
                chat_id = req.chat_id
            )
            return

        await add_chat_to_folder(
            chat_id = req.chat_id,
            folder_id = req.folder_id
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


class FolderID(BaseModel):
    folder_id:str

@app.post("/folder/get/chats")
@limiter.limit("20/minute")
async def get_folder_chats_handler(
    request:Request,
    req:FolderID,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        user_folders = await get_user_folders(
            user_data["user_id"]
        )

        seen:bool = False

        for folder_data in user_folders:
            if folder_data["folder_id"] == req.folder_id:
                seen = True

        if not seen:
            return {
                "messsage" : "error"
            }

        folder_chats = await get_folder_chats(req.folder_id)

        return {
            "result" : folder_chats
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.post("/folder/delete")
@limiter.limit("20/minute")
async def delete_folder_handler(
    request:Request,
    req:FolderID,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
                
        user_folders = await get_user_folders(
            user_data["user_id"]
        )

        seen:bool = False

        for folder_data in user_folders:
            if folder_data["folder_id"] == req.folder_id:
                seen = True

        if not seen:
            return {
                "messsage" : "error"
            }

        await delete_folder_folder_core(
            folder_id = req.folder_id
        )

        await delete_folder(
            user_id = user_data["user_id"],
            folder_id = req.folder_id
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



class RenameFolder(BaseModel):
    folder_id:str
    name:str

@app.post("/folder/rename")
@limiter.limit("20/minute")
async def rename_folder_handler(
    request:Request,
    req:RenameFolder,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        user_folders = await get_user_folders(
            user_data["user_id"]
        )

        seen:bool = False

        for folder_data in user_folders:
            if folder_data["folder_id"] == req.folder_id:
                seen = True

        if not seen:
            return {
                "messsage" : "error"
            }


        await rename_folder(
            folder_id = req.folder_id,
            new_name = req.name
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

class AddRemoveTagFolder(BaseModel):
    folder_id:str
    tag:str

@app.post("/folder/tag/add")
@limiter.limit("20/minute")
async def add_tag_to_folder_handler(
    request:Request,
    req:AddRemoveTagFolder,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        user_folders = await get_user_folders(
            user_data["user_id"]
        )

        seen:bool = False

        for folder_data in user_folders:
            if folder_data["folder_id"] == req.folder_id:
                seen = True

        if not seen:
            return {
                "messsage" : "error"
            }

        await add_tag(req.folder_id,req.tag)
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

@app.post("/folder/tag/remove")
@limiter.limit("20/minute")
async def add_tag_to_folder_handler(
    request:Request,
    req:AddRemoveTagFolder,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        user_folders = await get_user_folders(
            user_data["user_id"]
        )

        seen:bool = False

        for folder_data in user_folders:
            if folder_data["folder_id"] == req.folder_id:
                seen = True

        if not seen:
            return {
                "messsage" : "error"
            }

        await remove_tag(req.folder_id,req.tag)
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")




# --- WIDGETS ---

@app.get("/models/get/stats/today",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def get_today_models_count_handler(
    request:Request,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
                
        total_models = expensive_models + models + image_generation_models + list(tts_models)
        models_count = {}

        for model in total_models:
            result = await get_today_models_usage(
                user_id = user_data["user_id"],
                model_name = model
            )
            models_count[model] = result


        return {
            "result" : models_count
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

@app.get("/models/get/stats/total",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def get_total_models_count_handler(
    request:Request,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        total_models = expensive_models + models + image_generation_models + list(tts_models)
        models_count = {}

        for model in total_models:
            result = await get_total_models_usage(
                user_id = user_data["user_id"],
                model_name = model
            )
            models_count[model] = result


        return {
            "result" : models_count
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



# --- IMPROVED MEMORY ---

@app.get("/facts/write")
@limiter.limit("20/minute")
async def write_user_fact_handler(
    request:Request,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        
        user_fact_test:str = await get_user_fact(
            user_id = user_data["user_id"]
        )
        if user_fact_test != "":
            return {
                "message" : "User already has some facts written"
            }
        
        user_facts = await gather_user_main_information(
            user_id = user_data["user_id"]
        )
        if user_facts == "":
            return {
                "message" : "Not enough chats"
            }

        user_summarized_fact = await summarize_user_message_history(
            message_history =  user_facts,
            client = client
        )


        try_create = await create_fact_data(
            user_id = user_data["user_id"],
            facts = user_summarized_fact
        )

        return {
            "message" : try_create
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.get("/fact/update")
@limiter.limit("20/minute")
async def update_user_fact_handler(
    request:Request,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        check_gather = await check_last_gather(
            user_id = user_data["user_id"]
        )
        if not check_gather:
            return {
                "message" : "Error (gather time)"
            }

        user_facts = await gather_user_main_information(
            user_id = user_data["user_id"]
        )
        if user_facts == "":
            return {
                "message" : "Not enough chats"
            }
        
        user_previous_fact:str = await get_user_fact(
            user_id = user_data["user_id"]
        )

        user_summarized_fact = await summarize_user_message_history(
            message_history =  user_facts,
            user_previous_fact = user_previous_fact,
            client = client
        )

        result = await update_user_fact(
            user_id = user_data["user_id"],
            fact = user_summarized_fact
        )

        return {
            "message" : result
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


# --- LINKS ---


@app.post("/share/create")
@limiter.limit("20/minute")
async def create_link_handler(
    request:Request,
    req:ChatId,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        user_chats = await get_user_chats(user_id)

        if req.chat_id not in user_chats:
            return {
                "message": "error"
            }


        link_id = await create_link(
            user_id = user_data["user_id"],
            chat_id = req.chat_id
        )
        if link_id != "":
            return {
                "link_id":link_id
            }

        return {
            "message" : "error"
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

@app.get("/share/{link_id}",dependencies=[Depends(safe_get)])
@limiter.limit("20/minute")
async def share_get_chat_by_link_handler(
    request:Request,
    link_id:str,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        chat_id = await get_chat_id_by_link(
            link_id = link_id
        )
        if chat_id == "":
            return {
                "message" : "Chat not found."
            }
        chat_messages = await get_chat_messages_for_front_end(
            chat_id = chat_id
        )
        if chat_messages == "":
            return {
                "message" : "Chat was deleted by the owner."
            }

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


class DeleteLink(BaseModel):
    link_id:str

@app.post("/share/delete")
@limiter.limit("20/minute")
async def delete_link_handler(
    request:Request,
    req:DeleteLink,
    user_data:dict = Depends(get_current_user)
):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        user_links = await get_user_links(
            user_id = user_data["user_id"]
        )

        str_links:List = []

        for link in user_links:
            str_links.append(str(link))
        

        if req.link_id not in str_links:
            return {
                "message" : "error"
            }
        await delete_link(
            link_id = req.link_id
        )
        return {
            "message" : "ok"
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


# --- CUSTOM GPT ---

class CreateCustomGPT(BaseModel):
    gpt_name:str
    gpt_promt:str

MAX_GPT_NAME = 60
MAX_GPT_PROMPT = 4000   # sent with every message, so it also bounds the cost per request
MAX_GPTS_PER_USER = 20


def check_gpt_fields(name:str | None, prompt:str | None):
    if name is not None and not (0 < len(name.strip()) <= MAX_GPT_NAME):
        raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid GPT name")
    if prompt is not None and not (0 < len(prompt.strip()) <= MAX_GPT_PROMPT):
        raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid GPT instructions")

@app.post("/custom_gpt/create")
@limiter.limit("20/minute")
async def create_custom_gpt_handler(request:Request,req:CreateCustomGPT,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        check_gpt_fields(req.gpt_name, req.gpt_promt)
        if len(await get_custom_gpts_ids(user_id = user_id)) >= MAX_GPTS_PER_USER:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "GPT limit")
        gpt_id = await create_custom_gpt(
            user_id = user_id,
            gpt_name = req.gpt_name,
            gpt_promt = req.gpt_promt
        )

        return {
            "status":"ok",
            "custom_gpt_id":gpt_id
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



@app.get("/custom_gpt/get")
@limiter.limit("20/minute")
async def get_user_custom_gpts_handler(request:Request,user_data:dict = Depends(get_current_user)):
    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )

        user_gpts = await get_user_custom_gpts(
            user_id = user_id
        )

        result = []

        for gpt in user_gpts:
            result.append({
                "gpt_id": gpt["gpt_id"],
                "gpt_promt": decrypt_gpt_field(gpt["gpt_promt"]),
                "gpt_name": decrypt_gpt_field(gpt["gpt_name"]),
            })

        selected = await get_user_gpt(user_id = user_id)
        return {
            "result" : result,
            # the GPT the next messages are answered with (None = regular assistant)
            "selected" : selected if any(g["gpt_id"] == selected for g in result) else None
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
    

class ChangeGptSettings(BaseModel):
    gpt_id:str
    gpt_name:Optional[str] = None
    gpt_promt:Optional[str] = None


@app.post("/custom_gpt/settings/change")
@limiter.limit("20/minute")
async def change_custom_gpt_setting(request:Request,req:ChangeGptSettings,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )

        user_gpt_ids = await get_custom_gpts_ids(
            user_id = user_id
        )

        if req.gpt_id not in user_gpt_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="GPT not found"
            )

        check_gpt_fields(req.gpt_name, req.gpt_promt)
        if req.gpt_name:
            await change_gpt_name(
                gpt_id = req.gpt_id,
                new_name = req.gpt_name,
            )
        if req.gpt_promt:
            await change_gpt_promt(
                gpt_id = req.gpt_id,
                new_promt = req.gpt_promt,
            )

        return {
            "message" : "ok"
        }
        
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
        


class GptID(BaseModel):
    gpt_id:str

@app.delete("/custom_gpt/delete")
@limiter.limit("20/minute")
async def delete_custom_gpt_handler(request:Request,req:GptID,user_data:dict = Depends(get_current_user)):

    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        user_gpt_ids = await get_custom_gpts_ids(
            user_id = user_id
        )

        if req.gpt_id not in user_gpt_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="GPT not found"
            )
        await delete_gpt(
            gpt_id = req.gpt_id
        )
        if await get_user_gpt(user_id = user_id) == req.gpt_id:
            await unselect_user_custom_gpt(user_id)
        return {
            "message" : "ok"
        }
        
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
        
@app.post("/custom_gpt/select")
@limiter.limit("20/minute") 
async def select_user_custom_gpt_handler(request:Request,req:GptID,user_data:dict = Depends(get_current_user)):
    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        user_gpt_ids = await get_custom_gpts_ids(
            user_id = user_id
        )

        if req.gpt_id not in user_gpt_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="GPT not found"
            )
        await select_user_custom_gpt(
            user_id = user_id,
            gpt_id = req.gpt_id
        )
        return {
            "message" : "ok"
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.post("/custom_gpt/unselect")
@limiter.limit("20/minute")
async def unselect_user_custom_gpt_handler(request:Request,user_data:dict = Depends(get_current_user)):
    try:
        user_id = user_data["user_id"]
        ban_info = await get_ban_info(
            user_id = user_id
        )
    
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )
        await unselect_user_custom_gpt(user_id = user_data["user_id"])
        return {"message" : "ok"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
}


async def transcribe_voice_to_text(file_data:bytes,file_format:str) -> str:
    audio_base64 = base64.b64encode(
        file_data
    ).decode("utf-8")

    payload = {
        "model": "openai/whisper-large-v3",
        "input_audio": {
            "data": audio_base64,
            "format": file_format
        }
    }

    headers = {
        "Authorization": f"Bearer {OPEN_AI_KEY}",
        "Content-Type": "application/json"
    }
    timeout = aiohttp.ClientTimeout(total=60)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            "https://openrouter.ai/api/v1/audio/transcriptions",
            json=payload,
            headers=headers
        ) as response:

            if response.status != 200:
                error = await response.text()
                raise Exception(
                    f"OpenRouter STT error: {error}"
                )

            data = await response.json()

            return data["text"]


MAX_AUDIO_SIZE = 15 * 1024 * 1024

@app.post("/voice_to_text")
@limiter.limit("20/minute")
async def voice_to_text(request:Request,user_data:dict = Depends(get_current_user),audio: UploadFile = File(...)):
    try:
        # Transcription is paid (Whisper), so it costs one regular request.
        user_id = user_data["user_id"]
        await refil_all_requests(user_id)
        user_state = await get_user_state(user_id)
        if not user_state or (user_state.get("requests") or 0) <= 0:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")

        file_data = await audio.read(MAX_AUDIO_SIZE + 1)
        if len(file_data) > MAX_AUDIO_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Audio file too large"
            )
        if not file_data:
            raise HTTPException(
                status_code=400,
                detail="Audio file is empty"
            )
        
        mime = magic.from_buffer(file_data[:8192], mime=True)

        if mime not in ALLOWED_AUDIO_CONTENT_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported audio format: {mime}"
            )

        
        file_format = ALLOWED_AUDIO_CONTENT_TYPES[mime]

        result_text = await transcribe_voice_to_text(
            file_data = file_data,
            file_format = file_format
        )
        await minus_one_req(user_id)
        return {
            "result" : result_text
        }
        
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
    
class PaySubStripe(BaseModel):
    sub_type:str

# Where Stripe Checkout sends the user back to (the web app shows a toast and refreshes the plan).
WEB_URL = os.getenv("WEB_URL", "https://web.nexi.center").rstrip("/")
PLAN_COLUMNS = {data["column"]: name for name, data in SUBSCRIPTIONS.items()}

_stripe_prices_cache:dict = {"at": 0.0, "data": None}


def _plain(obj):
    """Stripe SDK objects aren't dicts in stripe-python 13+ (no .get); turn them into plain data."""
    if hasattr(obj, "to_dict"):
        obj = obj.to_dict()
    if isinstance(obj, dict):
        return {k: _plain(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_plain(v) for v in obj]
    return obj

@app.get("/stripe/plans")
@limiter.limit("30/minute")
async def stripe_plans_handler(request:Request):
    """Plans with their live Stripe price, for the pricing UI. Cached for 10 minutes."""
    if _stripe_prices_cache["data"] is None or time.time() - _stripe_prices_cache["at"] > 600:
        plans = []
        for name, data in SUBSCRIPTIONS.items():
            try:
                price = _plain(await asyncio.to_thread(stripe.Price.retrieve, data["price_id"]))
                amount, currency = price["unit_amount"], price["currency"]
                interval = (price.get("recurring") or {}).get("interval")
            except Exception:
                logger.exception("STRIPE PRICE ERROR")
                amount, currency, interval = None, None, None
            plans.append({
                "id": name,
                "requests": data["requests"],
                "premium_requests": data["nano_req"],
                "videos": data.get("video", 0),
                "photos": data.get("photos", 5),
                "voices": data.get("voices_amount", 0),
                "amount": amount,          # in cents
                "currency": currency,
                "interval": interval,
            })
        plans.sort(key = lambda p: p["amount"] if p["amount"] is not None else 10**9)
        _stripe_prices_cache.update(at = time.time(), data = plans)
    return {"result": _stripe_prices_cache["data"]}


@app.post("/stripe/create/payment")
@limiter.limit("20/minute")
async def stripe_create_payment(req:PaySubStripe,request:Request,user_data:dict = Depends(get_current_user)):
    try:
        user_id = user_data["user_id"]
            
        ban_info = await get_ban_info(
                user_id = user_id
            )
        
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id
                )


        sub_data = SUBSCRIPTIONS.get(req.sub_type)
        if sub_data is None:
            raise HTTPException(
            status_code=400,
            detail="Invalid subscription plan"
        )

        # subscribe() refuses a second plan, so paying for one would charge without upgrading.
        user_plan = await get_user_plan(user_id = user_id) or {}
        if any(user_plan.values()):
            raise HTTPException(
                status_code = status.HTTP_400_BAD_REQUEST,
                detail = "Already subscribed"
            )

        metadata = {"user_id": user_id, "plan": req.sub_type}
        email = await get_user_email_by_user_id(user_id)
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode = "subscription",
            line_items = [{"price": sub_data["price_id"], "quantity": 1}],
            client_reference_id = user_id,
            customer_email = email or None,
            metadata = metadata,
            # Copied onto the subscription, so renewals and cancellations know the user and plan.
            subscription_data = {"metadata": metadata},
            allow_promotion_codes = True,
            success_url = f"{WEB_URL}/?checkout=success",
            cancel_url = f"{WEB_URL}/?checkout=cancel",
        )

        return {
            "payment_url": session.url
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
        


async def _find_stripe_customer(user_id:str) -> str | None:
    """The Stripe customer that holds this user's subscription (we don't store it in our DB yet).

    1. Customers with the user's email (Checkout gets customer_email). The list API is
       consistent right away, unlike Search, which can lag about a minute behind new objects.
    2. Fallback: subscriptions whose metadata has this user_id (Search API).
    """
    email = await get_user_email_by_user_id(user_id)
    if email:
        customers = _plain(await asyncio.to_thread(stripe.Customer.list, email = email, limit = 10))
        for customer in customers["data"]:
            subscriptions = _plain(await asyncio.to_thread(stripe.Subscription.list, customer = customer["id"], status = "all", limit = 5))
            if any(sub["status"] in ("active", "trialing", "past_due", "unpaid") for sub in subscriptions["data"]):
                return customer["id"]
    try:
        found = _plain(await asyncio.to_thread(stripe.Subscription.search, query = f"metadata['user_id']:'{user_id}'", limit = 1))
        if found["data"]:
            return found["data"][0]["customer"]
    except Exception:
        logger.exception("STRIPE SUBSCRIPTION SEARCH ERROR")
    return None


@app.post("/stripe/portal")
@limiter.limit("20/minute")
async def stripe_portal_handler(request:Request,user_data:dict = Depends(get_current_user)):
    """Stripe Customer Portal: the user cancels the plan or changes the card there."""
    try:
        user_id = user_data["user_id"]
        customer_id = await _find_stripe_customer(user_id)
        if customer_id is None:
            logger.warning("STRIPE PORTAL: no Stripe customer with a subscription for user %s", user_id)
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "No Stripe subscription")
        portal = await asyncio.to_thread(
            stripe.billing_portal.Session.create,
            customer = customer_id,
            return_url = f"{WEB_URL}/?portal=return",
        )
        return {"portal_url": portal.url}
    except HTTPException:
        raise
    except Exception:
        logger.exception("STRIPE PORTAL ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")


def _invoice_subscription_id(invoice:dict) -> str | None:
    # Newer Stripe API versions moved it under parent.subscription_details.
    return invoice.get("subscription") or (
        ((invoice.get("parent") or {}).get("subscription_details") or {}).get("subscription")
    )


async def _subscription_metadata(subscription_id:str) -> dict:
    subscription = _plain(await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id))
    return subscription.get("metadata") or {}


# No rate limit and no JWT: Stripe calls this directly and the signature check authenticates it.
@app.post("/stripe/webhook")
async def stripe_webhook(request:Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature")

    if not signature:
        raise HTTPException(status_code=400)

    try:
        stripe.Webhook.construct_event(
            payload,
            signature,
            STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400)

    # Verified above; work with plain JSON so the shape doesn't depend on the SDK version.
    event = json.loads(payload)
    event_type = event["type"]
    obj = event["data"]["object"]

    try:
        if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            # First payment: turn the plan on (async methods confirm in the second event).
            if obj.get("mode") == "subscription" and obj.get("payment_status") in ("paid", "no_payment_required"):
                metadata = obj.get("metadata") or {}
                ok = await subscribe(user_id = metadata["user_id"], sub_type = metadata["plan"])
                if not ok:
                    logger.warning("STRIPE: subscribe() refused for %s (%s)", metadata.get("user_id"), metadata.get("plan"))

        elif event_type == "invoice.paid":
            # Monthly renewal (the first invoice is handled by checkout.session.completed).
            subscription_id = _invoice_subscription_id(obj)
            if obj.get("billing_reason") == "subscription_cycle" and subscription_id:
                metadata = await _subscription_metadata(subscription_id)
                if metadata.get("user_id"):
                    await renew_sub(metadata["user_id"])

        elif event_type == "invoice.payment_failed":
            # Stripe retries the card; if it keeps failing the subscription is deleted (handled below).
            logger.warning("STRIPE: payment failed for subscription %s", _invoice_subscription_id(obj))

        elif event_type == "customer.subscription.deleted":
            # Canceled (or unpaid for too long): turn the plan off right away.
            metadata = obj.get("metadata") or {}
            if metadata.get("user_id") and metadata.get("plan"):
                await unsubscribe(metadata["user_id"], metadata["plan"], force = True)
    except Exception:
        # A 500 makes Stripe retry the event later.
        logger.exception("STRIPE WEBHOOK ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

    return {"ok": True}


VOICE_ENCODING_KEY = os.getenv("VOICE_ENCODING_KEY")



MAX_VOICE_NAME = 40

# Multipart upload: with a file in the request, name/agree must be form fields
# (a JSON body model can't be combined with File).
@app.post("/voice/create")
@limiter.limit("20/minute")
async def voice_create_handler(request:Request,name:str = Form(...),agree:bool = Form(...),transcript:Optional[str] = Form(None),user_data:dict = Depends(get_current_user),voice_file:UploadFile = File(...)):
    try:
        name = name.strip()
        if not name or len(name) > MAX_VOICE_NAME:
            raise HTTPException(
                status_code = status.HTTP_400_BAD_REQUEST,
                detail = "Invalid name"
            )
        user_id_for_check = user_data["user_id"]
                            
        ban_info = await get_ban_info(
                user_id = user_id_for_check
            )
        
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id_for_check
                )
        file_data = await voice_file.read(MAX_AUDIO_SIZE + 1)
        if len(file_data) > MAX_AUDIO_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Audio file too large"
            )
        if not file_data:
            raise HTTPException(
                status_code=400,
                detail="Audio file is empty"
            )
        
        mime = magic.from_buffer(file_data[:8192], mime=True)

        if mime not in ALLOWED_AUDIO_CONTENT_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported audio format: {mime}"
            )

        if not agree:
            raise HTTPException(
                status_code = status.HTTP_400_BAD_REQUEST,
                detail = "Agree is false"
            )

        user_plan:Dict = await get_user_plan(
            user_id = user_id_for_check
        )
        user_sub = None

        for plan in user_plan.keys():
            if user_plan[plan]:
                user_sub = plan

        if user_sub is not None:
            sub_name = user_sub.split("_")[0] # this is for the dict names in config.py
            if sub_name == "starter":
                raise HTTPException(
                    status_code = status.HTTP_400_BAD_REQUEST,
                    detail = "Invalid plan"
                )
            else:
                user_sub_details = SUBSCRIPTIONS.get(sub_name)
                sub_voice_limit = user_sub_details["voices_amount"]
                user_voices_amount:int = await get_user_voices_amount(user_id = user_id_for_check)
                if user_voices_amount >= sub_voice_limit:
                    raise HTTPException(
                        status_code = status.HTTP_400_BAD_REQUEST,
                        detail = "Limit error"
                    )
                    
        else:
            raise HTTPException(
                status_code = status.HTTP_400_BAD_REQUEST,
                detail = "Invalid plan"
            )
        
        file_format = ALLOWED_AUDIO_CONTENT_TYPES[mime]

        url = await AWS_CLIENT.upload_file(
            file_path = f"{uuid.uuid4()}.{file_format}",
            file_data = file_data,
            content_type = mime
        )

        # The transcript makes clones much closer to the original. The site sends the script that
        # was read aloud; for uploaded files we transcribe the sample with Whisper.
        transcript = (transcript or "").strip()[:2000] or None
        if transcript is None:
            try:
                transcript = (await transcribe_voice_to_text(file_data, file_format)).strip()[:2000] or None
            except Exception:
                logger.exception("VOICE TRANSCRIBE ERROR")

        encoded_url = encrypt(url,VOICE_ENCODING_KEY)
        encoded_name = encrypt(name,VOICE_ENCODING_KEY)
        voice_id = await create_voice(
            user_id = user_id_for_check,
            name = encoded_name,
            link = encoded_url,
            agree = True,
            transcript = encrypt(transcript,VOICE_ENCODING_KEY) if transcript else None
        )
        if voice_id is None:
            raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
        return {
            "voice_id" : voice_id
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


class VoiceId(BaseModel):
    voice_id:str

@app.delete("/voice/delete")
@limiter.limit("20/minute")
async def delete_voice_handler(request:Request,req:VoiceId,user_data:dict = Depends(get_current_user)):
    try:
        user_id_for_check = user_data["user_id"]                       
        ban_info = await get_ban_info(
                user_id = user_id_for_check
            )
        
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id_for_check
                )
        seen:bool = False
        sample_link = None
        eleven_voice_id = None
        user_voices = await get_user_voices(user_id = user_id_for_check) or []
        for user_voice in user_voices:
            if user_voice["voice_id"] == req.voice_id:
                seen = True
                sample_link = user_voice["link"]
                eleven_voice_id = user_voice.get("eleven_voice_id")

        if not seen:
            raise HTTPException(
                status_code = status.HTTP_400_BAD_REQUEST,
                detail = "Error"
            )
        await delete_voice(
            voice_id = req.voice_id
        )
        if sample_link:
            try:
                await AWS_CLIENT.delete_file(decrypt(sample_link,VOICE_ENCODING_KEY))
            except Exception:
                logger.exception("VOICE SAMPLE DELETE ERROR")
        if eleven_voice_id and ELEVENLABS_API_KEY:
            try:
                await eleven_delete_voice(eleven_voice_id)
            except Exception:
                logger.exception("ELEVENLABS VOICE DELETE ERROR")

        
        return {
            "message" : "Ok"
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.get("/voices/get")
@limiter.limit("20/minute")
async def get_user_voices_handler(request:Request,user_data:dict = Depends(get_current_user)):
    try:
        user_id_for_check = user_data["user_id"]                       
        ban_info = await get_ban_info(
                user_id = user_id_for_check
            )
        
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id_for_check
                )
        user_voices = await get_user_voices(user_id = user_id_for_check) or []
        for user_voice in user_voices:
            user_voice["link"] = decrypt(user_voice["link"],VOICE_ENCODING_KEY)
            user_voice["name"] = decrypt(user_voice["name"],VOICE_ENCODING_KEY)
            # internal: the transcript and the ElevenLabs id stay on the server
            user_voice.pop("transcript", None)
            user_voice.pop("eleven_voice_id", None)
        
        return {
            "result" : user_voices
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@app.get("/voices/models")
@limiter.limit("20/minute")
async def get_voice_models_handler(request:Request,user_data:dict = Depends(get_current_user)):
    """Models the user can pick for their own voices, in preference order."""
    default = pick_clone_model(None)
    return {
        "result": [
            {"id": key, "name": CLONE_MODELS[key]["name"], "note": CLONE_MODELS[key]["note"], "default": key == default}
            for key in CLONE_MODEL_PREFERENCE if clone_model_available(key)
        ]
    }


class RenameVoice(BaseModel):
    voice_id:str
    new_name:str

@app.post("/voice/rename")
@limiter.limit("20/minute")
async def rename_voice_handler(request:Request,req:RenameVoice,user_data:dict = Depends(get_current_user)):
    try:
        user_id_for_check = user_data["user_id"]                       
        ban_info = await get_ban_info(
                user_id = user_id_for_check
            )
        
        if ban_info is not None:
            if ban_info["unban_date"] > datetime.now().date():
                raise HTTPException(status_code = status.HTTP_403_FORBIDDEN,detail = "Access denied")
            else:
                await unban_user(
                    user_id = user_id_for_check
                )

        seen:bool = False
        user_voices = await get_user_voices(user_id = user_id_for_check) or []
        for user_voice in user_voices:
            if user_voice["voice_id"] == req.voice_id:
                seen = True

        if not seen:
            raise HTTPException(
                status_code = status.HTTP_400_BAD_REQUEST,
                detail = "Error"
            )
        encoded_new_name = encrypt(req.new_name,VOICE_ENCODING_KEY)

        await rename_voice(
            voice_id = req.voice_id,
            new_name = encoded_new_name
        )
        return {
            "message" : "Ok"
        }
        
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")





# --- RUN ---

if __name__ == "__main__":
    uvicorn.run(app,host = "127.0.0.1",port = 8080,proxy_headers=True)

from fastapi import APIRouter,Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile,Form
from pydantic import BaseModel,EmailStr
import uvicorn
import json
import hmac
import hashlib
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
from typing import Optional
import uuid
import logging
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from backend.database.devices_db.devices_core import create_new_device,update_device_token
from backend.database.main_database.main_core import create_user
from backend.database.ai_choose_db.ai_core import create_default_user_model_name
from backend.api.auth import create_access_token,create_refresh_token

logger = logging.getLogger(__name__)

load_dotenv()


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(
    prefix="/auth"
)


async def verify_signature(data: dict, rec_signature, x_timestamp: str) -> bool:
   
    if time.time() - int(x_timestamp) > 300:
        return False
    
   
    return await asyncio.to_thread(_sync_verify_signature, data, rec_signature)

def _sync_verify_signature(data: dict, rec_signature: str) -> bool:
   
    KEY = os.getenv("signature")
    data_to_verify = data.copy()
    data_to_verify.pop("signature", None)
    data_str = json.dumps(data_to_verify, sort_keys=True, separators=(',', ':'))
    expected = hmac.new(KEY.encode(), data_str.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(rec_signature, expected)


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

class AuthGoogle(BaseModel):
    device_id:Optional[str] = None
    device_name:Optional[str] = None
    id_token:str

@router.post("/google")
@limiter.limit("20/minute")
async def auth_google(
    request:Request,
    req:AuthGoogle,
    x_signature:str = Header(...),
    x_timestamp:str = Header(...)
):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    
    try:
        idinfo = id_token.verify_oauth2_token(
            req.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
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


    await create_default_user_model_name(
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
        
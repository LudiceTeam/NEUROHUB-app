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
import logging


logger = logging.getLogger(__name__)

load_dotenv()


OOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

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
    it_token:str

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
        pass
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        
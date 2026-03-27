from fastapi import Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from pydantic import BaseModel, HttpUrl
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
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from jose import jwt
from auth import create_access_token,create_refresh_token
from backend.database.main_database.main_core import create_user,subscribe_basic,subscribe_premium,unsub_func_premium,unsub_basic,is_user_subbed,refil_nano_requests,refil_normal_requests,get_user_req_amount_all_requests,minus_one_req,minus_one_req_nano,does_user_have_nano_requests,does_user_have_requests,is_user_subbed_basic,profile
from backend.database.jwt_database.jwt_core import create_refresh_token_db,get_user_refresh_token,update_refresh_token


logger = logging.getLogger(__name__)

load_dotenv()


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
app = FastAPI()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)
#app.add_middleware(HTTPSRedirectMiddleware)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
        
        if not await asyncio.to_thread(hmac.compare_digest, api, os.getenv("api")):
            raise HTTPException(status_code=401, detail="Invalid API key")
            
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid api key")


# --- ROUTES ---
@app.get("/")
async def main():
    return "NEUROHUB-API"


class AuthGoogle(BaseModel):
    id_token:str

@app.post("/auth/google")
@limiter.limit("20/minute")
async def auth_google_handler(request:Request,req:AuthGoogle,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not verify_signature(req.model_dump(),x_signature,x_timestamp):
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


    try_create_user = await create_user(
        name = name,
        email = email,
        provider_id = google_sub,
        provider = "google",
        avatar_url=picture
    )

    if not try_create_user:
        raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "User already exists")
    
    user_data = {
        "email":email,
        "name":name,
        "provider":"google"
    }

    acces_token:str = create_access_token(user_data)
    refresh_token:str = create_refresh_token(user_data)

    try_create_refresh = await create_refresh_token_db(email,refresh_token)

    if not try_create_refresh:
        await update_refresh_token(email,refresh_token)

    return {
        "access_token":acces_token,
        "refresh_token":refresh_token,
        "token_type":"bearer"
    }







# --- RUN -- 

if __name__ == "__main__":
    uvicorn.run(app,host = "0.0.0.0",port = 8080)


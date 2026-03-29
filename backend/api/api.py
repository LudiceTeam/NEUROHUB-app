from fastapi import Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from pydantic import BaseModel
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
from backend.api.auth import create_access_token,create_refresh_token
from backend.database.main_database.main_core import create_user,subscribe_basic,subscribe_premium,unsub_func_premium,unsub_basic,refil_nano_requests,refil_normal_requests,minus_one_req,minus_one_req_nano,profile,get_user_data_for_jwt
from backend.database.jwt_database.jwt_core import create_refresh_token_db,get_user_refresh_token,update_refresh_token
from backend.database.email_code_db.email_core import create_code,check_code
from backend.database.chats_database.chats_core import create_chat,delete_chat,get_user_chats
from backend.database.ai_choose_db.ai_core import create_default_user_model_name
import aiohttp
import random

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



    # default sql data
    await create_user(
        name = name,
        email = email,
        provider_id = google_sub,
        provider = "google",
        avatar_url=picture
    )

    await create_chat(
        email = email
    )

    await create_default_user_model_name(
        email = email
    )


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


async def send_email_code(email: str, code: str):
    url = "https://api.resend.com/emails"

    headers = {
        "Authorization": f"Bearer {os.getenv('EMAIL_API_KEY')}",
        "Content-Type": "application/json"
    }

    payload = {
        "from": os.getenv("EMAIL_FROM"),
        "to": [email],
        "subject": "NEUROHUB LOGIN ",
        "html": f"""
        <h2>You`re code: {code}</h2>
        <p>The code is valid for 2 minutes.</p>
        """
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status >= 400:
                text = await resp.text()
                raise Exception(f"Ошибка отправки: {text}")

class AuthWithEmail(BaseModel):
    email:str
    

@app.post("/send/code")
@limiter.limit("20/minute")
async def send_code(request:Request,req:AuthWithEmail,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")

    try:
        email_parts = req.email.split("@")
        if len(email_parts) != 2:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Incorrect email")
        
        code = random.randint(100000,999999)
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
    email:str
    code:int

@app.post("/check/code")
@limiter.limit("20/minute")
async def check_code_router(request:Request,req:Verify_Code,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
         raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")

    try:
        email_parts = req.email.split("@")
        if len(email_parts) != 2:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Incorrect email")

        check_result = await check_code(req.email,req.code)

        if not check_result:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid code")
        

        # default sql data

        await create_user(
            name = None,
            email = req.email,
            provider_id = None,
            provider = "email",
            avatar_url = None
        )

        await create_chat(
            email = req.email
        )

        await create_default_user_model_name(
            email = req.email
        )



        user_data = {
        "email":req.email,
        "name":email_parts[0],
        "provider":"email"
        }

        acces_token:str = create_access_token(user_data)
        refresh_token:str = create_refresh_token(user_data)

        try_create_refresh = await create_refresh_token_db(req.email,refresh_token)

        if not try_create_refresh:
            await update_refresh_token(req.email,refresh_token)

        return {
            "access_token":acces_token,
            "refresh_token":refresh_token,
            "token_type":"bearer"
        }
        

    except HTTPException:
        raise
    except Exception:
        logger.exception("API ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


@limiter.limit("20/minute")
@app.post("/refresh",dependencies=[Depends(safe_get)])
async def refresh_token_api(request:Request,refresh_token:str):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Invalid refresh token",
    )
    
    try:
        payload = jwt.decode(refresh_token, os.getenv("REFRESH_SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
        email: str = payload.get("email")
        
        
        if email is None:
            raise credentials_exception
        
        stored_token = await get_user_refresh_token(email)
        if stored_token != refresh_token:
            raise credentials_exception
        
        user_data = await get_user_data_for_jwt(email)
        if user_data == {} or not user_data.get("provider"):
            raise credentials_exception
                
    except JWTError:
        raise credentials_exception
    
    
    new_access_token = create_access_token(user_data)
    
    new_refresh_token = create_refresh_token(user_data)
    
    await update_refresh_token(email,new_refresh_token)
    
    
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }

async def get_current_user(token: str = Header(..., alias="Authorization")) -> str:
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
        
        email: str = payload.get("email")
        if email is None:
            raise credentials_exception
            
        return email
        
        
    except jwt.ExpiredSignatureError:
        # Токен истек - клиент должен использовать refresh
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exception
    



@app.post("/profile")
@limiter.limit("20/minute")
async def profile_hadnler(request:Request,email:str = Depends(get_current_user)):

    try:
        profile_dict = await profile(email)

        if profile_dict == {}:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,deatil = "User not found")

        return profile_dict
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



# --- RUN -- 

if __name__ == "__main__":
    uvicorn.run(app,host = "0.0.0.0",port = 8080)


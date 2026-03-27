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



class UserAuthData(BaseModel):
    id_token:str








# --- RUN -- 

if __name__ == "__main__":
    uvicorn.run(app,host = "0.0.0.0",port = 8080)


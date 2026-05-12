from fastapi import FastAPI,Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile,Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import json
import hmac
import hashlib
import asyncio
import os
from dotenv import load_dotenv
import time
import asyncio
from backend.database.main_database.main_core import subscribe_basic,subscribe_premium,unsub_basic,unsub_func_premium
import logging

load_dotenv()


logger = logging.getLogger(__name__)


admin_app = FastAPI()

admin_app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_methods=["POST", "OPTIONS"],
      allow_headers=["*"],
  )



async def verify_signature(data: dict, rec_signature, x_timestamp: str) -> bool:
   
    if time.time() - int(x_timestamp) > 300:
        return False
    
   
    return await asyncio.to_thread(_sync_verify_signature, data, rec_signature)

def _sync_verify_signature(data: dict, rec_signature: str) -> bool:

    KEY = os.getenv("ADMIN_SIGNATURE")
    data_to_verify = data.copy()
    data_to_verify.pop("signature", None)
    data_str = json.dumps(data_to_verify, sort_keys=True, separators=(',', ':'))
    expected = hmac.new(KEY.encode(), data_str.encode(), hashlib.sha256).hexdigest()
    print(f"KEY    : {KEY}")          
    print(f"DATA   : {data_str}")     
    print(f"EXPECT : {expected}")     
    print(f"GOT    : {rec_signature}") 
    return hmac.compare_digest(rec_signature, expected)




async def safe_get(req: Request):
    try:
        api = req.headers.get("X-API-ADMIN")
        if not api:
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        if not await asyncio.to_thread(hmac.compare_digest, api, os.getenv("X-API-KEY")):
            raise HTTPException(status_code=401, detail="Invalid API key")
        
    except HTTPException:
        raise      
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid api key")

class User(BaseModel):
    user_id:str
    sub:str

@admin_app.post("/sub/give")
async def subscribe_func(req:User,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
        if req.sub == "premium":
            result = await subscribe_premium(
                req.user_id
            )

            if not result:
                return {
                    "message" : "error"
                }
        elif req.sub == "basic":
            result = await subscribe_basic(
                req.user_id
            )

            if not result:
                return {
                    "message" : "error"
                }

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")



@admin_app.post("/sub/return")
async def unsub_func(req:User,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
        if req.sub == "premium":
            result = await subscribe_premium(
                req.user_id
            )

            if not result:
                return {
                    "message" : "error"
                }
        elif req.sub == "basic":
            result = await subscribe_basic(
                req.user_id
            )

            if not result:
                return {
                    "message" : "error"
                }

    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


    
if __name__ == "__main__":
    uvicorn.run(admin_app,host = "localhost",port = 8000)

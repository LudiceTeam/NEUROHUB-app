from fastapi import FastAPI,Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile,Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import json
import hmac
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
async def subscribe_func(req:User):
    
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
async def unsub_func(req:User):
    
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

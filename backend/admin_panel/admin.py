from fastapi import FastAPI,Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile,Form
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


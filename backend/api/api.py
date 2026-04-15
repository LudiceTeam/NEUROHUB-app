from fastapi import Depends,HTTPException,Request,FastAPI,Header,status,File,UploadFile,Form
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
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
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from backend.api.auth import create_access_token,create_refresh_token
from backend.database.main_database.main_core import create_user,subscribe_basic,subscribe_premium,unsub_func_premium,unsub_basic,minus_one_req,minus_one_req_nano,profile,get_user_data_for_jwt,get_user_state,get_user_email_by_user_id,get_user_avatar_and_name,renew_sub,refil_all_requests,update_user_avatar
from backend.database.jwt_database.jwt_core import create_refresh_token_db,get_user_refresh_token,update_refresh_token,delete_jwt_tokens
from backend.database.email_code_db.email_core import create_code,check_code
from backend.database.chats_database.chats_core import create_chat,delete_chat,get_user_chats
from backend.database.ai_choose_db.ai_core import create_default_user_model_name,get_user_model_name,change_user_model_name
from backend.database.messages_database.messages_core import create_message,get_chat_messages,get_chat_first_message,delete_chat_messages,get_chat_messages_for_front_end
from backend.database.apple_notification_log.apple_core import create_new_log,is_notification_exists
from backend.database.transaction_db.transaction_core import create_new_trasacrion,is_transaction_exists,get_user_by_original_transaction_id,update_transaction
from backend.database.rate_ai_database.rate_core import create_rate,count_model_rate,get_user_all_models_rate
from backend.api.psw_hash import encrypt,decrypt
import aiohttp
import random
from openai import AsyncOpenAI
import openai
from typing import List
import base64
from jose.exceptions import ExpiredSignatureError, JWTError
import uuid 
from appstoreserverlibrary.api_client import APIException
from appstoreserverlibrary.signed_data_verifier import SignedDataVerifier
from appstoreserverlibrary.models.Environment import Environment
from backend.api.apple_client import get_apple_api_client
from backend.api.s3_client import S3Client


logger = logging.getLogger(__name__)

load_dotenv()


AWS_CLIENT = S3Client(
    access_key=os.getenv("AWS_ACCESS_KEY"),
    secret_key=os.getenv("AWS_SECRET_KEY"),
    endpoint_url=f"https://s3.{os.getenv('AWS_REGION')}.amazonaws.com",
    bucket_name=os.getenv("BUCKET_NAME"),
    cloud_front_domain=os.getenv("CLOUD_FRONT_DOMAIN")
)


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
        
        if not await asyncio.to_thread(hmac.compare_digest, api, os.getenv("X-API-KEY")):
            raise HTTPException(status_code=401, detail="Invalid API key")
        
    except HTTPException:
        raise      
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
        "provider":"google"
    }

    acces_token:str = create_access_token(user_data)
    refresh_token:str = create_refresh_token(user_data)

    try_create_refresh = await create_refresh_token_db(user_id_main,refresh_token)

    if not try_create_refresh:
        await update_refresh_token(user_id_main,refresh_token)

    return {
        "user_id":user_id_main,
        "access_token":acces_token,
        "refresh_token":refresh_token,
        "token_type":"bearer"
    }


APPLE_ISSUER = os.getenv("APPLE_ISSUER")
APPLE_AUDIENCE = os.getenv("APPLE_AUDIENCE")


class AuthApple(BaseModel):
    identity_token:str
    
@app.post("/auth/apple")
@limiter.limit("20/minute")
async def auth_apple_handler(request:Request,req:AuthApple,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    async with aiohttp.ClientSession() as session:
        async with session.get(APPLE_AUDIENCE) as resp:
            json_data = resp.json()
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
    
    email_parts = email.split("@")
    
    
    if not apple_sub:
        raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail =  "Invalid payload")
    
    
    
    user_id_main = str(uuid.uuid4())
        
        
    user_id_try = await create_user(
        user_id = user_id_main,
        name = email_parts[0],
        email = req.email,
        provider_id = apple_sub,
        provider = "apple",
        avatar_url=None
    )
    
    if type(user_id_try) == str:
        user_id_main = user_id_try


    await create_default_user_model_name(
        user_id = user_id_main
    )


    user_data = {
        "user_id":user_id_main,
        "name":email_parts[0],
        "provider":"apple"
    }

    acces_token:str = create_access_token(user_data)
    refresh_token:str = create_refresh_token(user_data)

    try_create_refresh = await create_refresh_token_db(user_id_main,refresh_token)

    if not try_create_refresh:
        await update_refresh_token(user_id_main,refresh_token)

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
    "subject": "NEUROHUB Login Verification",
    "html": f"""
    <div style="font-family: Arial, sans-serif; background-color:#0f172a; padding:40px; color:#ffffff;">
        <div style="max-width:600px; margin:0 auto; background:#1e293b; border-radius:12px; padding:30px; text-align:center;">
            
            <h1 style="color:#38bdf8;">NEUROHUB</h1>
            
            <h2 style="margin-top:20px;">Login Verification</h2>
            
            <p style="color:#cbd5f5; font-size:16px;">
                We received a request to log in to your account.
                Please use the verification code below to proceed.
            </p>
            
            <div style="margin:30px 0;">
                <span style="
                    display:inline-block;
                    font-size:32px;
                    letter-spacing:8px;
                    padding:15px 25px;
                    background:#0ea5e9;
                    border-radius:10px;
                    color:#ffffff;
                    font-weight:bold;
                ">
                    {code}
                </span>
            </div>
            
            <p style="color:#94a3b8;">
                This code is valid for <b>2 minutes</b>.
            </p>

            <p style="margin-top:20px; color:#64748b; font-size:14px;">
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
    "subject": "Your NEUROHUB Subscription Has Ended",
    "html": f"""
    <div style="font-family: Arial, sans-serif; background-color:#020617; padding:40px; color:#ffffff;">
        <div style="max-width:650px; margin:0 auto; background:#0f172a; border-radius:16px; padding:35px;">
            
            <h1 style="text-align:center; color:#38bdf8;">NEUROHUB</h1>
            
            <h2 style="margin-top:25px; text-align:center;">Subscription Expired</h2>
            
            <p style="margin-top:20px; color:#cbd5f5; font-size:16px; line-height:1.6;">
                We wanted to let you know that your NEUROHUB subscription has officially come to an end.
            </p>
            
            <p style="color:#cbd5f5; font-size:16px; line-height:1.6;">
                We truly appreciate the time you spent with us. During your subscription, you had access to advanced AI tools,
                powerful features, and an enhanced experience designed to boost your productivity and creativity.
            </p>

            <p style="color:#cbd5f5; font-size:16px; line-height:1.6;">
                We hope NEUROHUB helped you achieve your goals, whether it was building projects, exploring new ideas,
                or simply making your workflow faster and smarter.
            </p>


            <p style="color:#94a3b8; font-size:15px; line-height:1.6;">
                If you wish to continue using premium features, you can renew your subscription at any time.
                We’ll be happy to have you back.
            </p>

            <p style="margin-top:25px; color:#64748b; font-size:14px;">
                Thank you for choosing NEUROHUB 💙
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
async def send_code(request:Request,req:AuthWithEmail,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")

    try:
        
        code = random.randint(100000,999999)
        try_create_code = await create_code(req.email,code)
        if not try_create_code:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Code already sent")
        

        # delete this
        print(code)


        await send_email_code(req.email,code)

    except HTTPException:
        raise
    except Exception:
        logger.exception("API ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

class Verify_Code(BaseModel):
    email:EmailStr
    code:int

@app.post("/check/code")
@limiter.limit("20/minute")
async def check_code_router(request:Request,req:Verify_Code,x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
         raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")

    try:
        email_parts = req.email.split("@")
        
        check_result = await check_code(req.email,req.code)

        if not check_result:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid code")
        

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


        await create_default_user_model_name(
            user_id = user_id_main
        )



        user_data = {
            "user_id":user_id_main,
            "name":email_parts[0],
            "provider":"email"
        }

        acces_token:str = create_access_token(user_data)
        refresh_token:str = create_refresh_token(user_data)

        try_create_refresh = await create_refresh_token_db(user_id_main,refresh_token)

        if not try_create_refresh:
            await update_refresh_token(user_id_main,refresh_token)

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
        
        
        if user_id is None:
            raise credentials_exception
        
        stored_token = await get_user_refresh_token(user_id)
        if stored_token != req.refresh_token:
            raise credentials_exception
        
        user_data = await get_user_data_for_jwt(user_id)
        if user_data == {} or not user_data.get("provider"):
            raise credentials_exception
                
    except JWTError:
        raise credentials_exception
    
    
    new_access_token = create_access_token(user_data)
    
    new_refresh_token = create_refresh_token(user_data)
    
    await update_refresh_token(user_id,new_refresh_token)
    
    
    return {
        "user_id":user_id,
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
        
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
            
        return user_id
        
        
    except ExpiredSignatureError:
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
async def profile_hadnler(request:Request,user_id:str = Depends(get_current_user)):

    try:
        await refil_all_requests(user_id)

        profile_dict = await profile(user_id)
        
        return profile_dict
    
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")





OPEN_AI_KEY = os.getenv("OPEN_AI")


client = AsyncOpenAI(
    api_key=OPEN_AI_KEY,
    base_url="https://openrouter.ai/api/v1",
    timeout=120.0,
    max_retries=2
)

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




        if user_model == "google/gemini-3-pro-image-preview":
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
            ]
        )
        
        result = response.choices[0].message.content.strip()
        if not result:
            return "No text result."
        
        return result
    
    except TimeoutError:
        return "Generation took to long. Try again."
    
    except openai.NotFoundError:
        return "This model doesnt support image input"
        
    except Exception as e:
        #print(f"OpenAI SDK error: {e}")
        logger.exception("OpenAI SDK error")
        return "Some error happened."


class AskText(BaseModel):
    chat_id:Optional[str] = None
    request:str

@app.post("/ask_text")
@limiter.limit("20/minute")
async def ask_text_handler(request:Request,req:AskText,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):

    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
        

    try:

        await refil_all_requests(user_id)

        
        chat_id = req.chat_id
        if req.chat_id is None:
            chat_id = await create_chat(user_id)

        user_data = await get_user_state(user_id)

        if user_data == {}:
            return {
                "message":"None"
            }



        current_chat_messages = await get_chat_messages(chat_id)
        decoded_messages = []
        for message in current_chat_messages:
            decoded_messages.append(decrypt(message))

        message_history:str = "\n".join(decoded_messages)

        promt = f"""
Ты — умный AI-ассистент внутри приложения. Твоя задача — помогать пользователю максимально точно, полезно и безопасно, учитывая контекст переписки.

====================
КОНТЕКСТ ПЕРЕПИСКИ:
{message_history}
====================

ТЕКУЩЕЕ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:
{str(req.request)}

====================
ПРАВИЛА РАБОТЫ:

1. КОНТЕКСТ:
- Всегда учитывай историю переписки.
- Не игнорируй прошлые сообщения, если они влияют на ответ.
- Поддерживай логическую последовательность диалога.

2. ЯЗЫК:
- Отвечай на том же языке, на котором написал пользователь.
- Если язык не очевиден — используй английский.
- Не смешивай языки без необходимости.

3. ТОЧНОСТЬ:
- Не выдумывай факты.
- Если не уверен — прямо скажи.
- Не придумывай несуществующие API, функции или данные.

4. ПОЛЕЗНОСТЬ:
- Давай чёткие, практичные ответы.
- Если это код — он должен быть рабочим.
- Если задача сложная — разбивай на шаги.

5. СТИЛЬ:
- Пиши понятно и по делу.
- Без лишней воды.
- Если пользователь просит кратко — отвечай кратко.


6. ОБРАБОТКА НЕОДНОЗНАЧНОСТИ:
- Если запрос неясен — задай уточняющий вопрос.
- Не делай предположений без основания.

7. БЕЗОПАСНОСТЬ:
- Не помогай с вредоносной или незаконной деятельностью.
- Если запрос подозрительный — мягко откажись.

====================

ЗАДАЧА:
Ответь на текущее сообщение пользователя максимально полезно, точно и с учётом контекста.

ОТВЕТ:
"""

        user_model = await get_user_model_name(user_id)
        if user_model == "google/gemini-3-pro-image-preview":

            user_nano_req = user_data["nano_req"]
            if user_nano_req <= 0:
               raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")


            encrypted_message = encrypt(req.request)

            response = await ask_chat_gpt(req.request,"google/gemini-3-pro-image-preview")
            
            if type(response) != bytes:
                return response
            

            url = await AWS_CLIENT.upload_file(
                file_path = str(uuid.uuid4()) + ".jpg",
                file_data = response
            )
            
            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = None,
                image_response = url
            )

            await minus_one_req_nano(user_id)    
            return {
                "image": url
            } #  либо текст, либо url картинки

        if not user_data["sub"]:
            if user_data["requests"] <= 0:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")


            response = await ask_chat_gpt(promt,user_model)

            if response in ["No image in response","Generation took to long. Try again.","Some error happened.","This model doesnt support image input"]:
                return response


            await minus_one_req(user_id)

            encrypted_message = encrypt(req.request)
            encrypted_response = encrypt(response)

            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = encrypted_response
            )

            return {
                "message":response
            }
        
        else:
            response = await ask_chat_gpt(promt,user_model)
            encrypted_message = encrypt(req.request)
            encrypted_response = encrypt(response)

            if response in ["No image in response","Generation took to long. Try again.","Some error happened.","This model doesnt support image input"]:
                return response

            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = encrypted_response
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
    request_text:Optional[str] = Form(...),image_list:List[UploadFile] = File(...),user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    
    data_to_verify = {
        "chat_id":chat_id_form,
        "request":request_text
    }

    if not await verify_signature(data_to_verify,x_signature,x_timestamp):
         raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")


    try:
        if len(image_list) > 7:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "To many photos")
        

        list_bytes_images = []
        image_base64_list = []
        image_bytes_sum = 0

        for image in image_list:
            if image.content_type not in ["image/jpeg", "image/png", "image/webp","image/jpg"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsupported file type"
                )
            
            image_bytes = await image.read()
            image_bytes_sum += len(image_bytes)

            if len(image_bytes) > MAX_IMAGE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Image too large"
                )
            
            base64_str = base64.b64encode(image_bytes).decode('utf-8')
            image_base64_list.append(base64_str)
            
            list_bytes_images.append(image_bytes)
        
        if image_bytes_sum > 20 * 1024 * 1024:
            raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Images too large"
                )
            

        await refil_all_requests(user_id)


        user_data = await get_user_state(user_id)

        chat_id = chat_id_form

        if chat_id_form is None:
            chat_id:str = await create_chat(user_id)
        
        if user_data == {}:
            return {
                "message":"None"
            }
        

        true_request = request_text if request_text is not None else ""

        current_chat_messages = await get_chat_messages(chat_id)
        decoded_messages = []
        for message in current_chat_messages:
            decoded_messages.append(decrypt(message))

        message_history:str = "\n".join(decoded_messages)

        promt = f"""
Ты — умный AI-ассистент внутри приложения. Твоя задача — помогать пользователю максимально точно, полезно и безопасно, учитывая контекст переписки.

====================
КОНТЕКСТ ПЕРЕПИСКИ:
{message_history}
====================

ТЕКУЩЕЕ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:
{true_request}

====================
ПРАВИЛА РАБОТЫ:

1. КОНТЕКСТ:
- Всегда учитывай историю переписки.
- Не игнорируй прошлые сообщения, если они влияют на ответ.
- Поддерживай логическую последовательность диалога.

2. ЯЗЫК:
- Отвечай на том же языке, на котором написал пользователь.
- Если язык не очевиден — используй английский.
- Не смешивай языки без необходимости.

3. ТОЧНОСТЬ:
- Не выдумывай факты.
- Если не уверен — прямо скажи.
- Не придумывай несуществующие API, функции или данные.

4. ПОЛЕЗНОСТЬ:
- Давай чёткие, практичные ответы.
- Если это код — он должен быть рабочим.
- Если задача сложная — разбивай на шаги.

5. СТИЛЬ:
- Пиши понятно и по делу.
- Без лишней воды.
- Если пользователь просит кратко — отвечай кратко.


6. ОБРАБОТКА НЕОДНОЗНАЧНОСТИ:
- Если запрос неясен — задай уточняющий вопрос.
- Не делай предположений без основания.

7. БЕЗОПАСНОСТЬ:
- Не помогай с вредоносной или незаконной деятельностью.
- Если запрос подозрительный — мягко откажись.

====================

ЗАДАЧА:
Ответь на текущее сообщение пользователя максимально полезно, точно и с учётом контекста.

ОТВЕТ:
"""
        user_model = await get_user_model_name(user_id)
        if user_model == "google/gemini-3-pro-image-preview":

            user_nano_req = user_data["nano_req"]
            if user_nano_req <= 0:
               raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")


            response = await ask_chat_gpt([request_text,image_base64_list],"google/gemini-3-pro-image-preview")



            if type(response) != bytes:
                return response
            

            encrypted_message = encrypt(request_text)



            url_list = []

            for image_bytes in list_bytes_images:
                url = await AWS_CLIENT.upload_file(
                    file_path = str(uuid.uuid4()) + ".jpg",
                    file_data = image_bytes
                )
                url_list.append(url)
            
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
                image_response = response_image_url
            )

            await minus_one_req_nano(user_id)   


            return {
                "image":response_image_url
            } #  либо текст, либо url картинки
        


        if not user_data["sub"]:
            if user_data["requests"] <= 0:
                raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Doesnt have requests")


            response = await ask_chat_gpt([promt,image_base64_list],user_model)

            if response in ["No image in response","Generation took to long. Try again.","Some error happened.","This model doesnt support image input"]:
                return response
            

            await minus_one_req(user_id)


            encrypted_message = encrypt(request_text)

            encrypted_response = encrypt(response)

            url_list = []

            for image_bytes in list_bytes_images:
                url = await AWS_CLIENT.upload_file(
                    file_path = str(uuid.uuid4()) + ".jpg",
                    file_data = image_bytes
                )
                url_list.append(url)

            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = encrypted_response,
                image =  url_list
            )

            return {
                "message":response
            }
        else:
            response = await ask_chat_gpt([promt,image_base64_list],user_model)
            encrypted_message = encrypt(request_text)
            encrypted_response = encrypt(response)


            if response in ["No image in response","Generation took to long. Try again.","Some error happened.","This model doesnt support image input"]:
                return response
            
            url_list = []

            for image_bytes in list_bytes_images:
                url = await AWS_CLIENT.upload_file(
                    file_path = str(uuid.uuid4()) + ".jpg",
                    file_data = image_bytes
                )
                url_list.append(url)

            await create_message(
                user_id = user_id,
                chat_id = chat_id,
                message = encrypted_message,
                response = encrypted_response,
                image = url_list
            )

            return {
                "message":response
            }
        
    except HTTPException:
        raise

    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")

@app.post("/get_user_chats")
@limiter.limit("20/minute")
async def get_user_chats_handler(request:Request,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    data_to_verify = {
        "user_id":user_id
    }

    if not await verify_signature(data_to_verify,x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")


    try:
        user_chats = await get_user_chats(user_id)

        if user_chats == []:
            return {}

        result = {}
        
        # chat_id and its first message as in ChatGPT app
        for chat_id in user_chats:
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
async def delete_chat_handler(request:Request,req:ChatId,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
        await delete_chat(req.chat_id)
        await delete_chat_messages(req.chat_id)

        # deleting from aws
        chat_photos_url = await get_chat_messages_for_front_end(req.chat_id)

        for message_context in chat_photos_url:
            if message_context["image_message"] is not None:
                for url in message_context["image_message"]:
                    await AWS_CLIENT.delete_file(url)
            if message_context["image_response"] is not None:
                await AWS_CLIENT.delete_file(message_context["image_response"])
        
    except HTTPException:
        raise 
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
    
@app.post("/get_chat_messages")
@limiter.limit("20/minute")
async def get_chat_messages_handler(request:Request,req:ChatId,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
        result = await get_chat_messages_for_front_end(req.chat_id)
        return {
            "result":result
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
async def change_model_handler(request:Request,req:ChooseModel,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:

        models = [
            "google/gemini-3-flash-preview",
            "google/gemini-2.5-flash",
            "openai/gpt-5.4-mini",
            "openai/gpt-4o",
            "openai/gpt-4o-mini",
            "google/gemma-4-26b-a4b-it",
            "anthropic/claude-opus-4.6",
            "anthropic/claude-sonnet-4.6",
            "mistralai/mistral-large",
            "deepseek/deepseek-chat",
            "google/gemini-3-pro-image-preview",
        ]   

        if req.model_name not in models:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid model name")
        

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
async def get_model_name_handler(request:Request,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature({"user_id":user_id},x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
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
async def get_user_avatar_name_handler(request:Request,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature({"user_id":user_id},x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
        result = await get_user_avatar_and_name(user_id)
        return result
    except HTTPException:
        raise
    except Exception:
         raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
        


# --- SUBSCRIBTION ---

def build_verifier() -> SignedDataVerifier:
    env_name = os.getenv("APPLE_ENV", "sandbox").lower()
    environment = Environment.SANDBOX if env_name == "sandbox" else Environment.PRODUCTION

    # В реале сюда передаются Apple root certificates
    # Ниже каркас, чтобы показать архитектуру
    return SignedDataVerifier(
        root_certificates=[],
        enable_online_checks=True,
        environment=environment,
        bundle_id=os.getenv("APPLE_BUNDLE_ID"),
        app_apple_id=int(os.getenv("APPLE_APP_ID", "0")) if environment == Environment.PRODUCTION else None,
    )

class Validate(BaseModel):
    transaction_id:str
    product_id:str

@app.post("/billing/apple/validate")
@limiter.limit("20/minute")
async def apple_validate(request:Request,req:Validate,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):

    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    try:
        client = get_apple_api_client()
        verifier = build_verifier()

        try:
            response = client.get_transaction_info(req.transaction_id)
        except APIException as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Apple API error: {str(e)}"
            )
        
        signed_transaction_info = response.signedTransactionInfo
        if not signed_transaction_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No signedTransactionInfo returned by Apple"
            )
        
        try:
            decoded_tx = verifier.verify_and_decode_signed_transaction(signed_transaction_info)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid Apple signed transaction: {str(e)}"
            )

        # decoded_tx содержит данные покупки
        product_id = decoded_tx.productId
        transaction_id = decoded_tx.transactionId
        original_transaction_id = decoded_tx.originalTransactionId
        expires_date = getattr(decoded_tx, "expiresDate", None)
        bundle_id = decoded_tx.bundleId


    
        if bundle_id != os.getenv("APPLE_BUNDLE_ID"):
            raise HTTPException(status_code=400, detail="Wrong bundle_id")
        

        if req.product_id != "neurohub_premium" and req.product_id != "neurohub_basic":
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Invalid product id")
        
        if req.product_id != product_id:
            raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST,detail = "Product id mismatch")

        if await is_transaction_exists(transaction_id):
            return {"ok": True, "duplicate": True}
        


        try_new_tr:bool = await create_new_trasacrion(
            transaction_id = transaction_id,
            original_transaction_id = original_transaction_id,
            user_id = user_id,
            product_id = product_id,
            expires_date = expires_date,
            raw_payload = signed_transaction_info
        )


        if not try_new_tr:
            raise HTTPException(status_code = status.HTTP_409_CONFLICT,detail = "Transaction already exists")

        sub_type = "premium" if req.product_id == "neurohub_premium" else "basic"

        if sub_type == "premium":
            result = await subscribe_premium(user_id)

            if not result:
                raise HTTPException(status_code = status.HTTP_409_CONFLICT,detail = "Error while purchasing")
            
        
        elif sub_type == "basic":
            result = await subscribe_basic(user_id)
            if not result:
                raise HTTPException(status_code = status.HTTP_409_CONFLICT,detail = "Error while purchasing")
        
        
        return {
            "ok": True,
            "user_id": user_id,
            "product_id": product_id,
            "transaction_id": transaction_id,
            "original_transaction_id": original_transaction_id,
            "expires_date": expires_date,
        }




    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
    

class AppleNotificationRequest(BaseModel):
    signedPayload:str

@app.post("/webhook/apple/notification")
async def apple_notification(req:AppleNotificationRequest):

    verifier = build_verifier()

    try:
        decoded_notification = verifier.verify_and_decode_notification(req.signedPayload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid signedPayload: {str(e)}"
        )

    notification_type = decoded_notification.notificationType
    subtype = decoded_notification.subtype
    data = decoded_notification.data

    # Внутри data обычно есть ещё signedTransactionInfo и/или signedRenewalInfo
    signed_transaction_info = getattr(data, "signedTransactionInfo", None)
    signed_renewal_info = getattr(data, "signedRenewalInfo", None)

    # 1. вытащить notificationUUID
    notification_uuid = getattr(decoded_notification, "notificationUUID", None)

    if await is_notification_exists(notification_uuid):
        return {"ok": True, "duplicate": True}
    


    
    await create_new_log(
        notification_type = notification_type,
        notification_id= notification_uuid,
        subtype = subtype,
        raw_payload = req.signedPayload
    )

    if signed_transaction_info:
        try:
            decoded_tx = verifier.verify_and_decode_signed_transaction(signed_transaction_info)
            transaction_id = decoded_tx.transactionId
            original_transaction_id = decoded_tx.originalTransactionId
            product_id = decoded_tx.productId
            expires_date = getattr(decoded_tx, "expiresDate", None)

            user_id = await get_user_by_original_transaction_id(original_transaction_id)

            if user_id != "":

                if notification_type in ["SUBSCRIBED", "DID_RENEW"]:
                    await renew_sub(user_id)
                    await update_transaction(
                        transaction_id=transaction_id,
                        original_transaction_id=original_transaction_id,
                        product_id=product_id,
                        expires_date=expires_date
                    )

                elif notification_type in ["EXPIRED", "REFUND", "REVOKE"]:
                        email = await get_user_email_by_user_id(user_id)
                        if product_id == "neurohub_premium":
                            await unsub_func_premium(user_id)

                            
                        elif product_id == "neurohub_basic":
                            await unsub_basic(user_id)


                        await update_transaction(
                            transaction_id=transaction_id,
                            original_transaction_id=original_transaction_id,
                            product_id=product_id,
                            expires_date=expires_date
                        )


                        if email != "":
                            await send_email_sub_over(email)


        except Exception:
            raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")


    return {
        "ok": True,
        "notification_type": notification_type,
        "subtype": subtype,
        "notification_uuid": notification_uuid,
        "has_signed_transaction_info": bool(signed_transaction_info),
        "has_signed_renewal_info": bool(signed_renewal_info),
    }


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
async def translate_handler(request:Request,req:TranslateText,user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    if not await verify_signature(req.model_dump(),x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
        result_text:str = await translate_google(req.text,req.target_language)

        return result_text
    
    except HTTPException:
        raise
    except Exception:
        logger.exception("TRANSLATION ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
        
#holowknight540@gmail.com

@app.post("/change_avatar")
@limiter.limit("20/minute")
async def change_avatar_handler(request:Request,avatar:UploadFile = File(...),user_id:str = Depends(get_current_user),x_signature:str = Header(...),x_timestamp:str = Header(...)):
    data_to_verify = {
        "filename":avatar.filename,
        "content_type":avatar.content_type,
        "user_id":user_id
    }
    if not await verify_signature(data_to_verify,x_signature,x_timestamp):
        raise HTTPException(status_code = status.HTTP_401_UNAUTHORIZED,detail = "Invalid signature")
    
    try:
        file_bytes = await avatar.read()

        if len(file_bytes) > MAX_IMAGE_SIZE:
            raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Image too large"
                )

        if avatar.content_type not in ["image/jpeg", "image/png", "image/webp","image/jpg"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsupported file type"
                )
        

        url = await AWS_CLIENT.upload_file(str(uuid.uuid4()) + ".jpg", file_bytes)

        await update_user_avatar(user_id, url)

        return {
            "message":"Avatar changed"
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("ERROR")
        raise HTTPException(status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,detail = "Server error")
    

# --- RUN -- 

if __name__ == "__main__":
    uvicorn.run(app,host = "0.0.0.0",port = 8080)


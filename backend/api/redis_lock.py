from fastapi import HTTPException, status
import redis.asyncio as redis

r = redis.Redis(host="localhost", port=6379, decode_responses=True)

MAX_ATTEMPTS = 3
LOCK_SECONDS = 120


async def check_login_limit(email: str):
    lock_key = f"login_lock:{email}"
    
    ttl = await r.ttl(lock_key)
    if ttl > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Try again in {ttl} seconds"
        )


async def register_failed_login(email: str):
    attempts_key = f"login_attempts:{email}"
    lock_key = f"login_lock:{email}"

    attempts = await r.incr(attempts_key)

    if attempts == 1:
        await r.expire(attempts_key, LOCK_SECONDS)

    if attempts >= MAX_ATTEMPTS:
        await r.set(lock_key, "1", ex=LOCK_SECONDS)
        await r.delete(attempts_key)

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again in 2 minutes"
        )

async def reset_login_limit(email: str):
    await r.delete(f"login_attempts:{email}")
    await r.delete(f"login_lock:{email}")
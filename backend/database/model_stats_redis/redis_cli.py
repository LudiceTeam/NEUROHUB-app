import redis.asyncio as redis
from datetime import datetime

USAGE_KEY = "models:usage"
LAST_UPDATE_KEY = "models:last_update"

class RedisClient:
    def __init__(self, host: str, port: int):
        self.redis = redis.Redis(
            host=host,
            port=port,
            decode_responses=True
        )

    async def set_models_count(self, models_data: dict[str, int]) -> bool:
        today = datetime.now().date().isoformat()

        last_update = await self.redis.get(LAST_UPDATE_KEY)

        if last_update is not None and last_update >=  today:
            return False

        pipe = self.redis.pipeline()

        pipe.delete(USAGE_KEY)

        for model_name, amount in models_data.items():
            pipe.hset(USAGE_KEY, model_name, amount)

        pipe.set(LAST_UPDATE_KEY, today)

        await pipe.execute()
        return True

    async def get_stats(self) -> dict:
        data = await self.redis.hgetall(USAGE_KEY)
        last_update = await self.redis.get(LAST_UPDATE_KEY)

        return {
            "last_update": last_update,
            "models": {k: int(v) for k, v in data.items()}
        }

    async def get_last_date_update(self) -> str | None:
        last_update = await self.redis.get(LAST_UPDATE_KEY)
        return last_update

        

    


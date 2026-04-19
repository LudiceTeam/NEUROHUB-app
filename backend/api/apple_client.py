import os
import aiofiles

from appstoreserverlibrary.api_client import AppStoreServerAPIClient, APIException
from appstoreserverlibrary.models.Environment import Environment

_client: AppStoreServerAPIClient | None = None

async def get_apple_api_client() -> AppStoreServerAPIClient:
    global _client
    if _client is not None:
        return _client

    key_path = os.getenv("APPLE_PRIVATE_KEY_PATH", "")
    issuer_id = os.getenv("APPLE_ISSUER_ID")
    key_id = os.getenv("APPLE_KEY_ID")
    bundle_id = os.getenv("APPLE_BUNDLE_ID")
    env_name = os.getenv("APPLE_ENV", "sandbox").lower()

    if not os.path.isabs(key_path):
        key_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), key_path)

    async with aiofiles.open(key_path, "rb") as f:
        signing_key = await f.read()

    environment = Environment.SANDBOX if env_name == "sandbox" else Environment.PRODUCTION

    _client = AppStoreServerAPIClient(
        signing_key=signing_key,
        key_id=key_id,
        issuer_id=issuer_id,
        bundle_id=bundle_id,
        environment=environment,
    )
    return _client

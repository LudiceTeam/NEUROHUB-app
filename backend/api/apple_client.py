import os
from functools import lru_cache

from appstoreserverlibrary.api_client import AppStoreServerAPIClient, APIException
from appstoreserverlibrary.models.Environment import Environment

@lru_cache(maxsize=1)
def get_apple_api_client() -> AppStoreServerAPIClient:
    key_path = os.getenv("APPLE_PRIVATE_KEY_PATH")
    issuer_id = os.getenv("APPLE_ISSUER_ID")
    key_id = os.getenv("APPLE_KEY_ID")
    bundle_id = os.getenv("APPLE_BUNDLE_ID")
    env_name = os.getenv("APPLE_ENV", "sandbox").lower()

    with open(key_path, "rb") as f:
        signing_key = f.read()

    environment = Environment.SANDBOX if env_name == "sandbox" else Environment.PRODUCTION

    client = AppStoreServerAPIClient(
        signing_key=signing_key,
        key_id=key_id,
        issuer_id=issuer_id,
        bundle_id=bundle_id,
        environment=environment,
    )
    return client
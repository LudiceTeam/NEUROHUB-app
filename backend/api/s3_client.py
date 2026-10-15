from aiobotocore.session import get_session
from botocore.config import Config
from botocore.session import get_session as get_sync_session
from contextlib import asynccontextmanager
from urllib.parse import urlsplit
import threading
import time
import magic


# Files are private: the database keeps object keys, and clients get presigned GET links.
SIGN_TTL = 6 * 3600        # how long a link handed to a client works
SIGN_REUSE = 3600          # the same link is reused for an hour, so browsers can cache the file
EXTERNAL_TTL = 15 * 60     # links for OpenRouter / ElevenLabs, only for the duration of a request
_MAX_CACHED = 20000

# Hosts whose links point into our storage (old rows keep full CloudFront / R2 URLs).
OUR_HOST_SUFFIXES = (".cloudfront.net", ".r2.dev", ".r2.cloudflarestorage.com")


class S3Client():

    def __init__(self,access_key:str,
                 secret_key:str,
                 endpoint_url:str,
                 bucket_name:str,
                 own_hosts:tuple = ()):

        self.config = {
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "endpoint_url": endpoint_url,
            "region_name": "auto",
            "config": Config(signature_version = "s3v4", s3 = {"addressing_style": "path"}),
        }
        self.bucket_name = bucket_name
        self.own_hosts = {h for h in own_hosts if h}
        self.session = get_session()
        # Presigning is pure computation, so a plain botocore client is enough (and cheap to reuse).
        self._signer = get_sync_session().create_client("s3", **self.config)
        self._cache:dict = {}          # key -> (url, signed_at)
        self._lock = threading.Lock()

    @asynccontextmanager
    async def get_client(self):
        async with self.session.create_client("s3", **self.config) as client:
            yield client

    def key_of(self, value:str | None) -> str | None:
        """Object key for a stored value: a bare key, or an old full URL into our storage.
        Returns None for anything that isn't ours (Google avatars, data: URLs, empty values)."""
        if not value or value.startswith(("data:", "blob:")):
            return None
        if "://" not in value:
            return value.lstrip("/")
        parts = urlsplit(value)
        host = (parts.hostname or "").lower()
        if host not in self.own_hosts and not host.endswith(OUR_HOST_SUFFIXES):
            return None
        path = parts.path.lstrip("/")
        # Path-style R2 links carry the bucket name first.
        if host.endswith(".r2.cloudflarestorage.com") and path.startswith(f"{self.bucket_name}/"):
            path = path[len(self.bucket_name) + 1:]
        return path or None

    def sign(self, value:str | None, expires:int = SIGN_TTL, cache:bool = True) -> str | None:
        """Temporary GET link for a stored file; foreign URLs are returned unchanged."""
        if not value:
            return value
        key = self.key_of(value)
        if key is None:
            return value
        now = time.time()
        if cache:
            hit = self._cache.get(key)
            if hit and now - hit[1] < SIGN_REUSE:
                return hit[0]
        url = self._signer.generate_presigned_url(
            "get_object",
            Params = {"Bucket": self.bucket_name, "Key": key},
            ExpiresIn = expires,
        )
        if cache:
            with self._lock:
                if len(self._cache) >= _MAX_CACHED:
                    stale = [k for k, (_, at) in self._cache.items() if now - at >= SIGN_REUSE]
                    for k in stale or list(self._cache)[: _MAX_CACHED // 2]:
                        self._cache.pop(k, None)
                self._cache[key] = (url, now)
        return url

    def sign_external(self, value:str | None) -> str | None:
        """Short-lived link for a third-party service that has to fetch the file."""
        return self.sign(value, expires = EXTERNAL_TTL, cache = False)

    async def upload_file(self,file_path:str,file_data:bytes,content_type:str | None = None) -> str:
        """Uploads a private object and returns its key (store the key, sign it when sending it out)."""
        object_name = file_path.split("/")[-1]
        if not content_type:
            content_type = magic.from_buffer(file_data[:4096], mime = True) or "application/octet-stream"

        async with self.get_client() as client:
            await client.put_object(Bucket=self.bucket_name, Key=object_name, Body=file_data, ContentType=content_type)

        return object_name

    async def delete_file(self,file_path:str):
        object_name = self.key_of(file_path)
        if object_name is None:
            return
        self._cache.pop(object_name, None)

        async with self.get_client() as client:
            await client.delete_object(Bucket=self.bucket_name, Key=object_name)

from aiobotocore.session import get_session
from contextlib import asynccontextmanager

class S3Client():
    
    def __init__(self,access_key:str,
                 secret_key:str,
                 endpoint_url:str,
                 bucket_name:str,
                 cloud_front_domain:str):
        
        self.config = {
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "endpoint_url": endpoint_url
        }
        self.cloud_front_domain = cloud_front_domain

        self.bucket_name = bucket_name
        self.session = get_session()
    
    @asynccontextmanager
    async def get_client(self):
        async with self.session.create_client("s3", **self.config) as client:
            yield client

    async def upload_file(self,file_path:str,file_data:bytes) -> str:

        object_name = file_path.split("/")[-1]

        async with self.get_client() as client:
                await client.put_object(Bucket=self.bucket_name, Key=object_name, Body=file_data)

        return f"https://{self.cloud_front_domain}/{object_name}"
    
    async def delete_file(self,file_path:str):
        object_name = file_path.split("/")[-1]

        async with self.get_client() as client:
            await client.delete_object(Bucket=self.bucket_name, Key=object_name)
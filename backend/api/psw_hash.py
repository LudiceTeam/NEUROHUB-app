import base64
import hashlib
from cryptography.fernet import Fernet
from dotenv import load_dotenv
import os



load_dotenv()


def make_key(password: str) -> bytes:
    key = hashlib.sha256(password.encode()).digest()
    return base64.urlsafe_b64encode(key)


def encrypt(message: str) -> str:
    password = os.getenv("HASH_MESSAGES_KEY")
    key = make_key(password)
    f = Fernet(key)

    encrypted = f.encrypt(message.encode())
    return encrypted.decode()


def decrypt(encrypted_message:str) -> str:
    password = os.getenv("HASH_MESSAGES_KEY")
    key = make_key(password)
    f = Fernet(key)

    decrypted = f.decrypt(encrypted_message.encode())
    return decrypted.decode()


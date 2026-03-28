import requests
import time
import json
import hmac
import hashlib

URL = "http://127.0.0.1:8080/check/code"
SECRET = "some_signature_key"  # тот же что в .env

def generate_signature(data: dict) -> tuple[str, str]:
    timestamp = str(int(time.time()))

    data_to_sign = data.copy()
    data_str = json.dumps(data_to_sign, sort_keys=True, separators=(',', ':'))

    signature = hmac.new(
        SECRET.encode(),
        data_str.encode(),
        hashlib.sha256
    ).hexdigest()

    return signature, timestamp


def send_request():
    data = {
        "email": ""
    }

    signature, timestamp = generate_signature(data)

    headers = {
        "x-signature": signature,
        "x-timestamp": timestamp,
        "Content-Type": "application/json"
    }

    resp = requests.post(URL, json=data, headers=headers)

    print("STATUS:", resp.status_code)
    print("RESPONSE:", resp.text)

def check_code():
    data = {
        "email": "",
        "code": 137697
    }

    signature, timestamp = generate_signature(data)

    headers = {
        "x-signature": signature,
        "x-timestamp": timestamp,
        "Content-Type": "application/json"
    }

    resp = requests.post(URL, json=data, headers=headers)

    print("STATUS:", resp.status_code)
    print("RESPONSE:", resp.text)


if __name__ == "__main__":
    check_code()
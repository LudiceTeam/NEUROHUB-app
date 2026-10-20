"""Minimal async client for the YooKassa API v3 (https://yookassa.ru/developers/api)."""
import os
import uuid
import aiohttp

API_URL = "https://api.yookassa.ru/v3"


def _auth() -> aiohttp.BasicAuth:
    return aiohttp.BasicAuth(os.getenv("YOOKASSA_SHOP_ID", ""), os.getenv("YOOKASSA_SECRET_KEY", ""))


class YooKassaError(Exception):
    pass


async def _request(method:str, path:str, body:dict | None = None, idempotence_key:str | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if method == "POST":
        # The same key makes a retried request return the same payment instead of charging twice.
        headers["Idempotence-Key"] = idempotence_key or str(uuid.uuid4())
    async with aiohttp.ClientSession(timeout = aiohttp.ClientTimeout(total = 30), auth = _auth()) as session:
        async with session.request(method, f"{API_URL}{path}", json = body, headers = headers) as response:
            data = await response.json(content_type = None)
            if response.status >= 300:
                raise YooKassaError(f"YooKassa {response.status}: {data}")
            return data


def receipt(email:str, description:str, value:str) -> dict | None:
    """Fiscal receipt (54-FZ) sent through YooKassa. Turned on with YOOKASSA_RECEIPTS=1."""
    if os.getenv("YOOKASSA_RECEIPTS", "1") != "1":
        return None
    data = {
        "customer": {"email": email},
        "items": [{
            "description": description[:128],
            "quantity": "1.00",
            "amount": {"value": value, "currency": "RUB"},
            # 7 = VAT 5% (USN with VAT). Check the code in your YooKassa account settings.
            "vat_code": int(os.getenv("YOOKASSA_VAT_CODE", "7")),
            "payment_subject": "service",
            "payment_mode": "full_payment",
        }],
    }
    if os.getenv("YOOKASSA_TAX_SYSTEM"):
        data["tax_system_code"] = int(os.getenv("YOOKASSA_TAX_SYSTEM"))
    return data


async def create_first_payment(value:str, description:str, return_url:str, email:str, metadata:dict) -> dict:
    """Redirect payment that also saves the card for auto-renewal."""
    body = {
        "amount": {"value": value, "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "save_payment_method": True,
        "description": description[:128],
        "metadata": metadata,
    }
    if (r := receipt(email, description, value)):
        body["receipt"] = r
    return await _request("POST", "/payments", body)


async def create_recurring_payment(value:str, description:str, payment_method_id:str, email:str, metadata:dict, idempotence_key:str) -> dict:
    """Charges a saved card without the user (auto-renewal)."""
    body = {
        "amount": {"value": value, "currency": "RUB"},
        "capture": True,
        "payment_method_id": payment_method_id,
        "description": description[:128],
        "metadata": metadata,
    }
    if (r := receipt(email, description, value)):
        body["receipt"] = r
    return await _request("POST", "/payments", body, idempotence_key)


async def get_payment(payment_id:str) -> dict:
    return await _request("GET", f"/payments/{payment_id}")

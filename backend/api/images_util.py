"""Uploaded photos in formats AI models accept (PNG, JPEG, GIF, WebP).

HEIC (iPhone), AVIF, BMP and TIFF are converted to JPEG; data URLs get the real type instead
of always "image/jpeg"."""
import base64
import io
import logging

logger = logging.getLogger(__name__)

MODEL_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_SIDE = 4096   # larger photos are scaled down when they have to be converted anyway

try:
    from PIL import Image, ImageOps
    try:
        from pillow_heif import register_heif_opener   # HEIC / HEIF support for Pillow
        register_heif_opener()
    except ImportError:
        logger.warning("pillow-heif is not installed: HEIC photos can't be converted")
except ImportError:   # Pillow missing: unsupported formats are rejected instead of converted
    Image = None


class UnsupportedImage(Exception):
    pass


def sniff_image_type(data:bytes) -> str:
    """Image type from the first bytes (enough for the formats models accept)."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"GIF":
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def to_model_format(data:bytes, mime:str) -> tuple:
    """(bytes, mime) a model will accept. Blocking: run it with asyncio.to_thread."""
    if mime in MODEL_IMAGE_TYPES:
        return data, mime
    if Image is None:
        raise UnsupportedImage(mime)
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)        # keep the photo the right way up
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            out = io.BytesIO()
            img.save(out, "JPEG", quality = 90, optimize = True)
            return out.getvalue(), "image/jpeg"
    except Exception as e:
        logger.warning("IMAGE CONVERT FAILED (%s): %s", mime, e)
        raise UnsupportedImage(mime)


def data_url(b64:str) -> str:
    """data: URL with the real image type of a base64-encoded image."""
    head = base64.b64decode(b64[:24] + "=" * (-len(b64[:24]) % 4))
    return f"data:{sniff_image_type(head)};base64,{b64}"

from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from backend.api.config import WATERMARK_TEXT


def add_watermark(image_bytes:bytes) -> tuple[bytes, str]:
    """Puts WATERMARK_TEXT in the bottom-right corner. Returns (bytes, content type); PNG stays PNG,
    everything else becomes JPEG. CPU-bound, so call it with asyncio.to_thread."""
    image = Image.open(BytesIO(image_bytes))
    keep_png = image.format == "PNG"
    image = image.convert("RGBA")

    # Scales with the picture: ~2.5% of the shorter side, readable on phones and on 4K images alike.
    size = max(14, min(image.size) // 40)
    font = ImageFont.load_default(size = size)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    left, top, right, bottom = draw.textbbox((0, 0), WATERMARK_TEXT, font = font)
    margin = size
    x = image.width - (right - left) - margin
    y = image.height - (bottom - top) - margin - top

    # A soft dark shadow keeps the white text readable on light backgrounds.
    shadow = max(1, size // 14)
    draw.text((x + shadow, y + shadow), WATERMARK_TEXT, font = font, fill = (0, 0, 0, 90))
    draw.text((x, y), WATERMARK_TEXT, font = font, fill = (255, 255, 255, 170))

    image = Image.alpha_composite(image, layer)
    out = BytesIO()
    if keep_png:
        image.save(out, "PNG", optimize = True)
        return out.getvalue(), "image/png"
    image.convert("RGB").save(out, "JPEG", quality = 92)
    return out.getvalue(), "image/jpeg"

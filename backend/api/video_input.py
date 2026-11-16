"""Videos users upload: type check, length and size (read from the MP4/MOV header), and clean-up with ffmpeg."""
import asyncio
import math
import os
import shutil
import tempfile

# libmagic type -> (type OpenRouter takes, file extension for storage)
VIDEO_INPUT_TYPES = {
    "video/mp4": ("video/mp4", "mp4"),
    "video/x-m4v": ("video/mp4", "mp4"),
    "video/quicktime": ("video/mov", "mov"),
}


def mp4_duration(data:bytes) -> float | None:
    """Length in seconds from the movie header box (mvhd) of an MP4/MOV file, or None if there isn't one."""
    i = data.find(b"mvhd")
    if i < 4:
        return None
    version = data[i + 4]
    # mvhd: version(1) flags(3) creation modification timescale(4) duration; times are 8 bytes in version 1.
    if version == 1:
        timescale = int.from_bytes(data[i + 24:i + 28], "big")
        duration = int.from_bytes(data[i + 28:i + 36], "big")
    else:
        timescale = int.from_bytes(data[i + 16:i + 20], "big")
        duration = int.from_bytes(data[i + 20:i + 24], "big")
    if not timescale:
        return None
    return duration / timescale


def mp4_pixels(data:bytes) -> int | None:
    """Width × height of the biggest track from the track header boxes (tkhd) of an MP4/MOV file.
    Audio tracks report 0×0, so the largest one is the picture; rotation doesn't change the product."""
    best = None
    i = data.find(b"tkhd")
    while i >= 4:
        start = i + 4                      # version byte
        # tkhd: version(1) flags(3) times/ids (20 bytes, 32 in version 1) reserved(8) layer, group,
        # volume, reserved (8) matrix(36) width(4) height(4); width and height are 16.16 fixed point.
        offset = start + (88 if data[start] == 1 else 76)
        if offset + 8 <= len(data):
            width = int.from_bytes(data[offset:offset + 4], "big") >> 16
            height = int.from_bytes(data[offset + 4:offset + 8], "big") >> 16
            if width * height and (best is None or width * height > best):
                best = width * height
        i = data.find(b"tkhd", i + 4)
    return best


FFMPEG = shutil.which("ffmpeg")
NORMALIZED_PIXELS = 1280 * 720


async def normalize_clip(data:bytes, max_seconds:float, min_pixels:int) -> bytes | None:
    """Makes any phone or TikTok clip fit a video model: the first `max_seconds`, scaled up to 720p when it's
    smaller than `min_pixels`, re-encoded as H.264/AAC MP4. None when ffmpeg isn't installed or fails
    (the caller then checks the original as it is)."""
    if not FFMPEG:
        return None
    pixels = mp4_pixels(data) or 0
    # The same factor for both sides keeps the shape; even sizes are required by H.264.
    factor = math.sqrt(NORMALIZED_PIXELS / pixels) if 0 < pixels < min_pixels else 1
    scale = f"scale=trunc(iw*{factor:.4f}/2)*2:trunc(ih*{factor:.4f}/2)*2"
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "in"), os.path.join(tmp, "out.mp4")
        with open(src, "wb") as f:
            f.write(data)
        process = await asyncio.create_subprocess_exec(
            FFMPEG, "-y", "-loglevel", "error", "-i", src, "-t", str(max_seconds), "-vf", scale,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out,
            stdout = asyncio.subprocess.DEVNULL, stderr = asyncio.subprocess.PIPE,
        )
        try:
            _, err = await asyncio.wait_for(process.communicate(), timeout = 180)
        except asyncio.TimeoutError:
            process.kill()
            return None
        if process.returncode != 0 or not os.path.exists(out):
            return None
        with open(out, "rb") as f:
            return f.read()

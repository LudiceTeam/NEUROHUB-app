"""Videos the user sends to a chat model: type check and length (read from the MP4/MOV header)."""

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

"""Tries face swap models on OpenRouter before one goes into FACE_SWAP_MODEL (backend/api/config.py).

    OPEN_AI=sk-or-... python scripts/test_faceswap.py https://link/to/clip.mp4 selfie.jpg [model ...]

The clip must be a public https link (the provider downloads it itself), e.g. a presigned S3 link.
Each model's result is saved as faceswap_<model>.mp4 next to this script; errors are printed as they come.
"""
import asyncio
import base64
import os
import sys
import time

import aiohttp

URL = "https://openrouter.ai/api/v1"
MODELS = ["bytedance/seedance-2.5", "black-forest-labs/flux-video-edit", "runway/aleph-2"]
PROMPT = (
    "Edit the reference video: replace the face of the main person with the face of the person in the "
    "reference photo. Keep everything else exactly as in the video. Photorealistic, consistent in every frame."
)


async def try_model(session:aiohttp.ClientSession, model:str, video_url:str, selfie:str) -> None:
    headers = {"Authorization": f"Bearer {os.environ['OPEN_AI']}"}
    body = {
        "model": model,
        "prompt": PROMPT,
        "input_references": [
            {"type": "video_url", "video_url": {"url": video_url}},
            {"type": "image_url", "image_url": {"url": selfie}},
        ],
    }
    started = time.monotonic()
    async with session.post(f"{URL}/videos", json = body, headers = headers) as response:
        text = await response.text()
        if response.status >= 300:
            print(f"[{model}] create failed {response.status}: {text[:600]}")
            return
        job = await response.json(content_type = None)
    polling_url = job.get("polling_url") or f"{URL}/videos/{job['id']}"
    while True:
        await asyncio.sleep(5)
        async with session.get(polling_url, headers = headers) as response:
            job = await response.json(content_type = None)
        if job.get("status") == "completed":
            break
        if job.get("status") in ("failed", "cancelled", "expired"):
            print(f"[{model}] {job.get('status')}: {job.get('error')}")
            return
    content_url = (job.get("unsigned_urls") or [f"{URL}/videos/{job['id']}/content?index=0"])[0]
    async with session.get(content_url, headers = headers) as response:
        data = await response.read()
    out = os.path.join(os.path.dirname(__file__), f"faceswap_{model.replace('/', '_')}.mp4")
    with open(out, "wb") as f:
        f.write(data)
    print(f"[{model}] done in {time.monotonic() - started:.0f}s -> {out}; usage: {job.get('usage')}")


async def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    video_url, selfie_path = sys.argv[1], sys.argv[2]
    models = sys.argv[3:] or MODELS
    with open(selfie_path, "rb") as f:
        kind = "png" if selfie_path.lower().endswith(".png") else "jpeg"
        selfie = f"data:image/{kind};base64,{base64.b64encode(f.read()).decode()}"
    async with aiohttp.ClientSession(timeout = aiohttp.ClientTimeout(total = 20 * 60)) as session:
        await asyncio.gather(*(try_model(session, m, video_url, selfie) for m in models))


if __name__ == "__main__":
    asyncio.run(main())

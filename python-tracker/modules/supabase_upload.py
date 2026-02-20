"""
CrazyDesk Tracker — Supabase Storage upload module
===================================================
Uploads screenshot / camera images to the tracker-evidence bucket.
"""

import time
import logging
import requests

logger = logging.getLogger("crazydesk.supabase")

SUPABASE_URL = "https://lrdbybkovflytzygspdf.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZGJ5YmtvdmZseXR6eWdzcGRmIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTA5MzcsImV4cCI6MjA4NjcyNjkzN30."
    "Y6vp5QUYBPTEx-7q9HOFHeBmiruFIUs7acRS0qwXExk"
)
BUCKET = "tracker-evidence"


def upload_image(image_bytes: bytes, prefix: str, user_id: str) -> str | None:
    """
    Upload a JPEG image to Supabase Storage.
    Returns the public URL or None on failure.
    """
    if len(image_bytes) < 100:
        logger.warning("Image buffer too small (%d bytes), skipping", len(image_bytes))
        return None

    filename = f"{prefix}_{user_id}_{int(time.time() * 1000)}.jpg"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{filename}"

    headers = {
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "image/jpeg",
    }

    try:
        logger.info("Uploading %s image: %d bytes -> %s", prefix, len(image_bytes), filename)
        resp = requests.post(url, headers=headers, data=image_bytes, timeout=30)
        if not resp.ok:
            logger.error("Supabase upload error %d: %s", resp.status_code, resp.text[:300])
            return None

        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{filename}"
        logger.info("Upload success: %s", public_url)
        return public_url

    except Exception as e:
        logger.error("Upload error: %s", e)
        return None

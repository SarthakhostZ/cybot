"""
linkguard/safe_browsing.py

Google Safe Browsing API v4 client.
Results are cached in Redis for 1 hour to minimise quota usage.
"""

import hashlib
import logging

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

GSB_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find"
THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"]
CACHE_TTL = 3600  # 1 hour


def check(url: str) -> dict:
    """Check *url* against Google Safe Browsing API v4.

    Returns a dict with keys:
        flagged (bool)   – True if any threat match found
        threats (list)   – list of threat type strings
        cached  (bool)   – True if result came from Redis cache
    """
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    cache_key = f"gsb:{url_hash}"

    cached = cache.get(cache_key)
    if cached is not None:
        cached["cached"] = True
        return cached

    result = _call_api(url)
    cache.set(cache_key, result, timeout=CACHE_TTL)
    return result


def _call_api(url: str) -> dict:
    """Make the actual Safe Browsing API request.

    Falls back to a non-flagged result if the API key is missing or the
    request fails, so the overall scan can still proceed.
    """
    api_key = getattr(settings, "GOOGLE_SAFE_BROWSING_API_KEY", "")
    if not api_key:
        logger.debug("GOOGLE_SAFE_BROWSING_API_KEY not set – skipping GSB check")
        return {"flagged": False, "threats": [], "cached": False, "skipped": True}

    payload = {
        "client": {"clientId": "cybot-linkguard", "clientVersion": "1.0"},
        "threatInfo": {
            "threatTypes": THREAT_TYPES,
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}],
        },
    }

    try:
        resp = requests.post(
            GSB_ENDPOINT,
            params={"key": api_key},
            json=payload,
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Safe Browsing API error: %s", exc)
        return {"flagged": False, "threats": [], "cached": False, "error": str(exc)}

    matches = data.get("matches", [])
    threats = list({m.get("threatType", "") for m in matches})
    return {"flagged": bool(matches), "threats": threats, "cached": False}

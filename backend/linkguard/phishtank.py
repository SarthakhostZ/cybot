"""
linkguard/phishtank.py

PhishTank URL lookup integration.

PhishTank is a community-driven anti-phishing database.
API: https://www.phishtank.com/api_info.php

POST https://checkurl.phishtank.com/checkurl/
  url=<percent_encoded_url>&format=json[&app_key=<key>]

Response shape:
  {
    "meta": { "timestamp": "...", "serverid": "...", "status": "success|..." },
    "results": {
      "url": "...",
      "in_database": true|false,
      "phish_id": "...",
      "phish_detail_page": "...",
      "verified": "yes|no",
      "verified_at": "...",
      "valid": true|false
    }
  }

Required env key: PHISHTANK_APP_KEY  (empty string = use public rate limits)
"""

import hashlib
import logging
from urllib.parse import quote

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

PT_ENDPOINT = "https://checkurl.phishtank.com/checkurl/"
CACHE_TTL   = 3_600   # 1 hour
TIMEOUT     = 8       # seconds


def check(url: str) -> dict:
    """Check *url* against PhishTank.

    Returns:
        in_database   (bool) – URL exists in PhishTank database
        phish         (bool) – URL is confirmed as phishing (valid=True in DB)
        phish_id      (str)  – PhishTank submission ID, empty if not in DB
        detail_page   (str)  – Link to the PhishTank entry
        cached        (bool)
        skipped       (bool) – API call was not attempted
        error         (str)  – present on API failure
    """
    url_hash  = hashlib.sha256(url.encode()).hexdigest()
    cache_key = f"pt:{url_hash}"

    cached = cache.get(cache_key)
    if cached is not None:
        cached["cached"] = True
        return cached

    result = _call_api(url)
    if not result.get("error"):
        cache.set(cache_key, result, timeout=CACHE_TTL)
    return result


# ─── Internal ────────────────────────────────────────────────────────────────

def _call_api(url: str) -> dict:
    app_key = getattr(settings, "PHISHTANK_APP_KEY", "")

    payload = {"url": quote(url, safe=""), "format": "json"}
    if app_key:
        payload["app_key"] = app_key

    headers = {
        "User-Agent": "Cybot-LinkGuard/1.0 (https://cybot.app)",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    try:
        resp = requests.post(
            PT_ENDPOINT,
            data=payload,
            headers=headers,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        logger.warning("PhishTank request timed out for URL hash %s", url[:40])
        return _error("Request timed out")
    except requests.RequestException as exc:
        logger.warning("PhishTank API error: %s", exc)
        return _error(str(exc))
    except ValueError as exc:
        logger.warning("PhishTank JSON parse error: %s", exc)
        return _error("Invalid JSON response")

    meta    = data.get("meta", {})
    if meta.get("status") not in ("success", None, ""):
        # PhishTank returns {"meta": {"status": "...error msg..."}} on failures
        return _error(meta.get("status", "Unknown PhishTank error"))

    results = data.get("results", {})
    in_db   = bool(results.get("in_database", False))
    valid   = bool(results.get("valid", False))  # True = confirmed active phishing

    return {
        "in_database": in_db,
        "phish":       in_db and valid,
        "phish_id":    str(results.get("phish_id", "")),
        "detail_page": results.get("phish_detail_page", ""),
        "cached":      False,
    }


def _error(msg: str) -> dict:
    return {
        "in_database": False,
        "phish":       False,
        "phish_id":    "",
        "detail_page": "",
        "cached":      False,
        "error":       msg,
    }

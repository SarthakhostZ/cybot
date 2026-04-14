"""
linkguard/virustotal.py

VirusTotal API v3 integration for URL threat intelligence.

Strategy:
  1. Compute the VT URL identifier (base64url-encoded URL, no padding).
  2. Try GET /urls/{id} — returns cached analysis if VT already knows the URL.
  3. On 404 fall back to POST /urls to submit the URL, then GET the analysis.
  4. Cache results in Redis for 1 hour.

Required env key: VIRUSTOTAL_API_KEY
"""

import base64
import hashlib
import logging
import time

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

VT_BASE       = "https://www.virustotal.com/api/v3"
CACHE_TTL     = 3_600   # 1 hour
SUBMIT_WAIT   = 2       # seconds to wait after submitting before polling
REQUEST_TIMEOUT = 10    # seconds


def check(url: str) -> dict:
    """Check *url* against VirusTotal.

    Returns:
        flagged     (bool)   – True when any engine marks URL as malicious/suspicious
        positives   (int)    – count of malicious + suspicious detections
        total       (int)    – total engines that scanned
        permalink   (str)    – VT analysis URL for human reference
        cached      (bool)
        skipped     (bool)   – True when API key not configured
        error       (str)    – present on API failure
    """
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    cache_key = f"vt:{url_hash}"

    cached = cache.get(cache_key)
    if cached is not None:
        cached["cached"] = True
        return cached

    result = _call_api(url)
    # Only cache successful / definitive results
    if not result.get("error"):
        cache.set(cache_key, result, timeout=CACHE_TTL)
    return result


# ─── Internal ────────────────────────────────────────────────────────────────

def _vt_id(url: str) -> str:
    """Compute VT URL identifier: base64url without padding."""
    return base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")


def _call_api(url: str) -> dict:
    api_key = getattr(settings, "VIRUSTOTAL_API_KEY", "")
    if not api_key:
        logger.debug("VIRUSTOTAL_API_KEY not configured — skipping VT check")
        return _skipped()

    headers = {"x-apikey": api_key, "Accept": "application/json"}
    url_id  = _vt_id(url)

    # ── Try cached report first ───────────────────────────────────────────────
    try:
        resp = requests.get(
            f"{VT_BASE}/urls/{url_id}",
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 200:
            return _parse_report(resp.json(), url)
        if resp.status_code not in (404, 429):
            resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("VT GET /urls/%s error: %s", url_id[:8], exc)
        return _error(str(exc))

    # ── Submit URL for scanning ───────────────────────────────────────────────
    try:
        sub = requests.post(
            f"{VT_BASE}/urls",
            headers=headers,
            data={"url": url},
            timeout=REQUEST_TIMEOUT,
        )
        sub.raise_for_status()
        analysis_id = sub.json().get("data", {}).get("id", "")
        if not analysis_id:
            return _error("No analysis ID returned from VT submission")
    except requests.RequestException as exc:
        logger.warning("VT POST /urls error: %s", exc)
        return _error(str(exc))

    # Wait a moment, then poll the analysis result
    time.sleep(SUBMIT_WAIT)

    try:
        poll = requests.get(
            f"{VT_BASE}/analyses/{analysis_id}",
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        poll.raise_for_status()
        data = poll.json().get("data", {})
        stats = data.get("attributes", {}).get("stats", {})
        positives = stats.get("malicious", 0) + stats.get("suspicious", 0)
        total     = sum(stats.values())
        return {
            "flagged":   positives > 0,
            "positives": positives,
            "total":     total,
            "permalink": f"https://www.virustotal.com/gui/url/{url_id}",
            "cached":    False,
        }
    except requests.RequestException as exc:
        logger.warning("VT GET /analyses error: %s", exc)
        return _error(str(exc))


def _parse_report(data: dict, url: str) -> dict:
    """Parse a GET /urls/{id} response into a normalised dict."""
    attrs     = data.get("data", {}).get("attributes", {})
    stats     = attrs.get("last_analysis_stats", {})
    positives = stats.get("malicious", 0) + stats.get("suspicious", 0)
    total     = sum(stats.values())
    url_id    = _vt_id(url)
    return {
        "flagged":   positives > 0,
        "positives": positives,
        "total":     total,
        "permalink": f"https://www.virustotal.com/gui/url/{url_id}",
        "cached":    False,
    }


def _skipped() -> dict:
    return {"flagged": False, "positives": 0, "total": 0, "permalink": "", "cached": False, "skipped": True}


def _error(msg: str) -> dict:
    return {"flagged": False, "positives": 0, "total": 0, "permalink": "", "cached": False, "error": msg}

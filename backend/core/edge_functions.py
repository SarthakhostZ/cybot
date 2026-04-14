"""
core/edge_functions.py

Helpers for Django to call Supabase Edge Functions via HTTP.
Uses INTERNAL_SERVICE_KEY so the Edge Functions can authenticate the caller.
"""

import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_EDGE_BASE = f"{settings.SUPABASE_URL}/functions/v1"
_HEADERS = {
    "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}",
    "X-Internal-Service-Key": settings.INTERNAL_SERVICE_KEY,
    "Content-Type": "application/json",
}


def _post(function_name: str, payload: dict, timeout: int = 10) -> dict:
    url = f"{_EDGE_BASE}/{function_name}"
    try:
        resp = requests.post(url, json=payload, headers=_HEADERS, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.Timeout:
        logger.warning("Edge Function %s timed out", function_name)
        return {"error": "timeout"}
    except requests.RequestException as exc:
        logger.error("Edge Function %s failed: %s", function_name, exc)
        return {"error": str(exc)}


def trigger_notify_threat(threat_id: str) -> dict:
    """Call notify-threat Edge Function for a specific threat alert ID."""
    return _post("notify-threat", {"threat_id": threat_id})


def trigger_ml_inference(features: dict, user_id: str) -> dict:
    """Call ml-inference Edge Function with raw feature dict."""
    return _post("ml-inference", {"features": features, "user_id": user_id})

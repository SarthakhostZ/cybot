"""
linkguard/whois_checker.py

Domain age checker using the python-whois library.
Results cached in Redis for 24 hours.

Scoring penalties:
  domain < 30 days  → -30 points
  domain < 90 days  → -20 points
  domain < 180 days → -10 points
"""

import hashlib
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

import whois
from django.core.cache import cache

logger = logging.getLogger(__name__)

CACHE_TTL = 86_400  # 24 hours


def get_domain_age(url: str) -> dict:
    """Return domain age information for the host in *url*.

    Returns a dict with:
        domain      (str)       – the queried domain
        age_days    (int|None)  – age in days; None if unknown
        score_delta (int)       – negative points to apply (0, -10, -20, -30)
        flags       (list[str]) – human-readable flag strings
        cached      (bool)
    """
    hostname = _extract_hostname(url)
    if not hostname:
        return {"domain": "", "age_days": None, "score_delta": 0, "flags": [], "cached": False}

    cache_key = f"whois:{hostname}"
    cached = cache.get(cache_key)
    if cached is not None:
        cached["cached"] = True
        return cached

    result = _lookup(hostname)
    cache.set(cache_key, result, timeout=CACHE_TTL)
    return result


def _lookup(hostname: str) -> dict:
    """Perform the WHOIS lookup and compute the score penalty."""
    base = {"domain": hostname, "age_days": None, "score_delta": 0, "flags": [], "cached": False}

    try:
        info = whois.whois(hostname)
    except Exception as exc:
        logger.warning("WHOIS lookup failed for %s: %s", hostname, exc)
        return base

    creation_date = info.creation_date
    if isinstance(creation_date, list):
        creation_date = creation_date[0]

    if not creation_date:
        return base

    if creation_date.tzinfo is None:
        creation_date = creation_date.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    age_days = (now - creation_date).days

    score_delta = 0
    flags: list[str] = []

    if age_days < 30:
        score_delta = -30
        flags.append(f"domain_age_very_young:{age_days}_days")
    elif age_days < 90:
        score_delta = -20
        flags.append(f"domain_age_young:{age_days}_days")
    elif age_days < 180:
        score_delta = -10
        flags.append(f"domain_age_moderate:{age_days}_days")

    return {
        "domain": hostname,
        "age_days": age_days,
        "score_delta": score_delta,
        "flags": flags,
        "cached": False,
    }


def _extract_hostname(url: str) -> str:
    """Extract bare hostname from a URL string."""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        # Strip www. prefix for WHOIS
        return hostname.removeprefix("www.")
    except Exception:
        return ""

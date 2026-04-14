"""
linkguard/redirect_tracker.py

Follows the redirect chain for a URL and returns the final destination.

Scoring:
  > 3 redirects              → -15 points
  final domain ≠ original    → -20 points
"""

import logging
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

MAX_REDIRECTS = 10
TIMEOUT = 5  # seconds


def track(url: str) -> dict:
    """Follow the redirect chain for *url* and return analysis.

    Returns a dict with:
        final_url    (str)       – URL after all redirects
        chain        (list[str]) – ordered list of URLs in the chain
        redirect_count (int)     – number of hops
        score_delta  (int)       – negative points to apply
        flags        (list[str]) – human-readable flag strings
    """
    chain: list[str] = [url]
    score_delta = 0
    flags: list[str] = []

    try:
        session = requests.Session()
        session.max_redirects = MAX_REDIRECTS
        resp = session.head(
            url,
            allow_redirects=True,
            timeout=TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (LinkGuard/1.0)"},
            verify=False,  # We do SSL check separately
        )
        # Collect the full redirect chain
        if resp.history:
            chain = [r.url for r in resp.history] + [resp.url]
        final_url = resp.url
    except requests.TooManyRedirects:
        final_url = url
        flags.append("too_many_redirects")
        score_delta -= 30
        return {
            "final_url": final_url,
            "chain": chain,
            "redirect_count": MAX_REDIRECTS,
            "score_delta": score_delta,
            "flags": flags,
        }
    except Exception as exc:
        logger.warning("Redirect tracking failed for %s: %s", url, exc)
        return {
            "final_url": url,
            "chain": chain,
            "redirect_count": 0,
            "score_delta": 0,
            "flags": [],
        }

    redirect_count = len(chain) - 1

    if redirect_count > 3:
        score_delta -= 15
        flags.append(f"many_redirects:{redirect_count}")

    original_domain = _domain(url)
    final_domain = _domain(final_url)
    if original_domain and final_domain and original_domain != final_domain:
        score_delta -= 20
        flags.append(f"redirect_domain_mismatch:{final_domain}")

    return {
        "final_url": final_url,
        "chain": chain,
        "redirect_count": redirect_count,
        "score_delta": score_delta,
        "flags": flags,
    }


def _domain(url: str) -> str:
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        return host.removeprefix("www.")
    except Exception:
        return ""

"""
linkguard/content_fetcher.py

Safe webpage content fetcher for AI analysis.

Security hardening:
  - Hard timeout (5 s) prevents hanging
  - Streaming download with byte cap (200 KB) prevents memory exhaustion
  - Strips <script>, <style>, <noscript> tags before text extraction
  - Does NOT execute JavaScript
  - Must pass SSRF check in views.py before this is called
  - Returns empty string on any error (graceful degradation)

Output text is truncated to MAX_CHARS (3 000) so GPT-4o prompt stays lean.
"""

import logging
import re

import requests

logger = logging.getLogger(__name__)

MAX_BYTES  = 200_000   # 200 KB cap on downloaded HTML
MAX_CHARS  = 3_000     # max visible-text characters sent to AI
TIMEOUT    = 5         # seconds
HEADERS    = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36 (Cybot-LinkGuard/1.0)"
    ),
    "Accept":          "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

# Lazily imported so missing beautifulsoup4 only raises on actual use
_bs4_available: bool | None = None


def fetch(url: str) -> str:
    """Fetch *url* and return visible text (max MAX_CHARS chars).

    Returns an empty string if:
      - the request fails or times out
      - the response is not text/html
      - BeautifulSoup is not installed (falls back to regex)
    """
    try:
        resp = requests.get(
            url,
            headers=HEADERS,
            timeout=TIMEOUT,
            stream=True,
            verify=False,       # SSL checked separately; don't block content fetch
            allow_redirects=True,
        )
        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type and "text/plain" not in content_type:
            logger.debug("content_fetcher: skipping non-HTML response (%s)", content_type)
            return ""

        # Read up to MAX_BYTES
        chunks = []
        total  = 0
        for chunk in resp.iter_content(chunk_size=8_192):
            total += len(chunk)
            chunks.append(chunk)
            if total >= MAX_BYTES:
                break
        html = b"".join(chunks).decode("utf-8", errors="replace")

    except requests.exceptions.Timeout:
        logger.debug("content_fetcher: timeout fetching %s", url[:80])
        return ""
    except Exception as exc:
        logger.debug("content_fetcher: failed to fetch %s — %s", url[:80], exc)
        return ""

    return _extract_text(html)


# ─── Text extraction ─────────────────────────────────────────────────────────

def _extract_text(html: str) -> str:
    """Extract visible text from raw HTML string."""
    global _bs4_available

    if _bs4_available is None:
        try:
            from bs4 import BeautifulSoup  # noqa: F401
            _bs4_available = True
        except ImportError:
            _bs4_available = False

    if _bs4_available:
        return _extract_bs4(html)
    return _extract_regex(html)


def _extract_bs4(html: str) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")

    # Kill invisible content first
    for tag in soup(["script", "style", "noscript", "head", "meta",
                     "link", "iframe", "svg", "img"]):
        tag.decompose()

    text = soup.get_text(separator=" ", strip=True)
    # Collapse whitespace
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text[:MAX_CHARS]


def _extract_regex(html: str) -> str:
    """Fallback text extractor when BeautifulSoup is unavailable."""
    # Remove script/style blocks
    html = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove all remaining tags
    html = re.sub(r"<[^>]+>", " ", html)
    # Decode common HTML entities
    html = (html
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", '"')
            .replace("&#39;", "'")
            .replace("&nbsp;", " "))
    html = re.sub(r"\s{2,}", " ", html).strip()
    return html[:MAX_CHARS]

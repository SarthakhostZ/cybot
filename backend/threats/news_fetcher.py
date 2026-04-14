"""
threats/news_fetcher.py

Fetches cybersecurity news from trusted RSS feeds, normalises each entry
into a uniform NewsArticle dict, and returns a merged + sorted list.

Used by CyberNewsView — results are cached in Redis for 15 minutes.
"""

import hashlib
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import feedparser

logger = logging.getLogger(__name__)

# ─── RSS Sources ──────────────────────────────────────────────────────────────

SOURCES = [
    {
        "name":  "The Hacker News",
        "url":   "https://feeds.feedburner.com/TheHackersNews",
        "color": "#e74c3c",
    },
    {
        "name":  "BleepingComputer",
        "url":   "https://www.bleepingcomputer.com/feed/",
        "color": "#3498db",
    },
    {
        "name":  "Krebs on Security",
        "url":   "https://krebsonsecurity.com/feed/",
        "color": "#2ecc71",
    },
    {
        "name":  "CISA Alerts",
        "url":   "https://www.cisa.gov/cybersecurity-advisories/all-advisories.xml",
        "color": "#1a6db5",
    },
    {
        "name":  "Dark Reading",
        "url":   "https://www.darkreading.com/rss.xml",
        "color": "#9b59b6",
    },
]

# ─── Category keyword map ─────────────────────────────────────────────────────

_CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("BREACH",  ["breach", "leak", "exposed", "stolen", "dump", "database", "records", "compromised"]),
    ("MALWARE", ["malware", "ransomware", "trojan", "virus", "spyware", "botnet", "worm", "backdoor", "rat", "keylogger"]),
    ("PATCH",   ["patch", "update", "fix", "vulnerability", "cve", "zero-day", "exploit", "advisory", "mitigation"]),
    ("ALERT",   ["alert", "warning", "attack", "campaign", "threat", "critical", "emergency", "incident"]),
]


def _tag_category(text: str) -> str:
    lower = text.lower()
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return category
    return "OTHER"


# ─── Image extraction ─────────────────────────────────────────────────────────

def _extract_image(entry: dict, source_color: str) -> Optional[str]:
    """Try to pull a thumbnail URL from the feed entry."""
    # 1. media:content
    media = entry.get("media_content", [])
    if media and isinstance(media, list):
        url = media[0].get("url", "")
        if url.startswith("http"):
            return url

    # 2. media:thumbnail
    thumb = entry.get("media_thumbnail", [])
    if thumb and isinstance(thumb, list):
        url = thumb[0].get("url", "")
        if url.startswith("http"):
            return url

    # 3. enclosure (podcast/image attachment)
    for enc in entry.get("enclosures", []):
        enc_type = enc.get("type", "")
        enc_url  = enc.get("url", "")
        if enc_type.startswith("image/") and enc_url.startswith("http"):
            return enc_url

    # 4. First <img> tag in summary HTML
    summary_html = entry.get("summary", "")
    img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary_html, re.IGNORECASE)
    if img_match:
        url = img_match.group(1)
        if url.startswith("http"):
            return url

    return None


# ─── Date parsing ─────────────────────────────────────────────────────────────

def _parse_date(entry: dict) -> str:
    """Return ISO-8601 UTC string. Falls back to now if parsing fails."""
    for field in ("published", "updated"):
        raw = entry.get(field, "")
        if raw:
            try:
                dt = parsedate_to_datetime(raw)
                return dt.astimezone(timezone.utc).isoformat()
            except Exception:
                pass
    # feedparser also exposes parsed struct
    for field in ("published_parsed", "updated_parsed"):
        struct = entry.get(field)
        if struct:
            try:
                ts = time.mktime(struct)
                return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            except Exception:
                pass
    return datetime.now(tz=timezone.utc).isoformat()


# ─── Text cleaning ────────────────────────────────────────────────────────────

def _clean_html(raw: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    no_tags = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", no_tags).strip()


# ─── Single feed fetcher ──────────────────────────────────────────────────────

def _fetch_one(source: dict) -> list[dict]:
    """Fetch + normalise a single RSS source. Returns [] on failure."""
    try:
        feed = feedparser.parse(source["url"])
        articles = []
        for entry in feed.entries:
            title   = _clean_html(entry.get("title", "")).strip()
            link    = entry.get("link", "").strip()
            if not title or not link:
                continue

            summary_raw = entry.get("summary", entry.get("description", ""))
            summary     = _clean_html(summary_raw)[:300]   # cap at 300 chars

            published_at = _parse_date(entry)
            image_url    = _extract_image(entry, source["color"])
            category     = _tag_category(title + " " + summary)

            # Stable deterministic ID from link
            art_id = hashlib.sha1(link.encode()).hexdigest()[:16]

            articles.append({
                "id":           art_id,
                "title":        title,
                "summary":      summary,
                "image_url":    image_url,
                "source_name":  source["name"],
                "source_color": source["color"],
                "source_url":   link,
                "published_at": published_at,
                "category":     category,
            })
        return articles
    except Exception as exc:
        logger.warning("news_fetcher: failed to fetch %s — %s", source["name"], exc)
        return []


# ─── Public API ───────────────────────────────────────────────────────────────

def fetch_all_news() -> list[dict]:
    """
    Fetch all RSS sources in parallel and return a single merged list
    sorted by published_at descending (newest first).
    """
    all_articles: list[dict] = []

    with ThreadPoolExecutor(max_workers=len(SOURCES)) as executor:
        futures = {executor.submit(_fetch_one, src): src for src in SOURCES}
        for future in as_completed(futures):
            all_articles.extend(future.result())

    # Sort newest first
    all_articles.sort(key=lambda a: a["published_at"], reverse=True)
    return all_articles

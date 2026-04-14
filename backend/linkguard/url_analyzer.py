"""
linkguard/url_analyzer.py

Rule-based URL scoring engine (server-side).
Mirrors the client-side fast scanner plus additional server-side checks.

Score starts at 100 and deductions are applied per rule.
Verdict:  > 80 → safe  |  50-80 → suspicious  |  < 50 → dangerous
"""

import logging
import math
import re
import socket
import ssl
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

SUSPICIOUS_KEYWORDS = [
    "login", "verify", "bank", "secure", "update", "account",
    "password", "confirm", "suspend", "urgent", "prize", "winner",
]

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly",
    "short.io", "rb.gy", "cutt.ly", "is.gd", "v.gd", "clck.ru",
}

MALICIOUS_TLDS = {".tk", ".ml", ".ga", ".cf", ".gq"}

# Characters that look like others (homoglyphs)
HOMOGLYPH_PATTERN = re.compile(r"[0OlI1]")

# Double extension pattern, e.g., .pdf.exe
DOUBLE_EXT_PATTERN = re.compile(
    r"\.(pdf|doc|docx|xls|xlsx|zip|rar)\.(exe|bat|cmd|ps1|sh|vbs|js)$",
    re.IGNORECASE,
)

PRIVATE_IP_PATTERN = re.compile(
    r"^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|::1)"
)


def analyze(url: str) -> dict:
    """Run full rule-based analysis on *url*.

    Returns a dict with keys: score (int), flags (list[str]).
    """
    score = 100
    flags: list[str] = []

    try:
        parsed = urlparse(url)
    except Exception:
        return {"score": 0, "flags": ["invalid_url"]}

    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()
    path = parsed.path.lower()
    full_url = url.lower()

    # ── No HTTPS ──────────────────────────────────────────────────────────────
    if scheme != "https":
        score -= 20
        flags.append("no_https")

    # ── SSL certificate check (actual handshake) ──────────────────────────────
    ssl_valid = _check_ssl(hostname)
    if ssl_valid is False:
        score -= 20
        flags.append("invalid_ssl_certificate")

    # ── URL length ────────────────────────────────────────────────────────────
    url_len = len(url)
    if url_len > 150:
        score -= 30   # -10 for >80 + -20 for >150
        flags.append(f"excessive_url_length:{url_len}")
    elif url_len > 80:
        score -= 10
        flags.append(f"long_url:{url_len}")

    # ── IP-based URL ──────────────────────────────────────────────────────────
    if _is_ip(hostname):
        score -= 40
        flags.append("ip_based_url")

    # ── Private/loopback IP (SSRF protection – also scored as suspicious) ──────
    if PRIVATE_IP_PATTERN.match(hostname):
        score -= 40
        flags.append("private_ip_ssrf_risk")

    # ── Suspicious keywords ───────────────────────────────────────────────────
    keyword_hits = [kw for kw in SUSPICIOUS_KEYWORDS if kw in full_url]
    if keyword_hits:
        deduction = min(len(keyword_hits) * 15, 30)
        score -= deduction
        flags.extend(f"suspicious_keyword:{kw}" for kw in keyword_hits[:2])

    # ── Excessive subdomains (>3) ─────────────────────────────────────────────
    parts = hostname.split(".")
    if len(parts) > 4:   # e.g. a.b.c.d.com = 5 parts, 4 subdomains
        score -= 15
        flags.append(f"excessive_subdomains:{len(parts) - 2}")

    # ── Known URL shortener ───────────────────────────────────────────────────
    if hostname in URL_SHORTENERS:
        score -= 10
        flags.append("url_shortener")

    # ── Homoglyph characters ──────────────────────────────────────────────────
    if HOMOGLYPH_PATTERN.search(hostname):
        score -= 25
        flags.append("homoglyph_characters")

    # ── Double extension ──────────────────────────────────────────────────────
    if DOUBLE_EXT_PATTERN.search(path):
        score -= 30
        flags.append("double_extension")

    # ── @ symbol in URL (before host = credential stuffing) ──────────────────
    if "@" in (parsed.netloc or ""):
        score -= 20
        flags.append("at_symbol_in_url")

    # ── Malicious TLD ─────────────────────────────────────────────────────────
    for tld in MALICIOUS_TLDS:
        if hostname.endswith(tld):
            score -= 20
            flags.append(f"malicious_tld:{tld}")
            break

    # ── Domain entropy (random-looking characters) ────────────────────────────
    entropy = _domain_entropy(hostname)
    if entropy > 3.8:
        score -= 15
        flags.append(f"high_domain_entropy:{entropy:.2f}")

    score = max(score, 0)
    return {"score": score, "flags": flags, "ssl_valid": ssl_valid}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_ip(hostname: str) -> bool:
    """Return True if hostname is a raw IPv4 or IPv6 address."""
    try:
        socket.inet_pton(socket.AF_INET, hostname)
        return True
    except (socket.error, OSError):
        pass
    try:
        socket.inet_pton(socket.AF_INET6, hostname)
        return True
    except (socket.error, OSError):
        pass
    return False


def _check_ssl(hostname: str) -> bool | None:
    """Attempt an SSL handshake to verify the certificate.

    Returns True (valid), False (invalid/expired), or None (could not connect).
    """
    if not hostname:
        return None
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(
            socket.create_connection((hostname, 443), timeout=3),
            server_hostname=hostname,
        ):
            return True
    except ssl.SSLError:
        return False
    except Exception:
        return None


def _domain_entropy(hostname: str) -> float:
    """Shannon entropy of the hostname (excluding TLD)."""
    label = hostname.split(".")[0] if hostname else ""
    if len(label) < 4:
        return 0.0
    freq: dict[str, int] = {}
    for ch in label:
        freq[ch] = freq.get(ch, 0) + 1
    total = len(label)
    return -sum((c / total) * math.log2(c / total) for c in freq.values())

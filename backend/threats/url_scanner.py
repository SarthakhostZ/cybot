"""
threats/url_scanner.py

Lightweight URL threat analysis pipeline for the Live Threats scanner.

Pipeline:
  1. SSRF guard         — validates URL is safe to scan (no private hosts)
  2. Structure analysis — regex heuristics, no network calls
  3. AI analysis        — GPT-4o via linkguard.ai_analyzer (Redis-cached 6 h)

The output dict uses ``_``-prefixed keys for fields that are returned in the
API response but not stored in the ``threat_alerts`` Supabase table.
"""

import ipaddress
import logging
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ── Structural threat signals ─────────────────────────────────────────────────

_STRUCT_CHECKS: list[tuple[str, str]] = [
    (r"^\d{1,3}(\.\d{1,3}){3}",                                              "IP address used as host"),
    (r".{200,}",                                                               "Abnormally long URL"),
    (r"@",                                                                     "Username-trick in URL"),
    (r"-{3,}",                                                                 "Excessive dashes (typosquatting)"),
    (r"(?i)(login|signin|verify|account|secure|update|confirm|password)",     "Credential-harvest keyword"),
    (r"(?i)(free|prize|winner|claim|urgent|suspended|compromised)",           "Social-engineering keyword"),
    (r"(?i)(paypal|amazon|google|microsoft|apple|facebook|instagram|netflix)(?!\.com)", "Brand impersonation"),
    (r"\.(tk|ml|ga|cf|gq|pw|zip|work|click|xyz|top|loan|biz)(/|$)",         "High-risk TLD"),
]

# ── SSRF blocked address ranges ───────────────────────────────────────────────

_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

_BLOCKED_HOSTNAMES = frozenset({"localhost", "local", "internal", "metadata.google.internal"})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_private_host(hostname: str) -> bool:
    if hostname.lower() in _BLOCKED_HOSTNAMES:
        return True
    try:
        addr = ipaddress.ip_address(hostname)
        return any(addr in net for net in _PRIVATE_NETS)
    except ValueError:
        return False


def extract_domain(url: str) -> str:
    """Return the netloc component if *url* looks like a URL, else truncate title."""
    try:
        parsed = urlparse(url)
        if parsed.netloc:
            return parsed.netloc
    except Exception:
        pass
    return url[:60] if len(url) > 60 else url


def validate_url(url: str) -> str | None:
    """
    Validate that *url* is safe to scan.

    Returns:
        ``None``      — URL is valid
        ``str``       — human-readable error message
    """
    if not url:
        return "URL must not be empty."

    try:
        parsed = urlparse(url)
    except Exception:
        return "Malformed URL."

    if parsed.scheme not in ("http", "https"):
        return "Only http and https URLs are supported."

    hostname = (parsed.hostname or "").strip()
    if not hostname:
        return "URL has no hostname."

    if _is_private_host(hostname):
        return "Scanning internal or private addresses is not allowed."

    return None  # valid


# ── Core pipeline ─────────────────────────────────────────────────────────────

def _struct_analysis(url: str) -> list[str]:
    """Run regex heuristics and return a list of threat signals."""
    return [label for pattern, label in _STRUCT_CHECKS if re.search(pattern, url)]


def _map_severity(risk: str, ai_confidence: int, struct_count: int) -> str:
    boosted = min(100, ai_confidence + struct_count * 8)
    rl = risk.lower()
    if rl == "safe":
        return "LOW" if boosted < 60 else "MEDIUM"
    if rl == "dangerous":
        return "CRITICAL" if boosted >= 70 else "HIGH"
    # Suspicious
    return "HIGH" if boosted >= 65 else "MEDIUM"


def _infer_threat_type(reason: str, tactics: list[str]) -> str:
    text = (reason + " " + " ".join(tactics)).lower()
    if "malware" in text or "ransomware" in text or "trojan" in text:
        return "malware"
    if "phish" in text or "credential" in text or "login" in text or "harvest" in text:
        return "phishing"
    if ("data" in text and ("breach" in text or "leak" in text or "exfil" in text)):
        return "data_breach"
    if "ddos" in text or "flood" in text or "denial" in text:
        return "ddos"
    return "other"


def analyze_url_for_threat(url: str, source: str = "scan") -> dict:
    """
    Run the full URL threat analysis pipeline.

    Returns a merged dict with:
      * DB-storable keys (title, description, severity, threat_type,
        confidence, source_ip, is_active, ml_model_used)
      * Extra response keys prefixed with ``_`` (domain, score, source,
        tactics, risk) — these are returned in the API response but not
        stored directly in ``threat_alerts``.

    Args:
        url:    The URL to analyse (already validated by ``validate_url``).
        source: Origin of the scan: ``scan`` | ``clipboard`` | ``manual``.
    """
    # Lazy import avoids startup overhead and potential circular-import issues
    from linkguard.ai_analyzer import analyze as ai_analyze

    domain  = extract_domain(url)
    signals = _struct_analysis(url)

    # ── AI analysis (cached 6 h) ──────────────────────────────────────────────
    try:
        ai = ai_analyze(url)
    except Exception as exc:
        logger.warning("AI analysis failed for %s: %s", url, exc)
        ai = {
            "risk":       "Suspicious",
            "confidence": 50,
            "reason":     "AI analysis unavailable.",
            "tactics":    [],
            "ai_score":   50,
        }

    risk          = ai.get("risk", "Suspicious")
    ai_confidence = max(0, min(100, int(ai.get("confidence", 50))))
    reason        = (ai.get("reason") or "").strip() or "Suspicious URL detected."
    ai_tactics    = ai.get("tactics") or []
    ai_safety     = max(0, min(100, int(ai.get("ai_score", 50))))

    # Merge unique signals; AI tactics first for readability
    all_tactics = list(dict.fromkeys(ai_tactics + signals))[:6]

    # Append any structural signals not already mentioned in the reason
    unmentioned = [s for s in signals[:2] if s.lower() not in reason.lower()]
    if unmentioned:
        reason = f"{reason} Detected: {'; '.join(unmentioned)}."

    severity    = _map_severity(risk, ai_confidence, len(signals))
    threat_type = _infer_threat_type(reason, all_tactics)

    # Danger score: 0–100  (higher = more dangerous).
    # Invert the AI "safety" score then boost by structural signals.
    score = min(100, (100 - ai_safety) + len(signals) * 5)

    return {
        # ── threat_alerts columns ────────────────────────────────────────────
        "title":         url,
        "description":   reason,
        "severity":      severity,
        "threat_type":   threat_type,
        "confidence":    round(ai_confidence / 100, 4),
        "source_ip":     None,
        "is_active":     True,
        "ml_model_used": f"source:{source}",
        # ── extra response fields (not stored directly) ──────────────────────
        "_domain":  domain,
        "_score":   score,
        "_source":  source,
        "_tactics": all_tactics,
        "_risk":    risk,
    }

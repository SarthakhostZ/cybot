"""
privacy_audit/link_scanner.py

Production-grade Link Security Scanner.

Performs deep, multi-signal URL analysis and returns a structured result
with a 0–100 safety score, risk classification, per-check breakdown, and
a human-readable explanation.

External dependencies (beyond stdlib + requests):
    python-whois  — WHOIS domain-age lookup
    Google Safe Browsing v4 API  — blacklist check (GOOGLE_SAFE_BROWSING_API_KEY)

All network calls use hard timeouts. Failures are gracefully demoted to
"unknown" rather than crashing the whole scan.
"""

import ipaddress
import logging
import re
import socket
import ssl
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

import requests
import whois as python_whois
from django.conf import settings

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

SUSPICIOUS_TLDS = {
    ".xyz", ".tk", ".ml", ".ga", ".cf", ".gq", ".pw", ".top",
    ".click", ".download", ".stream", ".gdn", ".racing", ".review",
    ".date", ".accountant", ".science", ".work", ".party",
}

PHISHING_KEYWORDS = [
    "login", "verify", "bank", "secure", "update", "account",
    "password", "confirm", "signin", "credential", "billing",
    "invoice", "paypal", "amazon", "apple", "microsoft", "google",
    "netflix", "ebay", "chase", "wellsfargo", "citibank",
]

# Brands commonly spoofed — keyword appears in domain but is NOT the real domain
BRAND_KEYWORDS = {
    "paypal": "paypal.com",
    "amazon": "amazon.com",
    "apple": "apple.com",
    "microsoft": "microsoft.com",
    "google": "google.com",
    "netflix": "netflix.com",
    "ebay": "ebay.com",
    "facebook": "facebook.com",
    "instagram": "instagram.com",
    "twitter": "twitter.com",
    "chase": "chase.com",
    "wellsfargo": "wellsfargo.com",
}

GSB_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find"
REQUEST_TIMEOUT = 8  # seconds


# ─── Public API ───────────────────────────────────────────────────────────────

class LinkScanner:
    """Stateless URL scanner — call scan() once per request."""

    def scan(self, url: str) -> dict:
        """
        Analyse *url* and return:
        {
            "url": str,
            "score": int,          # 0–100 (higher = safer)
            "risk": str,           # "Safe" | "Suspicious" | "Dangerous"
            "summary": str,        # one-sentence human explanation
            "checks": [
                { "name": str, "status": "pass"|"fail"|"warn"|"unknown",
                  "message": str }
            ]
        }
        """
        parsed  = self._parse_url(url)
        checks  = []
        score   = 100

        # 1. HTTPS presence
        https_check, https_delta = self._check_https(parsed)
        checks.append(https_check)
        score += https_delta

        # 2. SSL certificate
        ssl_check, ssl_delta = self._check_ssl(parsed)
        checks.append(ssl_check)
        score += ssl_delta

        # 3. IP-based URL
        ip_check, ip_delta = self._check_ip_url(parsed)
        checks.append(ip_check)
        score += ip_delta

        # 4. Domain age
        age_check, age_delta = self._check_domain_age(parsed)
        checks.append(age_check)
        score += age_delta

        # 5. Blacklist (Google Safe Browsing)
        bl_check, bl_delta = self._check_blacklist(url)
        checks.append(bl_check)
        score += bl_delta

        # 6. Phishing heuristics
        phish_check, phish_delta = self._check_phishing(parsed)
        checks.append(phish_check)
        score += phish_delta

        # 7. Brand impersonation
        brand_check, brand_delta = self._check_brand_impersonation(parsed)
        checks.append(brand_check)
        score += brand_delta

        # 8. Redirect depth
        redirect_check, redirect_delta = self._check_redirects(url)
        checks.append(redirect_check)
        score += redirect_delta

        # 9. Suspicious TLD
        tld_check, tld_delta = self._check_tld(parsed)
        checks.append(tld_check)
        score += tld_delta

        # 10. URL length
        len_check, len_delta = self._check_url_length(url)
        checks.append(len_check)
        score += len_delta

        # 11. DNS resolution
        dns_check, dns_delta = self._check_dns(parsed)
        checks.append(dns_check)
        score += dns_delta

        # 12. Excessive subdomains
        sub_check, sub_delta = self._check_subdomains(parsed)
        checks.append(sub_check)
        score += sub_delta

        score = max(0, min(100, score))
        risk  = self._classify(score)

        return {
            "url":     url,
            "score":   score,
            "risk":    risk,
            "summary": self._build_summary(score, risk, checks),
            "checks":  checks,
        }

    # ─── Individual Checks ────────────────────────────────────────────────────

    def _check_https(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        if parsed.scheme == "https":
            return _ok("HTTPS", "Connection is encrypted over HTTPS."), 0
        if parsed.scheme == "http":
            return _fail("HTTPS", "No HTTPS — connection is unencrypted."), -15
        return _warn("HTTPS", f"Non-standard scheme '{parsed.scheme}'."), -5

    def _check_ssl(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        if parsed.scheme != "https":
            return _unknown("SSL Certificate", "Not applicable — site does not use HTTPS."), 0

        hostname = parsed.hostname
        if not hostname:
            return _unknown("SSL Certificate", "Unable to determine hostname."), 0

        try:
            ctx  = ssl.create_default_context()
            port = parsed.port or 443
            with ctx.wrap_socket(
                socket.create_connection((hostname, port), timeout=REQUEST_TIMEOUT),
                server_hostname=hostname,
            ) as conn:
                cert  = conn.getpeercert()
                expiry_str = cert.get("notAfter", "")
                if expiry_str:
                    expiry = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
                    days_left = (expiry - datetime.now(timezone.utc)).days
                    if days_left < 0:
                        return _fail("SSL Certificate", "SSL certificate has expired."), -20
                    if days_left < 15:
                        return _warn("SSL Certificate", f"SSL certificate expires in {days_left} day(s)."), -10
                issuer = dict(x[0] for x in cert.get("issuer", []))
                org    = issuer.get("organizationName", "Unknown CA")
                return _ok("SSL Certificate", f"Valid certificate. Issued by {org}. Expires in {days_left} days."), 0
        except ssl.SSLCertVerificationError as exc:
            return _fail("SSL Certificate", f"SSL verification failed: {exc}."), -20
        except ssl.SSLError as exc:
            return _fail("SSL Certificate", f"SSL error: {exc}."), -20
        except (socket.timeout, OSError):
            return _unknown("SSL Certificate", "Could not connect to server to verify certificate."), 0

    def _check_ip_url(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        hostname = parsed.hostname or ""
        try:
            ipaddress.ip_address(hostname)
            return _fail("IP-Based URL", "URL uses a raw IP address instead of a domain — common in phishing."), -30
        except ValueError:
            return _ok("IP-Based URL", "URL uses a proper domain name."), 0

    def _check_domain_age(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        hostname = parsed.hostname or ""
        if not hostname:
            return _unknown("Domain Age", "Unable to extract domain."), 0

        # strip www / subdomains to get registrable domain
        parts  = hostname.split(".")
        domain = ".".join(parts[-2:]) if len(parts) >= 2 else hostname

        try:
            info       = python_whois.whois(domain)
            created    = info.creation_date
            if isinstance(created, list):
                created = created[0]
            if not created:
                return _unknown("Domain Age", "WHOIS record found but no creation date."), 0

            # ensure timezone-aware
            if hasattr(created, "tzinfo") and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)

            age_days  = (datetime.now(timezone.utc) - created).days
            age_months = age_days / 30

            if age_months < 6:
                return (
                    _fail("Domain Age", f"Domain is very new ({int(age_months)} months old) — high phishing risk."),
                    -25,
                )
            if age_months < 12:
                return (
                    _warn("Domain Age", f"Domain is relatively new ({int(age_months)} months old)."),
                    -15,
                )
            years = age_days // 365
            return _ok("Domain Age", f"Domain is established ({years} year(s) old)."), 0

        except Exception as exc:
            logger.debug("WHOIS lookup failed for %s: %s", domain, exc)
            return _unknown("Domain Age", "WHOIS lookup unavailable — domain age could not be determined."), 0

    def _check_blacklist(self, url: str) -> tuple[dict, int]:
        api_key = getattr(settings, "GOOGLE_SAFE_BROWSING_API_KEY", "")
        if not api_key:
            return _unknown("Blacklist (Google Safe Browsing)", "API key not configured."), 0

        payload = {
            "client": {"clientId": "cybot", "clientVersion": "1.0"},
            "threatInfo": {
                "threatTypes":      ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
                "platformTypes":    ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries":    [{"url": url}],
            },
        }
        try:
            resp = requests.post(
                GSB_ENDPOINT,
                params={"key": api_key},
                json=payload,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("matches"):
                threat_type = data["matches"][0].get("threatType", "UNKNOWN")
                return _fail("Blacklist", f"URL is flagged by Google Safe Browsing as {threat_type}."), -50
            return _ok("Blacklist", "Not found in Google Safe Browsing database."), 0
        except Exception as exc:
            logger.warning("Safe Browsing API error: %s", exc)
            return _unknown("Blacklist", "Safe Browsing check could not be completed."), 0

    def _check_phishing(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        full = (parsed.netloc + parsed.path + (parsed.query or "")).lower()
        hits = [kw for kw in PHISHING_KEYWORDS if kw in full]
        if len(hits) >= 3:
            return _fail("Phishing Keywords", f"Multiple phishing keywords detected: {', '.join(hits[:5])}."), -10
        if hits:
            return _warn("Phishing Keywords", f"Phishing keyword(s) present in URL: {', '.join(hits)}."), -5
        return _ok("Phishing Keywords", "No common phishing keywords detected."), 0

    def _check_brand_impersonation(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        hostname = (parsed.hostname or "").lower()
        for brand, real_domain in BRAND_KEYWORDS.items():
            if brand in hostname and not hostname.endswith(real_domain):
                return (
                    _fail("Brand Impersonation", f"Domain contains '{brand}' but is not {real_domain} — likely spoofed."),
                    -20,
                )
        return _ok("Brand Impersonation", "No brand impersonation patterns detected."), 0

    def _check_redirects(self, url: str) -> tuple[dict, int]:
        try:
            resp  = requests.get(
                url,
                allow_redirects=True,
                timeout=REQUEST_TIMEOUT,
                headers={"User-Agent": "Mozilla/5.0 (Cybot-Scanner/1.0)"},
                stream=True,          # avoid downloading body
            )
            resp.close()
            depth = len(resp.history)
            if depth == 0:
                return _ok("Redirect Chain", "No redirects. URL resolves directly."), 0
            if depth <= 2:
                return _ok("Redirect Chain", f"{depth} redirect(s) — normal."), 0
            if depth <= 4:
                return _warn("Redirect Chain", f"{depth} redirects detected — moderately suspicious."), -5
            return _fail("Redirect Chain", f"{depth} redirects — excessive chain, potential cloaking."), -10
        except requests.exceptions.SSLError:
            return _fail("Redirect Chain", "SSL error while following redirects."), -10
        except requests.exceptions.ConnectionError:
            return _fail("Redirect Chain", "Could not connect to host."), -5
        except Exception as exc:
            logger.debug("Redirect check failed for %s: %s", url, exc)
            return _unknown("Redirect Chain", "Redirect check could not be completed."), 0

    def _check_tld(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        hostname = (parsed.hostname or "").lower()
        for tld in SUSPICIOUS_TLDS:
            if hostname.endswith(tld):
                return _warn("TLD Reputation", f"TLD '{tld}' is frequently abused in malicious campaigns."), -10
        return _ok("TLD Reputation", "TLD has no elevated risk profile."), 0

    def _check_url_length(self, url: str) -> tuple[dict, int]:
        length = len(url)
        if length > 200:
            return _warn("URL Length", f"URL is very long ({length} chars) — often used to obfuscate destinations."), -5
        if length > 75:
            return _warn("URL Length", f"URL is longer than typical ({length} chars)."), -3
        return _ok("URL Length", f"URL length is normal ({length} chars)."), 0

    def _check_dns(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        hostname = parsed.hostname or ""
        if not hostname:
            return _fail("DNS Resolution", "No hostname found in URL."), -5
        # Skip for raw IPs — already flagged
        try:
            ipaddress.ip_address(hostname)
            return _ok("DNS Resolution", "IP address — DNS not applicable."), 0
        except ValueError:
            pass
        try:
            socket.setdefaulttimeout(REQUEST_TIMEOUT)
            socket.gethostbyname(hostname)
            return _ok("DNS Resolution", f"{hostname} resolves successfully."), 0
        except socket.gaierror:
            return _fail("DNS Resolution", f"{hostname} does not resolve — domain may not exist."), -15

    def _check_subdomains(self, parsed: urllib.parse.ParseResult) -> tuple[dict, int]:
        hostname = parsed.hostname or ""
        try:
            ipaddress.ip_address(hostname)
            return _ok("Subdomain Depth", "Not applicable for IP addresses."), 0
        except ValueError:
            pass
        parts = hostname.split(".")
        # e.g. login.secure.bank.example.com → 3 subdomains
        subdomain_count = max(0, len(parts) - 2)
        if subdomain_count > 3:
            return _warn("Subdomain Depth", f"{subdomain_count} subdomain levels — common in phishing URLs."), -10
        if subdomain_count > 2:
            return _warn("Subdomain Depth", f"{subdomain_count} subdomain levels."), -5
        return _ok("Subdomain Depth", "Subdomain structure is normal."), 0

    # ─── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_url(url: str) -> urllib.parse.ParseResult:
        """Normalise and parse URL. Add scheme if missing."""
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9+\-.]*://", url):
            url = "https://" + url
        return urllib.parse.urlparse(url)

    @staticmethod
    def _classify(score: int) -> str:
        if score >= 80:
            return "Safe"
        if score >= 50:
            return "Suspicious"
        return "Dangerous"

    @staticmethod
    def _build_summary(score: int, risk: str, checks: list[dict]) -> str:
        failures = [c for c in checks if c["status"] == "fail"]
        warnings = [c for c in checks if c["status"] == "warn"]

        if risk == "Safe":
            return (
                "This URL appears safe. "
                "All major security indicators passed without significant issues."
            )

        reasons = []

        # Prioritise most impactful failures
        priority_order = [
            "Blacklist", "Brand Impersonation", "IP-Based URL",
            "SSL Certificate", "HTTPS", "Domain Age",
            "Redirect Chain", "Phishing Keywords",
        ]
        named_failures = {c["name"]: c for c in failures}
        for name in priority_order:
            if name in named_failures:
                reasons.append(named_failures[name]["message"].rstrip(".").lower())
        # Add any remaining failures not in priority list
        for c in failures:
            if c["name"] not in priority_order and c["name"] not in [r for r in reasons]:
                reasons.append(c["message"].rstrip(".").lower())

        if not reasons and warnings:
            for c in warnings[:2]:
                reasons.append(c["message"].rstrip(".").lower())

        if not reasons:
            return f"This URL scored {score}/100 ({risk}). Exercise caution."

        joined = "; ".join(reasons[:3])
        prefix = "This URL is potentially dangerous" if risk == "Dangerous" else "This URL has raised concerns"
        return f"{prefix} because {joined}."


# ─── Check result factories ───────────────────────────────────────────────────

def _ok(name: str, message: str) -> dict:
    return {"name": name, "status": "pass", "message": message}


def _fail(name: str, message: str) -> dict:
    return {"name": name, "status": "fail", "message": message}


def _warn(name: str, message: str) -> dict:
    return {"name": name, "status": "warn", "message": message}


def _unknown(name: str, message: str) -> dict:
    return {"name": name, "status": "unknown", "message": message}

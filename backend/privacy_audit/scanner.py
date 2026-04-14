"""
privacy_audit/scanner.py

HaveIBeenPwned (HIBP) v3 integration + risk scoring.

HIBP API docs: https://haveibeenpwned.com/API/v3
Requires:
    HIBP_API_KEY — set in backend/.env
    pip install requests (already in requirements.txt)
"""

import hashlib
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

HIBP_BREACH_URL = "https://haveibeenpwned.com/api/v3/breachedaccount/{email}"
HIBP_PASTE_URL  = "https://haveibeenpwned.com/api/v3/pasteaccount/{email}"

_HEADERS = {
    "hibp-api-key": getattr(settings, "HIBP_API_KEY", ""),
    "User-Agent":   "Cybot-Privacy-Scanner/1.0",
}

# Risk level thresholds
# (breach_count, has_sensitive_breach) → risk
SENSITIVE_DATA_CLASSES = {
    "Passwords", "Credit cards", "Bank account numbers",
    "Social security numbers", "Health records", "Financial information",
    "Private messages", "Biometric data",
}


class PrivacyScanner:
    """Run a privacy scan for an email address.

    Returns a dict ready for insertion into the privacy_audits table.
    """

    def scan(self, user_id: str, email: str) -> dict:
        breaches  = self._get_breaches(email)
        pastes    = self._get_pastes(email)

        breach_count      = len(breaches)
        paste_count       = len(pastes)
        sensitive_breach  = self._has_sensitive_data(breaches)
        data_classes      = self._collect_data_classes(breaches)
        risk_level        = self._calculate_risk(breach_count, sensitive_breach)
        recommendations   = self._build_recommendations(breach_count, sensitive_breach, data_classes)

        return {
            "user_id":        user_id,
            "email_scanned":  email,
            "breach_count":   breach_count,
            "paste_count":    paste_count,
            "risk_level":     risk_level,
            "data_classes":   data_classes,
            "recommendations": recommendations,
            "raw_breaches":   [b.get("Name") for b in breaches],
        }

    # ------------------------------------------------------------------ #
    #  HIBP API calls                                                      #
    # ------------------------------------------------------------------ #

    def _get_breaches(self, email: str) -> list[dict]:
        """Return list of breach objects for *email*, or [] on error."""
        if not _HEADERS["hibp-api-key"]:
            logger.warning("HIBP_API_KEY not configured — skipping breach lookup")
            return []
        try:
            url  = HIBP_BREACH_URL.format(email=email)
            resp = requests.get(url, headers=_HEADERS, params={"truncateResponse": "false"}, timeout=8)
            if resp.status_code == 404:
                return []  # no breaches
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            logger.error("HIBP breach lookup failed for %s: %s", email, exc)
            return []

    def _get_pastes(self, email: str) -> list[dict]:
        """Return paste count for *email*."""
        if not _HEADERS["hibp-api-key"]:
            return []
        try:
            url  = HIBP_PASTE_URL.format(email=email)
            resp = requests.get(url, headers=_HEADERS, timeout=8)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            logger.error("HIBP paste lookup failed for %s: %s", email, exc)
            return []

    # ------------------------------------------------------------------ #
    #  Scoring & recommendations                                           #
    # ------------------------------------------------------------------ #

    def _has_sensitive_data(self, breaches: list[dict]) -> bool:
        for breach in breaches:
            classes = set(breach.get("DataClasses", []))
            if classes & SENSITIVE_DATA_CLASSES:
                return True
        return False

    def _collect_data_classes(self, breaches: list[dict]) -> list[str]:
        classes: set[str] = set()
        for breach in breaches:
            classes.update(breach.get("DataClasses", []))
        return sorted(classes)

    def _calculate_risk(self, breach_count: int, sensitive: bool) -> str:
        if breach_count == 0:
            return "LOW"
        if sensitive or breach_count >= 5:
            return "CRITICAL"
        if breach_count >= 3:
            return "HIGH"
        if breach_count >= 1:
            return "MEDIUM"
        return "LOW"

    def _build_recommendations(
        self, breach_count: int, sensitive: bool, data_classes: list[str]
    ) -> list[str]:
        recs: list[str] = []

        if breach_count == 0:
            recs.append("No known breaches found. Keep using strong, unique passwords.")
            return recs

        recs.append(
            f"Your email appeared in {breach_count} data breach(es). "
            "Change your passwords on affected services immediately."
        )

        if "Passwords" in data_classes:
            recs.append("Your password was exposed. Enable a password manager (e.g. Bitwarden, 1Password).")

        if sensitive:
            recs.append(
                "Sensitive data (financial, health, or identity) was leaked. "
                "Consider a credit freeze and monitor your credit report."
            )

        if breach_count >= 3:
            recs.append("Enable multi-factor authentication (MFA) on all important accounts.")

        recs.append("Check each breached service and revoke active sessions where possible.")

        return recs

"""
privacy_audit/serializers.py
"""

from rest_framework import serializers


# ─── Legacy HIBP serializers (kept for backward compatibility) ─────────────────

class PrivacyAuditRequestSerializer(serializers.Serializer):
    """Validates a HIBP scan request body."""
    email = serializers.EmailField()


class PrivacyAuditSerializer(serializers.Serializer):
    """Read serializer — shapes raw Supabase rows for API consumers."""

    id             = serializers.UUIDField(read_only=True)
    user_id        = serializers.UUIDField(read_only=True)
    email_scanned  = serializers.EmailField(read_only=True)
    breach_count   = serializers.IntegerField(read_only=True)
    paste_count    = serializers.IntegerField(read_only=True)
    risk_level     = serializers.CharField(read_only=True)
    data_classes   = serializers.ListField(child=serializers.CharField(), read_only=True)
    recommendations = serializers.ListField(child=serializers.CharField(), read_only=True)
    raw_breaches   = serializers.ListField(child=serializers.CharField(), read_only=True)
    created_at     = serializers.DateTimeField(read_only=True)


# ─── Link Scanner serializers ──────────────────────────────────────────────────

class LinkScanRequestSerializer(serializers.Serializer):
    """Validates a link-scan request body."""
    url = serializers.CharField(
        max_length=2048,
        trim_whitespace=True,
        error_messages={"blank": "A URL is required."},
    )

    def validate_url(self, value: str) -> str:
        # Block obviously private/RFC-1918 addresses (basic SSRF prevention)
        import re, ipaddress, urllib.parse

        normalized = value if "://" in value else "https://" + value
        try:
            parsed = urllib.parse.urlparse(normalized)
        except Exception:
            raise serializers.ValidationError("Invalid URL format.")

        hostname = parsed.hostname or ""

        # Block numeric IPs that are private ranges
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                raise serializers.ValidationError("Scanning private/internal addresses is not permitted.")
        except ValueError:
            pass  # not an IP — fine

        # Block localhost aliases
        if hostname.lower() in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            raise serializers.ValidationError("Scanning local addresses is not permitted.")

        return value


class CheckResultSerializer(serializers.Serializer):
    name    = serializers.CharField()
    status  = serializers.ChoiceField(choices=["pass", "fail", "warn", "unknown"])
    message = serializers.CharField()


class LinkScanResultSerializer(serializers.Serializer):
    url     = serializers.CharField()
    score   = serializers.IntegerField(min_value=0, max_value=100)
    risk    = serializers.ChoiceField(choices=["Safe", "Suspicious", "Dangerous"])
    summary = serializers.CharField()
    checks  = CheckResultSerializer(many=True)

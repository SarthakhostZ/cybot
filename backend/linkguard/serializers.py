"""
linkguard/serializers.py

DRF serializers for the LinkGuard scan API.
"""

from rest_framework import serializers
from .models import LinkScan


class ScanRequestSerializer(serializers.Serializer):
    """Validates the POST /api/v1/linkguard/scan request body."""

    # CharField instead of URLField so we can normalise the scheme first
    url = serializers.CharField(max_length=2048)
    client_score = serializers.IntegerField(min_value=0, max_value=100)
    client_flags = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )

    def validate_url(self, value: str) -> str:
        """Normalise scheme, then reject dangerous schemes and private targets."""
        import re
        from urllib.parse import urlparse

        value = value.strip()

        # Add https:// if the client sent a bare domain (e.g. "example.com")
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9+\-.]*://", value):
            value = "https://" + value

        scheme = urlparse(value).scheme.lower()
        if scheme not in ("http", "https"):
            raise serializers.ValidationError(
                "Only http and https URLs are accepted."
            )

        # Block javascript: / data: at serializer level (belt-and-suspenders)
        if re.search(r"javascript:|data:", value, re.IGNORECASE):
            raise serializers.ValidationError("URL scheme is not permitted.")

        return value


class AIAnalysisSerializer(serializers.Serializer):
    risk = serializers.CharField()
    confidence = serializers.IntegerField()
    reason = serializers.CharField()


class ScanResponseSerializer(serializers.ModelSerializer):
    """Serialises a saved LinkScan for the API response."""

    scan_id = serializers.UUIDField(source="id")
    ai_analysis = serializers.SerializerMethodField()

    class Meta:
        model = LinkScan
        fields = [
            "scan_id",
            "final_score",
            "verdict",
            "flags",
            "ai_analysis",
            "domain_age_days",
            "ssl_valid",
            "redirect_chain",
            "google_safe_browsing",
            "scanned_at",
        ]

    def get_ai_analysis(self, obj):
        if obj.ai_explanation:
            import json
            try:
                return json.loads(obj.ai_explanation)
            except (json.JSONDecodeError, TypeError):
                return {"reason": obj.ai_explanation}
        return None


class LinkScanListSerializer(serializers.ModelSerializer):
    """Compact serializer for scan history list."""

    scan_id = serializers.UUIDField(source="id")

    class Meta:
        model = LinkScan
        fields = [
            "scan_id",
            "url_hash",
            "final_score",
            "verdict",
            "flags",
            "scanned_at",
        ]


class ScanStatsSerializer(serializers.Serializer):
    total_scans = serializers.IntegerField()
    threats_blocked = serializers.IntegerField()
    suspicious_count = serializers.IntegerField()
    safe_count = serializers.IntegerField()

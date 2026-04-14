"""
threats/serializers.py
"""

from rest_framework import serializers

SEVERITY_CHOICES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
THREAT_TYPE_CHOICES = [
    "malware", "phishing", "data_breach", "ransomware",
    "ddos", "insider_threat", "vulnerability", "other",
]


class ThreatAlertSerializer(serializers.Serializer):
    """Read serializer — shapes raw Supabase rows for API consumers."""

    id            = serializers.UUIDField(read_only=True)
    user_id       = serializers.UUIDField(read_only=True)
    title         = serializers.CharField(read_only=True)
    description   = serializers.CharField(read_only=True)
    severity      = serializers.ChoiceField(choices=SEVERITY_CHOICES, read_only=True)
    threat_type   = serializers.ChoiceField(choices=THREAT_TYPE_CHOICES, read_only=True)
    confidence    = serializers.FloatField(read_only=True)
    source_ip     = serializers.IPAddressField(allow_null=True, read_only=True)
    is_active     = serializers.BooleanField(read_only=True)
    ml_model_used = serializers.CharField(allow_null=True, read_only=True)
    created_at    = serializers.DateTimeField(read_only=True)
    updated_at    = serializers.DateTimeField(read_only=True)


class ThreatCreateSerializer(serializers.Serializer):
    """Write serializer — validates incoming threat creation payload."""

    title       = serializers.CharField(max_length=255)
    description = serializers.CharField(allow_blank=True, default="")
    severity    = serializers.ChoiceField(choices=SEVERITY_CHOICES, default="LOW")
    threat_type = serializers.ChoiceField(choices=THREAT_TYPE_CHOICES, default="other")
    confidence  = serializers.FloatField(min_value=0.0, max_value=1.0, default=1.0)
    source_ip   = serializers.IPAddressField(allow_null=True, required=False, default=None)
    is_active   = serializers.BooleanField(default=True)


class ThreatStatsSerializer(serializers.Serializer):
    """Read serializer for get_threat_stats() RPC result."""

    total_threats    = serializers.IntegerField()
    active_threats   = serializers.IntegerField()
    critical_count   = serializers.IntegerField()
    high_count       = serializers.IntegerField()
    medium_count     = serializers.IntegerField()
    low_count        = serializers.IntegerField()
    avg_confidence   = serializers.FloatField(allow_null=True)

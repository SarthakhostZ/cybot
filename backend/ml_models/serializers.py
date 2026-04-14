"""
ml_models/serializers.py
"""

from rest_framework import serializers
from ml_models.feature_extractor import FEATURE_NAMES


class PredictRequestSerializer(serializers.Serializer):
    """Validate a prediction request body.

    Accepts either:
      features  – dict mapping feature name → numeric value  (preferred)
      vector    – list of 10 raw floats (already extracted)
    """
    features = serializers.DictField(
        child=serializers.FloatField(),
        required=False,
        allow_empty=False,
    )
    vector = serializers.ListField(
        child=serializers.FloatField(),
        required=False,
        min_length=len(FEATURE_NAMES),
        max_length=len(FEATURE_NAMES),
    )

    def validate(self, data):
        if not data.get("features") and not data.get("vector"):
            raise serializers.ValidationError(
                "Provide either 'features' (dict) or 'vector' (list of 10 floats)."
            )
        return data


class PredictResponseSerializer(serializers.Serializer):
    threat_class   = serializers.CharField()
    confidence     = serializers.FloatField()
    probabilities  = serializers.DictField(child=serializers.FloatField())
    is_threat      = serializers.BooleanField()
    model_loaded   = serializers.BooleanField()


class ModelInfoSerializer(serializers.Serializer):
    """Represents a model version in Supabase Storage."""
    name         = serializers.CharField()
    storage_path = serializers.CharField()
    size_bytes   = serializers.IntegerField(allow_null=True)
    created_at   = serializers.CharField(allow_null=True)

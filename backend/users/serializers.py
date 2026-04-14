"""
users/serializers.py

DRF serializers for the profiles table (backed by Supabase Postgres).
No Django ORM models — data is fetched/written via the Supabase Python client.
"""

from rest_framework import serializers


class ProfileSerializer(serializers.Serializer):
    """Read + partial-update serializer for public.profiles."""

    id             = serializers.UUIDField(read_only=True)
    full_name      = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone          = serializers.CharField(max_length=30,  required=False, allow_blank=True, allow_null=True)
    avatar_url     = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    security_score = serializers.IntegerField(read_only=True, min_value=0, max_value=100)
    role           = serializers.ChoiceField(choices=["user", "analyst", "admin"], read_only=True)
    created_at     = serializers.DateTimeField(read_only=True)
    updated_at     = serializers.DateTimeField(read_only=True)

    UPDATABLE_FIELDS = {"full_name", "phone", "avatar_url"}

    def validate(self, data):
        unknown = set(data) - self.UPDATABLE_FIELDS
        if unknown:
            raise serializers.ValidationError(
                f"Fields {unknown} are not updatable."
            )
        return data


class PublicProfileSerializer(serializers.Serializer):
    """Minimal read-only profile for public-facing contexts (threat reporter info)."""

    id        = serializers.UUIDField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    role      = serializers.CharField(read_only=True)

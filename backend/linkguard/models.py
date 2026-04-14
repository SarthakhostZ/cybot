"""
linkguard/models.py

LinkScan — persists every URL scan result to the database.
"""

from uuid import uuid4
from django.db import models


class LinkScan(models.Model):
    """Records a single URL scan with all scoring signals and final verdict."""

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user_id = models.CharField(max_length=255, db_index=True)  # Supabase user UUID

    url = models.URLField(max_length=2048)
    url_hash = models.CharField(max_length=64, db_index=True)  # SHA-256 of URL

    # Scores (0-100)
    client_score = models.IntegerField()
    backend_score = models.IntegerField(null=True, blank=True)
    ai_score = models.IntegerField(null=True, blank=True)
    final_score = models.IntegerField(null=True, blank=True)

    verdict = models.CharField(max_length=20)  # safe | suspicious | dangerous

    # Fields added by migration 0002 — must match the live DB schema
    status          = models.CharField(max_length=20, default="")
    url_score       = models.IntegerField(null=True, blank=True)
    domain_score    = models.IntegerField(null=True, blank=True)
    threat_score    = models.IntegerField(null=True, blank=True)
    reasons         = models.JSONField(default=list)
    ai_tactics      = models.JSONField(default=list)
    virustotal_result  = models.JSONField(null=True, blank=True)
    phishtank_result   = models.JSONField(null=True, blank=True)

    flags = models.JSONField(default=list)
    ai_explanation = models.TextField(null=True, blank=True)

    domain_age_days = models.IntegerField(null=True, blank=True)
    google_safe_browsing = models.JSONField(null=True, blank=True)
    redirect_chain = models.JSONField(null=True, blank=True)
    ssl_valid = models.BooleanField(null=True, blank=True)

    scanned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-scanned_at"]
        indexes = [
            models.Index(fields=["user_id", "-scanned_at"]),
        ]

    def __str__(self):
        return f"LinkScan({self.url_hash[:8]}… → {self.verdict})"

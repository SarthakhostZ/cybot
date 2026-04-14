"""
privacy_audit/views.py — Privacy Audit endpoints
"""

import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from core.supabase_client import get_supabase_admin
from core.pagination import SupabasePagination
from users.permissions import IsAuthenticated
from privacy_audit.serializers import (
    PrivacyAuditRequestSerializer,
    LinkScanRequestSerializer,
    LinkScanResultSerializer,
)
from privacy_audit.scanner import PrivacyScanner
from privacy_audit.link_scanner import LinkScanner

logger = logging.getLogger(__name__)


class PrivacyAuditView(APIView):
    """
    GET  /api/v1/privacy/audit/  — paginated audit history for the authenticated user
    POST /api/v1/privacy/audit/  — run a new HIBP privacy scan
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        pag    = SupabasePagination(request)
        client = get_supabase_admin()

        query  = (
            client.table("privacy_audits")
            .select("*", count="exact")
            .eq("user_id", request.supabase_user_id)
            .order("created_at", desc=True)
        )
        result = pag.apply(query).execute()
        return Response(pag.wrap(result.data, count=result.count))

    def post(self, request):
        from django.conf import settings

        # If HIBP API key is not configured, return coming_soon flag gracefully
        if not getattr(settings, "HIBP_API_KEY", ""):
            return Response({"coming_soon": True}, status=status.HTTP_200_OK)

        serializer = PrivacyAuditRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]

        try:
            scanner = PrivacyScanner()
            audit   = scanner.scan(user_id=request.supabase_user_id, email=email)
        except Exception as exc:
            logger.error("PrivacyScanner failed for %s: %s", request.supabase_user_id, exc)
            return Response({"error": "Scan failed. Please try again later."}, status=status.HTTP_502_BAD_GATEWAY)

        try:
            client = get_supabase_admin()
            result = client.table("privacy_audits").insert(audit).execute()
            if not result.data:
                return Response({"error": "Failed to save audit"}, status=status.HTTP_502_BAD_GATEWAY)
            return Response(result.data[0], status=status.HTTP_201_CREATED)
        except Exception as exc:
            logger.error("privacy_audits insert failed: %s", exc)
            # Return the scan result even if DB save fails
            return Response({**audit, "id": None}, status=status.HTTP_200_OK)


class PrivacyAuditDetailView(APIView):
    """GET /api/v1/privacy/audit/<id>/ — fetch a single audit record."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        client = get_supabase_admin()
        result = (
            client.table("privacy_audits")
            .select("*")
            .eq("id", pk)
            .eq("user_id", request.supabase_user_id)  # enforce ownership
            .single()
            .execute()
        )
        if not result.data:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(result.data)


class LinkScanView(APIView):
    """
    POST /api/v1/privacy/scan/link/

    Body:  { "url": "https://example.com" }
    Returns a full security analysis with score, risk, per-check breakdown,
    and a human-readable summary.

    Does NOT persist results — purely stateless analysis endpoint.
    Results are returned synchronously (all checks run inline with timeouts).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        req_ser = LinkScanRequestSerializer(data=request.data)
        if not req_ser.is_valid():
            return Response(req_ser.errors, status=status.HTTP_400_BAD_REQUEST)

        url    = req_ser.validated_data["url"]
        result = LinkScanner().scan(url)

        # Validate output shape (belt-and-suspenders)
        out_ser = LinkScanResultSerializer(data=result)
        if not out_ser.is_valid():
            logger.error("LinkScanner returned invalid shape: %s", out_ser.errors)
            return Response(
                {"error": "Internal analysis error."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(out_ser.validated_data, status=status.HTTP_200_OK)

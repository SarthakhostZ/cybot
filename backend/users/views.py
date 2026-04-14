"""
users/views.py  – Profile + Storage endpoints
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from core.supabase_client import get_supabase_admin
from core.storage_utils import list_user_reports, signed_report_url
from users.permissions import IsAuthenticated
from users.serializers import ProfileSerializer


class ProfileView(APIView):
    """GET/PATCH the authenticated user's profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        client = get_supabase_admin()
        result = (
            client.table("profiles")
            .select("*")
            .eq("id", request.supabase_user_id)
            .single()
            .execute()
        )
        if not result.data:
            return Response({"error": "Profile not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(result.data)

    def patch(self, request):
        serializer = ProfileSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updates = serializer.validated_data
        if not updates:
            return Response({"error": "No valid fields to update"}, status=status.HTTP_400_BAD_REQUEST)

        client = get_supabase_admin()
        result = (
            client.table("profiles")
            .update(updates)
            .eq("id", request.supabase_user_id)
            .execute()
        )
        return Response(result.data[0] if result.data else {})


class ReportListView(APIView):
    """GET /api/v1/users/reports/ — list the authenticated user's threat reports."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            reports = list_user_reports(request.supabase_user_id)
        except RuntimeError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(reports)


class ReportSignedUrlView(APIView):
    """POST /api/v1/users/reports/signed-url/ — generate a signed download URL.

    Body: { "path": "<storage path>" }
    The server validates the path belongs to the requesting user before signing.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        path = request.data.get("path", "").strip()
        if not path:
            return Response({"error": "path is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce ownership: path must start with the user's UUID
        if not path.startswith(f"{request.supabase_user_id}/"):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            url = signed_report_url(path)
        except RuntimeError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({"signed_url": url, "expires_in": 3600})

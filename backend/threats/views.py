"""
threats/views.py — Threat alerts + Chatbot + Cyber News endpoints
"""

import logging
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from core.supabase_client import get_supabase_admin
from core.pagination import SupabasePagination
from core.edge_functions import trigger_notify_threat
from users.permissions import IsAuthenticated, IsAnalyst
from threats.serializers import ThreatCreateSerializer, ThreatStatsSerializer

logger = logging.getLogger(__name__)

_NEWS_CACHE_TTL      = 900   # 15 minutes
_VALID_CATEGORIES    = {"ALL", "BREACH", "MALWARE", "PATCH", "ALERT", "OTHER"}
_NEWS_ITEMS_PER_PAGE = 20

# Severities that trigger push notifications
NOTIFY_SEVERITIES = {"HIGH", "CRITICAL"}


class ThreatListView(APIView):
    """
    GET  /api/v1/threats/         — paginated list with optional filters
    POST /api/v1/threats/         — create a new threat alert (analyst+)

    Query params (GET):
        severity    — LOW | MEDIUM | HIGH | CRITICAL
        threat_type — malware | phishing | data_breach | ransomware | ...
        is_active   — true | false  (default: true)
        search      — substring match on title
        page, per_page
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAnalyst()]
        return [IsAuthenticated()]

    def get(self, request):
        client = get_supabase_admin()
        pag    = SupabasePagination(request)

        query = client.table("threat_alerts").select("*", count="exact")

        # Filters
        is_active_param = request.query_params.get("is_active", "true").lower()
        query = query.eq("is_active", is_active_param != "false")

        severity = request.query_params.get("severity", "").upper()
        if severity in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            query = query.eq("severity", severity)

        threat_type = request.query_params.get("threat_type", "")
        if threat_type:
            query = query.eq("threat_type", threat_type)

        search = request.query_params.get("search", "").strip()
        if search:
            query = query.ilike("title", f"%{search}%")

        query  = query.order("created_at", desc=True)
        result = pag.apply(query).execute()

        return Response(pag.wrap(result.data, count=result.count))

    def post(self, request):
        serializer = ThreatCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        payload = {**serializer.validated_data, "user_id": request.supabase_user_id}

        client = get_supabase_admin()
        result = client.table("threat_alerts").insert(payload).execute()

        if not result.data:
            return Response({"error": "Insert failed"}, status=status.HTTP_502_BAD_GATEWAY)

        created = result.data[0]

        # Fire push notification for high-severity threats (non-blocking)
        if created.get("severity") in NOTIFY_SEVERITIES:
            try:
                trigger_notify_threat(created["id"])
            except Exception as exc:
                logger.warning("notify-threat call failed for %s: %s", created["id"], exc)

        return Response(created, status=status.HTTP_201_CREATED)


class ThreatDetailView(APIView):
    """
    GET   /api/v1/threats/<id>/  — fetch a single threat alert
    PATCH /api/v1/threats/<id>/  — update is_active or description (analyst+)
    """

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsAnalyst()]
        return [IsAuthenticated()]

    def get(self, request, pk):
        client = get_supabase_admin()
        result = (
            client.table("threat_alerts")
            .select("*")
            .eq("id", pk)
            .single()
            .execute()
        )
        if not result.data:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(result.data)

    def patch(self, request, pk):
        allowed = {"description", "is_active", "severity"}
        updates = {k: v for k, v in request.data.items() if k in allowed}
        if not updates:
            return Response({"error": "No updatable fields provided"}, status=status.HTTP_400_BAD_REQUEST)

        client = get_supabase_admin()
        result = (
            client.table("threat_alerts")
            .update(updates)
            .eq("id", pk)
            .execute()
        )
        if not result.data:
            return Response({"error": "Not found or no change"}, status=status.HTTP_404_NOT_FOUND)
        return Response(result.data[0])


class ThreatStatsView(APIView):
    """GET /api/v1/threats/stats/ — call get_threat_stats() Supabase RPC."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        client = get_supabase_admin()
        result = client.rpc("get_threat_stats").execute()

        if not result.data:
            return Response({})

        serializer = ThreatStatsSerializer(data=result.data)
        if serializer.is_valid():
            return Response(serializer.validated_data)
        # RPC returned unexpected shape — pass through raw
        return Response(result.data)


class ChatbotView(APIView):
    """POST /api/v1/threats/chat/ — send a message to the cybersecurity chatbot."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from threats.chatbot import CybotChatbot

        message    = request.data.get("message", "").strip()
        session_id = request.data.get("session_id", None)   # accepted but unused (history is per-user)

        if not message:
            return Response({"error": "message is required"}, status=status.HTTP_400_BAD_REQUEST)

        bot   = CybotChatbot()
        reply = bot.chat(user_id=request.supabase_user_id, message=message)
        return Response({"reply": reply, "session_id": session_id})


class ChatHistoryView(APIView):
    """GET /api/v1/threats/chat/history/ — paginated chat log for the authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        pag    = SupabasePagination(request)
        client = get_supabase_admin()

        query  = (
            client.table("chat_logs")
            .select("id, role, content, created_at", count="exact")
            .eq("user_id", request.supabase_user_id)
            .order("created_at", desc=False)   # chronological for display
        )
        result = pag.apply(query).execute()
        return Response(pag.wrap(result.data, count=result.count))


class ChatSessionListView(APIView):
    """GET /api/v1/threats/chat/sessions/ — list chat sessions for the sidebar.

    Each session is derived from the chat_logs by grouping the user's messages
    by day. Returns a lightweight list so the sidebar can render quickly.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        client = get_supabase_admin()
        result = (
            client.table("chat_logs")
            .select("id, role, content, created_at")
            .eq("user_id", request.supabase_user_id)
            .eq("role", "user")                 # one entry per user turn
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        rows = result.data or []

        # Group by date — each calendar day becomes one "session"
        from collections import OrderedDict
        sessions: "OrderedDict[str, dict]" = OrderedDict()
        for row in rows:
            date_key = row["created_at"][:10]   # YYYY-MM-DD
            if date_key not in sessions:
                sessions[date_key] = {
                    "id":         date_key,
                    "title":      row["content"][:60],   # first message of the day
                    "created_at": row["created_at"],
                    "updated_at": row["created_at"],
                }
            else:
                # Keep updated_at as the most recent message timestamp
                sessions[date_key]["updated_at"] = sessions[date_key]["updated_at"]

        return Response(list(sessions.values()))


class ChatSessionDetailView(APIView):
    """GET /api/v1/threats/chat/sessions/<session_id>/ — messages for a given day session."""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id: str):
        # session_id is a YYYY-MM-DD date string
        client = get_supabase_admin()

        # Fetch all messages for that calendar day
        date_start = f"{session_id}T00:00:00"
        date_end   = f"{session_id}T23:59:59"

        result = (
            client.table("chat_logs")
            .select("id, role, content, created_at")
            .eq("user_id", request.supabase_user_id)
            .gte("created_at", date_start)
            .lte("created_at", date_end)
            .order("created_at", desc=False)
            .execute()
        )
        return Response(result.data or [])


class CyberNewsView(APIView):
    """
    GET /api/v1/threats/news/

    Returns a paginated cybersecurity news feed aggregated from trusted RSS sources.
    Results are cached in Redis for 15 minutes to avoid hammering upstream feeds.

    Query params:
        category  — ALL | BREACH | MALWARE | PATCH | ALERT | OTHER  (default: ALL)
        page      — 1-based page number (default: 1)
        per_page  — items per page (default: 20, max: 50)
    """

    # Public endpoint — no auth required so anyone can see news headlines
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        from threats.news_fetcher import fetch_all_news

        category = request.query_params.get("category", "ALL").upper()
        if category not in _VALID_CATEGORIES:
            category = "ALL"

        try:
            page     = max(1, int(request.query_params.get("page", 1)))
            per_page = min(50, max(1, int(request.query_params.get("per_page", _NEWS_ITEMS_PER_PAGE))))
        except (ValueError, TypeError):
            page, per_page = 1, _NEWS_ITEMS_PER_PAGE

        # Try Redis cache first (cache holds all articles for this category)
        cache_key = f"cyber_news:{category}"
        articles  = cache.get(cache_key)

        if articles is None:
            # Cache miss — fetch from all RSS feeds, then filter + cache
            all_articles = fetch_all_news()
            # Cache the full ALL list
            cache.set("cyber_news:ALL", all_articles, _NEWS_CACHE_TTL)
            # Also cache per-category slices
            for cat in _VALID_CATEGORIES - {"ALL"}:
                filtered = [a for a in all_articles if a["category"] == cat]
                cache.set(f"cyber_news:{cat}", filtered, _NEWS_CACHE_TTL)

            articles = all_articles if category == "ALL" else [
                a for a in all_articles if a["category"] == category
            ]

        total    = len(articles)
        offset   = (page - 1) * per_page
        page_data = articles[offset: offset + per_page]
        has_next  = (offset + per_page) < total

        return Response({
            "data": page_data,
            "meta": {
                "page":     page,
                "per_page": per_page,
                "total":    total,
                "has_next": has_next,
                "category": category,
            },
        })

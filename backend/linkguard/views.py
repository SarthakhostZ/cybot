"""
linkguard/views.py

API views for the LinkGuard feature.

Endpoints:
  POST /api/v1/linkguard/scan       – deep scan a URL
  GET  /api/v1/linkguard/history    – scan history (paginated)
  GET  /api/v1/linkguard/stats      – aggregate stats
  GET  /api/v1/linkguard/scan/<id>  – single scan detail
"""

import hashlib
import ipaddress
import json
import logging
import re
from urllib.parse import urlparse

from django.core.cache import cache
from django.core.paginator import Paginator
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from . import ai_analyzer, redirect_tracker, safe_browsing, url_analyzer, whois_checker
from .models import LinkScan
from .serializers import (
    LinkScanListSerializer,
    ScanRequestSerializer,
    ScanResponseSerializer,
    ScanStatsSerializer,
)

logger = logging.getLogger(__name__)

# ── Private IP ranges for SSRF prevention ─────────────────────────────────────
_PRIVATE_NETS = [
    ipaddress.ip_network(n) for n in [
        "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
        "127.0.0.0/8", "169.254.0.0/16", "::1/128", "fc00::/7",
    ]
]


def _is_private_ip(hostname: str) -> bool:
    """Return True if hostname resolves to a private/loopback address."""
    try:
        addr = ipaddress.ip_address(hostname)
        return any(addr in net for net in _PRIVATE_NETS)
    except ValueError:
        pass
    return False


def _ssrf_safe(url: str) -> bool:
    """Return True if the URL target is safe to request (no SSRF risk)."""
    try:
        hostname = urlparse(url).hostname or ""
        return not _is_private_ip(hostname)
    except Exception:
        return True


# ── Rate throttles ─────────────────────────────────────────────────────────────

class LinkGuardUserThrottle(SimpleRateThrottle):
    scope = "linkguard_user"

    def get_cache_key(self, request, view):
        user_id = getattr(request, "supabase_user_id", None)
        if user_id:
            return f"throttle_lg_{user_id}"
        # Unauthenticated: stricter limit applied separately
        return f"throttle_lg_anon_{self.get_ident(request)}"

    def get_rate(self):
        from django.conf import settings
        limit = getattr(settings, "LINKGUARD_RATE_LIMIT", 30)
        return f"{limit}/min"


class LinkGuardAnonThrottle(SimpleRateThrottle):
    scope = "linkguard_anon"

    def get_cache_key(self, request, view):
        if getattr(request, "supabase_user_id", None):
            return None  # Only throttle anon
        return f"throttle_lg_anon_{self.get_ident(request)}"

    def get_rate(self):
        return "5/min"


# ── Scan endpoint ──────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LinkGuardUserThrottle, LinkGuardAnonThrottle])
def scan_url(request):
    """POST /api/v1/linkguard/scan — Deep scan a URL.

    Runs: rule-based scoring → Google Safe Browsing → WHOIS → redirect tracking
          → GPT-4o AI analysis → hybrid score → persist to DB.
    """
    user_id = getattr(request, "supabase_user_id", None)

    serializer = ScanRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    url: str = serializer.validated_data["url"]
    client_score: int = serializer.validated_data["client_score"]
    client_flags: list = serializer.validated_data.get("client_flags", [])

    # ── Scheme sanitization (belt-and-suspenders) ─────────────────────────────
    scheme = urlparse(url).scheme.lower()
    if scheme not in ("http", "https"):
        return Response(
            {"error": "Only http/https URLs are permitted."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if re.search(r"javascript:|data:", url, re.IGNORECASE):
        return Response({"error": "Forbidden URL scheme."}, status=status.HTTP_400_BAD_REQUEST)

    url_hash = hashlib.sha256(url.encode()).hexdigest()

    # ── Full-scan Redis cache ─────────────────────────────────────────────────
    scan_cache_key = f"scan:{url_hash}"
    cached_scan = cache.get(scan_cache_key)
    if cached_scan:
        return Response(cached_scan, status=status.HTTP_200_OK)

    all_flags: list[str] = list(client_flags)

    # 1. Rule-based backend scoring
    rule_result = url_analyzer.analyze(url)
    backend_score: int = rule_result["score"]
    all_flags.extend(rule_result.get("flags", []))
    ssl_valid: bool | None = rule_result.get("ssl_valid")

    # 2. Google Safe Browsing
    gsb = safe_browsing.check(url)
    gsb_flagged = gsb.get("flagged", False)
    if gsb_flagged:
        all_flags.extend(f"gsb:{t}" for t in gsb.get("threats", []))

    # 3. WHOIS domain age
    whois_result = whois_checker.get_domain_age(url)
    domain_age_days: int | None = whois_result.get("age_days")
    backend_score = max(0, backend_score + whois_result.get("score_delta", 0))
    all_flags.extend(whois_result.get("flags", []))

    # 4. Redirect tracking (only if SSRF-safe)
    redirect_result: dict = {"chain": [url], "redirect_count": 0, "score_delta": 0, "flags": []}
    if _ssrf_safe(url):
        redirect_result = redirect_tracker.track(url)
        backend_score = max(0, backend_score + redirect_result.get("score_delta", 0))
        all_flags.extend(redirect_result.get("flags", []))

    redirect_chain: list = redirect_result.get("chain", [url])
    redirect_count: int = redirect_result.get("redirect_count", 0)

    # 5. AI analysis
    gsb_label = "flagged" if gsb_flagged else "clean"
    ai_result = ai_analyzer.analyze(
        url,
        domain_age=domain_age_days,
        ssl_valid=ssl_valid,
        redirect_count=redirect_count,
        gsb_result=gsb_label,
    )
    ai_score: int = ai_result.get("ai_score", 50)

    # 6. Hybrid scoring formula
    final_score = int(
        (backend_score * 0.40)
        + (client_score * 0.20)
        + (ai_score * 0.40)
    )

    # Security overrides
    if gsb_flagged:
        final_score = min(final_score, 20)
    if domain_age_days is not None and domain_age_days < 7:
        final_score = min(final_score, 40)

    final_score = max(0, min(100, final_score))

    # Verdict
    if final_score > 80:
        verdict = "safe"
    elif final_score >= 50:
        verdict = "suspicious"
    else:
        verdict = "dangerous"

    # Deduplicate flags
    all_flags = list(dict.fromkeys(all_flags))

    # AI explanation JSON
    ai_explanation = json.dumps({
        "risk": ai_result.get("risk", "Unknown"),
        "confidence": ai_result.get("confidence", 50),
        "reason": ai_result.get("reason", ""),
    })

    # 7. Persist to DB
    scan = LinkScan.objects.create(
        user_id=user_id or "anonymous",
        url=url,
        url_hash=url_hash,
        client_score=client_score,
        backend_score=backend_score,
        ai_score=ai_score,
        final_score=final_score,
        verdict=verdict,
        status=verdict,          # mirrors verdict; satisfies the NOT NULL constraint from migration 0002
        flags=all_flags,
        ai_explanation=ai_explanation,
        domain_age_days=domain_age_days,
        google_safe_browsing=gsb,
        redirect_chain=redirect_chain,
        ssl_valid=ssl_valid,
    )

    response_data = ScanResponseSerializer(scan).data

    # Cache full result for 1 hour
    ttl = getattr(__import__("django.conf", fromlist=["settings"]).settings, "LINKGUARD_CACHE_TTL", 3600)
    cache.set(scan_cache_key, response_data, timeout=ttl)

    return Response(response_data, status=status.HTTP_201_CREATED)


# ── History endpoint ───────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def scan_history(request):
    """GET /api/v1/linkguard/history — paginated scan history for the user."""
    user_id = getattr(request, "supabase_user_id", None)
    if not user_id:
        return Response({"error": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

    qs = LinkScan.objects.filter(user_id=user_id)
    page_num = int(request.query_params.get("page", 1))
    paginator = Paginator(qs, 20)
    page = paginator.get_page(page_num)

    return Response({
        "results": LinkScanListSerializer(page.object_list, many=True).data,
        "count": paginator.count,
        "num_pages": paginator.num_pages,
        "current_page": page_num,
    })


# ── Stats endpoint ─────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def scan_stats(request):
    """GET /api/v1/linkguard/stats — aggregate statistics for the user."""
    user_id = getattr(request, "supabase_user_id", None)
    if not user_id:
        return Response({"error": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

    qs = LinkScan.objects.filter(user_id=user_id)
    total = qs.count()
    threats = qs.filter(verdict="dangerous").count()
    suspicious = qs.filter(verdict="suspicious").count()
    safe = qs.filter(verdict="safe").count()

    serializer = ScanStatsSerializer({
        "total_scans": total,
        "threats_blocked": threats,
        "suspicious_count": suspicious,
        "safe_count": safe,
    })
    return Response(serializer.data)


# ── Detail endpoint ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def scan_detail(request, scan_id):
    """GET /api/v1/linkguard/scan/<id> — single scan detail."""
    user_id = getattr(request, "supabase_user_id", None)
    if not user_id:
        return Response({"error": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        scan = LinkScan.objects.get(id=scan_id, user_id=user_id)
    except LinkScan.DoesNotExist:
        return Response({"error": "Scan not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(ScanResponseSerializer(scan).data)

"""
core/health.py — Liveness and readiness probe endpoints

GET /health/         → liveness  (always 200 while process is alive)
GET /health/ready/   → readiness (checks Redis + Supabase reachability)

Used by:
  - ECS Fargate container health-check
  - Load balancer target-group health-check
  - docker-compose healthcheck
"""

import time
import logging
from django.http import JsonResponse
from django.conf import settings

logger = logging.getLogger(__name__)

# Process start time for uptime reporting
_START = time.time()


def liveness(request):
    """Return 200 immediately — proves the process is alive."""
    return JsonResponse({"status": "ok", "uptime_s": round(time.time() - _START, 1)})


def readiness(request):
    """Return 200 only when all dependencies are reachable."""
    checks: dict[str, dict] = {}
    healthy = True

    # ── Redis ─────────────────────────────────────────────────────────────────
    try:
        import redis as redis_lib
        r = redis_lib.from_url(settings.CACHES["default"]["LOCATION"], socket_timeout=2)
        r.ping()
        checks["redis"] = {"status": "ok"}
    except Exception as exc:
        checks["redis"] = {"status": "error", "detail": str(exc)}
        healthy = False

    # ── Supabase REST reachability ─────────────────────────────────────────────
    try:
        import requests as req_lib
        resp = req_lib.get(
            f"{settings.SUPABASE_URL}/rest/v1/",
            headers={"apikey": settings.SUPABASE_ANON_KEY},
            timeout=3,
        )
        if resp.status_code < 500:
            checks["supabase"] = {"status": "ok", "http": resp.status_code}
        else:
            raise ValueError(f"HTTP {resp.status_code}")
    except Exception as exc:
        checks["supabase"] = {"status": "error", "detail": str(exc)}
        healthy = False

    status_code = 200 if healthy else 503
    return JsonResponse(
        {"status": "ok" if healthy else "degraded", "checks": checks},
        status=status_code,
    )

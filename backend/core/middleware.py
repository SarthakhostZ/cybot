"""
core/middleware.py

SupabaseAuthMiddleware  – Verifies Supabase JWT on every request.
                          Supports both modern ES256 (ECC P-256, verified via
                          Supabase JWKS endpoint) and legacy HS256 tokens.
                          Attaches user_id, email, role to the request object.
ZeroTrustMiddleware     – Redis-backed rate limiting, request fingerprinting,
                          anomaly detection, security headers.
"""

import hashlib
import json
import logging
import time

import requests as http_requests
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
import jwt  # PyJWT
from jwt.algorithms import ECAlgorithm

logger = logging.getLogger(__name__)

_JWKS_CACHE_KEY = "supabase_jwks_keys"
_JWKS_CACHE_TTL = 3600   # re-fetch at most once per hour
_JWKS_FETCH_TIMEOUT = 5  # seconds

# ─── Paths that bypass JWT verification ──────────────────────────────────────
PUBLIC_PATHS = [
    "/admin/",
    "/api/v1/threats/public/",
    "/api/v1/threats/news/",
]

# ─── Rate-limiting constants ──────────────────────────────────────────────────
RL_LIMIT       = 120   # max requests
RL_WINDOW      = 60    # sliding window in seconds
RL_ANOMALY     = 200   # log anomaly above this
CACHE_PREFIX   = "rl:"  # Redis key prefix


class SupabaseAuthMiddleware:
    """Verify the Supabase-issued JWT on every non-public request.

    Algorithm support:
      - ES256 (ECC P-256) — current Supabase default; verified via JWKS.
      - HS256 (Legacy)    — fallback for tokens issued before key rotation;
                            uses SUPABASE_JWT_SECRET from settings.

    JWKS keys are cached in Django's cache backend (default: Redis) and
    refreshed at most once per hour. On a cache miss the keys are re-fetched
    from Supabase synchronously; the fetch has a hard 5-second timeout.

    Attaches to request:
        supabase_user_id  – UUID string from 'sub' claim
        supabase_email    – user email from 'email' claim
        supabase_role     – JWT role ('authenticated' | 'anon' | 'service_role')
        supabase_metadata – raw user_metadata dict
    """

    def __init__(self, get_response):
        self.get_response  = get_response
        self.supabase_url  = settings.SUPABASE_URL.rstrip("/")
        self.hs256_secret  = getattr(settings, "SUPABASE_JWT_SECRET", "")

    # ── JWKS helpers ──────────────────────────────────────────────────────────

    def _fetch_jwks(self) -> list[dict]:
        """Download JWKS from Supabase and return the key list."""
        url = f"{self.supabase_url}/auth/v1/.well-known/jwks.json"
        try:
            resp = http_requests.get(url, timeout=_JWKS_FETCH_TIMEOUT)
            resp.raise_for_status()
            return resp.json().get("keys", [])
        except Exception as exc:
            logger.error("JWKS fetch failed: %s", exc)
            return []

    def _get_jwks(self) -> list[dict]:
        """Return cached JWKS keys, refreshing if the cache is cold."""
        keys = cache.get(_JWKS_CACHE_KEY)
        if keys is None:
            keys = self._fetch_jwks()
            if keys:
                cache.set(_JWKS_CACHE_KEY, keys, timeout=_JWKS_CACHE_TTL)
        return keys or []

    def _verify_token(self, token: str) -> dict:
        """
        Decode and verify *token*. Returns the payload dict.
        Raises jwt.InvalidTokenError (or subclasses) on any failure.
        """
        try:
            header = jwt.get_unverified_header(token)
        except jwt.DecodeError as exc:
            raise jwt.InvalidTokenError(f"Malformed token header: {exc}") from exc

        alg = header.get("alg", "HS256")
        kid = header.get("kid")

        if alg == "ES256":
            # ── ECC P-256: verify against JWKS public key ─────────────────────
            keys = self._get_jwks()
            key_data = next((k for k in keys if k.get("kid") == kid), None)

            if key_data is None:
                # Key not in cache — force a refresh and try once more
                cache.delete(_JWKS_CACHE_KEY)
                keys = self._get_jwks()
                key_data = next((k for k in keys if k.get("kid") == kid), None)

            if key_data is None:
                raise jwt.InvalidTokenError(
                    f"Signing key '{kid}' not found in JWKS. "
                    "The key may have been rotated — try again."
                )

            public_key = ECAlgorithm.from_jwk(json.dumps(key_data))
            return jwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                audience="authenticated",
            )

        else:
            # ── Legacy HS256 ──────────────────────────────────────────────────
            if not self.hs256_secret:
                raise jwt.InvalidTokenError(
                    "HS256 token received but SUPABASE_JWT_SECRET is not set."
                )
            return jwt.decode(
                token,
                self.hs256_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )

    # ── Request handler ───────────────────────────────────────────────────────

    def __call__(self, request):
        # ── Public paths ──────────────────────────────────────────────────────
        if any(request.path.startswith(p) for p in PUBLIC_PATHS):
            self._set_anon(request)
            return self.get_response(request)

        # ── Internal Edge Function / service calls ────────────────────────────
        service_key = request.headers.get("X-Internal-Service-Key", "")
        if service_key and service_key == settings.INTERNAL_SERVICE_KEY:
            request.supabase_user_id  = request.headers.get("X-User-Id")
            request.supabase_email    = None
            request.supabase_role     = "service_role"
            request.supabase_metadata = {}
            return self.get_response(request)

        # ── JWT verification ──────────────────────────────────────────────────
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JsonResponse(
                {"error": "Missing or invalid Authorization header"},
                status=401,
            )

        token = auth_header.split(" ", 1)[1]
        try:
            payload = self._verify_token(token)
        except jwt.ExpiredSignatureError:
            return JsonResponse({"error": "Token has expired"}, status=401)
        except jwt.InvalidAudienceError:
            return JsonResponse({"error": "Invalid token audience"}, status=401)
        except jwt.InvalidTokenError as exc:
            logger.warning("JWT validation failed: %s", exc)
            return JsonResponse({"error": "Invalid token"}, status=401)

        request.supabase_user_id  = payload.get("sub")
        request.supabase_email    = payload.get("email")
        request.supabase_role     = payload.get("role", "authenticated")
        request.supabase_metadata = payload.get("user_metadata", {})

        return self.get_response(request)

    @staticmethod
    def _set_anon(request):
        request.supabase_user_id  = None
        request.supabase_email    = None
        request.supabase_role     = "anon"
        request.supabase_metadata = {}


class ZeroTrustMiddleware:
    """Zero-trust security layer.

    Features:
    - Redis-backed sliding-window rate limiting per client fingerprint
    - Anomaly detection + warning logging
    - Security response headers on every response
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        fingerprint = self._fingerprint(request)
        cache_key   = f"{CACHE_PREFIX}{fingerprint}"
        now         = time.time()

        # ── Sliding-window rate limit via Redis ───────────────────────────────
        try:
            count = self._increment_counter(cache_key, now)
        except Exception:
            # If Redis is down, fail open (don't block legitimate traffic)
            logger.exception("Rate-limit cache error — failing open")
            count = 0

        if count > RL_ANOMALY:
            logger.warning(
                "ZeroTrust anomaly: fingerprint=%s count=%d window=%ds",
                fingerprint[:8], count, RL_WINDOW,
            )

        if count > RL_LIMIT:
            return JsonResponse(
                {"error": "Rate limit exceeded. Please slow down."},
                status=429,
                headers={
                    "Retry-After": str(RL_WINDOW),
                    "X-RateLimit-Limit": str(RL_LIMIT),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = self.get_response(request)
        self._add_security_headers(response)
        remaining = max(RL_LIMIT - count, 0)
        response["X-RateLimit-Limit"]     = str(RL_LIMIT)
        response["X-RateLimit-Remaining"] = str(remaining)
        return response

    @staticmethod
    def _increment_counter(cache_key: str, now: float) -> int:
        """Increment and return the request count for this fingerprint.

        Uses a list-based sliding window stored in Django's Redis cache.
        Each element is a timestamp; elements older than RL_WINDOW are pruned.
        """
        timestamps: list = cache.get(cache_key) or []
        cutoff = now - RL_WINDOW
        timestamps = [t for t in timestamps if t > cutoff]
        timestamps.append(now)
        cache.set(cache_key, timestamps, timeout=RL_WINDOW + 5)
        return len(timestamps)

    @staticmethod
    def _fingerprint(request) -> str:
        ip = (
            request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
            or request.META.get("REMOTE_ADDR", "unknown")
        )
        ua  = request.META.get("HTTP_USER_AGENT", "")
        raw = f"{ip}:{ua}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def _add_security_headers(response):
        response["X-Content-Type-Options"]   = "nosniff"
        response["X-Frame-Options"]           = "DENY"
        response["X-XSS-Protection"]          = "1; mode=block"
        response["Referrer-Policy"]           = "strict-origin-when-cross-origin"
        response["Permissions-Policy"]        = "geolocation=(), microphone=(), camera=()"
        response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


def axes_lockout_response(request, credentials, *args, **kwargs):
    return JsonResponse(
        {"error": "Account temporarily locked due to too many failed attempts."},
        status=429,
    )

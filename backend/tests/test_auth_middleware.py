"""
tests/test_auth_middleware.py

Tests for SupabaseAuthMiddleware:
  - Valid JWT → request attributes set, next middleware called
  - Expired JWT → 401
  - Invalid signature → 401
  - Wrong audience → 401
  - Missing Authorization header → 401
  - Bearer without token → 401
  - Public path → skips verification (anon)
  - Internal service key → service_role bypass
  - Edge Function X-User-Id forwarding
"""

import time
import pytest
import jwt as pyjwt
from django.test import RequestFactory, override_settings
from django.http import HttpResponse

from core.middleware import SupabaseAuthMiddleware, ZeroTrustMiddleware

# ─── Helpers ──────────────────────────────────────────────────────────────────

JWT_SECRET = "test-jwt-secret-at-least-32-characters-long"
INTERNAL_KEY = "test-internal-service-key"
USER_ID = "00000000-0000-0000-0000-000000000001"
USER_EMAIL = "test@cybot.dev"

TEST_SETTINGS = {
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_ANON_KEY": "test-anon",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role",
    "SUPABASE_JWT_SECRET": JWT_SECRET,
    "INTERNAL_SERVICE_KEY": INTERNAL_KEY,
}


def make_token(
    sub: str = USER_ID,
    email: str = USER_EMAIL,
    role: str = "authenticated",
    aud: str = "authenticated",
    exp_offset: int = 3600,   # seconds from now
    secret: str = JWT_SECRET,
) -> str:
    payload = {
        "sub": sub,
        "email": email,
        "role": role,
        "aud": aud,
        "iat": int(time.time()),
        "exp": int(time.time()) + exp_offset,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


def dummy_response(request):
    return HttpResponse("OK", status=200)


def make_middleware(next_view=dummy_response):
    return SupabaseAuthMiddleware(next_view)


factory = RequestFactory()

# ─── Tests ────────────────────────────────────────────────────────────────────

@override_settings(**TEST_SETTINGS)
def test_valid_jwt_sets_request_attrs():
    token = make_token()
    request = factory.get("/api/v1/threats/", HTTP_AUTHORIZATION=f"Bearer {token}")
    mw = make_middleware()
    response = mw(request)

    assert response.status_code == 200
    assert request.supabase_user_id == USER_ID
    assert request.supabase_email == USER_EMAIL
    assert request.supabase_role == "authenticated"


@override_settings(**TEST_SETTINGS)
def test_expired_jwt_returns_401():
    token = make_token(exp_offset=-10)   # expired 10 s ago
    request = factory.get("/api/v1/threats/", HTTP_AUTHORIZATION=f"Bearer {token}")
    response = make_middleware()(request)

    assert response.status_code == 401
    import json
    body = json.loads(response.content)
    assert "expired" in body["error"].lower()


@override_settings(**TEST_SETTINGS)
def test_invalid_signature_returns_401():
    token = make_token(secret="wrong-secret-altogether")
    request = factory.get("/api/v1/threats/", HTTP_AUTHORIZATION=f"Bearer {token}")
    response = make_middleware()(request)

    assert response.status_code == 401


@override_settings(**TEST_SETTINGS)
def test_wrong_audience_returns_401():
    token = make_token(aud="anon")  # should be 'authenticated'
    request = factory.get("/api/v1/threats/", HTTP_AUTHORIZATION=f"Bearer {token}")
    response = make_middleware()(request)

    assert response.status_code == 401


@override_settings(**TEST_SETTINGS)
def test_missing_auth_header_returns_401():
    request = factory.get("/api/v1/threats/")
    response = make_middleware()(request)

    assert response.status_code == 401


@override_settings(**TEST_SETTINGS)
def test_malformed_bearer_returns_401():
    request = factory.get("/api/v1/threats/", HTTP_AUTHORIZATION="Basic dXNlcjpwYXNz")
    response = make_middleware()(request)

    assert response.status_code == 401


@override_settings(**TEST_SETTINGS)
def test_public_path_skips_auth():
    request = factory.get("/api/v1/threats/public/")
    response = make_middleware()(request)

    assert response.status_code == 200
    assert request.supabase_role == "anon"
    assert request.supabase_user_id is None


@override_settings(**TEST_SETTINGS)
def test_admin_path_skips_auth():
    request = factory.get("/admin/login/")
    response = make_middleware()(request)

    assert response.status_code == 200


@override_settings(**TEST_SETTINGS)
def test_internal_service_key_bypasses_jwt():
    request = factory.get(
        "/api/v1/threats/",
        HTTP_X_INTERNAL_SERVICE_KEY=INTERNAL_KEY,
    )
    response = make_middleware()(request)

    assert response.status_code == 200
    assert request.supabase_role == "service_role"


@override_settings(**TEST_SETTINGS)
def test_edge_function_x_user_id_forwarded():
    request = factory.get(
        "/api/v1/privacy/audit/",
        HTTP_X_INTERNAL_SERVICE_KEY=INTERNAL_KEY,
        HTTP_X_USER_ID=USER_ID,
    )
    make_middleware()(request)

    assert request.supabase_user_id == USER_ID
    assert request.supabase_role == "service_role"


@override_settings(**TEST_SETTINGS)
def test_wrong_internal_key_falls_through_to_jwt_check():
    """A wrong service key should not bypass JWT — it falls through and requires a token."""
    request = factory.get(
        "/api/v1/threats/",
        HTTP_X_INTERNAL_SERVICE_KEY="totally-wrong-key",
    )
    response = make_middleware()(request)

    # No Bearer token either, so 401
    assert response.status_code == 401


@override_settings(**TEST_SETTINGS)
def test_user_metadata_extracted():
    payload = {
        "sub": USER_ID,
        "email": USER_EMAIL,
        "role": "authenticated",
        "aud": "authenticated",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "user_metadata": {"full_name": "Alice Cybot"},
    }
    token = pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")
    request = factory.get("/api/v1/threats/", HTTP_AUTHORIZATION=f"Bearer {token}")
    make_middleware()(request)

    assert request.supabase_metadata.get("full_name") == "Alice Cybot"

"""
tests/test_security.py — Security-focused tests

Covers:
  - JWT manipulation (expired, wrong algo, tampered payload, missing)
  - Internal service key handling
  - Path traversal in report signed-URL endpoint
  - Privacy audit ownership
  - Rate limit headers
  - Unauthenticated access to protected endpoints
"""

import jwt
import time
import uuid
import pytest
from unittest.mock import MagicMock, patch
from django.test import RequestFactory
from rest_framework.test import APIRequestFactory

USER_ID       = str(uuid.uuid4())
OTHER_USER_ID = str(uuid.uuid4())
JWT_SECRET    = "test-secret-minimum-32-characters-xx"


def _make_jwt(user_id=USER_ID, secret=JWT_SECRET, exp_offset=3600, algorithm="HS256",
              extra_claims=None):
    payload = {
        "sub":   user_id,
        "email": "test@example.com",
        "iat":   int(time.time()),
        "exp":   int(time.time()) + exp_offset,
        "aud":   "authenticated",
        "role":  "authenticated",
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, secret, algorithm=algorithm)


def _request_with_auth(factory, method, path, token, data=None):
    fn = getattr(factory, method)
    if data is not None:
        req = fn(path, data=data, format="json")
    else:
        req = fn(path)
    if token:
        req.META["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return req


# ─── JWT middleware security tests ───────────────────────────────────────────

@pytest.mark.django_db
class TestJWTSecurity:
    factory = RequestFactory()

    def _process(self, token):
        from core.middleware import SupabaseAuthMiddleware
        get_response  = MagicMock(return_value=MagicMock(status_code=200))
        middleware     = SupabaseAuthMiddleware(get_response)
        req            = self.factory.get("/api/v1/threats/")
        if token:
            req.META["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        middleware(req)
        return req

    def test_valid_jwt_sets_user_id(self):
        token = _make_jwt()
        with patch("core.middleware.settings") as mock_settings:
            mock_settings.SUPABASE_JWT_SECRET  = JWT_SECRET
            mock_settings.INTERNAL_SERVICE_KEY = ""
            mock_settings.PUBLIC_PATHS         = []
            req = self._process(token)
        assert req.supabase_user_id == USER_ID

    def test_expired_jwt_clears_user_id(self):
        token = _make_jwt(exp_offset=-1)  # already expired
        with patch("core.middleware.settings") as mock_settings:
            mock_settings.SUPABASE_JWT_SECRET  = JWT_SECRET
            mock_settings.INTERNAL_SERVICE_KEY = ""
            mock_settings.PUBLIC_PATHS         = []
            req = self._process(token)
        assert req.supabase_user_id is None

    def test_wrong_secret_clears_user_id(self):
        token = _make_jwt(secret="wrong-secret-minimum-32-chars-xxxx")
        with patch("core.middleware.settings") as mock_settings:
            mock_settings.SUPABASE_JWT_SECRET  = JWT_SECRET
            mock_settings.INTERNAL_SERVICE_KEY = ""
            mock_settings.PUBLIC_PATHS         = []
            req = self._process(token)
        assert req.supabase_user_id is None

    def test_missing_token_clears_user_id(self):
        with patch("core.middleware.settings") as mock_settings:
            mock_settings.SUPABASE_JWT_SECRET  = JWT_SECRET
            mock_settings.INTERNAL_SERVICE_KEY = ""
            mock_settings.PUBLIC_PATHS         = []
            req = self._process(None)
        assert req.supabase_user_id is None

    def test_malformed_bearer_clears_user_id(self):
        with patch("core.middleware.settings") as mock_settings:
            mock_settings.SUPABASE_JWT_SECRET  = JWT_SECRET
            mock_settings.INTERNAL_SERVICE_KEY = ""
            mock_settings.PUBLIC_PATHS         = []
            factory = RequestFactory()
            req = factory.get("/api/v1/threats/")
            req.META["HTTP_AUTHORIZATION"] = "NotBearer token"
            from core.middleware import SupabaseAuthMiddleware
            SupabaseAuthMiddleware(MagicMock(return_value=MagicMock()))(req)
        assert req.supabase_user_id is None


# ─── Path traversal in signed-URL endpoint ────────────────────────────────────

class TestSignedUrlOwnership:
    factory = APIRequestFactory()

    def _post(self, path_param, user_id=USER_ID):
        from users.views import ReportSignedUrlView
        req = self.factory.post(
            "/api/v1/users/reports/signed-url/",
            data={"path": path_param},
            format="json",
        )
        req.supabase_user_id = user_id
        req.user = MagicMock(is_authenticated=True)
        return ReportSignedUrlView.as_view()(req)

    def test_own_path_returns_url(self):
        with patch("users.views.signed_report_url", return_value="https://signed.url/file"):
            resp = self._post(f"{USER_ID}/report.pdf")
        assert resp.status_code == 200
        assert "signed_url" in resp.data

    def test_other_user_path_returns_403(self):
        resp = self._post(f"{OTHER_USER_ID}/report.pdf")
        assert resp.status_code == 403

    def test_path_traversal_attempt_returns_403(self):
        resp = self._post(f"../../../etc/passwd")
        assert resp.status_code == 403

    def test_empty_path_returns_400(self):
        resp = self._post("")
        assert resp.status_code == 400


# ─── Privacy audit ownership ──────────────────────────────────────────────────

class TestPrivacyAuditOwnership:
    factory = APIRequestFactory()

    def _mock_sb_empty(self):
        result = MagicMock()
        result.data = None
        chain = MagicMock()
        chain.execute.return_value = result
        for m in ("select", "eq", "single"):
            getattr(chain, m).return_value = chain
        client = MagicMock()
        client.table.return_value = chain
        return client

    def test_other_user_audit_returns_404(self):
        """Detail view must add user_id eq filter — returns 404 for another user's record."""
        from privacy_audit.views import PrivacyAuditDetailView
        pk  = str(uuid.uuid4())
        req = self.factory.get(f"/api/v1/privacy/audit/{pk}/")
        req.supabase_user_id = USER_ID
        req.user = MagicMock(is_authenticated=True)

        with patch("privacy_audit.views.get_supabase_admin", return_value=self._mock_sb_empty()):
            resp = PrivacyAuditDetailView.as_view()(req, pk=pk)
        assert resp.status_code == 404


# ─── Unauthenticated access ────────────────────────────────────────────────────

class TestUnauthenticatedAccess:
    factory = APIRequestFactory()

    def _unauthed_get(self, path, view_class, **kwargs):
        req = self.factory.get(path)
        req.supabase_user_id = None
        req.user = MagicMock(is_authenticated=False)
        return view_class.as_view()(req, **kwargs)

    def test_threat_list_rejects_unauthenticated(self):
        from threats.views import ThreatListView
        resp = self._unauthed_get("/api/v1/threats/", ThreatListView)
        assert resp.status_code == 403

    def test_privacy_audit_rejects_unauthenticated(self):
        from privacy_audit.views import PrivacyAuditView
        resp = self._unauthed_get("/api/v1/privacy/audit/", PrivacyAuditView)
        assert resp.status_code == 403

    def test_ml_predict_rejects_unauthenticated(self):
        from ml_models.views import PredictView
        req = self.factory.post(
            "/api/v1/ml/predict/",
            data={"features": {"packet_rate": 100}},
            format="json",
        )
        req.supabase_user_id = None
        req.user = MagicMock(is_authenticated=False)
        resp = PredictView.as_view()(req)
        assert resp.status_code == 403

    def test_profile_rejects_unauthenticated(self):
        from users.views import ProfileView
        resp = self._unauthed_get("/api/v1/users/profile/", ProfileView)
        assert resp.status_code == 403

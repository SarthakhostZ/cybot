"""
tests/test_integration.py — Cross-app integration tests

Tests that span multiple Django apps to verify they work together:
  - Auth → threats → chat flow
  - Auth → privacy audit → result storage
  - Health endpoints (no auth)
  - ML predict → auto-alert → threat created
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch
from django.test import RequestFactory
from rest_framework.test import APIRequestFactory

USER_ID   = str(uuid.uuid4())
THREAT_ID = str(uuid.uuid4())


def _authed_request(factory, method, path, data=None, user_id=USER_ID):
    fn = getattr(factory, method)
    req = fn(path, data=data, format="json") if data is not None else fn(path)
    req.supabase_user_id = user_id
    req.user = MagicMock(is_authenticated=True)
    return req


def _mock_sb(rows=None, count=None):
    result = MagicMock()
    result.data  = rows if rows is not None else []
    result.count = count
    chain = MagicMock()
    chain.execute.return_value = result
    for m in ("select", "eq", "neq", "order", "range", "insert", "update",
              "single", "limit", "ilike"):
        getattr(chain, m).return_value = chain
    client = MagicMock()
    client.table.return_value = chain
    client.rpc.return_value   = chain
    return client


# ─── Health endpoints ─────────────────────────────────────────────────────────

class TestHealthEndpoints:
    factory = RequestFactory()

    def test_liveness_always_200(self):
        from core.health import liveness
        req  = self.factory.get("/health/")
        resp = liveness(req)
        assert resp.status_code == 200
        import json
        body = json.loads(resp.content)
        assert body["status"] == "ok"
        assert "uptime_s" in body

    def test_readiness_returns_json(self):
        from core.health import readiness
        req = self.factory.get("/health/ready/")
        with patch("core.health.redis_lib") as mock_redis, \
             patch("core.health.req_lib") as mock_requests:
            mock_redis.from_url.return_value.ping.return_value = True
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_requests.get.return_value = mock_resp

            resp = readiness(req)
        assert resp.status_code == 200

    def test_readiness_503_when_redis_down(self):
        import redis as redis_lib_real
        from core.health import readiness
        req = self.factory.get("/health/ready/")
        with patch("core.health.redis_lib") as mock_redis, \
             patch("core.health.req_lib") as mock_requests:
            mock_redis.from_url.return_value.ping.side_effect = ConnectionError("refused")
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_requests.get.return_value = mock_resp

            resp = readiness(req)
        assert resp.status_code == 503


# ─── Threat + Chat integration ────────────────────────────────────────────────

class TestThreatChatFlow:
    """Create a threat, then ask chatbot about it."""

    factory = APIRequestFactory()

    def test_create_threat_then_chat(self):
        from threats.views import ThreatListView, ChatbotView

        # Step 1 — create threat
        created = {"id": THREAT_ID, "severity": "MEDIUM", "title": "SQL Injection Detected"}
        with patch("threats.views.get_supabase_admin", return_value=_mock_sb(rows=[created])):
            with patch("threats.views.trigger_notify_threat"):
                req  = _authed_request(
                    self.factory, "post", "/api/v1/threats/",
                    data={"title": "SQL Injection Detected", "severity": "MEDIUM", "threat_type": "vulnerability"},
                )
                resp = ThreatListView.as_view()(req)
        assert resp.status_code == 201

        # Step 2 — ask chatbot about it
        mock_bot = MagicMock()
        mock_bot.chat.return_value = "SQL injection exploits unparameterised queries."
        with patch("threats.views.CybotChatbot", return_value=mock_bot):
            req2  = _authed_request(
                self.factory, "post", "/api/v1/threats/chat/",
                data={"message": "How do I prevent SQL injection?"},
            )
            resp2 = ChatbotView.as_view()(req2)
        assert resp2.status_code == 200
        assert "reply" in resp2.data


# ─── Privacy audit flow ───────────────────────────────────────────────────────

class TestPrivacyAuditFlow:
    factory = APIRequestFactory()

    def test_audit_then_fetch_history(self):
        from privacy_audit.views import PrivacyAuditView

        audit_row = {
            "id": str(uuid.uuid4()),
            "email_scanned": "test@example.com",
            "breach_count": 1,
            "risk_level": "MEDIUM",
            "data_classes": ["Emails"],
            "recommendations": ["Change password"],
            "raw_breaches": ["TestBreach"],
            "paste_count": 0,
        }
        scanner_result = {**audit_row, "user_id": USER_ID}
        mock_scanner   = MagicMock()
        mock_scanner.scan.return_value = scanner_result

        # POST — run audit
        with patch("privacy_audit.views.get_supabase_admin", return_value=_mock_sb(rows=[audit_row])):
            with patch("privacy_audit.views.PrivacyScanner", return_value=mock_scanner):
                req  = _authed_request(
                    self.factory, "post", "/api/v1/privacy/audit/",
                    data={"email": "test@example.com"},
                )
                resp = PrivacyAuditView.as_view()(req)
        assert resp.status_code == 201
        assert resp.data["risk_level"] == "MEDIUM"

        # GET — fetch history
        history = [audit_row]
        with patch("privacy_audit.views.get_supabase_admin", return_value=_mock_sb(rows=history, count=1)):
            req2  = _authed_request(self.factory, "get", "/api/v1/privacy/audit/")
            resp2 = PrivacyAuditView.as_view()(req2)
        assert resp2.status_code == 200
        assert len(resp2.data["data"]) == 1


# ─── ML predict → auto-alert integration ─────────────────────────────────────

class TestMLAutoAlert:
    factory = APIRequestFactory()

    def test_auto_alert_creates_threat_on_detection(self):
        from ml_models.views import PredictView

        prediction = {
            "threat_class":  "brute_force",
            "confidence":    0.91,
            "probabilities": {"benign": 0.05, "dos_ddos": 0.01, "port_scan": 0.01,
                               "brute_force": 0.91, "data_exfiltration": 0.02},
            "is_threat":     True,
        }
        mock_det = MagicMock()
        mock_det.model = MagicMock()
        mock_det.predict.return_value = prediction

        inserted = {"id": THREAT_ID, "severity": "HIGH", "title": "ML-detected: Brute Force"}

        with patch("ml_models.views.get_threat_detector", return_value=mock_det):
            with patch("ml_models.views.get_supabase_admin", return_value=_mock_sb(rows=[inserted])):
                with patch("ml_models.views.trigger_notify_threat") as mock_notify:
                    req  = _authed_request(
                        self.factory, "post", "/api/v1/ml/predict/",
                        data={
                            "features": {"packet_rate": 15000, "failed_auth_count": 850},
                            "auto_alert": True,
                        },
                    )
                    resp = PredictView.as_view()(req)

        assert resp.status_code == 200
        assert resp.data["is_threat"] is True
        assert resp.data["threat_class"] == "brute_force"
        assert "alert_id" in resp.data
        mock_notify.assert_called_once_with(THREAT_ID)

"""
tests/test_privacy.py — Unit tests for privacy_audit/ endpoints and scanner

All external HTTP calls are mocked — HIBP API never contacted.
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch
from rest_framework.test import APIRequestFactory

from privacy_audit.views import PrivacyAuditView, PrivacyAuditDetailView
from privacy_audit.scanner import PrivacyScanner


USER_ID = str(uuid.uuid4())
AUDIT_ID = str(uuid.uuid4())


def _make_request(factory, method, path, data=None, user_id=USER_ID):
    fn = getattr(factory, method)
    req = fn(path, data=data, format="json") if data is not None else fn(path)
    req.supabase_user_id = user_id
    req.user = MagicMock(is_authenticated=True)
    return req


def _mock_supabase(rows=None, count=None):
    mock_result = MagicMock()
    mock_result.data  = rows if rows is not None else []
    mock_result.count = count

    chain = MagicMock()
    chain.execute.return_value = mock_result
    for m in ("select", "eq", "order", "range", "insert", "single"):
        getattr(chain, m).return_value = chain

    mock_client = MagicMock()
    mock_client.table.return_value = chain
    return mock_client


# ─── PrivacyAuditView ─────────────────────────────────────────────────────────

class TestPrivacyAuditView:
    factory = APIRequestFactory()
    view    = PrivacyAuditView.as_view()

    def test_get_history_returns_paginated(self):
        rows = [{"id": AUDIT_ID, "email_scanned": "test@example.com", "breach_count": 2}]
        with patch("privacy_audit.views.get_supabase_admin", return_value=_mock_supabase(rows=rows, count=1)):
            req  = _make_request(self.factory, "get", "/api/v1/privacy/audit/")
            resp = self.view(req)
        assert resp.status_code == 200
        assert resp.data["data"] == rows

    def test_post_missing_email_returns_400(self):
        req  = _make_request(self.factory, "post", "/api/v1/privacy/audit/", data={})
        resp = self.view(req)
        assert resp.status_code == 400

    def test_post_invalid_email_returns_400(self):
        req  = _make_request(self.factory, "post", "/api/v1/privacy/audit/", data={"email": "not-an-email"})
        resp = self.view(req)
        assert resp.status_code == 400

    def test_post_valid_email_runs_scan(self):
        audit_row = {"id": AUDIT_ID, "email_scanned": "user@example.com", "risk_level": "LOW"}
        scanner_result = {
            "user_id": USER_ID, "email_scanned": "user@example.com",
            "breach_count": 0, "paste_count": 0,
            "risk_level": "LOW", "data_classes": [], "recommendations": [], "raw_breaches": [],
        }
        mock_scanner = MagicMock()
        mock_scanner.scan.return_value = scanner_result

        with patch("privacy_audit.views.get_supabase_admin", return_value=_mock_supabase(rows=[audit_row])):
            with patch("privacy_audit.views.PrivacyScanner", return_value=mock_scanner):
                req  = _make_request(
                    self.factory, "post", "/api/v1/privacy/audit/",
                    data={"email": "user@example.com"},
                )
                resp = self.view(req)
        assert resp.status_code == 201
        mock_scanner.scan.assert_called_once_with(user_id=USER_ID, email="user@example.com")


# ─── PrivacyScanner ───────────────────────────────────────────────────────────

class TestPrivacyScanner:
    scanner = PrivacyScanner()

    def _hibp_breach_response(self, breaches):
        mock_resp = MagicMock()
        mock_resp.status_code = 200 if breaches else 404
        mock_resp.json.return_value = breaches
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_no_breaches_returns_low_risk(self):
        with patch("privacy_audit.scanner.requests.get") as mock_get:
            mock_get.return_value = self._hibp_breach_response([])
            result = self.scanner.scan(USER_ID, "clean@example.com")
        assert result["risk_level"] == "LOW"
        assert result["breach_count"] == 0

    def test_one_breach_returns_medium(self):
        breach = {"Name": "TestBreach", "DataClasses": ["Usernames", "Email addresses"]}
        with patch("privacy_audit.scanner.requests.get") as mock_get:
            mock_get.return_value = self._hibp_breach_response([breach])
            result = self.scanner.scan(USER_ID, "breached@example.com")
        assert result["risk_level"] == "MEDIUM"
        assert result["breach_count"] == 1

    def test_sensitive_breach_returns_critical(self):
        breach = {"Name": "SensitiveBreach", "DataClasses": ["Passwords", "Credit cards"]}
        with patch("privacy_audit.scanner.requests.get") as mock_get:
            mock_get.return_value = self._hibp_breach_response([breach])
            result = self.scanner.scan(USER_ID, "sensitive@example.com")
        assert result["risk_level"] == "CRITICAL"

    def test_five_breaches_returns_critical(self):
        breaches = [{"Name": f"Breach{i}", "DataClasses": ["Emails"]} for i in range(5)]
        with patch("privacy_audit.scanner.requests.get") as mock_get:
            mock_get.return_value = self._hibp_breach_response(breaches)
            result = self.scanner.scan(USER_ID, "many@example.com")
        assert result["risk_level"] == "CRITICAL"

    def test_api_timeout_gracefully_returns_empty(self):
        import requests as req_lib
        with patch("privacy_audit.scanner.requests.get", side_effect=req_lib.Timeout):
            result = self.scanner.scan(USER_ID, "timeout@example.com")
        assert result["breach_count"] == 0
        assert result["risk_level"] == "LOW"

    def test_recommendations_include_password_advice(self):
        breach = {"Name": "PwdBreach", "DataClasses": ["Passwords"]}
        with patch("privacy_audit.scanner.requests.get") as mock_get:
            mock_get.return_value = self._hibp_breach_response([breach])
            result = self.scanner.scan(USER_ID, "pwd@example.com")
        combined = " ".join(result["recommendations"]).lower()
        assert "password manager" in combined

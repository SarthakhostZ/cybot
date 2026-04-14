"""
tests/test_threats.py — Unit tests for threats/ endpoints

Supabase calls are fully mocked — no network required.
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch
from django.test import RequestFactory
from rest_framework.test import APIRequestFactory

from threats.views import ThreatListView, ThreatDetailView, ThreatStatsView


# ─── Fixtures ────────────────────────────────────────────────────────────────

USER_ID = str(uuid.uuid4())
THREAT_ID = str(uuid.uuid4())


def _make_request(factory, method, path, data=None, user_id=USER_ID):
    """Build a DRF request with supabase_user_id injected."""
    fn = getattr(factory, method)
    req = fn(path, data=data, format="json") if data is not None else fn(path)
    req.supabase_user_id = user_id
    req.user = MagicMock(is_authenticated=True)
    return req


def _mock_supabase(rows=None, count=None):
    """Return a mock Supabase client where execute() yields rows."""
    mock_result = MagicMock()
    mock_result.data  = rows if rows is not None else []
    mock_result.count = count

    chain = MagicMock()
    chain.execute.return_value = mock_result
    # Every chained method returns the same chain mock
    for method in ("select", "eq", "neq", "order", "range", "ilike", "single", "insert", "update"):
        getattr(chain, method).return_value = chain

    mock_client = MagicMock()
    mock_client.table.return_value = chain
    mock_client.rpc.return_value   = chain
    return mock_client


# ─── ThreatListView ───────────────────────────────────────────────────────────

class TestThreatListView:
    factory = APIRequestFactory()
    view    = ThreatListView.as_view()

    def _get(self, query_string="", user_id=USER_ID):
        req = _make_request(self.factory, "get", f"/api/v1/threats/?{query_string}")
        req.supabase_user_id = user_id
        return req

    def test_get_returns_paginated_list(self):
        sample = [{"id": THREAT_ID, "title": "Test Threat", "severity": "HIGH"}]
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=sample, count=1)):
            req  = self._get()
            resp = self.view(req)
        assert resp.status_code == 200
        assert resp.data["data"] == sample
        assert resp.data["meta"]["total"] == 1

    def test_get_filters_by_severity(self):
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=[], count=0)):
            req  = self._get("severity=CRITICAL")
            resp = self.view(req)
        assert resp.status_code == 200

    def test_get_filters_by_search(self):
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=[], count=0)):
            req  = self._get("search=malware")
            resp = self.view(req)
        assert resp.status_code == 200

    def test_post_creates_threat(self):
        created = {"id": THREAT_ID, "severity": "LOW", "title": "New Threat"}
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=[created])):
            req = _make_request(
                self.factory, "post", "/api/v1/threats/",
                data={"title": "New Threat", "severity": "LOW", "threat_type": "malware"},
            )
            resp = self.view(req)
        assert resp.status_code == 201

    def test_post_triggers_notify_for_high(self):
        created = {"id": THREAT_ID, "severity": "HIGH", "title": "High Threat"}
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=[created])):
            with patch("threats.views.trigger_notify_threat") as mock_notify:
                req = _make_request(
                    self.factory, "post", "/api/v1/threats/",
                    data={"title": "High Threat", "severity": "HIGH", "threat_type": "malware"},
                )
                resp = self.view(req)
        assert resp.status_code == 201
        mock_notify.assert_called_once_with(THREAT_ID)

    def test_post_does_not_notify_for_low(self):
        created = {"id": THREAT_ID, "severity": "LOW", "title": "Low Threat"}
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=[created])):
            with patch("threats.views.trigger_notify_threat") as mock_notify:
                req = _make_request(
                    self.factory, "post", "/api/v1/threats/",
                    data={"title": "Low Threat", "severity": "LOW", "threat_type": "other"},
                )
                self.view(req)
        mock_notify.assert_not_called()

    def test_post_invalid_severity_rejected(self):
        req  = _make_request(
            self.factory, "post", "/api/v1/threats/",
            data={"title": "T", "severity": "EXTREME", "threat_type": "malware"},
        )
        resp = self.view(req)
        assert resp.status_code == 400


# ─── ThreatDetailView ────────────────────────────────────────────────────────

class TestThreatDetailView:
    factory = APIRequestFactory()
    view    = ThreatDetailView.as_view()

    def test_get_existing_threat(self):
        row = {"id": THREAT_ID, "title": "Test"}
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=row)):
            req  = _make_request(self.factory, "get", f"/api/v1/threats/{THREAT_ID}/")
            resp = self.view(req, pk=THREAT_ID)
        assert resp.status_code == 200

    def test_get_missing_threat_returns_404(self):
        mock_client = _mock_supabase(rows=None)
        with patch("threats.views.get_supabase_admin", return_value=mock_client):
            req  = _make_request(self.factory, "get", f"/api/v1/threats/{THREAT_ID}/")
            resp = self.view(req, pk=THREAT_ID)
        assert resp.status_code == 404


# ─── ThreatStatsView ──────────────────────────────────────────────────────────

class TestThreatStatsView:
    factory = APIRequestFactory()
    view    = ThreatStatsView.as_view()

    def test_stats_rpc_called(self):
        stats = {
            "total_threats": 10, "active_threats": 5,
            "critical_count": 1, "high_count": 2,
            "medium_count": 3, "low_count": 4, "avg_confidence": 0.82,
        }
        with patch("threats.views.get_supabase_admin", return_value=_mock_supabase(rows=stats)):
            req  = _make_request(self.factory, "get", "/api/v1/threats/stats/")
            resp = self.view(req)
        assert resp.status_code == 200

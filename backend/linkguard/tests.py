"""
linkguard/tests.py

Unit tests for the LinkGuard backend.
Run with: pytest backend/linkguard/tests.py -v
"""

import hashlib
from unittest.mock import MagicMock, patch

import pytest
from django.test import TestCase

from linkguard import url_analyzer, safe_browsing, whois_checker


class TestUrlAnalyzer(TestCase):
    """Rule-based scoring engine tests."""

    def test_safe_url_scoring(self):
        result = url_analyzer.analyze("https://google.com/search?q=test")
        self.assertGreater(result["score"], 80)
        self.assertNotIn("no_https", result["flags"])

    def test_suspicious_url_scoring(self):
        result = url_analyzer.analyze("https://unknown-site.com/login/account")
        self.assertLess(result["score"], 80)
        # Should have keyword flags
        flag_texts = " ".join(result["flags"])
        self.assertIn("suspicious_keyword", flag_texts)

    def test_dangerous_url_scoring(self):
        result = url_analyzer.analyze("http://192.168.1.1/login/verify/bank")
        self.assertLess(result["score"], 50)
        self.assertIn("no_https", result["flags"])
        self.assertIn("ip_based_url", result["flags"])

    def test_no_https_deduction(self):
        result = url_analyzer.analyze("http://example.com/")
        self.assertIn("no_https", result["flags"])

    def test_long_url_deduction(self):
        long_url = "https://example.com/" + "a" * 200
        result = url_analyzer.analyze(long_url)
        flag_texts = " ".join(result["flags"])
        self.assertIn("excessive_url_length", flag_texts)

    def test_url_shortener_detection(self):
        result = url_analyzer.analyze("https://bit.ly/abc123")
        self.assertIn("url_shortener", result["flags"])

    def test_double_extension_detection(self):
        result = url_analyzer.analyze("https://example.com/doc.pdf.exe")
        self.assertIn("double_extension", result["flags"])

    def test_at_symbol_detection(self):
        result = url_analyzer.analyze("https://user@evil.com/login")
        self.assertIn("at_symbol_in_url", result["flags"])

    def test_malicious_tld(self):
        result = url_analyzer.analyze("https://free-prize.tk/claim")
        flag_texts = " ".join(result["flags"])
        self.assertIn("malicious_tld", flag_texts)

    def test_score_never_negative(self):
        result = url_analyzer.analyze("http://192.168.1.1/login/verify/bank/password/confirm.pdf.exe")
        self.assertGreaterEqual(result["score"], 0)


class TestSafeBrowsing(TestCase):
    """Google Safe Browsing client tests."""

    @patch("linkguard.safe_browsing.requests.post")
    @patch("linkguard.safe_browsing.cache")
    def test_flagged_url_returns_dangerous(self, mock_cache, mock_post):
        mock_cache.get.return_value = None
        mock_cache.set = MagicMock()

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "matches": [{"threatType": "MALWARE"}]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        with self.settings(GOOGLE_SAFE_BROWSING_API_KEY="test-key"):
            result = safe_browsing.check("http://malware-site.com/")

        self.assertTrue(result["flagged"])
        self.assertIn("MALWARE", result["threats"])

    @patch("linkguard.safe_browsing.cache")
    def test_cache_hit_skips_api(self, mock_cache):
        cached = {"flagged": False, "threats": [], "cached": True}
        mock_cache.get.return_value = cached

        result = safe_browsing.check("https://example.com/")
        self.assertTrue(result["cached"])
        self.assertFalse(result["flagged"])

    def test_missing_api_key_skips(self):
        with self.settings(GOOGLE_SAFE_BROWSING_API_KEY=""):
            result = safe_browsing._call_api("https://example.com/")
        self.assertFalse(result["flagged"])
        self.assertTrue(result.get("skipped"))


class TestWhoisChecker(TestCase):
    """Domain age checker tests."""

    @patch("linkguard.whois_checker.whois.whois")
    @patch("linkguard.whois_checker.cache")
    def test_young_domain_penalty(self, mock_cache, mock_whois):
        from datetime import datetime, timedelta, timezone

        mock_cache.get.return_value = None
        mock_cache.set = MagicMock()

        info = MagicMock()
        info.creation_date = datetime.now(timezone.utc) - timedelta(days=10)
        mock_whois.return_value = info

        result = whois_checker.get_domain_age("https://brand-new-site.com/")
        self.assertEqual(result["score_delta"], -30)
        self.assertIsNotNone(result["age_days"])

    @patch("linkguard.whois_checker.whois.whois")
    @patch("linkguard.whois_checker.cache")
    def test_old_domain_no_penalty(self, mock_cache, mock_whois):
        from datetime import datetime, timedelta, timezone

        mock_cache.get.return_value = None
        mock_cache.set = MagicMock()

        info = MagicMock()
        info.creation_date = datetime.now(timezone.utc) - timedelta(days=3650)
        mock_whois.return_value = info

        result = whois_checker.get_domain_age("https://old-site.com/")
        self.assertEqual(result["score_delta"], 0)


class TestScanView(TestCase):
    """API endpoint tests."""

    def setUp(self):
        from django.test import RequestFactory
        self.factory = RequestFactory()

    def _make_request(self, data):
        import json as json_mod
        from linkguard.views import scan_url
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/linkguard/scan/",
            data=json_mod.dumps(data),
            content_type="application/json",
        )
        request.supabase_user_id = "test-user-123"
        return scan_url(request)

    @patch("linkguard.views.url_analyzer.analyze")
    @patch("linkguard.views.safe_browsing.check")
    @patch("linkguard.views.whois_checker.get_domain_age")
    @patch("linkguard.views.redirect_tracker.track")
    @patch("linkguard.views.ai_analyzer.analyze")
    @patch("linkguard.views.cache")
    def test_safe_url_scan(self, mock_cache, mock_ai, mock_redirect, mock_whois, mock_gsb, mock_rule):
        mock_cache.get.return_value = None
        mock_cache.set = MagicMock()
        mock_rule.return_value = {"score": 90, "flags": [], "ssl_valid": True}
        mock_gsb.return_value = {"flagged": False, "threats": []}
        mock_whois.return_value = {"age_days": 3650, "score_delta": 0, "flags": []}
        mock_redirect.return_value = {"chain": ["https://google.com/"], "redirect_count": 0, "score_delta": 0, "flags": []}
        mock_ai.return_value = {"risk": "Safe", "confidence": 95, "reason": "Known safe domain.", "ai_score": 95}

        response = self._make_request({"url": "https://google.com/", "client_score": 100})
        self.assertIn(response.status_code, [200, 201])
        self.assertEqual(response.data["verdict"], "safe")

    @patch("linkguard.views.url_analyzer.analyze")
    @patch("linkguard.views.safe_browsing.check")
    @patch("linkguard.views.whois_checker.get_domain_age")
    @patch("linkguard.views.redirect_tracker.track")
    @patch("linkguard.views.ai_analyzer.analyze")
    @patch("linkguard.views.cache")
    def test_gsb_override_forces_dangerous(self, mock_cache, mock_ai, mock_redirect, mock_whois, mock_gsb, mock_rule):
        mock_cache.get.return_value = None
        mock_cache.set = MagicMock()
        mock_rule.return_value = {"score": 70, "flags": [], "ssl_valid": True}
        mock_gsb.return_value = {"flagged": True, "threats": ["MALWARE"]}
        mock_whois.return_value = {"age_days": 365, "score_delta": 0, "flags": []}
        mock_redirect.return_value = {"chain": [], "redirect_count": 0, "score_delta": 0, "flags": []}
        mock_ai.return_value = {"risk": "Suspicious", "confidence": 60, "reason": "Flagged.", "ai_score": 40}

        response = self._make_request({"url": "https://malware.example.com/", "client_score": 60})
        self.assertIn(response.status_code, [200, 201])
        self.assertEqual(response.data["verdict"], "dangerous")

    def test_invalid_scheme_rejected(self):
        response = self._make_request({"url": "ftp://files.example.com/", "client_score": 80})
        self.assertEqual(response.status_code, 400)

    @patch("linkguard.views.cache")
    def test_cache_hit_returns_200(self, mock_cache):
        cached = {"scan_id": "abc", "final_score": 90, "verdict": "safe"}
        mock_cache.get.return_value = cached

        response = self._make_request({"url": "https://google.com/", "client_score": 100})
        self.assertEqual(response.status_code, 200)

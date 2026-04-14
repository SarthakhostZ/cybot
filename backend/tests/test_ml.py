"""
tests/test_ml.py — Unit tests for ml_models/ package

TensorFlow is NOT required to run these tests:
  - ThreatDetector.predict() is tested with a mock model
  - FeatureExtractor is pure Python
  - Django views are tested with mocked detector and Supabase
"""

import uuid
import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from rest_framework.test import APIRequestFactory

from ml_models.feature_extractor import FeatureExtractor, FEATURE_NAMES
from ml_models.threat_detector import ThreatDetector, THREAT_CLASSES, _stub_prediction
from ml_models.views import PredictView, FeatureInfoView


USER_ID = str(uuid.uuid4())


def _make_request(factory, method, path, data=None, user_id=USER_ID):
    fn = getattr(factory, method)
    req = fn(path, data=data, format="json") if data is not None else fn(path)
    req.supabase_user_id = user_id
    req.user = MagicMock(is_authenticated=True)
    return req


# ─── FeatureExtractor ─────────────────────────────────────────────────────────

class TestFeatureExtractor:
    fx = FeatureExtractor()

    def test_extract_all_zeros_for_empty_dict(self):
        vec = self.fx.extract({})
        assert vec == [0.0] * len(FEATURE_NAMES)

    def test_extract_normalises_to_zero_one(self):
        raw = {name: 1e9 for name in FEATURE_NAMES}  # beyond ceiling
        vec = self.fx.extract(raw)
        assert all(v == 1.0 for v in vec)

    def test_extract_mid_values(self):
        raw = {"packet_rate": 50_000, "byte_rate": 500_000}
        vec = self.fx.extract(raw)
        assert abs(vec[0] - 0.5) < 0.01   # packet_rate / 100_000
        assert abs(vec[1] - 0.5) < 0.01   # byte_rate / 1_000_000

    def test_extract_clamps_negatives(self):
        raw = {"packet_rate": -999}
        vec = self.fx.extract(raw)
        assert vec[0] == 0.0

    def test_validate_accepts_valid_features(self):
        errors = self.fx.validate({"packet_rate": 1000, "byte_rate": 500})
        assert errors == []

    def test_validate_rejects_unknown_feature(self):
        errors = self.fx.validate({"not_a_feature": 1.0})
        assert any("not_a_feature" in e for e in errors)

    def test_validate_rejects_non_numeric(self):
        errors = self.fx.validate({"packet_rate": "fast"})
        assert any("packet_rate" in e for e in errors)

    def test_output_length_always_ten(self):
        for raw in [{}, {"packet_rate": 50}, {name: 0.5 for name in FEATURE_NAMES}]:
            assert len(self.fx.extract(raw)) == len(FEATURE_NAMES)


# ─── ThreatDetector ───────────────────────────────────────────────────────────

class TestThreatDetector:

    def _mock_model(self, probs: list[float]):
        """Return a mock Keras model that predicts *probs*."""
        mock = MagicMock()
        mock.predict.return_value = np.array([probs], dtype=np.float32)
        return mock

    def test_predict_returns_stub_when_model_not_loaded(self):
        det    = ThreatDetector()
        result = det.predict([0.0] * len(FEATURE_NAMES))
        assert result["threat_class"] == "unknown"
        assert result["confidence"] == 0.0
        assert result["is_threat"] is False

    def test_predict_correct_class(self):
        det = ThreatDetector()
        # High confidence for class 3 (brute_force)
        probs = [0.01, 0.01, 0.01, 0.95, 0.02]
        det.model = self._mock_model(probs)
        result = det.predict([0.5] * len(FEATURE_NAMES))
        assert result["threat_class"] == "brute_force"
        assert result["confidence"] == pytest.approx(0.95, abs=0.01)
        assert result["is_threat"] is True

    def test_predict_benign_class_is_not_threat(self):
        det = ThreatDetector()
        probs = [0.92, 0.02, 0.02, 0.02, 0.02]
        det.model = self._mock_model(probs)
        result = det.predict([0.1] * len(FEATURE_NAMES))
        assert result["threat_class"] == "benign"
        assert result["is_threat"] is False

    def test_low_confidence_falls_back_to_benign(self):
        det = ThreatDetector()
        # Max prob is 0.50 — below MIN_CONFIDENCE (0.55), falls back to benign
        probs = [0.45, 0.50, 0.02, 0.02, 0.01]
        det.model = self._mock_model(probs)
        result = det.predict([0.5] * len(FEATURE_NAMES))
        assert result["threat_class"] == "benign"

    def test_predict_wrong_feature_count_raises(self):
        det = ThreatDetector()
        det.model = self._mock_model([0.2] * len(THREAT_CLASSES))
        with pytest.raises(ValueError):
            det.predict([0.5] * 5)  # wrong length

    def test_probabilities_dict_has_all_classes(self):
        det = ThreatDetector()
        probs = [0.7, 0.1, 0.1, 0.05, 0.05]
        det.model = self._mock_model(probs)
        result = det.predict([0.5] * len(FEATURE_NAMES))
        assert set(result["probabilities"].keys()) == set(THREAT_CLASSES)


# ─── PredictView ──────────────────────────────────────────────────────────────

class TestPredictView:
    factory = APIRequestFactory()
    view    = PredictView.as_view()

    def _mock_detector(self, prediction: dict | None = None):
        det = MagicMock()
        det.model = MagicMock()   # truthy → model_loaded = True
        det.predict.return_value = prediction or {
            "threat_class":  "port_scan",
            "confidence":    0.88,
            "probabilities": {c: 0.0 for c in THREAT_CLASSES},
            "is_threat":     True,
        }
        return det

    def test_predict_with_features_dict(self):
        with patch("ml_models.views.get_threat_detector", return_value=self._mock_detector()):
            req = _make_request(
                self.factory, "post", "/api/v1/ml/predict/",
                data={"features": {"packet_rate": 50000, "byte_rate": 100000}},
            )
            resp = self.view(req)
        assert resp.status_code == 200
        assert resp.data["threat_class"] == "port_scan"
        assert resp.data["model_loaded"] is True

    def test_predict_with_vector(self):
        vector = [0.5] * len(FEATURE_NAMES)
        with patch("ml_models.views.get_threat_detector", return_value=self._mock_detector()):
            req = _make_request(
                self.factory, "post", "/api/v1/ml/predict/",
                data={"vector": vector},
            )
            resp = self.view(req)
        assert resp.status_code == 200

    def test_missing_features_and_vector_returns_400(self):
        req = _make_request(self.factory, "post", "/api/v1/ml/predict/", data={})
        resp = self.view(req)
        assert resp.status_code == 400

    def test_wrong_vector_length_returns_400(self):
        req = _make_request(
            self.factory, "post", "/api/v1/ml/predict/",
            data={"vector": [0.5, 0.5]},  # too short
        )
        resp = self.view(req)
        assert resp.status_code == 400

    def test_unknown_feature_key_returns_400(self):
        with patch("ml_models.views.get_threat_detector", return_value=self._mock_detector()):
            req = _make_request(
                self.factory, "post", "/api/v1/ml/predict/",
                data={"features": {"not_valid": 0.5}},
            )
            resp = self.view(req)
        assert resp.status_code == 400


# ─── FeatureInfoView ──────────────────────────────────────────────────────────

class TestFeatureInfoView:
    factory = APIRequestFactory()
    view    = FeatureInfoView.as_view()

    def test_returns_feature_names_and_classes(self):
        req  = _make_request(self.factory, "get", "/api/v1/ml/features/")
        resp = self.view(req)
        assert resp.status_code == 200
        assert "feature_names" in resp.data
        assert "threat_classes" in resp.data
        assert len(resp.data["feature_names"]) == len(FEATURE_NAMES)
        assert len(resp.data["threat_classes"]) == len(THREAT_CLASSES)

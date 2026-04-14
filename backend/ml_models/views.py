"""
ml_models/views.py — ML inference + model management endpoints
"""

import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from core.supabase_client import get_supabase_admin
from core.edge_functions import trigger_notify_threat
from users.permissions import IsAuthenticated, IsAdmin, IsServiceRole
from ml_models.feature_extractor import FeatureExtractor
from ml_models.threat_detector import get_threat_detector, reload_threat_detector, THREAT_CLASSES
from ml_models.serializers import PredictRequestSerializer

logger = logging.getLogger(__name__)

_extractor = FeatureExtractor()


class PredictView(APIView):
    """
    POST /api/v1/ml/predict/

    Run threat detection on submitted network features.
    Accepts authenticated users OR the internal service key (from Edge Functions).

    Body (one of):
        { "features": { "packet_rate": 0.8, "byte_rate": 0.5, ... } }
        { "vector":   [0.8, 0.5, 0.1, ...] }   # pre-extracted, length 10

    Optional:
        { "auto_alert": true }   – if true AND is_threat, insert a threat_alert row
    """

    def get_permissions(self):
        # Allow both authenticated users and the internal service role
        return [IsAuthenticated() if not _is_service_request(self.request) else IsServiceRole()]

    def post(self, request):
        serializer = PredictRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Build feature vector
        if serializer.validated_data.get("features"):
            raw = serializer.validated_data["features"]
            errors = _extractor.validate(raw)
            if errors:
                return Response({"error": "Invalid features", "details": errors},
                                status=status.HTTP_400_BAD_REQUEST)
            vector = _extractor.extract(raw)
        else:
            vector = serializer.validated_data["vector"]

        detector  = get_threat_detector()
        result    = detector.predict(vector)
        result["model_loaded"] = detector.model is not None

        # Optionally auto-create a threat alert
        auto_alert = request.data.get("auto_alert", False)
        if auto_alert and result["is_threat"]:
            threat_id = _create_threat_alert(request, result, vector)
            result["alert_id"] = threat_id

        return Response(result)


class ModelListView(APIView):
    """
    GET /api/v1/ml/models/  — list model files in Supabase Storage ml-models bucket.
    Admin only.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        try:
            client = get_supabase_admin()
            items  = client.storage.from_("ml-models").list()
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        models = [
            {
                "name":         item.get("name"),
                "storage_path": item.get("name"),
                "size_bytes":   item.get("metadata", {}).get("size"),
                "created_at":   item.get("created_at"),
            }
            for item in (items or [])
        ]
        return Response({"data": models, "count": len(models)})


class ModelReloadView(APIView):
    """
    POST /api/v1/ml/models/reload/  — reload the active model from Storage.
    Admin only. Clears the lru_cache singleton.
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        storage_path = request.data.get("storage_path", "active/threat_detector.keras")
        detector     = reload_threat_detector(storage_path)
        loaded       = detector.model is not None

        return Response({
            "reloaded":      loaded,
            "storage_path":  storage_path,
            "model_classes": THREAT_CLASSES,
        })


class FeatureInfoView(APIView):
    """
    GET /api/v1/ml/features/  — return expected feature names and normalization ceilings.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from ml_models.feature_extractor import FEATURE_NAMES, _CEILINGS
        return Response({
            "feature_names": FEATURE_NAMES,
            "ceilings":      _CEILINGS,
            "threat_classes": THREAT_CLASSES,
        })


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _is_service_request(request) -> bool:
    from django.conf import settings
    return (
        request.META.get("HTTP_X_INTERNAL_SERVICE_KEY", "") ==
        getattr(settings, "INTERNAL_SERVICE_KEY", "")
        and bool(getattr(settings, "INTERNAL_SERVICE_KEY", ""))
    )


def _create_threat_alert(request, prediction: dict, vector: list) -> str | None:
    """Insert a threat_alert row and optionally trigger push notification."""
    severity_map = {
        "dos_ddos":          "CRITICAL" if prediction["confidence"] > 0.85 else "HIGH",
        "port_scan":         "MEDIUM",
        "brute_force":       "HIGH",
        "data_exfiltration": "CRITICAL" if prediction["confidence"] > 0.85 else "HIGH",
    }
    severity = severity_map.get(prediction["threat_class"], "LOW")
    user_id  = getattr(request, "supabase_user_id", None)

    row = {
        "title":         f"ML-detected: {prediction['threat_class'].replace('_', ' ').title()}",
        "description":   (
            f"ThreatDetector flagged this activity as {prediction['threat_class']} "
            f"with {round(prediction['confidence'] * 100, 1)}% confidence."
        ),
        "severity":      severity,
        "threat_type":   prediction["threat_class"],
        "confidence":    prediction["confidence"],
        "is_active":     True,
        "ml_model_used": "threat_detector_v1",
    }
    if user_id:
        row["user_id"] = user_id

    try:
        client = get_supabase_admin()
        result = client.table("threat_alerts").insert(row).execute()
        if result.data:
            alert_id = result.data[0]["id"]
            if severity in ("HIGH", "CRITICAL"):
                try:
                    trigger_notify_threat(alert_id)
                except Exception as exc:
                    logger.warning("notify-threat failed for ML alert %s: %s", alert_id, exc)
            return alert_id
    except Exception as exc:
        logger.error("Failed to create ML threat alert: %s", exc)
    return None

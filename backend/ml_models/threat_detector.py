"""
ml_models/threat_detector.py

ThreatDetector — TensorFlow 2.x multi-class threat classifier.

Model:    3-layer feedforward network, 10 inputs → 5 outputs (softmax)
Storage:  Model files are persisted to Supabase Storage (ml-models bucket).
          On first request, the active model is downloaded to a temp dir.
Inference:Returns threat class, confidence, and per-class probabilities.
"""

import logging
import os
import tempfile

import numpy as np
from django.conf import settings

from ml_models.feature_extractor import FEATURE_NAMES

logger = logging.getLogger(__name__)

THREAT_CLASSES = [
    "benign",
    "dos_ddos",
    "port_scan",
    "brute_force",
    "data_exfiltration",
]

# Confidence below this → classify as benign regardless of argmax
MIN_CONFIDENCE = 0.55

# Storage path inside the ml-models bucket
DEFAULT_MODEL_STORAGE_PATH = "active/threat_detector.keras"


class ThreatDetector:
    """Wrapper around a TensorFlow 2.x multi-class threat classifier."""

    def __init__(self, model_path: str | None = None):
        self.model       = None
        self.model_path  = model_path
        self._tmp_dir    = None

        if model_path:
            self._load_local(model_path)

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def build_model(self):
        """Build a fresh model architecture (used during training)."""
        try:
            import tensorflow as tf
            from tensorflow import keras

            inputs = keras.Input(shape=(len(FEATURE_NAMES),), name="features")
            x = keras.layers.Dense(128, activation="relu")(inputs)
            x = keras.layers.BatchNormalization()(x)
            x = keras.layers.Dropout(0.3)(x)
            x = keras.layers.Dense(64, activation="relu")(x)
            x = keras.layers.BatchNormalization()(x)
            x = keras.layers.Dropout(0.2)(x)
            x = keras.layers.Dense(32, activation="relu")(x)
            outputs = keras.layers.Dense(len(THREAT_CLASSES), activation="softmax", name="probabilities")(x)

            model = keras.Model(inputs=inputs, outputs=outputs)
            model.compile(
                optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
                loss="sparse_categorical_crossentropy",
                metrics=["accuracy"],
            )
            self.model = model
            return model
        except Exception as exc:
            logger.error("Model build failed: %s", exc)
            return None

    def predict(self, features: list[float]) -> dict:
        """Run inference on a 10-feature vector.

        Returns:
            {
                "threat_class":   str,   # e.g. "brute_force"
                "confidence":     float, # 0–1, argmax probability
                "probabilities":  dict,  # class → probability
                "is_threat":      bool,  # False when class == "benign"
            }
        """
        if self.model is None:
            logger.warning("Model not loaded; returning stub prediction.")
            return _stub_prediction()

        if len(features) != len(FEATURE_NAMES):
            raise ValueError(f"Expected {len(FEATURE_NAMES)} features, got {len(features)}")

        x          = np.array([features], dtype=np.float32)
        probs      = self.model.predict(x, verbose=0)[0]
        class_idx  = int(np.argmax(probs))
        confidence = float(probs[class_idx])

        # Low-confidence detections fall back to "benign"
        if confidence < MIN_CONFIDENCE:
            class_idx  = 0
            confidence = float(probs[0])

        threat_class = THREAT_CLASSES[class_idx]
        return {
            "threat_class":  threat_class,
            "confidence":    round(confidence, 4),
            "probabilities": {c: round(float(p), 4) for c, p in zip(THREAT_CLASSES, probs)},
            "is_threat":     threat_class != "benign",
        }

    # ------------------------------------------------------------------ #
    #  Model persistence helpers                                           #
    # ------------------------------------------------------------------ #

    def load_from_storage(self, storage_path: str = DEFAULT_MODEL_STORAGE_PATH) -> bool:
        """Download model from Supabase Storage ml-models bucket and load it.

        Returns True on success.
        """
        from core.supabase_client import get_supabase_admin

        try:
            client   = get_supabase_admin()
            response = client.storage.from_("ml-models").download(storage_path)
            if not response:
                logger.warning("Model not found in Storage at %s", storage_path)
                return False

            self._tmp_dir = tempfile.mkdtemp(prefix="cybot_ml_")
            local_path    = os.path.join(self._tmp_dir, "model.keras")
            with open(local_path, "wb") as f:
                f.write(response)

            self._load_local(local_path)
            logger.info("Model loaded from Storage: %s → %s", storage_path, local_path)
            return self.model is not None

        except Exception as exc:
            logger.error("load_from_storage failed: %s", exc)
            return False

    def save_to_storage(self, storage_path: str = DEFAULT_MODEL_STORAGE_PATH) -> bool:
        """Save current model to Supabase Storage ml-models bucket.

        Returns True on success.
        """
        if self.model is None:
            raise RuntimeError("No model loaded — nothing to save.")

        from core.supabase_client import get_supabase_admin
        from core.storage_utils import upload_ml_model

        try:
            with tempfile.TemporaryDirectory() as tmp:
                local_path = os.path.join(tmp, "model.keras")
                self.model.save(local_path)
                # upload_ml_model expects raw bytes — read the file before the
                # TemporaryDirectory context manager removes it.
                with open(local_path, "rb") as fh:
                    file_bytes = fh.read()
                upload_ml_model(file_bytes, storage_path)
            logger.info("Model saved to Storage: %s", storage_path)
            return True
        except Exception as exc:
            logger.error("save_to_storage failed: %s", exc)
            return False

    # ------------------------------------------------------------------ #
    #  Private                                                             #
    # ------------------------------------------------------------------ #

    def _load_local(self, path: str) -> None:
        try:
            from tensorflow import keras
            self.model      = keras.models.load_model(path)
            self.model_path = path
            logger.info("ThreatDetector loaded from %s", path)
        except Exception as exc:
            logger.error("Failed to load model from %s: %s", path, exc)


# ------------------------------------------------------------------ #
#  Module-level singleton (loaded once per process)                    #
# ------------------------------------------------------------------ #

_singleton: "ThreatDetector | None" = None


def get_threat_detector() -> "ThreatDetector":
    """Return the process-level ThreatDetector singleton.

    Load order:
      1. ML_MODEL_PATH env var (absolute file path)
      2. Supabase Storage active/threat_detector.keras
      3. Unloaded (predict() returns stub)

    Call reload_threat_detector() to swap in a different model at runtime.
    """
    global _singleton
    if _singleton is None:
        _singleton = _create_detector()
    return _singleton


def reload_threat_detector(storage_path: str = DEFAULT_MODEL_STORAGE_PATH) -> "ThreatDetector":
    """Replace the singleton with a freshly downloaded model.

    Used by ModelReloadView so the caller can specify an exact storage path.
    Returns the new ThreatDetector (model may be None if download failed).
    """
    global _singleton
    detector = ThreatDetector()
    detector.load_from_storage(storage_path)
    _singleton = detector
    return detector


def _create_detector() -> "ThreatDetector":
    """Internal factory — builds and loads the initial singleton."""
    local_path = getattr(settings, "ML_MODEL_PATH", "")
    detector   = ThreatDetector()

    if local_path and os.path.exists(local_path):
        detector._load_local(local_path)
        return detector

    detector.load_from_storage()
    return detector


def _stub_prediction() -> dict:
    return {
        "threat_class":  "unknown",
        "confidence":    0.0,
        "probabilities": {c: 0.0 for c in THREAT_CLASSES},
        "is_threat":     False,
    }

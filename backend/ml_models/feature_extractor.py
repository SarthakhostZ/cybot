"""
ml_models/feature_extractor.py

Converts raw network-event metadata into a normalised 10-dimensional
feature vector ready for ThreatDetector.predict().

Input schema (all fields optional — missing fields default to 0):
    packet_rate          – packets per second (float)
    byte_rate            – bytes per second (float)
    flow_duration        – seconds (float)
    unique_ips           – count of distinct IPs in the flow window (int)
    port_entropy         – Shannon entropy of destination ports (float 0-8)
    failed_auth_count    – authentication failures in window (int)
    payload_entropy      – byte entropy of payload sample (float 0-8)
    geo_anomaly_score    – 0–1: fraction of IPs from unusual geos (float)
    time_of_day_anomaly  – 0–1: deviation from historical baseline (float)
    protocol_deviation   – 0–1: fraction of unexpected protocols (float)

Output: list[float] of length 10, each value in [0, 1].
"""

import math
import logging
from typing import Any

logger = logging.getLogger(__name__)

FEATURE_NAMES = [
    "packet_rate",
    "byte_rate",
    "flow_duration",
    "unique_ips",
    "port_entropy",
    "failed_auth_count",
    "payload_entropy",
    "geo_anomaly_score",
    "time_of_day_anomaly",
    "protocol_deviation",
]

# Normalisation ceilings — values are clipped then divided by these
_CEILINGS = {
    "packet_rate":         100_000.0,   # pps
    "byte_rate":         1_000_000.0,   # bps
    "flow_duration":         3_600.0,   # seconds (1 hour max)
    "unique_ips":            1_000.0,   # IPs per window
    "port_entropy":              8.0,   # max Shannon entropy (3-bit)
    "failed_auth_count":     1_000.0,   # failures
    "payload_entropy":           8.0,
    "geo_anomaly_score":         1.0,   # already 0-1
    "time_of_day_anomaly":       1.0,
    "protocol_deviation":        1.0,
}


class FeatureExtractor:
    """Convert a raw feature dict to a normalised float list."""

    def extract(self, raw: dict[str, Any]) -> list[float]:
        """Return a normalised feature vector (length 10).

        Values outside [0, ceiling] are clipped before normalisation.
        Missing keys default to 0.
        """
        vector: list[float] = []
        for name in FEATURE_NAMES:
            raw_val = float(raw.get(name, 0) or 0)
            ceiling = _CEILINGS[name]
            normalised = min(max(raw_val, 0.0), ceiling) / ceiling
            vector.append(normalised)
        return vector

    def validate(self, raw: dict[str, Any]) -> list[str]:
        """Return a list of validation error strings (empty = OK)."""
        errors: list[str] = []
        for key, val in raw.items():
            if key not in _CEILINGS:
                errors.append(f"Unknown feature: '{key}'")
                continue
            try:
                fval = float(val)
                if not math.isfinite(fval):
                    errors.append(f"Feature '{key}' is not finite: {val}")
            except (TypeError, ValueError):
                errors.append(f"Feature '{key}' is not numeric: {val!r}")
        return errors

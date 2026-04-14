"""
ml_models/train.py

CLI training script — generates synthetic labelled data, trains ThreatDetector,
evaluates on a held-out test split, then optionally uploads to Supabase Storage.

Usage (from backend/):
    python -m ml_models.train [--epochs 30] [--upload] [--output path/to/model.keras]

The synthetic data uses per-class feature distributions that mimic real-world
network traffic patterns; each class has distinguishing feature signatures.
"""

import argparse
import logging
import os
import sys
import tempfile

import numpy as np

logger = logging.getLogger(__name__)

# ── Synthetic data parameters ──────────────────────────────────────────────────

# feature order matches FEATURE_NAMES in feature_extractor.py:
# packet_rate, byte_rate, flow_duration, unique_ips, port_entropy,
# failed_auth_count, payload_entropy, geo_anomaly_score,
# time_of_day_anomaly, protocol_deviation

# Each entry: (mean_vector, std_vector, n_samples)
CLASS_DISTRIBUTIONS = {
    # 0 – benign  — moderate traffic, low anomaly
    0: dict(
        mean=[0.05, 0.04, 0.30, 0.05, 0.40, 0.00, 0.35, 0.05, 0.10, 0.05],
        std= [0.02, 0.02, 0.15, 0.03, 0.10, 0.00, 0.08, 0.03, 0.05, 0.02],
        n=2000,
    ),
    # 1 – dos_ddos  — very high packet/byte rate, many IPs
    1: dict(
        mean=[0.85, 0.80, 0.10, 0.70, 0.55, 0.02, 0.60, 0.60, 0.70, 0.40],
        std= [0.08, 0.10, 0.05, 0.10, 0.08, 0.01, 0.10, 0.10, 0.10, 0.08],
        n=800,
    ),
    # 2 – port_scan  — low bytes, high port entropy, short flows
    2: dict(
        mean=[0.20, 0.04, 0.05, 0.30, 0.90, 0.01, 0.25, 0.20, 0.30, 0.30],
        std= [0.05, 0.02, 0.02, 0.08, 0.05, 0.01, 0.05, 0.05, 0.08, 0.06],
        n=700,
    ),
    # 3 – brute_force  — many failed auth, moderate rate, long duration
    3: dict(
        mean=[0.15, 0.08, 0.70, 0.10, 0.20, 0.85, 0.30, 0.15, 0.60, 0.10],
        std= [0.04, 0.03, 0.10, 0.04, 0.05, 0.08, 0.06, 0.04, 0.10, 0.04],
        n=700,
    ),
    # 4 – data_exfiltration  — high byte rate, high payload entropy, geo anomaly
    4: dict(
        mean=[0.10, 0.75, 0.50, 0.08, 0.30, 0.05, 0.85, 0.75, 0.40, 0.25],
        std= [0.03, 0.10, 0.12, 0.03, 0.07, 0.02, 0.07, 0.10, 0.08, 0.06],
        n=700,
    ),
}


def generate_dataset() -> tuple[np.ndarray, np.ndarray]:
    """Return (X, y) where X has shape (N, 10) and y has shape (N,)."""
    X_parts, y_parts = [], []
    for label, cfg in CLASS_DISTRIBUTIONS.items():
        n = cfg["n"]
        samples = np.random.normal(
            loc=cfg["mean"], scale=cfg["std"], size=(n, 10)
        ).astype(np.float32)
        samples = np.clip(samples, 0.0, 1.0)
        X_parts.append(samples)
        y_parts.append(np.full(n, label, dtype=np.int32))

    X = np.vstack(X_parts)
    y = np.concatenate(y_parts)

    # Shuffle
    idx = np.random.permutation(len(X))
    return X[idx], y[idx]


def train(epochs: int = 30, upload: bool = False, output: str | None = None) -> str:
    """Train a ThreatDetector model and return the path to the saved file."""
    # Django setup (needed for Supabase client if uploading)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    try:
        import django
        django.setup()
    except Exception:
        pass

    from ml_models.threat_detector import ThreatDetector, THREAT_CLASSES

    logger.info("Generating synthetic training data…")
    X, y = generate_dataset()

    split      = int(len(X) * 0.85)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    logger.info("Train: %d  Val: %d", len(X_train), len(X_val))

    detector = ThreatDetector()
    model    = detector.build_model()
    if model is None:
        raise RuntimeError("TensorFlow not available — cannot train.")

    import tensorflow as tf

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=5, restore_best_weights=True
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6
        ),
    ]

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=64,
        callbacks=callbacks,
        verbose=1,
    )

    # Evaluation
    loss, acc = model.evaluate(X_val, y_val, verbose=0)
    logger.info("Val loss: %.4f  Val accuracy: %.4f", loss, acc)

    # Per-class accuracy report
    y_pred = np.argmax(model.predict(X_val, verbose=0), axis=1)
    from ml_models.threat_detector import THREAT_CLASSES
    for i, cls in enumerate(THREAT_CLASSES):
        mask = y_val == i
        if mask.sum() > 0:
            cls_acc = (y_pred[mask] == i).mean()
            logger.info("  %-20s %.2f%%  (n=%d)", cls, cls_acc * 100, mask.sum())

    # Save
    save_path = output or os.path.join(tempfile.mkdtemp(prefix="cybot_train_"), "threat_detector.keras")
    model.save(save_path)
    logger.info("Model saved to %s", save_path)

    if upload:
        detector.model = model
        detector.save_to_storage()
        logger.info("Model uploaded to Supabase Storage.")

    return save_path


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Train Cybot ThreatDetector")
    parser.add_argument("--epochs",  type=int,  default=30,    help="Max training epochs")
    parser.add_argument("--upload",  action="store_true",       help="Upload trained model to Supabase Storage")
    parser.add_argument("--output",  type=str,  default=None,  help="Local save path for .keras file")
    args = parser.parse_args()

    path = train(epochs=args.epochs, upload=args.upload, output=args.output)
    print(f"\nDone. Model saved to: {path}")


if __name__ == "__main__":
    main()

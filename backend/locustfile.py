"""
locustfile.py — Load test scenarios for the Cybot Django API

Run:
    pip install locust
    locust -f locustfile.py --host https://api.cybot.example.com

Scenarios:
    CybotUser       — authenticated user browsing threats, running an audit
    CybotAnalyst    — analyst creating threat alerts
    HealthProbe     — synthetic monitor hitting health endpoints
"""

import random
import string
from locust import HttpUser, task, between, constant


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _random_email():
    suffix = "".join(random.choices(string.ascii_lowercase, k=6))
    return f"loadtest+{suffix}@example.com"


def _fake_features():
    return {
        "packet_rate":         random.uniform(0, 100_000),
        "byte_rate":           random.uniform(0, 1_000_000),
        "flow_duration":       random.uniform(0, 3600),
        "unique_ips":          random.randint(0, 1000),
        "port_entropy":        random.uniform(0, 8),
        "failed_auth_count":   random.randint(0, 200),
        "payload_entropy":     random.uniform(0, 8),
        "geo_anomaly_score":   random.uniform(0, 1),
        "time_of_day_anomaly": random.uniform(0, 1),
        "protocol_deviation":  random.uniform(0, 1),
    }


# Placeholder — in real load tests, obtain a valid JWT before the test run
# and pass it via --env or a locust config file.
BEARER_TOKEN = "REPLACE_WITH_REAL_JWT"

AUTH_HEADERS = {"Authorization": f"Bearer {BEARER_TOKEN}"}


# ─── User scenarios ───────────────────────────────────────────────────────────

class CybotUser(HttpUser):
    """Simulates a typical authenticated mobile app user."""
    wait_time = between(1, 5)
    weight    = 10

    @task(5)
    def list_threats(self):
        self.client.get(
            "/api/v1/threats/?per_page=20",
            headers=AUTH_HEADERS,
            name="/api/v1/threats/",
        )

    @task(2)
    def list_threats_filtered(self):
        severity = random.choice(["HIGH", "CRITICAL", "MEDIUM"])
        self.client.get(
            f"/api/v1/threats/?severity={severity}&per_page=20",
            headers=AUTH_HEADERS,
            name="/api/v1/threats/?severity=[sev]",
        )

    @task(3)
    def get_profile(self):
        self.client.get("/api/v1/users/profile/", headers=AUTH_HEADERS)

    @task(2)
    def privacy_audit_history(self):
        self.client.get("/api/v1/privacy/audit/", headers=AUTH_HEADERS)

    @task(1)
    def run_privacy_audit(self):
        self.client.post(
            "/api/v1/privacy/audit/",
            json={"email": _random_email()},
            headers=AUTH_HEADERS,
            name="/api/v1/privacy/audit/ [POST]",
        )

    @task(2)
    def ml_predict(self):
        self.client.post(
            "/api/v1/ml/predict/",
            json={"features": _fake_features()},
            headers=AUTH_HEADERS,
        )

    @task(3)
    def threat_stats(self):
        self.client.get("/api/v1/threats/stats/", headers=AUTH_HEADERS)

    @task(1)
    def chat(self):
        questions = [
            "What is a DDoS attack?",
            "How do I secure my passwords?",
            "What is phishing?",
            "Explain port scanning.",
        ]
        self.client.post(
            "/api/v1/threats/chat/",
            json={"message": random.choice(questions)},
            headers=AUTH_HEADERS,
            name="/api/v1/threats/chat/",
        )


class CybotAnalyst(HttpUser):
    """Simulates a security analyst creating threat alerts."""
    wait_time = between(3, 10)
    weight    = 2

    @task
    def create_threat(self):
        severity  = random.choice(["LOW", "MEDIUM", "HIGH"])
        threat_type = random.choice(["malware", "phishing", "port_scan", "brute_force"])
        self.client.post(
            "/api/v1/threats/",
            json={
                "title":       f"Load-test threat {random.randint(1, 9999)}",
                "severity":    severity,
                "threat_type": threat_type,
                "confidence":  round(random.uniform(0.5, 1.0), 2),
            },
            headers=AUTH_HEADERS,
            name="/api/v1/threats/ [POST]",
        )


class HealthProbe(HttpUser):
    """Synthetic health monitor — hits health endpoints at a fixed rate."""
    wait_time = constant(5)
    weight    = 1

    @task(3)
    def liveness(self):
        self.client.get("/health/", name="/health/")

    @task(1)
    def readiness(self):
        self.client.get("/health/ready/", name="/health/ready/")

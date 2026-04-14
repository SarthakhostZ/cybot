"""
conftest.py — pytest fixtures for the Cybot backend.
"""

import django
from django.conf import settings

def pytest_configure(config):
    """Override settings for test runs — no real DB needed for middleware tests."""
    if not settings.configured:
        settings.configure(
            SECRET_KEY="test-only-secret",
            DATABASES={
                "default": {
                    "ENGINE": "django.db.backends.sqlite3",
                    "NAME": ":memory:",
                }
            },
            INSTALLED_APPS=[
                "django.contrib.contenttypes",
                "django.contrib.auth",
                "rest_framework",
            ],
            CACHES={
                "default": {
                    "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                }
            },
            # Middleware tests patch these via @override_settings
            SUPABASE_URL="https://placeholder.supabase.co",
            SUPABASE_ANON_KEY="placeholder",
            SUPABASE_SERVICE_ROLE_KEY="placeholder",
            SUPABASE_JWT_SECRET="placeholder-32-char-secret-change",
            INTERNAL_SERVICE_KEY="placeholder-internal-key",
        )

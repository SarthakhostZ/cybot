"""
Cybot – Django 5 settings
Primary backend: Supabase PostgreSQL (via transaction pooler)
"""

import os
from pathlib import Path
from decouple import config
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Core ────────────────────────────────────────────────────────────────────
SECRET_KEY = config("DJANGO_SECRET_KEY", default="insecure-dev-key-change-me")
DEBUG = config("DJANGO_DEBUG", default=True, cast=bool)
# In development (DEBUG=True) allow any host so the dev server is reachable
# from physical devices / emulators on any LAN IP without manual updates.
# In production, set DJANGO_ALLOWED_HOSTS to your actual domain(s).
if DEBUG:
    ALLOWED_HOSTS = ["*"]
else:
    ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",")

# ─── Apps ────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "corsheaders",
    "axes",
    # Cybot apps
    "users",
    "threats",
    "privacy_audit",
    "linkguard",
]

# ─── Middleware ───────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Cybot custom
    "core.middleware.SupabaseAuthMiddleware",
    "core.middleware.ZeroTrustMiddleware",
    # django-axes (brute-force protection)
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"

# ─── Database — Supabase PostgreSQL via Transaction Pooler (port 6543) ───────
_DATABASE_URL = config("DATABASE_URL", default="sqlite:///db.sqlite3")
DATABASES = {
    "default": dj_database_url.config(
        default=_DATABASE_URL,
        conn_max_age=60,
        conn_health_checks=True,
        # ssl_require only makes sense for PostgreSQL; SQLite (local dev
        # fallback) does not support SSL and will error if the option is set.
        ssl_require=_DATABASE_URL.startswith("postgres"),
    )
}

# ─── Cache / Redis ────────────────────────────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": config("REDIS_URL", default="redis://localhost:6379/0"),
    }
}

# ─── Auth ─────────────────────────────────────────────────────────────────────
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─── DRF ──────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],   # Auth is done by our JWT middleware
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",
        "user": "300/minute",
    },
    "EXCEPTION_HANDLER": "core.exceptions.cybot_exception_handler",
}

# ─── CORS ─────────────────────────────────────────────────────────────────────
if DEBUG:
    # Allow all origins in dev — Expo runs on whatever LAN IP the machine has
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOWED_ORIGINS = config(
        "DJANGO_CORS_ORIGINS",
        default="http://localhost:8081,http://localhost:19006",
    ).split(",")
CORS_ALLOW_CREDENTIALS = True

# ─── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL = config("SUPABASE_URL")
SUPABASE_ANON_KEY = config("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = config("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_JWT_SECRET = config("SUPABASE_JWT_SECRET")

# ─── OpenAI ───────────────────────────────────────────────────────────────────
OPENAI_API_KEY = config("OPENAI_API_KEY", default="")

# ─── HaveIBeenPwned ───────────────────────────────────────────────────────────
HIBP_API_KEY = config("HIBP_API_KEY", default="")

# ─── Google Safe Browsing (Link Scanner) ──────────────────────────────────────
GOOGLE_SAFE_BROWSING_API_KEY = config("GOOGLE_SAFE_BROWSING_API_KEY", default="")

# ─── ML / ThreatDetector ──────────────────────────────────────────────────────
# Absolute path to a local .keras file. If empty, the model is loaded from
# Supabase Storage (ml-models bucket) on first inference request.
ML_MODEL_PATH = config("ML_MODEL_PATH", default="")

# ─── Static / Media ───────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# ─── Internationalisation ─────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── Security headers (production) ────────────────────────────────────────────
if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ─── Axes (brute-force) ───────────────────────────────────────────────────────
AXES_FAILURE_LIMIT = 10
AXES_COOLOFF_TIME = 1   # hours
AXES_LOCKOUT_CALLABLE = "core.middleware.axes_lockout_response"

# ─── Internal service key (Edge Functions → Django) ──────────────────────────
INTERNAL_SERVICE_KEY = config("INTERNAL_SERVICE_KEY", default="")

# ─── LinkGuard ────────────────────────────────────────────────────────────────
LINKGUARD_CACHE_TTL      = config("LINKGUARD_CACHE_TTL", default=3600, cast=int)
LINKGUARD_RATE_LIMIT     = config("LINKGUARD_RATE_LIMIT", default=30, cast=int)
LINKGUARD_AI_ENABLED     = config("LINKGUARD_AI_ENABLED", default=True, cast=bool)
LINKGUARD_AUTO_OPEN_DELAY = config("LINKGUARD_AUTO_OPEN_DELAY", default=3000, cast=int)

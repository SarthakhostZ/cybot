# ─── Stage 1: build dependencies ─────────────────────────────────────────────
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Runtime system deps only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r cybot && useradd -r -g cybot -d /app -s /sbin/nologin cybot

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY --chown=cybot:cybot . .

# Collect static files (needs placeholder env vars — not secrets)
ENV DJANGO_SETTINGS_MODULE=core.settings \
    DJANGO_SECRET_KEY=build-time-placeholder \
    DJANGO_DEBUG=False \
    DATABASE_URL=sqlite:///tmp/build.db \
    SUPABASE_URL=https://placeholder.supabase.co \
    SUPABASE_ANON_KEY=placeholder \
    SUPABASE_SERVICE_ROLE_KEY=placeholder \
    SUPABASE_JWT_SECRET=placeholder-jwt-secret-minimum-32-chars \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN python manage.py collectstatic --noinput

# Drop to non-root
USER cybot

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:8000/health/ || exit 1

CMD ["gunicorn", "core.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--worker-class", "sync", \
     "--timeout", "120", \
     "--keep-alive", "5", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "50", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]

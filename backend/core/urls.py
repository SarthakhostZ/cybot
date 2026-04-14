from django.contrib import admin
from django.urls import path, include
from core.health import liveness, readiness

urlpatterns = [
    # Health probes (no auth required)
    path("health/",       liveness,  name="health-live"),
    path("health/ready/", readiness, name="health-ready"),

    path("admin/",             admin.site.urls),
    path("api/v1/users/",      include("users.urls")),
    path("api/v1/threats/",    include("threats.urls")),
    path("api/v1/privacy/",    include("privacy_audit.urls")),
    path("api/v1/ml/",         include("ml_models.urls")),
    path("api/v1/linkguard/",  include("linkguard.urls")),
]

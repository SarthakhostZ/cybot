"""
linkguard/urls.py

URL routing for the LinkGuard app.
All paths are mounted under /api/v1/linkguard/ in core/urls.py.
"""

from django.urls import path
from . import views

urlpatterns = [
    path("scan/",           views.scan_url,    name="linkguard-scan"),
    path("history/",        views.scan_history, name="linkguard-history"),
    path("stats/",          views.scan_stats,   name="linkguard-stats"),
    path("scan/<uuid:scan_id>/", views.scan_detail, name="linkguard-detail"),
]

from django.urls import path
from . import views

urlpatterns = [
    path("audit/",            views.PrivacyAuditView.as_view(),       name="privacy-audit"),
    path("audit/<uuid:pk>/",  views.PrivacyAuditDetailView.as_view(), name="privacy-audit-detail"),
    path("scan/link/",        views.LinkScanView.as_view(),           name="link-scan"),
]

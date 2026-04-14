from django.urls import path
from . import views

urlpatterns = [
    path("profile/",                 views.ProfileView.as_view(),       name="profile"),
    path("reports/",                 views.ReportListView.as_view(),     name="report-list"),
    path("reports/signed-url/",      views.ReportSignedUrlView.as_view(),name="report-signed-url"),
]

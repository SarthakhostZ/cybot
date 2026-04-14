from django.urls import path
from . import views

urlpatterns = [
    path("",                              views.ThreatListView.as_view(),          name="threat-list"),
    path("stats/",                        views.ThreatStatsView.as_view(),         name="threat-stats"),
    path("news/",                         views.CyberNewsView.as_view(),           name="cyber-news"),
    path("<uuid:pk>/",                    views.ThreatDetailView.as_view(),        name="threat-detail"),
    path("chat/",                         views.ChatbotView.as_view(),             name="chatbot"),
    path("chat/history/",                 views.ChatHistoryView.as_view(),         name="chat-history"),
    path("chat/sessions/",                views.ChatSessionListView.as_view(),     name="chat-sessions"),
    path("chat/sessions/<str:session_id>/", views.ChatSessionDetailView.as_view(), name="chat-session-detail"),
]

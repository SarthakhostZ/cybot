from django.urls import path
from . import views

urlpatterns = [
    path("predict/",         views.PredictView.as_view(),      name="ml-predict"),
    path("models/",          views.ModelListView.as_view(),    name="ml-model-list"),
    path("models/reload/",   views.ModelReloadView.as_view(),  name="ml-model-reload"),
    path("features/",        views.FeatureInfoView.as_view(),  name="ml-features"),
]

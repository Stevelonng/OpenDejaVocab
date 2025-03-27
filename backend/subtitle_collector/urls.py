"""
URL configuration for subtitle_collector project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from api import privacy_views
from api.admin import deja_vocab_admin

urlpatterns = [
    path('admin/', deja_vocab_admin.urls),
    path('privacy-policy/', privacy_views.privacy_policy, name='privacy_policy'),
    path('api/', include('api.urls')),
    path('api-auth/', include('rest_framework.urls')),
    path('', RedirectView.as_view(url='api/', permanent=False)),
]

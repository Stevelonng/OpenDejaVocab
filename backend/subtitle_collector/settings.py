"""
Django settings for subtitle_collector project.

Generated by 'django-admin startproject' using Django 5.1.7.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/5.1/ref/settings/
"""

from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
import os
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-ax7%t=&q&36xj4%#237wz_u%%=6@r)!s!s$ii19afh(g5rpy!i')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() == 'true'

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '192.168.2.171',
    'dejavocab.com',
    'www.dejavocab.com',
    '103.131.131.220',  # Add your IP address
    'linkiai.com',      # Add another domain
    'www.linkiai.com',   # Include www subdomain
    '0b55-104-234-99-10.ngrok-free.app',  # ngrok domain
    '*.ngrok-free.app',  # Support all ngrok domains
    '47.245.57.52',     # 阿里云服务器IP
    '47.245.54.174',    # 新的阿里云服务器IP
    '*',                # 允许所有主机（可选，在部署测试期间使用）
]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party apps
    'rest_framework',
    'rest_framework.authtoken',  # Add token authentication
    'corsheaders',
    # Local apps
    'api',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # CORS middleware
    # 'api.middleware.SecureRedirectMiddleware',  # Removed, handled by Nginx
    'django.middleware.common.CommonMiddleware',
    # Disable CSRF middleware in development environment
    # 'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # User activity tracking middleware - must be after AuthenticationMiddleware
    'api.middleware.UserActivityMiddleware',
]

ROOT_URLCONF = 'subtitle_collector.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'api' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'subtitle_collector.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'static'

# Media files
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# 生产环境安全设置
if not DEBUG:
    # 启用HTTPS相关设置
    SECURE_SSL_REDIRECT = os.environ.get('DJANGO_SECURE_SSL_REDIRECT', 'False').lower() == 'true'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    
    # 建议的HSTS设置
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    
    # 反向代理设置
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')  # 允许Django识别代理传递的HTTPS请求
    USE_X_FORWARDED_HOST = True  # 使用X-Forwarded-Host头信息
    USE_X_FORWARDED_PORT = True  # 使用X-Forwarded-Port头信息

# Django REST Framework settings
REST_FRAMEWORK = {
    # Give highest priority to Token authentication
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',  # Token auth first
        'rest_framework.authentication.BasicAuthentication',
        # Remove SessionAuthentication to avoid CSRF checks
        # 'rest_framework.authentication.SessionAuthentication', 
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# CORS settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://47.245.54.174",  # 阿里云服务器IP
    "http://47.245.54.174:8000",  # 阿里云服务器IP带端口
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://dejavocab.com",
    "https://www.dejavocab.com",
    "https://www.youtube.com",
    "http://0b55-104-234-99-10.ngrok-free.app",
    "https://0b55-104-234-99-10.ngrok-free.app",
    "https://www.bilibili.com",  # 添加B站域名
]

# Support cookies in cross-origin requests
CORS_ALLOW_CREDENTIALS = True

# 允许所有域名的CORS请求（开发环境使用）
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True

# Use regex to match all Chrome extension IDs
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^chrome-extension://.*$",  # Match any Chrome extension
]

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# CSRF settings
# Allow Chrome extensions to access
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://47.245.54.174",
    "http://47.245.54.174:8000",
    "https://dejavocab.com",
    "https://www.dejavocab.com",
    "http://0b55-104-234-99-10.ngrok-free.app",
    "https://0b55-104-234-99-10.ngrok-free.app"
]

# For Chrome extensions, we need special handling in the CSRF middleware
# Django 4.0+ supports wildcards in CSRF_TRUSTED_ORIGINS
# But a more secure approach is to use the @csrf_exempt decorator or custom middleware to handle Chrome extension requests

# Configure logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'filters': {
        'ignore_common_404s': {
            '()': 'django.utils.log.CallbackFilter',
            'callback': lambda record: not (
                record.levelname == 'WARNING' and 
                record.getMessage().startswith(('Not Found:', '"GET /')) and
                any(path in record.getMessage() for path in [
                    # Git and Docker related
                    '/.git', '/Dockerfile', '/.dockerignore', '/config.js',
                    
                    # API documentation related
                    '/api-docs', '/swagger', '/openapi',
                    
                    # Database related
                    '/backup.sql', '/db_backup.sql', '/backup/',
                    
                    # Laravel related
                    '/storage/framework/', '/storage/logs/', '/.env', 'env.php', 'local.xml',
                    
                    # Drupal and WordPress related
                    '/sites/all/', '/core/install.php', '/CHANGELOG.txt', '/wp-', '/xmlrpc.php',
                    
                    # Symfony related
                    '/config/packages/', '/config/routes', '/web/config.php', '/web.config',
                    
                    # Node.js related
                    '/package.json', '/yarn.lock', '/.npmrc', '/server.js', '/app.js',
                    
                    # Log file related
                    '/var/log', '/logs/', '/debug.log', '/error',
                    
                    # Configuration file related
                    '/.htaccess', '/configuration.php', '/.well-known/'
                ])
            )
        },
    },
    'handlers': {
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
            'filters': ['ignore_common_404s'],
        },
        'file': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': 'debug.log',
            'formatter': 'verbose',
            'filters': ['ignore_common_404s'],
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': True,
        },
        'django.server': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
            'filters': ['ignore_common_404s'],
        },
        'django.request': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
            'filters': ['ignore_common_404s'],
        },
        'api': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,  # 修改为False防止日志消息重复
        },
    },
}

# Content Security Policy settings
CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com")
CSP_STYLE_SRC = ("'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com")
CSP_FONT_SRC = ("'self'", "https://fonts.gstatic.com")
CSP_IMG_SRC = ("'self'", "data:")
CSP_CONNECT_SRC = ("'self'",)
CSP_FRAME_ANCESTORS = ("'self'",)
CSP_FORM_ACTION = ("'self'",)
CSP_BASE_URI = ("'self'",)
CSP_OBJECT_SRC = ("'none'",)
CSP_MEDIA_SRC = ("'self'")
CSP_FRAME_SRC = ("'self'")
CSP_CHILD_SRC = ("'self'")
CSP_MANIFEST_SRC = ("'self'")
CSP_WORKER_SRC = ("'self'")

# CSRF设置
CSRF_TRUSTED_ORIGINS = [
    'https://linkie.fun',
    'https://www.linkie.fun',
    'https://dejavocab.com',
    'https://www.dejavocab.com',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]

# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Increase the request field limit to handle large subtitles
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000

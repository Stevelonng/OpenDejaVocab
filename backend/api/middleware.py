import re
import time
from django.utils import timezone
from django.contrib.auth.models import User
from django.http import HttpResponsePermanentRedirect
from .models import UserSession, UserActivity, UserMetrics

class UserActivityMiddleware:
    """
    Middleware to track user sessions and activities
    """
    def __init__(self, get_response):
        self.get_response = get_response
        # Mapping of paths to action types
        self.path_to_action = {
            r'^/api/videos/': 'view_video',
            r'^/api/save-subtitles/': 'save_subtitle',
            r'^/api/add-sentence/': 'add_sentence',
            r'^/web/dictionary/': 'lookup_word',
            r'^/web/videos/\d+/$': 'view_video',
            r'^/web/login/': 'login',
            r'^/web/logout/': 'logout',
        }

    def __call__(self, request):
        # Record the start time of the request
        start_time = time.time()
        
        # Process the request
        if request.user.is_authenticated:
            self.process_request(request)
            
        # Get the response
        response = self.get_response(request)
        
        # Process the response
        if request.user.is_authenticated:
            # Calculate the execution time
            execution_time = int((time.time() - start_time) * 1000)
            self.process_response(request, response, execution_time)
            
        return response
    
    def process_request(self, request):
        """Process the request, create or get a session, and record user activity"""
        # Try to get the current user's active session
        user_session = UserSession.objects.filter(
            user=request.user,
            is_active=True
        ).first()
        
        # If no active session exists, create a new one
        if not user_session:
            # Detect device type, browser, and operating system
            device_type = self.get_device_type(request.META.get('HTTP_USER_AGENT', ''))
            browser, os = self.get_browser_and_os(request.META.get('HTTP_USER_AGENT', ''))
            
            # Create a new session
            user_session = UserSession.objects.create(
                user=request.user,
                session_key=request.session.session_key,
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                device_type=device_type,
                browser=browser,
                os=os
            )
            
            # Record the login activity
            UserActivity.objects.create(
                user=request.user,
                session=user_session,
                action_type='login',
                url=request.build_absolute_uri()
            )
            
            # Update user metrics
            self.update_user_metrics(request.user, login=True)
        else:
            # Update the session's last active time
            user_session.save()
        
        # Add the session object to the request
        request.user_session = user_session
        
        # Record user activity based on the request path
        self.record_activity_from_path(request, user_session)
    
    def process_response(self, request, response, execution_time):
        """Process the response, update session information"""
        # Update user metrics for each request
        if hasattr(request, 'user_session'):
            # In some views, a specific activity type may be set
            if hasattr(request, 'activity_type') and hasattr(request, 'activity_details'):
                UserActivity.objects.create(
                    user=request.user,
                    session=request.user_session,
                    action_type=request.activity_type,
                    details=request.activity_details,
                    url=request.build_absolute_uri()
                )
    
    def record_activity_from_path(self, request, user_session):
        """Record user activity based on the request path"""
        path = request.path
        
        for pattern, action_type in self.path_to_action.items():
            if re.match(pattern, path):
                # Create an activity record
                UserActivity.objects.create(
                    user=request.user,
                    session=user_session,
                    action_type=action_type,
                    url=request.build_absolute_uri()
                )
                
                # Update user metrics
                self.update_user_metrics(request.user, action_type=action_type)
                break
    
    def update_user_metrics(self, user, login=False, action_type=None):
        """Update user metrics"""
        # Get or create user metrics
        metrics, created = UserMetrics.objects.get_or_create(user=user)
        
        # Update metrics based on the activity type
        if login:
            metrics.total_login_count += 1
            metrics.last_login = timezone.now()
        
        if action_type:
            if action_type == 'view_video':
                # Do not increment every time, as it may be the same video
                pass
            elif action_type == 'save_subtitle':
                pass  # Subtitle count tracking has been removed
            elif action_type == 'add_sentence':
                metrics.sentences_count += 1
            elif action_type == 'lookup_word':
                pass  # Word query count tracking has been removed
            elif action_type == 'favorite_word':
                metrics.favorite_words_count += 1
        
        # Update the user's active status
        metrics.is_active_user = True
        metrics.save()
    
    def get_client_ip(self, request):
        """Get the client IP address"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    def get_device_type(self, user_agent):
        """Detect device type"""
        if not user_agent:
            return 'unknown'
        
        if 'Mobile' in user_agent:
            if 'iPad' in user_agent or 'Tablet' in user_agent:
                return 'tablet'
            return 'mobile'
        return 'desktop'
    
    def get_browser_and_os(self, user_agent):
        """Detect browser and operating system"""
        browser = 'unknown'
        os = 'unknown'
        
        if not user_agent:
            return browser, os
        
        # Browser detection
        if 'Chrome' in user_agent and 'Chromium' not in user_agent:
            browser = 'Chrome'
        elif 'Firefox' in user_agent:
            browser = 'Firefox'
        elif 'Safari' in user_agent and 'Chrome' not in user_agent:
            browser = 'Safari'
        elif 'MSIE' in user_agent or 'Trident' in user_agent:
            browser = 'IE'
        elif 'Edge' in user_agent:
            browser = 'Edge'
        
        # Operating system detection
        if 'Windows' in user_agent:
            os = 'Windows'
        elif 'Macintosh' in user_agent:
            os = 'macOS'
        elif 'Linux' in user_agent:
            os = 'Linux'
        elif 'Android' in user_agent:
            os = 'Android'
        elif 'iOS' in user_agent or 'iPhone' in user_agent or 'iPad' in user_agent:
            os = 'iOS'
        
        return browser, os

class SecureRedirectMiddleware:
    """
    Middleware to redirect HTTP requests to HTTPS, non-www domains to www, and alternate domains to the main domain
    """
    def __init__(self, get_response):
        self.get_response = get_response
        # Add other domains that need to be redirected to the main domain
        self.alternate_domains = {
            'linkiai.com': 'dejavocab.com',
            'www.linkiai.com': 'dejavocab.com'
        }

    def __call__(self, request):
        host = request.get_host()
        
        # Check if the request is from an alternate domain that needs to be redirected to the main domain
        if host in self.alternate_domains:
            # Get the target domain to redirect to
            target_domain = self.alternate_domains[host]
            # Construct the new URL with HTTPS and www prefix
            new_url = f"https://www.{target_domain}{request.path}"
            if request.META.get('QUERY_STRING', ''):
                new_url += f"?{request.META['QUERY_STRING']}"
            return HttpResponsePermanentRedirect(new_url)
            
        # Only perform HTTPS and www redirects for the production environment main domain
        elif host in ['dejavocab.com', 'www.dejavocab.com']:
            # Check if the request is secure
            is_secure = request.is_secure()
            
            # Check if the domain has a www prefix
            has_www = host.startswith('www.')
            
            # If the request is not secure or does not have a www prefix, perform the redirect
            if not is_secure or not has_www:
                scheme = 'https'
                
                # If the domain does not have a www prefix, add it
                if not has_www:
                    host = 'www.' + host
                
                # Construct the new URL
                new_url = f"{scheme}://{host}{request.path}"
                if request.META.get('QUERY_STRING', ''):
                    new_url += f"?{request.META['QUERY_STRING']}"
                
                return HttpResponsePermanentRedirect(new_url)
                
        return self.get_response(request)

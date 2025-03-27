import re
import time
from django.utils import timezone
from django.contrib.auth.models import User
from django.http import HttpResponsePermanentRedirect
from .models import UserSession, UserActivity, UserMetrics

class UserActivityMiddleware:
    """
    中间件，用于跟踪用户会话和活动
    """
    def __init__(self, get_response):
        self.get_response = get_response
        # 路径和活动类型的映射
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
        # 记录请求开始时间
        start_time = time.time()
        
        # 处理请求前的逻辑
        if request.user.is_authenticated:
            self.process_request(request)
            
        # 获取响应
        response = self.get_response(request)
        
        # 处理响应后的逻辑
        if request.user.is_authenticated:
            # 执行时间（毫秒）
            execution_time = int((time.time() - start_time) * 1000)
            self.process_response(request, response, execution_time)
            
        return response
    
    def process_request(self, request):
        """处理请求，创建或获取会话，并记录用户活动"""
        # 尝试获取当前用户的活跃会话
        user_session = UserSession.objects.filter(
            user=request.user,
            is_active=True
        ).first()
        
        # 如果没有活跃会话，创建一个
        if not user_session:
            # 检测设备类型、浏览器和操作系统
            device_type = self.get_device_type(request.META.get('HTTP_USER_AGENT', ''))
            browser, os = self.get_browser_and_os(request.META.get('HTTP_USER_AGENT', ''))
            
            # 创建新会话
            user_session = UserSession.objects.create(
                user=request.user,
                session_key=request.session.session_key,
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                device_type=device_type,
                browser=browser,
                os=os
            )
            
            # 记录登录活动
            UserActivity.objects.create(
                user=request.user,
                session=user_session,
                action_type='login',
                url=request.build_absolute_uri()
            )
            
            # 更新用户指标
            self.update_user_metrics(request.user, login=True)
        else:
            # 更新会话的最后活跃时间
            user_session.save()
        
        # 将会话对象添加到请求中，以便在视图中使用
        request.user_session = user_session
        
        # 根据请求路径记录用户活动
        self.record_activity_from_path(request, user_session)
    
    def process_response(self, request, response, execution_time):
        """处理响应，更新会话信息"""
        # 每个请求都可能更新用户指标
        if hasattr(request, 'user_session'):
            # 在某些视图中可能会设置特定的活动类型
            if hasattr(request, 'activity_type') and hasattr(request, 'activity_details'):
                UserActivity.objects.create(
                    user=request.user,
                    session=request.user_session,
                    action_type=request.activity_type,
                    details=request.activity_details,
                    url=request.build_absolute_uri()
                )
    
    def record_activity_from_path(self, request, user_session):
        """根据请求路径记录用户活动"""
        path = request.path
        
        for pattern, action_type in self.path_to_action.items():
            if re.match(pattern, path):
                # 创建活动记录
                UserActivity.objects.create(
                    user=request.user,
                    session=user_session,
                    action_type=action_type,
                    url=request.build_absolute_uri()
                )
                
                # 更新用户指标
                self.update_user_metrics(request.user, action_type=action_type)
                break
    
    def update_user_metrics(self, user, login=False, action_type=None):
        """更新用户指标"""
        # 获取或创建用户指标
        metrics, created = UserMetrics.objects.get_or_create(user=user)
        
        # 根据活动类型更新相应的指标
        if login:
            metrics.total_login_count += 1
            metrics.last_login = timezone.now()
        
        if action_type:
            if action_type == 'view_video':
                # 不每次都增加，因为可能是同一个视频的多次请求
                pass
            elif action_type == 'save_subtitle':
                pass  # 已经移除字幕计数跟踪
            elif action_type == 'add_sentence':
                metrics.sentences_count += 1
            elif action_type == 'lookup_word':
                pass  # 已经移除单词查询计数跟踪
            elif action_type == 'favorite_word':
                metrics.favorite_words_count += 1
        
        # 更新用户活跃状态
        metrics.is_active_user = True
        metrics.save()
    
    def get_client_ip(self, request):
        """获取客户端IP地址"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    def get_device_type(self, user_agent):
        """简单检测设备类型"""
        if not user_agent:
            return 'unknown'
        
        if 'Mobile' in user_agent:
            if 'iPad' in user_agent or 'Tablet' in user_agent:
                return 'tablet'
            return 'mobile'
        return 'desktop'
    
    def get_browser_and_os(self, user_agent):
        """简单检测浏览器和操作系统"""
        browser = 'unknown'
        os = 'unknown'
        
        if not user_agent:
            return browser, os
        
        # 浏览器检测
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
        
        # 操作系统检测
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
    中间件，用于将HTTP请求重定向到HTTPS，将非www域名重定向到www域名
    以及将备用域名重定向到主域名
    """
    def __init__(self, get_response):
        self.get_response = get_response
        # 添加需要重定向到主域名的其他域名
        self.alternate_domains = {
            'linkiai.com': 'dejavocab.com',
            'www.linkiai.com': 'dejavocab.com'
        }

    def __call__(self, request):
        host = request.get_host()
        
        # 检查是否是备用域名需要重定向到主域名
        if host in self.alternate_domains:
            # 获取应该重定向到的主域名
            target_domain = self.alternate_domains[host]
            # 构造新的URL，使用https和www前缀
            new_url = f"https://www.{target_domain}{request.path}"
            if request.META.get('QUERY_STRING', ''):
                new_url += f"?{request.META['QUERY_STRING']}"
            return HttpResponsePermanentRedirect(new_url)
            
        # 只针对生产环境主域名进行HTTPS和www重定向
        elif host in ['dejavocab.com', 'www.dejavocab.com']:
            # 检查是否使用HTTPS
            is_secure = request.is_secure()
            
            # 检查域名是否带www
            has_www = host.startswith('www.')
            
            # 如果不是HTTPS或者没有www前缀，进行重定向
            if not is_secure or not has_www:
                scheme = 'https'
                
                # 如果没有www前缀，添加它
                if not has_www:
                    host = 'www.' + host
                
                # 构造新的URL
                new_url = f"{scheme}://{host}{request.path}"
                if request.META.get('QUERY_STRING', ''):
                    new_url += f"?{request.META['QUERY_STRING']}"
                
                return HttpResponsePermanentRedirect(new_url)
                
        return self.get_response(request)

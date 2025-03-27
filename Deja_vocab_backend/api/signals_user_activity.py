from django.db.models.signals import post_save, post_delete, post_init
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.utils import timezone

from .models import Video, Subtitle, Sentence, UserActivity, UserSession, UserMetrics
from .word_models import UserWord


# 用户活动跟踪信号处理

@receiver(user_logged_in)
def user_logged_in_handler(sender, request, user, **kwargs):
    """处理用户登录事件"""
    try:
        # 创建或获取用户指标记录
        metrics, created = UserMetrics.objects.get_or_create(user=user)
        metrics.total_login_count += 1
        metrics.last_login = timezone.now()
        metrics.is_active_user = True
        metrics.save()
        
        # 创建用户会话
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        ip_address = get_client_ip(request)
        
        # 检测设备类型和浏览器信息
        device_type = 'unknown'
        browser = 'unknown'
        os = 'unknown'
        
        if 'Mobile' in user_agent:
            if 'iPad' in user_agent or 'Tablet' in user_agent:
                device_type = 'tablet'
            else:
                device_type = 'mobile'
        else:
            device_type = 'desktop'
        
        if 'Chrome' in user_agent and 'Chromium' not in user_agent:
            browser = 'Chrome'
        elif 'Firefox' in user_agent:
            browser = 'Firefox'
        elif 'Safari' in user_agent and 'Chrome' not in user_agent:
            browser = 'Safari'
        elif 'Edge' in user_agent:
            browser = 'Edge'
            
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
        
        # 创建会话记录
        session = UserSession.objects.create(
            user=user,
            session_key=request.session.session_key,
            ip_address=ip_address,
            user_agent=user_agent,
            device_type=device_type,
            browser=browser,
            os=os
        )
        
        # 记录登录活动
        UserActivity.objects.create(
            user=user,
            session=session,
            action_type='login',
            url=request.build_absolute_uri() if hasattr(request, 'build_absolute_uri') else None
        )
        
    except Exception as e:
        print(f"记录用户登录活动时出错: {str(e)}")


@receiver(user_logged_out)
def user_logged_out_handler(sender, request, user, **kwargs):
    """处理用户登出事件"""
    if not user:
        return
        
    try:
        # 查找用户当前活跃会话并关闭
        active_sessions = UserSession.objects.filter(user=user, is_active=True)
        now = timezone.now()
        
        for session in active_sessions:
            # 计算会话时长（分钟）
            duration = (now - session.start_time).total_seconds() / 60
            
            # 结束会话
            session.is_active = False
            session.end_time = now
            session.save()
            
            # 记录登出活动
            UserActivity.objects.create(
                user=user,
                session=session,
                action_type='logout',
                url=request.build_absolute_uri() if hasattr(request, 'build_absolute_uri') else None
            )
            
            # 更新用户使用时长指标
            metrics, created = UserMetrics.objects.get_or_create(user=user)
            metrics.total_session_time += int(duration)
            metrics.save()
            
    except Exception as e:
        print(f"记录用户登出活动时出错: {str(e)}")


@receiver(post_save, sender=Video)
def track_video_creation(sender, instance, created, **kwargs):
    """跟踪视频创建活动"""
    if created and instance.user:
        try:
            # 更新用户指标
            metrics, created_metrics = UserMetrics.objects.get_or_create(user=instance.user)
            metrics.videos_count += 1
            metrics.save()
            
            # 记录视频创建活动
            active_session = UserSession.objects.filter(user=instance.user, is_active=True).first()
            
            if active_session:
                UserActivity.objects.create(
                    user=instance.user,
                    session=active_session,
                    action_type='save_video',
                    details={'video_id': instance.id, 'title': instance.title},
                    url=None
                )
            else:
                # 如果没有活跃会话，创建一个新的会话
                new_session = UserSession.objects.create(
                    user=instance.user,
                    is_active=True
                )
                
                UserActivity.objects.create(
                    user=instance.user,
                    session=new_session,
                    action_type='save_video',
                    details={'video_id': instance.id, 'title': instance.title}
                )
                
        except Exception as e:
            print(f"跟踪视频创建活动时出错: {str(e)}")


@receiver(post_save, sender=Subtitle)
def track_subtitle_creation(sender, instance, created, **kwargs):
    """跟踪字幕创建活动 - 不再跟踪计数"""
    # 此函数已被简化，不再更新字幕计数
    pass


@receiver(post_save, sender=Sentence)
def track_sentence_creation(sender, instance, created, **kwargs):
    """跟踪句子创建活动"""
    if created and instance.user:
        try:
            # 更新用户指标
            metrics, created = UserMetrics.objects.get_or_create(user=instance.user)
            metrics.sentences_count += 1
            metrics.save()
            
            # 记录句子创建活动
            active_session = UserSession.objects.filter(user=instance.user, is_active=True).first()
            if active_session:
                UserActivity.objects.create(
                    user=instance.user,
                    session=active_session,
                    action_type='add_sentence',
                    details={'sentence_id': instance.id, 'text': instance.text[:50]}
                )
        except Exception as e:
            print(f"跟踪句子创建活动时出错: {str(e)}")


@receiver(post_save, sender=UserWord)
def track_favorite_word_change(sender, instance, created, **kwargs):
    """跟踪用户单词收藏状态变化"""
    # 获取实例的is_favorite字段是否发生了变化
    if hasattr(instance, '_original_is_favorite') and instance.is_favorite != instance._original_is_favorite:
        try:
            # 更新用户指标
            metrics, created = UserMetrics.objects.get_or_create(user=instance.user)
            
            # 如果是添加到收藏夹
            if instance.is_favorite:
                metrics.favorite_words_count += 1
                action_type = 'add_favorite'
            # 如果是从收藏夹移除
            else:
                metrics.favorite_words_count = max(0, metrics.favorite_words_count - 1)
                action_type = 'remove_favorite'
                
            metrics.save()
            
            # 记录收藏活动
            active_session = UserSession.objects.filter(user=instance.user, is_active=True).first()
            if active_session:
                word_details = {
                    'word_id': instance.id,
                    'word': instance.word_definition.text
                }
                
                UserActivity.objects.create(
                    user=instance.user,
                    session=active_session,
                    action_type=action_type,
                    details=word_details
                )
        except Exception as e:
            print(f"跟踪单词收藏活动时出错: {str(e)}")


# 在保存前捕获原始收藏状态
@receiver(post_init, sender=UserWord)
def store_original_favorite_status(sender, instance, **kwargs):
    """在UserWord实例初始化后，存储原始的收藏状态"""
    instance._original_is_favorite = instance.is_favorite


@receiver(post_save, sender=User)
def create_user_metrics(sender, instance, created, **kwargs):
    """为新用户创建指标记录"""
    if created:
        UserMetrics.objects.create(user=instance)


# 辅助函数
def get_client_ip(request):
    """获取客户端IP地址"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

from django.db.models.signals import post_save, post_delete, post_init
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.utils import timezone

from .models import Video, Subtitle, Sentence, UserActivity, UserSession, UserMetrics
from .word_models import UserWord


# User activity tracking signal handlers

@receiver(user_logged_in)
def user_logged_in_handler(sender, request, user, **kwargs):
    """Handle user login events"""
    try:
        # Create or get user metrics record
        metrics, _ = UserMetrics.objects.get_or_create(user=user)
        metrics.total_login_count += 1
        metrics.last_login = timezone.now()
        metrics.is_active_user = True
        metrics.save()
        
        # Create user session
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        ip_address = get_client_ip(request)
        
        # Detect device type and browser information
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
        
        # Create session record
        session = UserSession.objects.create(
            user=user,
            session_key=request.session.session_key,
            ip_address=ip_address,
            user_agent=user_agent,
            device_type=device_type,
            browser=browser,
            os=os
        )
        
        # Record login activity
        UserActivity.objects.create(
            user=user,
            session=session,
            action_type='login',
            url=request.build_absolute_uri() if hasattr(request, 'build_absolute_uri') else None
        )
        
    except Exception as e:
        print(f"Error recording user login activity: {str(e)}")


@receiver(user_logged_out)
def user_logged_out_handler(sender, request, user, **kwargs):
    """Handle user logout events"""
    if not user:
        return
        
    try:
        # Find user's current active sessions and close them
        active_sessions = UserSession.objects.filter(user=user, is_active=True)
        now = timezone.now()
        
        for session in active_sessions:
            # Calculate session duration (minutes)
            duration = (now - session.start_time).total_seconds() / 60
            
            # End session
            session.is_active = False
            session.end_time = now
            session.save()
            
            # Record logout activity
            UserActivity.objects.create(
                user=user,
                session=session,
                action_type='logout',
                url=request.build_absolute_uri() if hasattr(request, 'build_absolute_uri') else None
            )
            
            # Update user usage time metrics
            metrics, created = UserMetrics.objects.get_or_create(user=user)
            metrics.total_session_time += int(duration)
            metrics.save()
            
    except Exception as e:
        print(f"Error recording user logout activity: {str(e)}")


@receiver(post_save, sender=Video)
def track_video_creation(sender, instance, created, **kwargs):
    """Track video creation activity"""
    if created and instance.user:
        try:
            # Update user metrics
            metrics, created_metrics = UserMetrics.objects.get_or_create(user=instance.user)
            metrics.videos_count += 1
            metrics.save()
            
            # Record video creation activity
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
                # If no active session, create a new one
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
            print(f"Error tracking video creation activity: {str(e)}")


@receiver(post_save, sender=Subtitle)
def track_subtitle_creation(sender, instance, created, **kwargs):
    """Track subtitle creation activity - no longer tracking count"""
    # This function has been simplified, no longer updates subtitle count
    pass


@receiver(post_save, sender=Sentence)
def track_sentence_creation(sender, instance, created, **kwargs):
    """Track sentence creation activity"""
    if created and instance.user:
        try:
            # Update user metrics
            metrics, created = UserMetrics.objects.get_or_create(user=instance.user)
            metrics.sentences_count += 1
            metrics.save()
            
            # Record sentence creation activity
            active_session = UserSession.objects.filter(user=instance.user, is_active=True).first()
            if active_session:
                UserActivity.objects.create(
                    user=instance.user,
                    session=active_session,
                    action_type='add_sentence',
                    details={'sentence_id': instance.id, 'text': instance.text[:50]}
                )
        except Exception as e:
            print(f"Error tracking sentence creation activity: {str(e)}")


@receiver(post_save, sender=UserWord)
def track_favorite_word_change(sender, instance, created, **kwargs):
    """Track changes in user word favorite status"""
    # Check if the is_favorite field has changed
    if hasattr(instance, '_original_is_favorite') and instance.is_favorite != instance._original_is_favorite:
        try:
            # Update user metrics
            metrics, created = UserMetrics.objects.get_or_create(user=instance.user)
            
            # If adding to favorites
            if instance.is_favorite:
                metrics.favorite_words_count += 1
                
                # Record add to favorites activity
                active_session = UserSession.objects.filter(user=instance.user, is_active=True).first()
                if active_session:
                    UserActivity.objects.create(
                        user=instance.user,
                        session=active_session,
                        action_type='favorite_word',
                        details={'word_id': instance.id, 'word': instance.word_definition.text}
                    )
            # If removing from favorites
            else:
                # Ensure count doesn't go below 0
                metrics.favorite_words_count = max(0, metrics.favorite_words_count - 1)
                
                # Record remove from favorites activity
                active_session = UserSession.objects.filter(user=instance.user, is_active=True).first()
                if active_session:
                    UserActivity.objects.create(
                        user=instance.user,
                        session=active_session,
                        action_type='unfavorite_word',
                        details={'word_id': instance.id, 'word': instance.word_definition.text}
                    )
            
            metrics.save()
        except Exception as e:
            print(f"Error tracking favorite word change: {str(e)}")


# Capture original favorite status before saving
@receiver(post_init, sender=UserWord)
def store_original_favorite_status(sender, instance, **kwargs):
    """After UserWord instance is initialized, store original favorite status"""
    instance._original_is_favorite = instance.is_favorite


@receiver(post_save, sender=User)
def create_user_metrics(sender, instance, created, **kwargs):
    """Create metrics record for new users"""
    if created:
        UserMetrics.objects.create(user=instance)


# Helper functions
def get_client_ip(request):
    """Get client IP address"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

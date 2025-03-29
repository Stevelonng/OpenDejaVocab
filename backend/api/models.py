from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
# Delayed import to avoid circular reference
from django.db.models import SET_NULL

class Video(models.Model):
    """Model to store video information"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='videos')
    url = models.URLField(max_length=255)
    title = models.CharField(max_length=255, blank=True)
    platform = models.CharField(max_length=50, default='YouTube')
    created_at = models.DateTimeField(auto_now_add=True)
    # Add foreign key to chat session - a video can only belong to one session
    # Use string reference to avoid circular import
    chat_session = models.ForeignKey('api.ChatSession', on_delete=SET_NULL, 
                                    related_name='session_videos', null=True, blank=True)
    
    class Meta:
        # Ensure that the same user does not have multiple video records with the same URL
        unique_together = ['user', 'url']
        # Add default sorting to resolve pagination warning
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title or self.url
    
    def has_subtitles(self):
        """
        检查视频是否有字幕
        返回值:
        - True: 如果有至少一条字幕
        - False: 如果没有字幕
        """
        return self.subtitles.exists()
    
    def subtitles_count(self):
        """
        返回视频的字幕数量
        """
        return self.subtitles.count()

class Subtitle(models.Model):
    """Model to store subtitle segments with timestamps"""
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='subtitles')
    text = models.TextField()
    start_time = models.FloatField()  # Time in seconds
    end_time = models.FloatField()    # Time in seconds
    
    def __str__(self):
        return f"{self.text[:50]}..."

class Sentence(models.Model):
    """Model to store important sentences marked by users from video subtitles"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sentences')
    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name='sentences', null=True)
    text = models.TextField()
    translation = models.TextField(blank=True)
    start_time = models.FloatField(null=True, blank=True)  # Sentence start time in the video
    end_time = models.FloatField(null=True, blank=True)    # Sentence end time in the video
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.text[:50]
    
    def get_video_link(self):
        """Get the video link associated with the sentence"""
        return self.video.url if self.video else ""
    
    def get_video_title(self):
        """Get the video title associated with the sentence"""
        return self.video.title if self.video else ""
        
    def get_timestamp_url(self):
        """Get the YouTube video link with timestamp"""
        if not self.video or self.start_time is None or not self.video.url:
            return ""
        
        # Extract YouTube video ID from URL
        import re
        youtube_regex = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/)|\
                          youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})'
        match = re.search(youtube_regex, self.video.url)
        
        if not match:
            return self.video.url
            
        video_id = match.group(1)
        # Convert time to integer seconds
        t = int(self.start_time)
        return f"https://www.youtube.com/watch?v={video_id}&t={t}s"


# MVP user activity tracking model
class UserSession(models.Model):
    """Record user session information"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    session_key = models.CharField(max_length=40, blank=True, null=True)  # Django session key
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, null=True)
    device_type = models.CharField(max_length=20, blank=True, null=True)  # desktop, mobile, tablet
    browser = models.CharField(max_length=100, blank=True, null=True)
    os = models.CharField(max_length=100, blank=True, null=True)
    
    class Meta:
        verbose_name = "User Session"
        verbose_name_plural = "User Sessions"
    
    def __str__(self):
        duration = "Active" if self.is_active else f"{self.get_duration()} minutes"
        return f"{self.user.username} - {self.start_time.strftime('%Y-%m-%d %H:%M')} ({duration})"
    
    def get_duration(self):
        if self.end_time and self.start_time:
            diff = self.end_time - self.start_time
            return round(diff.total_seconds() / 60, 1)  # Return minutes
        return 0
    
    def save(self, *args, **kwargs):
        if not self.is_active and not self.end_time:
            self.end_time = timezone.now()
        super().save(*args, **kwargs)


class UserActivity(models.Model):
    """Record user specific activities"""
    ACTION_TYPES = (
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('view_video', 'View Video'),
        ('save_subtitle', 'Save Subtitle'),
        ('lookup_word', 'Lookup Word'),
        ('add_sentence', 'Add Sentence'),
        ('favorite_word', 'Favorite Word'),
        ('extension_use', 'Use Extension'),
        ('other', 'Other'),
    )
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='activities')
    session = models.ForeignKey(UserSession, on_delete=models.CASCADE, related_name='activities', null=True, blank=True)
    action_type = models.CharField(max_length=50, choices=ACTION_TYPES)
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(null=True, blank=True)  # Store additional activity information
    url = models.URLField(max_length=500, blank=True, null=True)  # URL where the activity occurred
    
    class Meta:
        verbose_name = "User Activity"
        verbose_name_plural = "User Activities"
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.user.username} - {self.get_action_type_display()} - {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"


class UserMetrics(models.Model):
    """Summarize user usage metrics"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='metrics')
    total_login_count = models.PositiveIntegerField(default=0)
    total_session_time = models.PositiveIntegerField(default=0)  # In minutes
    videos_count = models.PositiveIntegerField(default=0)
    favorite_words_count = models.PositiveIntegerField(default=0)
    sentences_count = models.PositiveIntegerField(default=0)
    last_active = models.DateTimeField(auto_now=True)
    last_login = models.DateTimeField(null=True, blank=True)
    first_seen = models.DateTimeField(auto_now_add=True)
    is_active_user = models.BooleanField(default=True)  # Whether the user has been active in the last 30 days
    
    class Meta:
        verbose_name = "User Metrics"
        verbose_name_plural = "User Metrics"
    
    def __str__(self):
        return f"{self.user.username} Metrics"

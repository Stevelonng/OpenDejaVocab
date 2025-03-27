from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from .word_models import WordDefinition, UserWord
# 延迟导入避免循环引用
from django.db.models import SET_NULL

class Video(models.Model):
    """Model to store video information"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='videos')
    url = models.URLField(max_length=255)
    title = models.CharField(max_length=255, blank=True)
    platform = models.CharField(max_length=50, default='YouTube')
    created_at = models.DateTimeField(auto_now_add=True)
    # 添加外键到聊天会话 - 一个视频只能属于一个会话
    # 使用字符串引用避免循环导入
    chat_session = models.ForeignKey('api.ChatSession', on_delete=SET_NULL, 
                                    related_name='session_videos', null=True, blank=True)
    
    class Meta:
        # 确保同一用户不会有相同URL的视频记录
        unique_together = ['user', 'url']
        # 添加默认排序，解决分页警告
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title or self.url

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
    start_time = models.FloatField(null=True, blank=True)  # 句子在视频中的开始时间
    end_time = models.FloatField(null=True, blank=True)    # 句子在视频中的结束时间
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.text[:50]
    
    def get_video_link(self):
        """获取与句子关联的视频链接"""
        return self.video.url if self.video else ""
    
    def get_video_title(self):
        """获取与句子关联的视频标题"""
        return self.video.title if self.video else ""
        
    def get_timestamp_url(self):
        """获取带时间戳的YouTube视频链接"""
        if not self.video or self.start_time is None or not self.video.url:
            return ""
        
        # 从 URL 中提取 YouTube 视频 ID
        import re
        youtube_regex = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/)|\
                          youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})'
        match = re.search(youtube_regex, self.video.url)
        
        if not match:
            return self.video.url
            
        video_id = match.group(1)
        # 转换时间为整数秒数
        t = int(self.start_time)
        return f"https://www.youtube.com/watch?v={video_id}&t={t}s"


# MVP用户活动跟踪模型
class UserSession(models.Model):
    """记录用户会话信息"""
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
        verbose_name = "用户会话"
        verbose_name_plural = "用户会话"
    
    def __str__(self):
        duration = "活跃中" if self.is_active else f"{self.get_duration()} 分钟"
        return f"{self.user.username} - {self.start_time.strftime('%Y-%m-%d %H:%M')} ({duration})"
    
    def get_duration(self):
        if self.end_time and self.start_time:
            diff = self.end_time - self.start_time
            return round(diff.total_seconds() / 60, 1)  # 返回分钟数
        return 0
    
    def save(self, *args, **kwargs):
        if not self.is_active and not self.end_time:
            self.end_time = timezone.now()
        super().save(*args, **kwargs)


class UserActivity(models.Model):
    """记录用户具体活动"""
    ACTION_TYPES = (
        ('login', '登录'),
        ('logout', '登出'),
        ('view_video', '查看视频'),
        ('save_subtitle', '保存字幕'),
        ('lookup_word', '查词'),
        ('add_sentence', '添加句子'),
        ('favorite_word', '收藏单词'),
        ('extension_use', '使用扩展'),
        ('other', '其他'),
    )
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='activities')
    session = models.ForeignKey(UserSession, on_delete=models.CASCADE, related_name='activities', null=True, blank=True)
    action_type = models.CharField(max_length=50, choices=ACTION_TYPES)
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(null=True, blank=True)  # 存储活动的额外信息
    url = models.URLField(max_length=500, blank=True, null=True)  # 活动发生的URL
    
    class Meta:
        verbose_name = "用户活动"
        verbose_name_plural = "用户活动"
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.user.username} - {self.get_action_type_display()} - {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"


class UserMetrics(models.Model):
    """汇总用户使用指标"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='metrics')
    total_login_count = models.PositiveIntegerField(default=0)
    total_session_time = models.PositiveIntegerField(default=0)  # 以分钟为单位
    videos_count = models.PositiveIntegerField(default=0)
    favorite_words_count = models.PositiveIntegerField(default=0)
    sentences_count = models.PositiveIntegerField(default=0)
    last_active = models.DateTimeField(auto_now=True)
    last_login = models.DateTimeField(null=True, blank=True)
    first_seen = models.DateTimeField(auto_now_add=True)
    is_active_user = models.BooleanField(default=True)  # 过去30天是否活跃
    
    class Meta:
        verbose_name = "用户指标"
        verbose_name_plural = "用户指标"
    
    def __str__(self):
        return f"{self.user.username} 的使用指标"

from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from .models import Subtitle, Video

class ChatSession(models.Model):
    """用户聊天会话模型 - 代表一次完整的聊天对话"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    created_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    title = models.CharField(max_length=255, blank=True)  # 自动或手动设置的会话标题
    summary = models.TextField(blank=True)  # 会话结束时的AI生成总结
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "聊天会话"
        verbose_name_plural = "聊天会话"
    
    def __str__(self):
        return f"{self.user.username} - {self.title or self.created_at.strftime('%Y-%m-%d %H:%M')}"
    
    def end_session(self):
        """结束会话并记录结束时间"""
        if self.is_active:
            self.is_active = False
            self.ended_at = timezone.now()
            self.save()
    
    def get_duration(self):
        """获取会话持续时间（分钟）"""
        end = self.ended_at or timezone.now()
        if self.created_at:
            diff = end - self.created_at
            return round(diff.total_seconds() / 60, 1)
        return 0
    
    def get_videos_count(self):
        """获取本次会话关联的视频数量"""
        return self.session_videos.count()
    
    def get_messages_count(self):
        """获取本次会话的消息数量"""
        return self.messages.count()
    
    def generate_title(self):
        """根据对话内容自动生成会话标题"""
        if self.title:
            return
            
        # 使用第一条用户消息作为标题基础
        first_user_message = self.messages.filter(role='user').first()
        if first_user_message:
            # 截取适当长度作为标题
            title_base = first_user_message.content[:50]
            if len(first_user_message.content) > 50:
                title_base += "..."
            self.title = title_base
            self.save()
        else:
            # 如果没有用户消息，使用日期作为标题
            self.title = f"对话 {self.created_at.strftime('%Y-%m-%d %H:%M')}"
            self.save()


class ChatMessage(models.Model):
    """聊天消息模型 - 存储对话中的每条消息"""
    ROLE_CHOICES = (
        ('user', '用户'),
        ('assistant', '助手'),
        ('system', '系统'),
    )
    
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    # 可选关联到视频
    video = models.ForeignKey(Video, on_delete=models.SET_NULL, null=True, blank=True, 
                             related_name='chat_messages')
    
    class Meta:
        ordering = ['timestamp']
        verbose_name = "聊天消息"
        verbose_name_plural = "聊天消息"
    
    def __str__(self):
        preview = self.content[:30] + "..." if len(self.content) > 30 else self.content
        return f"{self.get_role_display()}: {preview}"

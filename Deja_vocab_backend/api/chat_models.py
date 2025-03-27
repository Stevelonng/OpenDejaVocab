from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from .models import Video

class ChatSession(models.Model):
    """Chat session model - represents a complete conversation"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    created_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    title = models.CharField(max_length=255, blank=True)  # Automatically or manually set session title
    summary = models.TextField(blank=True)  # AI-generated summary at the end of the session
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "Chat Session"
        verbose_name_plural = "Chat Sessions"
    
    def __str__(self):
        return f"{self.user.username} - {self.title or self.created_at.strftime('%Y-%m-%d %H:%M')}"
    
    def end_session(self):
        """End the session and record the end time"""
        if self.is_active:
            self.is_active = False
            self.ended_at = timezone.now()
            self.save()
    
    def get_duration(self):
        """Get the session duration in minutes"""
        end = self.ended_at or timezone.now()
        if self.created_at:
            diff = end - self.created_at
            return round(diff.total_seconds() / 60, 1)
        return 0
    
    def get_videos_count(self):
        """Get the number of videos associated with this session"""
        return self.session_videos.count()
    
    def get_messages_count(self):
        """Get the number of messages in this session"""
        return self.messages.count()
    
    def generate_title(self):
        """Automatically generate a session title based on the conversation content"""
        if self.title:
            return
            
        # Use the first user message as the title basis
        first_user_message = self.messages.filter(role='user').first()
        if first_user_message:
            # Trim to a suitable length as the title
            title_base = first_user_message.content[:50]
            if len(first_user_message.content) > 50:
                title_base += "..."
            self.title = title_base
            self.save()
        else:
            # If there are no user messages, use the date as the title
            self.title = f"Conversation {self.created_at.strftime('%Y-%m-%d %H:%M')}"
            self.save()


class ChatMessage(models.Model):
    """Chat message model - stores each message in a conversation"""
    ROLE_CHOICES = (
        ('user', 'User'),
        ('assistant', 'Assistant'),
        ('system', 'System'),
    )
    
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    # Optional association with a video
    video = models.ForeignKey(Video, on_delete=models.SET_NULL, null=True, blank=True, 
                             related_name='chat_messages')
    
    class Meta:
        ordering = ['timestamp']
        verbose_name = "Chat Message"
        verbose_name_plural = "Chat Messages"
    
    def __str__(self):
        preview = self.content[:30] + "..." if len(self.content) > 30 else self.content
        return f"{self.get_role_display()}: {preview}"

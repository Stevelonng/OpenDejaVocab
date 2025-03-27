from django.db import models
from django.conf import settings

class Feedback(models.Model):
    """User feedback model, used to collect user comments and suggestions"""
    
    FEEDBACK_TYPES = (
        ('bug', 'Error Report'),
        ('feature', 'Feature Suggestion'),
        ('usability', 'Usability'),
        ('other', 'Other'),
    )
    
    type = models.CharField(max_length=20, choices=FEEDBACK_TYPES, verbose_name='Feedback Type')
    content = models.TextField(verbose_name='Feedback Content')
    wechat = models.CharField(max_length=50, blank=True, null=True, verbose_name='WeChat')
    source = models.CharField(max_length=50, default='web', verbose_name='Feedback Source')
    url = models.URLField(blank=True, null=True, verbose_name='Page URL')
    user_agent = models.TextField(blank=True, null=True, verbose_name='User Agent')
    
    # Whether the feedback is adopted
    is_adopted = models.BooleanField(default=False, verbose_name='Whether adopted')
    adopted_at = models.DateTimeField(null=True, blank=True, verbose_name='Adopted Time')
    reward_given = models.BooleanField(default=False, verbose_name='Whether a reward has been issued')
    reward_note = models.CharField(max_length=255, blank=True, null=True, verbose_name='Reward Note')
    
    # Optional user association
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='feedbacks',
        verbose_name='User'
    )
    
    # Auto record time
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Created Time')
    
    # Whether processed
    is_processed = models.BooleanField(default=False, verbose_name='Whether processed')
    processed_at = models.DateTimeField(null=True, blank=True, verbose_name='Processed Time')
    
    class Meta:
        verbose_name = 'User Feedback'
        verbose_name_plural = 'User Feedback'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_type_display()} - {self.content[:50]}"

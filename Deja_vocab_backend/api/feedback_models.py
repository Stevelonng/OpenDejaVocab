from django.db import models
from django.conf import settings

class Feedback(models.Model):
    """用户反馈模型，用于收集用户意见和建议"""
    
    FEEDBACK_TYPES = (
        ('bug', '错误报告'),
        ('feature', '功能建议'),
        ('usability', '使用体验'),
        ('other', '其他'),
    )
    
    type = models.CharField(max_length=20, choices=FEEDBACK_TYPES, verbose_name='反馈类型')
    content = models.TextField(verbose_name='反馈内容')
    wechat = models.CharField(max_length=50, blank=True, null=True, verbose_name='微信号')
    source = models.CharField(max_length=50, default='web', verbose_name='反馈来源')
    url = models.URLField(blank=True, null=True, verbose_name='页面URL')
    user_agent = models.TextField(blank=True, null=True, verbose_name='用户代理')
    
    # 是否采纳反馈
    is_adopted = models.BooleanField(default=False, verbose_name='是否采纳')
    adopted_at = models.DateTimeField(null=True, blank=True, verbose_name='采纳时间')
    reward_given = models.BooleanField(default=False, verbose_name='是否已发放奖励')
    reward_note = models.CharField(max_length=255, blank=True, null=True, verbose_name='奖励备注')
    
    # 关联用户（可选）
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='feedbacks',
        verbose_name='用户'
    )
    
    # 自动记录时间
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    
    # 是否已处理
    is_processed = models.BooleanField(default=False, verbose_name='是否已处理')
    processed_at = models.DateTimeField(null=True, blank=True, verbose_name='处理时间')
    
    class Meta:
        verbose_name = '用户反馈'
        verbose_name_plural = '用户反馈'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_type_display()} - {self.content[:50]}"

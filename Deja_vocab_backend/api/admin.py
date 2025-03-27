from django.contrib import admin
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db.models import Count, Sum, Avg
from django.contrib import admin
from django.http import HttpResponseRedirect
from django.contrib import messages
from django.shortcuts import render
from .models import Video, Subtitle, Sentence
from .models import UserSession, UserActivity, UserMetrics
from .feedback_models import Feedback
from .word_models import WordDefinition, UserWord, WordReference
from .chat_models import ChatSession, ChatMessage

# 为所有Admin类添加的删除所有记录的操作
def delete_all_records(modeladmin, request, queryset):
    """删除该模型下的所有记录（谨慎使用）"""
    model = modeladmin.model
    count = model.objects.count()
    model.objects.all().delete()
    messages.success(request, f'成功删除所有{count}条{model._meta.verbose_name}记录')
delete_all_records.short_description = "⚠️ 删除所有记录（谨慎使用）"

# 为Admin类添加自定义按钮方法
class AdminWithDeleteAllButton:
    """包含删除所有记录按钮的Admin基类"""
    
    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom_urls = [
            path('delete_all/', self.admin_site.admin_view(self.delete_all_view), name=f'{self.model._meta.app_label}_{self.model._meta.model_name}_delete_all'),
        ]
        return custom_urls + urls
    
    def delete_all_view(self, request):
        """处理删除所有记录的视图"""
        if request.method == 'POST':
            model = self.model
            count = model.objects.count()
            model.objects.all().delete()
            self.message_user(request, f'成功删除所有{count}条{model._meta.verbose_name}记录', messages.SUCCESS)
            return HttpResponseRedirect("../")
        else:
            opts = self.model._meta
            context = {
                **self.admin_site.each_context(request),
                'title': f'确认删除所有{opts.verbose_name}',
                'opts': opts,
                'app_label': opts.app_label,
                'count': self.model.objects.count(),
            }
            return render(request, 'admin/delete_all_confirmation.html', context)
    
    def changelist_view(self, request, extra_context=None):
        """添加删除所有按钮到列表页"""
        extra_context = extra_context or {}
        extra_context['show_delete_all'] = True
        return super().changelist_view(request, extra_context=extra_context)

class SubtitleInline(admin.TabularInline):
    model = Subtitle
    extra = 0
    fields = ('text', 'start_time', 'end_time')
    
# 不再需要 SentenceReferenceInline
    
@admin.register(Video)
class VideoAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('title', 'url', 'platform', 'created_at', 'user')
    list_filter = ('platform', 'created_at')
    search_fields = ('title', 'url')
    inlines = [SubtitleInline]
    
@admin.register(Subtitle)
class SubtitleAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('text', 'start_time', 'end_time', 'video')
    list_filter = ('video__title',)
    search_fields = ('text',)
    
@admin.register(Sentence)
class SentenceAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('text', 'translation', 'user', 'video', 'start_time', 'end_time', 'created_at')
    list_filter = ('created_at', 'video')
    search_fields = ('text', 'translation', 'video__title')

@admin.register(Feedback)
class FeedbackAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('type', 'content_preview', 'wechat', 'source', 'user', 'created_at', 'is_processed', 'is_adopted', 'reward_given')
    list_filter = ('type', 'source', 'created_at', 'is_processed', 'is_adopted', 'reward_given')
    search_fields = ('content', 'wechat', 'user__username', 'reward_note')
    readonly_fields = ('created_at',)
    actions = ['mark_as_processed', 'adopt_feedback', 'mark_reward_given']
    
    def content_preview(self, obj):
        """显示反馈内容的前50个字符"""
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = '反馈内容'
    
    def mark_as_processed(self, request, queryset):
        """将选中的反馈标记为已处理"""
        queryset.update(is_processed=True, processed_at=timezone.now())
    mark_as_processed.short_description = '标记为已处理'
    
    def adopt_feedback(self, request, queryset):
        """将选中的反馈标记为已采纳，等待发放 Link零记卡组奖励"""
        queryset.update(is_adopted=True, adopted_at=timezone.now())
        # 标记为已处理，如果还没标记的话
        queryset.filter(is_processed=False).update(is_processed=True, processed_at=timezone.now())
    adopt_feedback.short_description = '采纳反馈（可获奖励）'
    
    def mark_reward_given(self, request, queryset):
        """将选中的反馈标记为已发放奖励"""
        queryset.update(reward_given=True)
    mark_reward_given.short_description = '标记为已发放奖励'
    
# User Activity Models
class UserActivityInline(admin.TabularInline):
    model = UserActivity
    extra = 0
    fields = ('action_type', 'timestamp', 'url')
    readonly_fields = ('action_type', 'timestamp', 'url')
    can_delete = False
    max_num = 15
    ordering = ('-timestamp',)

@admin.register(UserSession)
class UserSessionAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user', 'start_time', 'end_time', 'session_duration', 'is_active', 'device_type', 'browser', 'os')
    list_filter = ('is_active', 'start_time', 'device_type', 'browser', 'os')
    search_fields = ('user__username', 'ip_address', 'user_agent')
    readonly_fields = ('session_key', 'start_time', 'user_agent')
    date_hierarchy = 'start_time'
    inlines = [UserActivityInline]
    
    def session_duration(self, obj):
        if obj.is_active:
            return "会话活跃中"
        return f"{obj.get_duration()} 分钟"
    session_duration.short_description = "会话时长"

@admin.register(UserActivity)
class UserActivityAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user', 'action_type', 'timestamp', 'get_session_info', 'url')
    list_filter = ('action_type', 'timestamp')
    search_fields = ('user__username', 'details', 'url')
    readonly_fields = ('user', 'session', 'action_type', 'timestamp', 'details', 'url')
    date_hierarchy = 'timestamp'
    
    def get_session_info(self, obj):
        if obj.session:
            return f"会话ID: {obj.session.id} - {obj.session.start_time.strftime('%Y-%m-%d %H:%M')}"
        return "-"
    get_session_info.short_description = "会话信息"

@admin.register(UserMetrics)
class UserMetricsAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user', 'total_login_count', 'total_session_time', 'videos_count', 
                   'favorite_words_count', 'sentences_count', 'last_active', 'is_active_user')
    list_filter = ('is_active_user', 'last_active', 'first_seen')
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('first_seen',)
    
    def get_queryset(self, request):
        # 添加按最后活跃时间倒序排序
        return super().get_queryset(request).order_by('-last_active')
        
# 添加UserMetricsInline到User管理界面
class UserMetricsInline(admin.StackedInline):
    model = UserMetrics
    can_delete = False
    verbose_name_plural = '用户使用指标'
    readonly_fields = ('total_login_count', 'total_session_time', 'videos_count', 
                      'favorite_words_count', 'sentences_count', 
                      'last_active', 'first_seen')

# 扩展User Admin
class CustomUserAdmin(AdminWithDeleteAllButton, BaseUserAdmin):
    inlines = (UserMetricsInline,)
    list_display = BaseUserAdmin.list_display + ('get_last_active', 'get_videos_count', 'get_session_time')
    
    def get_last_active(self, obj):
        try:
            return obj.metrics.last_active
        except UserMetrics.DoesNotExist:
            return "-"
    get_last_active.short_description = "最后活跃时间"
    
    def get_videos_count(self, obj):
        try:
            return obj.metrics.videos_count
        except UserMetrics.DoesNotExist:
            return 0
    get_videos_count.short_description = "视频数量"
    
    def get_session_time(self, obj):
        try:
            return f"{obj.metrics.total_session_time} 分钟"
        except UserMetrics.DoesNotExist:
            return "0 分钟"
    get_session_time.short_description = "总使用时间"

# 替换默认User admin
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)

# 添加 WordDefinition 和 UserWord 的注册和管理类
@admin.register(WordDefinition)
class WordDefinitionAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('text', 'translation', 'uk_phonetic', 'us_phonetic', 'language', 'created_at')
    list_filter = ('language', 'created_at')
    search_fields = ('text', 'translation')
    fields = ('text', 'language', 'translation', 'uk_phonetic', 'us_phonetic', 'phonetic', 'web_translation', 'has_audio')
    
@admin.register(UserWord)
class UserWordAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user', 'word_text', 'notes', 'is_favorite', 'created_at')
    list_filter = ('user', 'is_favorite', 'created_at')
    search_fields = ('word_definition__text', 'notes', 'user__username')
    fields = ('user', 'word_definition', 'notes', 'is_favorite')
    
    def word_text(self, obj):
        """返回关联的单词文本"""
        return obj.word_definition.text if obj.word_definition else "无单词"
    word_text.short_description = "单词"
    
@admin.register(WordReference)
class WordReferenceAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user_word_text', 'subtitle_preview', 'video_title', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user_word__word_definition__text', 'subtitle__text')
    raw_id_fields = ('user_word', 'subtitle')
    
    def user_word_text(self, obj):
        """返回关联的单词文本"""
        if obj.user_word and obj.user_word.word_definition:
            return obj.user_word.word_definition.text
        return "未关联单词"
    user_word_text.short_description = "单词"
    
    def subtitle_preview(self, obj):
        """显示字幕内容的前50个字符"""
        if obj.subtitle and obj.subtitle.text:
            text = obj.subtitle.text
            return text[:50] + "..." if len(text) > 50 else text
        return "无字幕内容"
    subtitle_preview.short_description = "字幕内容"
    
    def video_title(self, obj):
        """显示关联的视频标题"""
        if obj.subtitle and obj.subtitle.video:
            return obj.subtitle.video.title
        return "未关联视频"
    video_title.short_description = "视频标题"

# 聊天消息内联视图
class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    fields = ('role', 'content_preview', 'timestamp', 'video')
    readonly_fields = ('role', 'content_preview', 'timestamp', 'video')
    can_delete = False
    max_num = 20
    ordering = ('timestamp',)
    
    def content_preview(self, obj):
        if obj.content:
            return obj.content[:100] + "..." if len(obj.content) > 100 else obj.content
        return "无内容"
    content_preview.short_description = "消息内容"

# 会话关联视频内联视图
class SessionVideoInline(admin.TabularInline):
    model = Video
    extra = 0
    fields = ('title', 'url', 'platform', 'created_at')
    readonly_fields = ('title', 'url', 'platform', 'created_at')
    can_delete = False
    max_num = 20
    verbose_name = "关联视频"
    verbose_name_plural = "关联视频"
    fk_name = 'chat_session'

# 聊天会话管理
class ChatSessionAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('id', 'user', 'title', 'created_at', 'ended_at', 'is_active', 'get_videos_count', 'get_messages_count')
    list_filter = ('is_active', 'created_at', 'ended_at')
    search_fields = ('title', 'summary', 'user__username')
    readonly_fields = ('created_at', 'ended_at')
    actions = ['mark_as_inactive']
    inlines = [ChatMessageInline, SessionVideoInline]
    date_hierarchy = 'created_at'
    
    def get_videos_count(self, obj):
        return obj.session_videos.count()
    get_videos_count.short_description = "视频数量"
    
    def mark_as_inactive(self, request, queryset):
        now = timezone.now()
        updated = queryset.update(is_active=False, ended_at=now)
        self.message_user(request, f'成功将{updated}个会话标记为已结束')
    mark_as_inactive.short_description = "结束选中的会话"

# 聊天消息管理
class ChatMessageAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('id', 'session', 'role', 'content_preview', 'video', 'timestamp')
    list_filter = ('role', 'timestamp')
    search_fields = ('content', 'session__title', 'session__user__username')
    readonly_fields = ('timestamp',)
    
    def content_preview(self, obj):
        if obj.content:
            return obj.content[:100] + "..." if len(obj.content) > 100 else obj.content
        return "无内容"
    content_preview.short_description = "消息内容"

# 注册聊天会话模型
admin.site.register(ChatSession, ChatSessionAdmin)
admin.site.register(ChatMessage, ChatMessageAdmin)

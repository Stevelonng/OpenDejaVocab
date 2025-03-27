from django.contrib import admin
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.http import HttpResponseRedirect
from django.contrib import messages
from django.shortcuts import render
from .models import Video, Subtitle, Sentence
from .models import UserSession, UserActivity, UserMetrics
from .feedback_models import Feedback
from .word_models import WordDefinition, UserWord, WordReference
from .chat_models import ChatSession, ChatMessage

# Action to delete all records for all Admin classes
def delete_all_records(modeladmin, request, queryset):
    """Delete all records of this model (use with caution)"""
    model = modeladmin.model
    count = model.objects.count()
    model.objects.all().delete()
    messages.success(request, f'Successfully deleted all {count} {model._meta.verbose_name} records')
delete_all_records.short_description = " Delete all records (use with caution)"

# Custom button method for Admin classes
class AdminWithDeleteAllButton:
    """Admin base class with a delete all records button"""
    
    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom_urls = [
            path('delete_all/', self.admin_site.admin_view(self.delete_all_view), name=f'{self.model._meta.app_label}_{self.model._meta.model_name}_delete_all'),
        ]
        return custom_urls + urls
    
    def delete_all_view(self, request):
        """Handle the view for deleting all records"""
        if request.method == 'POST':
            model = self.model
            count = model.objects.count()
            model.objects.all().delete()
            self.message_user(request, f'Successfully deleted all {count} {model._meta.verbose_name} records', messages.SUCCESS)
            return HttpResponseRedirect("../")
        else:
            opts = self.model._meta
            context = {
                **self.admin_site.each_context(request),
                'title': f'Confirm deletion of all {opts.verbose_name}',
                'opts': opts,
                'app_label': opts.app_label,
                'count': self.model.objects.count(),
            }
            return render(request, 'admin/delete_all_confirmation.html', context)
    
    def changelist_view(self, request, extra_context=None):
        """Add delete all button to the list page"""
        extra_context = extra_context or {}
        extra_context['show_delete_all'] = True
        return super().changelist_view(request, extra_context=extra_context)

class SubtitleInline(admin.TabularInline):
    model = Subtitle
    extra = 0
    fields = ('text', 'start_time', 'end_time')
    
# SentenceReferenceInline no longer needed
    
@admin.register(Video)
class VideoAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('title', 'url', 'platform', 'created_at', 'user', 'has_subtitles_display', 'subtitles_count_display')
    list_filter = ('platform', 'created_at')
    search_fields = ('title', 'url')
    inlines = [SubtitleInline]
    
    def has_subtitles_display(self, obj):
        """在admin中显示视频是否有字幕"""
        return obj.has_subtitles()
    has_subtitles_display.short_description = '有字幕'
    has_subtitles_display.boolean = True  # 显示为勾选框
    
    def subtitles_count_display(self, obj):
        """在admin中显示视频字幕数量"""
        return obj.subtitles_count()
    subtitles_count_display.short_description = '字幕数量'
    
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
        """Display the first 50 characters of feedback content"""
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = 'Feedback Content'
    
    def mark_as_processed(self, request, queryset):
        """Mark selected feedback as processed"""
        queryset.update(is_processed=True, processed_at=timezone.now())
    mark_as_processed.short_description = 'Mark as processed'
    
    def adopt_feedback(self, request, queryset):
        """Mark selected feedback as adopted, pending Link Zero card set reward"""
        queryset.update(is_adopted=True, adopted_at=timezone.now())
        # Mark as processed if not already marked
        queryset.filter(is_processed=False).update(is_processed=True, processed_at=timezone.now())
    adopt_feedback.short_description = 'Adopt feedback (eligible for reward)'
    
    def mark_reward_given(self, request, queryset):
        """Mark selected feedback as rewarded"""
        queryset.update(reward_given=True)
    mark_reward_given.short_description = 'Mark as rewarded'
    
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
            return "Session active"
        return f"{obj.get_duration()} minutes"
    session_duration.short_description = "Session Duration"

@admin.register(UserActivity)
class UserActivityAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user', 'action_type', 'timestamp', 'get_session_info', 'url')
    list_filter = ('action_type', 'timestamp')
    search_fields = ('user__username', 'details', 'url')
    readonly_fields = ('user', 'session', 'action_type', 'timestamp', 'details', 'url')
    date_hierarchy = 'timestamp'
    
    def get_session_info(self, obj):
        if obj.session:
            return f"Session ID: {obj.session.id} - {obj.session.start_time.strftime('%Y-%m-%d %H:%M')}"
        return "-"
    get_session_info.short_description = "Session Info"

@admin.register(UserMetrics)
class UserMetricsAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user', 'total_login_count', 'total_session_time', 'videos_count', 
                   'favorite_words_count', 'sentences_count', 'last_active', 'is_active_user')
    list_filter = ('is_active_user', 'last_active', 'first_seen')
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('first_seen',)
    
    def get_queryset(self, request):
        # Add sorting by last active time in descending order
        return super().get_queryset(request).order_by('-last_active')
        
# Add UserMetricsInline to User admin interface
class UserMetricsInline(admin.StackedInline):
    model = UserMetrics
    can_delete = False
    verbose_name_plural = 'User Metrics'
    readonly_fields = ('total_login_count', 'total_session_time', 'videos_count', 
                      'favorite_words_count', 'sentences_count', 
                      'last_active', 'first_seen')

# Extend User Admin
class CustomUserAdmin(AdminWithDeleteAllButton, BaseUserAdmin):
    inlines = (UserMetricsInline,)
    list_display = BaseUserAdmin.list_display + ('get_last_active', 'get_videos_count', 'get_session_time')
    
    def get_last_active(self, obj):
        try:
            return obj.metrics.last_active
        except UserMetrics.DoesNotExist:
            return "-"
    get_last_active.short_description = "Last Active"
    
    def get_videos_count(self, obj):
        try:
            return obj.metrics.videos_count
        except UserMetrics.DoesNotExist:
            return 0
    get_videos_count.short_description = "Video Count"
    
    def get_session_time(self, obj):
        try:
            return f"{obj.metrics.total_session_time} minutes"
        except UserMetrics.DoesNotExist:
            return "0 minutes"
    get_session_time.short_description = "Session Time"

# Replace default User admin
# admin.site.unregister(User)
# admin.site.register(User, CustomUserAdmin)

# Word Models Registration
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
        # Return the associated word text
        return obj.word_definition.text if obj.word_definition else ""
    word_text.short_description = "Word"

@admin.register(WordReference)
class WordReferenceAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('user_word_text', 'subtitle_preview', 'video_title', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user_word__word_definition__text', 'subtitle__text')
    raw_id_fields = ('user_word', 'subtitle')
    
    def user_word_text(self, obj):
        # Return the associated word text
        return obj.user_word.word_definition.text if obj.user_word and obj.user_word.word_definition else ""
    user_word_text.short_description = "Word"
    
    def subtitle_preview(self, obj):
        # Display the first 50 characters of subtitle content
        if not obj.subtitle:
            return ""
        return obj.subtitle.text[:50] + "..." if len(obj.subtitle.text) > 50 else obj.subtitle.text
    subtitle_preview.short_description = "Subtitle Content"
    
    def video_title(self, obj):
        # Display the associated video title
        if not obj.subtitle or not obj.subtitle.video:
            return ""
        return obj.subtitle.video.title
    video_title.short_description = "Video Title"

# Chat message inline view
class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    fields = ('role', 'content_preview', 'timestamp', 'video')
    readonly_fields = ('role', 'content_preview', 'timestamp', 'video')
    can_delete = False
    max_num = 20
    ordering = ('timestamp',)
    
    def content_preview(self, obj):
        return obj.content[:50] + "..." if len(obj.content) > 50 else obj.content
    content_preview.short_description = "Message Content"

# Session video inline view
class SessionVideoInline(admin.TabularInline):
    model = Video
    extra = 0
    fields = ('title', 'url', 'platform', 'created_at')
    readonly_fields = ('title', 'url', 'platform', 'created_at')
    can_delete = False
    max_num = 20
    verbose_name = "Associated Video"
    verbose_name_plural = "Associated Videos"
    fk_name = 'chat_session'


# Chat session management
@admin.register(ChatSession)
class ChatSessionAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('id', 'user', 'title', 'created_at', 'ended_at', 'is_active', 'get_messages_count')
    list_filter = ('is_active', 'created_at', 'ended_at')
    search_fields = ('title', 'summary', 'user__username')
    readonly_fields = ('created_at', 'ended_at')
    actions = ['mark_as_inactive']
    inlines = [ChatMessageInline, SessionVideoInline]
    date_hierarchy = 'created_at'

    def get_videos_count(self, obj):
        return obj.videos.count()
    get_videos_count.short_description = "Video Count"

    def get_messages_count(self, obj):
        return obj.messages.count()
    get_messages_count.short_description = "Message Count"
    
    def mark_as_inactive(self, request, queryset):
        queryset.update(is_active=False, ended_at=timezone.now())
    mark_as_inactive.short_description = "End selected sessions"

# Chat message management
@admin.register(ChatMessage)
class ChatMessageAdmin(AdminWithDeleteAllButton, admin.ModelAdmin):
    list_display = ('id', 'session', 'role', 'content_preview', 'video', 'timestamp')
    list_filter = ('role', 'timestamp')
    search_fields = ('content', 'session__title', 'session__user__username')
    readonly_fields = ('timestamp',)
    
    def content_preview(self, obj):
        return obj.content[:50] + "..." if len(obj.content) > 50 else obj.content
    content_preview.short_description = "Message Content"

# 创建自定义AdminSite
class DejaVocabAdminSite(admin.AdminSite):
    site_header = 'Déjà Vocab Admin'
    site_title = 'Déjà Vocab Admin Portal'
    index_title = 'Déjà Vocab Administration'
    
    def get_app_list(self, request):
        """
        Return a sorted list of all the installed apps that have been
        registered in this site.
        """
        app_dict = self._build_app_dict(request)
        
        # 排序的应用名称列表，确定分组的显示顺序
        app_list = sorted(app_dict.values(), key=lambda x: x['name'].lower())
        
        # 创建自定义的分组
        custom_groups = {
            'Chat Management': {
                'name': 'Chat Management',
                'app_label': 'chat_group',
                'models': [],
                'has_module_perms': True,
            },
            'User Management': {
                'name': 'User Management',
                'app_label': 'user_group',
                'models': [],
                'has_module_perms': True,
            },
            'Content Management': {
                'name': 'Content Management',
                'app_label': 'content_group',
                'models': [],
                'has_module_perms': True,
            },
            'Word Management': {
                'name': 'Word Management',
                'app_label': 'word_group',
                'models': [],
                'has_module_perms': True,
            }
        }
        
        # 遍历所有应用程序和模型
        for app in app_list:
            for model in app['models']:
                model_name = model['object_name']
                
                # 根据模型名称将模型分配到相应分组
                if model_name in ['ChatMessage', 'ChatSession']:
                    custom_groups['Chat Management']['models'].append(model)
                elif model_name in ['UserActivity', 'Feedback', 'UserMetrics', 'UserSession']:
                    custom_groups['User Management']['models'].append(model)
                elif model_name in ['UserWord', 'WordReference', 'Sentence', 'Subtitle', 'Video']:
                    custom_groups['Content Management']['models'].append(model)
                elif model_name in ['WordDefinition']:
                    custom_groups['Word Management']['models'].append(model)
                else:
                    # 其他模型保留在原应用中
                    continue
        
        # 排序每个分组中的模型
        for group in custom_groups.values():
            group['models'].sort(key=lambda x: x['name'])
        
        # 创建最终应用列表，包含分组
        final_app_list = []
        
        # 添加自定义分组
        for group_name in ['Chat Management', 'User Management', 'Content Management', 'Word Management']:
            group = custom_groups[group_name]
            if group['models']:  # 只添加非空分组
                final_app_list.append(group)
        
        # 添加未分组的应用
        for app in app_list:
            has_models = False
            for model in app['models']:
                model_name = model['object_name']
                if model_name not in ['ChatMessage', 'ChatSession', 'UserActivity', 'Feedback', 
                                      'UserMetrics', 'UserSession', 'UserWord', 'WordReference', 
                                      'Sentence', 'Subtitle', 'Video', 'WordDefinition']:
                    has_models = True
                    break
            
            if has_models:
                cleaned_models = []
                for model in app['models']:
                    model_name = model['object_name']
                    if model_name not in ['ChatMessage', 'ChatSession', 'UserActivity', 'Feedback', 
                                         'UserMetrics', 'UserSession', 'UserWord', 'WordReference', 
                                         'Sentence', 'Subtitle', 'Video', 'WordDefinition']:
                        cleaned_models.append(model)
                
                app_copy = app.copy()
                app_copy['models'] = cleaned_models
                final_app_list.append(app_copy)
        
        return final_app_list

# 创建自定义AdminSite实例
deja_vocab_admin = DejaVocabAdminSite(name='deja_vocab_admin')

# 注册所有模型到自定义AdminSite
deja_vocab_admin.register(Video, VideoAdmin)
deja_vocab_admin.register(Subtitle, SubtitleAdmin)
deja_vocab_admin.register(Sentence, SentenceAdmin)
deja_vocab_admin.register(Feedback, FeedbackAdmin)
deja_vocab_admin.register(UserSession, UserSessionAdmin)
deja_vocab_admin.register(UserActivity, UserActivityAdmin)
deja_vocab_admin.register(UserMetrics, UserMetricsAdmin)
deja_vocab_admin.register(WordDefinition, WordDefinitionAdmin)
deja_vocab_admin.register(UserWord, UserWordAdmin)
deja_vocab_admin.register(WordReference, WordReferenceAdmin)
deja_vocab_admin.register(ChatSession, ChatSessionAdmin)
deja_vocab_admin.register(ChatMessage, ChatMessageAdmin)
deja_vocab_admin.register(User, CustomUserAdmin)

# 用自定义AdminSite替换默认的admin.site
admin.site = deja_vocab_admin

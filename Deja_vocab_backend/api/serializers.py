from rest_framework import serializers
from .models import Video, Subtitle, Sentence
from .word_models import WordReference

class SubtitleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subtitle
        fields = ['id', 'text', 'start_time', 'end_time']

class VideoSerializer(serializers.ModelSerializer):
    subtitles = SubtitleSerializer(many=True, read_only=True)
    
    class Meta:
        model = Video
        fields = ['id', 'url', 'title', 'platform', 'created_at', 'subtitles']
        read_only_fields = ['created_at']

# SentenceSerializer has replaced SentenceReferenceSerializer, because Sentence is now directly associated with video and timestamp

class SentenceSerializer(serializers.ModelSerializer):
    video_title = serializers.SerializerMethodField()
    video_url = serializers.SerializerMethodField()
    timestamp_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Sentence
        fields = ['id', 'text', 'translation', 'video', 'video_title', 'video_url', 'start_time', 'end_time', 'timestamp_url', 'created_at']
        read_only_fields = ['created_at', 'video_title', 'video_url', 'timestamp_url']
    
    def get_video_title(self, obj):
        return obj.get_video_title() if obj.video else ''
        
    def get_video_url(self, obj):
        return obj.get_video_link() if obj.video else ''
        
    def get_timestamp_url(self, obj):
        return obj.get_timestamp_url()

# Add WordReference serializer
class WordReferenceSerializer(serializers.ModelSerializer):
    word_text = serializers.SerializerMethodField()
    video_title = serializers.SerializerMethodField()
    video_url = serializers.SerializerMethodField()
    context = serializers.SerializerMethodField()
    highlighted_context = serializers.SerializerMethodField()
    timestamp_url = serializers.SerializerMethodField()
    
    class Meta:
        model = WordReference
        fields = ['id', 'user_word', 'subtitle', 'context_start', 'context_end', 
                 'created_at', 'word_text', 'video_title', 'video_url', 
                 'context', 'highlighted_context', 'timestamp_url']
        read_only_fields = ['created_at', 'word_text', 'video_title', 'video_url', 
                           'context', 'highlighted_context', 'timestamp_url']
    
    def get_word_text(self, obj):
        return obj.user_word.word_definition.text if obj.user_word and obj.user_word.word_definition else ''
    
    def get_video_title(self, obj):
        return obj.subtitle.video.title if obj.subtitle and obj.subtitle.video else ''
    
    def get_video_url(self, obj):
        if obj.subtitle and obj.subtitle.video:
            video = obj.subtitle.video
            if video.platform == 'youtube' and video.url:
                return video.url
        return ''
    
    def get_context(self, obj):
        return obj.get_context()
    
    def get_highlighted_context(self, obj):
        return obj.get_highlighted_context()
    
    def get_timestamp_url(self, obj):
        if obj.subtitle and obj.subtitle.video:
            video = obj.subtitle.video
            if video.platform == 'youtube' and video.url:
                time_seconds = int(obj.subtitle.start_time)
                return f"{video.url}&t={time_seconds}s"
        return ''

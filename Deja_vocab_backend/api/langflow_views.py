from rest_framework import viewsets, permissions
from django.contrib.auth.models import User
from .models import Video, Subtitle, Sentence, UserMetrics
from .word_models import WordDefinition, UserWord, WordReference
from .serializers import (
    VideoSerializer, SubtitleSerializer, SentenceSerializer,
    WordReferenceSerializer
)

# 添加缺少的序列化器
from rest_framework import serializers

class WordDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WordDefinition
        fields = ['id', 'text', 'language', 'translation', 'web_translation',
                 'uk_phonetic', 'us_phonetic', 'phonetic', 'has_audio', 
                 'created_at', 'last_updated']

class UserWordSerializer(serializers.ModelSerializer):
    word_definition = WordDefinitionSerializer(read_only=True)
    
    class Meta:
        model = UserWord
        fields = ['id', 'user', 'word_definition', 'notes', 'is_favorite',
                 'created_at', 'last_seen_at']

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'date_joined', 'last_login']


# 创建视图集
class VideoViewSet(viewsets.ReadOnlyModelViewSet):
    """提供视频数据的API端点"""
    queryset = Video.objects.all()
    serializer_class = VideoSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """只返回当前用户的视频"""
        user = self.request.user
        return Video.objects.filter(user=user)


class SubtitleViewSet(viewsets.ReadOnlyModelViewSet):
    """提供字幕数据的API端点"""
    queryset = Subtitle.objects.all()
    serializer_class = SubtitleSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """根据视频ID过滤字幕"""
        user = self.request.user
        video_id = self.request.query_params.get('video_id')
        if video_id:
            return Subtitle.objects.filter(video_id=video_id, video__user=user)
        return Subtitle.objects.filter(video__user=user)


class SentenceViewSet(viewsets.ReadOnlyModelViewSet):
    """提供句子数据的API端点"""
    queryset = Sentence.objects.all()
    serializer_class = SentenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """只返回当前用户的句子，可以通过视频ID过滤"""
        user = self.request.user
        video_id = self.request.query_params.get('video_id')
        if video_id:
            return Sentence.objects.filter(user=user, video_id=video_id)
        return Sentence.objects.filter(user=user)


class WordDefinitionViewSet(viewsets.ReadOnlyModelViewSet):
    """提供词汇定义的API端点"""
    queryset = WordDefinition.objects.all()
    serializer_class = WordDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """可以通过文本搜索词汇"""
        text = self.request.query_params.get('text')
        if text:
            return WordDefinition.objects.filter(text__icontains=text)
        return WordDefinition.objects.all()


class UserWordViewSet(viewsets.ReadOnlyModelViewSet):
    """提供用户词汇的API端点"""
    queryset = UserWord.objects.all()
    serializer_class = UserWordSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """只返回当前用户的词汇"""
        user = self.request.user
        is_favorite = self.request.query_params.get('is_favorite')
        if is_favorite:
            return UserWord.objects.filter(user=user, is_favorite=True).select_related('word_definition')
        return UserWord.objects.filter(user=user).select_related('word_definition')


class WordReferenceViewSet(viewsets.ReadOnlyModelViewSet):
    """提供词汇引用（词汇在视频中的出现）的API端点"""
    queryset = WordReference.objects.all()
    serializer_class = WordReferenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """只返回当前用户的词汇引用，可以通过词汇ID过滤"""
        user = self.request.user
        user_word_id = self.request.query_params.get('user_word_id')
        if user_word_id:
            return WordReference.objects.filter(
                user_word_id=user_word_id, 
                user_word__user=user
            ).select_related('user_word', 'subtitle', 'user_word__word_definition')
        return WordReference.objects.filter(
            user_word__user=user
        ).select_related('user_word', 'subtitle', 'user_word__word_definition')

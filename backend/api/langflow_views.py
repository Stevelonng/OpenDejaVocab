from rest_framework import viewsets, permissions
from django.contrib.auth.models import User
from .models import Video, Subtitle, Sentence
from .word_models import WordDefinition, UserWord, WordReference
from .serializers import (
    VideoSerializer, SubtitleSerializer, SentenceSerializer,
    WordReferenceSerializer
)

# Add missing serializers
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


# Create viewsets
class VideoViewSet(viewsets.ReadOnlyModelViewSet):
    """Provide video data API endpoint"""
    queryset = Video.objects.all()
    serializer_class = VideoSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return only the current user's videos"""
        user = self.request.user
        return Video.objects.filter(user=user)


class SubtitleViewSet(viewsets.ReadOnlyModelViewSet):
    """Provide subtitle data API endpoint"""
    queryset = Subtitle.objects.all()
    serializer_class = SubtitleSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filter subtitles by video ID"""
        user = self.request.user
        video_id = self.request.query_params.get('video_id')
        if video_id:
            return Subtitle.objects.filter(video_id=video_id, video__user=user)
        return Subtitle.objects.filter(video__user=user)


class SentenceViewSet(viewsets.ReadOnlyModelViewSet):
    """Provide sentence data API endpoint"""
    queryset = Sentence.objects.all()
    serializer_class = SentenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return only the current user's sentences, can be filtered by video ID"""
        user = self.request.user
        video_id = self.request.query_params.get('video_id')
        if video_id:
            return Sentence.objects.filter(user=user, video_id=video_id)
        return Sentence.objects.filter(user=user)


class WordDefinitionViewSet(viewsets.ReadOnlyModelViewSet):
    """Provide word definition API endpoint"""
    queryset = WordDefinition.objects.all()
    serializer_class = WordDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Search word definitions by text"""
        text = self.request.query_params.get('text')
        if text:
            return WordDefinition.objects.filter(text__icontains=text)
        return WordDefinition.objects.all()


class UserWordViewSet(viewsets.ReadOnlyModelViewSet):
    """Provide user word API endpoint"""
    queryset = UserWord.objects.all()
    serializer_class = UserWordSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return only the current user's words"""
        user = self.request.user
        is_favorite = self.request.query_params.get('is_favorite')
        if is_favorite:
            return UserWord.objects.filter(user=user, is_favorite=True).select_related('word_definition')
        return UserWord.objects.filter(user=user).select_related('word_definition')


class WordReferenceViewSet(viewsets.ReadOnlyModelViewSet):
    """Provide word reference (word appearance in video) API endpoint"""
    queryset = WordReference.objects.all()
    serializer_class = WordReferenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return only the current user's word references, can be filtered by word ID"""
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

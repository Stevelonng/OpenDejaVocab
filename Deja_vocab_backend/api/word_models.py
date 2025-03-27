from django.db import models
from django.contrib.auth.models import User

class WordDefinition(models.Model):
    """Model to store shared word definitions across all users"""
    text = models.CharField(max_length=100)  # The word itself
    language = models.CharField(max_length=20, default='en')  # Language code
    translation = models.TextField(blank=True)  # Standard translation
    web_translation = models.TextField(blank=True)  # 网络释义，常见词组和例句
    uk_phonetic = models.CharField(max_length=100, blank=True)  # UK phonetic symbol
    us_phonetic = models.CharField(max_length=100, blank=True)  # US phonetic symbol
    phonetic = models.CharField(max_length=100, blank=True)  # General phonetic symbol (if UK/US not available)
    has_audio = models.BooleanField(default=False)  # Indicates if audio is available
    created_at = models.DateTimeField(auto_now_add=True)
    last_updated = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('text', 'language')  # Same word different languages
    
    def __str__(self):
        return self.text


class UserWord(models.Model):
    """Model to store user-specific word information and relation to shared definition"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user_words')
    word_definition = models.ForeignKey(WordDefinition, on_delete=models.CASCADE, related_name='user_words')
    notes = models.TextField(blank=True)  # User-specific notes
    is_favorite = models.BooleanField(default=False)  # 替代原来的FavoriteWord模型
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)  # Last time this word was seen by this user
    
    class Meta:
        unique_together = ('user', 'word_definition')  # One user-word relation per word definition
    
    def __str__(self):
        return f"{self.user.username} - {self.word_definition.text}"
    
    @property
    def text(self):
        """Compatibility property to maintain API compatibility with Word model"""
        return self.word_definition.text
    
    @property
    def translation(self):
        """Compatibility property to maintain API compatibility with Word model"""
        return self.word_definition.translation
    
    @property
    def uk_phonetic(self):
        """Compatibility property to maintain API compatibility with Word model"""
        return self.word_definition.uk_phonetic
    
    @property
    def us_phonetic(self):
        """Compatibility property to maintain API compatibility with Word model"""
        return self.word_definition.us_phonetic
    
    @property
    def phonetic(self):
        """Compatibility property to maintain API compatibility with Word model"""
        return self.word_definition.phonetic
    
    @property
    def has_audio(self):
        """Compatibility property to maintain API compatibility with Word model"""
        return self.word_definition.has_audio


# 添加新的WordReference模型，连接UserWord和Subtitle
class WordReference(models.Model):
    """关联用户单词和字幕，记录单词在视频中的出现情况"""
    user_word = models.ForeignKey(UserWord, on_delete=models.CASCADE, related_name='references')
    subtitle = models.ForeignKey('api.Subtitle', on_delete=models.CASCADE, related_name='word_references') 
    context_start = models.IntegerField(default=0)  # 单词在字幕中的起始位置
    context_end = models.IntegerField(default=0)    # 单词在字幕中的结束位置
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('user_word', 'subtitle')  # 一个单词在一个字幕中只记录一次
    
    def __str__(self):
        return f"{self.user_word.word_definition.text} in {self.subtitle.video.title}"
    
    def get_context(self):
        """获取单词出现的上下文"""
        return self.subtitle.text
    
    def get_highlighted_context(self):
        """获取带有HTML高亮标记的上下文"""
        text = self.subtitle.text
        before = text[:self.context_start]
        word = text[self.context_start:self.context_end]
        after = text[self.context_end:]
        return f"{before}<span class='highlighted-word'>{word}</span>{after}"

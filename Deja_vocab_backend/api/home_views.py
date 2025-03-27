from django.shortcuts import render
from django.db.models import Count
from .word_models import WordDefinition, UserWord
from .models import Sentence

def home_view(request):
    """
    主页视图，显示应用介绍和基本功能。
    对已登录用户，显示其学习概览数据。
    """
    context = {}
    
    # 如果用户已登录，添加个人统计数据
    if request.user.is_authenticated:
        # 查询用户的词典大小
        word_count = UserWord.objects.filter(user=request.user).count()
        # 查询用户的句子数量
        sentence_count = Sentence.objects.filter(user=request.user).count()
        # 查询用户的收藏单词数量
        favorite_count = UserWord.objects.filter(user=request.user, is_favorite=True).count()
        
        context.update({
            'word_count': word_count,
            'sentence_count': sentence_count,
            'favorite_count': favorite_count
        })
        
    return render(request, 'api/home.html', context)

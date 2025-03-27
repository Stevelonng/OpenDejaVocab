from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.views.generic import TemplateView, View
from django.db.models import Count, Min, Q, F
from django.utils import timezone
from django.http import JsonResponse
from datetime import timedelta
import json

from .word_models import WordDefinition, UserWord, WordReference
from .word_adapter import generate_secure_word_id


@method_decorator(login_required, name='dispatch')
class WordStatisticsView(TemplateView):
    """单词学习统计视图"""
    template_name = 'api/word_statistics.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # 获取用户
        user = self.request.user
        
        # 获取选定的时间范围（天数）
        days = self.request.GET.get('days', '1')
        try:
            days = int(days)
        except ValueError:
            days = 1
            
        context['days'] = days
        
        # 设置时间范围
        now = timezone.now()
        start_date = None
        if days > 0:
            start_date = now - timedelta(days=days)
            
        # 1. 获取用户的总单词数
        context['total_unique_words'] = UserWord.objects.filter(user=user).count()
        
        # 2. 统计时间范围内唯一单词的数量
        user_words_query = UserWord.objects.filter(user=user)
        if start_date:
            unique_words_count = user_words_query.filter(created_at__gte=start_date).count()
        else:
            unique_words_count = user_words_query.count()
        
        context['unique_words_count'] = unique_words_count
        
        # 3. 统计新词数量（在时间范围内添加的单词）
        if start_date:
            new_words_count = user_words_query.filter(created_at__gte=start_date).count()
        else:
            new_words_count = 0  # 如果是全部时间范围，就没有"新词"
            
        context['new_words_count'] = new_words_count
        
        # 不再一次性加载所有单词，改为通过API动态获取
        context['unique_words'] = []
        context['new_words'] = []
        context['all_word_occurrences'] = []
        context['total_word_occurrences'] = 0
        
        # 转发Chrome扩展ID以便前端可能需要与扩展通信
        context['extension_id'] = 'fbkhlnenfchhkkmcodebhiiklcpdjehj'
        
        return context


@method_decorator(login_required, name='dispatch')
class WordListAPIView(View):
    """提供分页的单词列表数据API"""
    
    def get(self, request):
        # 获取参数
        list_type = request.GET.get('type', 'unique')  # unique或new
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 10))
        days = request.GET.get('days', '1')
        
        try:
            days = int(days)
        except ValueError:
            days = 1
        
        # 设置时间范围
        now = timezone.now()
        start_date = None
        if days > 0:
            start_date = now - timedelta(days=days)
        
        # 查询用户单词
        user_words_query = UserWord.objects.filter(user=request.user).select_related('word_definition')
        
        # 根据类型过滤
        if list_type == 'new' and start_date:
            # 新词只显示在时间范围内添加的单词
            filtered_words = user_words_query.filter(created_at__gte=start_date)
        elif list_type == 'unique' and start_date:
            # 唯一单词显示曾在时间范围内遇到过的单词
            filtered_words = user_words_query.filter(created_at__gte=start_date)
        else:
            # 全部时间范围
            filtered_words = user_words_query
        
        # 计算总数和总页数
        total_count = filtered_words.count()
        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
        
        # 分页
        start = (page - 1) * page_size
        end = start + page_size
        paginated_words = filtered_words[start:end]
        
        # 构建结果数据
        word_list = []
        for user_word in paginated_words:
            word_def = user_word.word_definition
            
            # 计算单词在引用中的出现次数
            reference_count = WordReference.objects.filter(user_word=user_word).count()
            
            # 生成安全的单词ID格式
            secure_word_id = generate_secure_word_id(word_def.text, request.user.id)
            
            word_data = {
                'id': secure_word_id,
                'text': word_def.text,
                'language': word_def.language,
                'translation': word_def.translation,
                'phonetic': word_def.phonetic,
                'uk_phonetic': word_def.uk_phonetic, 
                'us_phonetic': word_def.us_phonetic,
                'web_translation': word_def.web_translation,
                'notes': user_word.notes,
                'frequency': reference_count,
                'created_at': user_word.created_at.strftime('%Y-%m-%d %H:%M'),
                'occurrence_count': reference_count,
                'is_new': user_word.created_at >= start_date if start_date else False,
                'is_favorite': user_word.is_favorite
            }
            word_list.append(word_data)
        
        # 返回JSON响应
        return JsonResponse({
            'words': word_list,
            'total_count': total_count,
            'total_pages': total_pages,
            'current_page': page,
            'page_size': page_size
        })

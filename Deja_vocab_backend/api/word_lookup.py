import json
import pickle
import sqlite3
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.contrib.auth.decorators import login_required
from youdao.spider import YoudaoSpider
from youdao.config import DB_DIR
from .word_models import WordDefinition, UserWord, WordReference

@require_GET
def lookup_word(request):
    """
    查询单词定义的API端点
    先尝试从Django数据库查询，如果不存在则从youdao.db查询，如果仍不存在则使用爬虫获取
    """
    word_text = request.GET.get('word', '').strip().lower()
    
    if not word_text:
        return JsonResponse({'error': '请提供单词'}, status=400)
    
    # 处理可能是整个句子的情况，提取第一个单词
    import re
    words = re.findall(r'\b[a-zA-Z]+\b', word_text)
    if words:
        word_text = words[0].lower()
    
    # 简单过滤非单词内容
    if len(word_text) > 50 or not any(c.isalpha() for c in word_text):
        return JsonResponse({'error': '无效的单词'}, status=400)
    
    result = {}
    
    # 1. 首先查询Django数据库 (使用新模型)
    try:
        user = request.user if request.user.is_authenticated else None
        word_def = WordDefinition.objects.filter(text__iexact=word_text).first()
        
        if word_def:
            # 找到了单词定义
            result = {
                'source': 'django_db',
                'word': word_def.text,
                'translation': word_def.translation or '',
                'phonetic': word_def.phonetic or '',
                'uk_phonetic': word_def.uk_phonetic or '',
                'us_phonetic': word_def.us_phonetic or '',
                'web_translation': word_def.web_translation or '',
                'has_audio': word_def.has_audio
            }
            
            # 如果用户已登录，尝试获取用户个人的笔记和频率
            if user:
                user_word = UserWord.objects.filter(user=user, word_definition=word_def).first()
                if user_word:
                    result['notes'] = user_word.notes or ''
                    # 计算单词在引用中的出现次数
                    result['frequency'] = WordReference.objects.filter(user_word=user_word).count()
                    result['is_favorite'] = user_word.is_favorite
            
            return JsonResponse(result)
    except Exception as e:
        print(f"从Django数据库查询单词失败: {str(e)}")
    
    # 2. 然后查询youdao.db
    try:
        if DB_DIR:
            conn = sqlite3.connect(DB_DIR)
            cursor = conn.cursor()
            cursor.execute('SELECT data FROM words WHERE word = ?', (word_text,))
            row = cursor.fetchone()
            conn.close()
            
            if row:
                youdao_data = pickle.loads(row[0])
                result = {
                    'source': 'youdao_db',
                    'word': word_text,
                    'translation': '',
                    'phonetic': '',
                    'uk_phonetic': '',
                    'us_phonetic': '',
                    'web_translation': ''
                }
                
                # 提取有道词典数据
                if 'basic' in youdao_data:
                    basic = youdao_data['basic']
                    
                    # 音标
                    if 'phonetic' in basic:
                        result['phonetic'] = basic['phonetic']
                    if 'uk-phonetic' in basic:
                        result['uk_phonetic'] = basic['uk-phonetic']
                    if 'us-phonetic' in basic:
                        result['us_phonetic'] = basic['us-phonetic']
                    
                    # 释义
                    if 'explains' in basic and basic['explains']:
                        result['translation'] = '; '.join(basic['explains'])
                
                # 网络释义
                if 'web' in youdao_data and youdao_data['web']:
                    web_trans = []
                    for item in youdao_data['web']:
                        if 'key' in item and 'value' in item:
                            web_trans.append(f"{item['key']}: {', '.join(item['value'])}")
                    result['web_translation'] = '; '.join(web_trans)
                
                return JsonResponse(result)
    except Exception as e:
        print(f"从youdao.db查询单词失败: {str(e)}")
    
    # 3. 最后使用爬虫获取
    try:
        spider = YoudaoSpider(word_text)
        youdao_result = spider.get_result(use_cache=True)
        
        if youdao_result and youdao_result['errorCode'] == 0:
            result = {
                'source': 'youdao_spider',
                'word': word_text,
                'translation': '',
                'phonetic': '',
                'uk_phonetic': '',
                'us_phonetic': '',
                'web_translation': ''
            }
            
            # 提取有道词典数据
            if 'basic' in youdao_result:
                basic = youdao_result['basic']
                
                # 音标
                if 'phonetic' in basic:
                    result['phonetic'] = basic['phonetic']
                if 'uk-phonetic' in basic:
                    result['uk_phonetic'] = basic['uk-phonetic']
                if 'us-phonetic' in basic:
                    result['us_phonetic'] = basic['us-phonetic']
                
                # 释义
                if 'explains' in basic and basic['explains']:
                    result['translation'] = '; '.join(basic['explains'])
            
            # 网络释义
            if 'web' in youdao_result and youdao_result['web']:
                web_trans = []
                for item in youdao_result['web']:
                    if 'key' in item and 'value' in item:
                        web_trans.append(f"{item['key']}: {', '.join(item['value'])}")
                result['web_translation'] = '; '.join(web_trans)
            
            return JsonResponse(result)
    except Exception as e:
        print(f"使用爬虫查询单词失败: {str(e)}")
    
    # 如果所有方法都失败，返回错误
    return JsonResponse({
        'error': '无法找到单词定义',
        'word': word_text
    }, status=404)

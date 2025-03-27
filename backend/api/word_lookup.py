import pickle
import sqlite3
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from youdao.spider import YoudaoSpider
from youdao.config import DB_DIR
from .word_models import WordDefinition, UserWord, WordReference

@require_GET
def lookup_word(request):
    """
    Query word definition API endpoint
    First try to query from Django database, if not exist then query from youdao.db, if still not exist then use spider to get
    """
    word_text = request.GET.get('word', '').strip().lower()
    
    if not word_text:
        return JsonResponse({'error': 'Please provide a word'}, status=400)
    
    # Handle possible sentence situation, extract the first word
    import re
    words = re.findall(r'\b[a-zA-Z]+\b', word_text)
    if words:
        word_text = words[0].lower()
    
    # Simple filter non-word content
    if len(word_text) > 50 or not any(c.isalpha() for c in word_text):
        return JsonResponse({'error': 'Invalid word'}, status=400)
    
    result = {}
    
    # 1. First query Django database (using new model)
    try:
        user = request.user if request.user.is_authenticated else None
        word_def = WordDefinition.objects.filter(text__iexact=word_text).first()
        
        if word_def:
            # Found word definition
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
            
            # If user is logged in, try to get user's notes and frequency
            if user:
                user_word = UserWord.objects.filter(user=user, word_definition=word_def).first()
                if user_word:
                    result['notes'] = user_word.notes or ''
                    # Calculate word frequency in references
                    result['frequency'] = WordReference.objects.filter(user_word=user_word).count()
                    result['is_favorite'] = user_word.is_favorite
            
            return JsonResponse(result)
    except Exception as e:
        print(f"Failed to query word from Django database: {str(e)}")
    
    # 2. Then query youdao.db
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
                
                # Extract Youdao data
                if 'basic' in youdao_data:
                    basic = youdao_data['basic']
                    
                    # Phonetic
                    if 'phonetic' in basic:
                        result['phonetic'] = basic['phonetic']
                    if 'uk-phonetic' in basic:
                        result['uk_phonetic'] = basic['uk-phonetic']
                    if 'us-phonetic' in basic:
                        result['us_phonetic'] = basic['us-phonetic']
                    
                    # Translation
                    if 'explains' in basic and basic['explains']:
                        result['translation'] = '; '.join(basic['explains'])
                
                # Web translation
                if 'web' in youdao_data and youdao_data['web']:
                    web_trans = []
                    for item in youdao_data['web']:
                        if 'key' in item and 'value' in item:
                            web_trans.append(f"{item['key']}: {', '.join(item['value'])}")
                    result['web_translation'] = '; '.join(web_trans)
                
                return JsonResponse(result)
    except Exception as e:
        print(f"Failed to query word from youdao.db: {str(e)}")
    
    # 3. Finally use spider to get
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
            
            # Extract Youdao data
            if 'basic' in youdao_result:
                basic = youdao_result['basic']
                
                # Phonetic
                if 'phonetic' in basic:
                    result['phonetic'] = basic['phonetic']
                if 'uk-phonetic' in basic:
                    result['uk_phonetic'] = basic['uk-phonetic']
                if 'us-phonetic' in basic:
                    result['us_phonetic'] = basic['us-phonetic']
                
                # Translation
                if 'explains' in basic and basic['explains']:
                    result['translation'] = '; '.join(basic['explains'])
            
            # Web translation
            if 'web' in youdao_result and youdao_result['web']:
                web_trans = []
                for item in youdao_result['web']:
                    if 'key' in item and 'value' in item:
                        web_trans.append(f"{item['key']}: {', '.join(item['value'])}")
                result['web_translation'] = '; '.join(web_trans)
            
            return JsonResponse(result)
    except Exception as e:
        print(f"Failed to use spider to query word: {str(e)}")
    
    # If all methods fail, return error
    return JsonResponse({
        'error': 'Failed to find word definition',
        'word': word_text
    }, status=404)

import re
import string
from collections import Counter
import spacy
from .models import Video, Subtitle
from .word_models import WordDefinition, UserWord
from .word_adapter import save_word, toggle_favorite, batch_save_words
from youdao.spider import YoudaoSpider

# 加载英语模型
def load_english_model():
    """加载英语spaCy模型，并配置不拆分缩写词"""
    try:
        # 加载模型
        nlp = spacy.load('en_core_web_sm')
        
        # 定义常见的缩写词列表
        contractions = [
            "'s", "'ve", "'re", "'d", "'ll", "'m", "n't", "'t",
            "ain't", "aren't", "can't", "couldn't", "didn't", "doesn't", "don't", "hadn't",
            "hasn't", "haven't", "he's", "here's", "i'm", "isn't", "it's", "let's",
            "mustn't", "shan't", "she's", "shouldn't", "that's", "there's", "they're",
            "wasn't", "we're", "we've", "weren't", "what's", "where's", "who's", "won't",
            "wouldn't", "y'all", "you're", "you've", "you'll", "you'd"
        ]
        
        # 自定义标记规则，将缩写词作为不拆分的完整单词处理
        infix_re = spacy.util.compile_infix_regex(
            list(nlp.Defaults.infixes) + [r'''[\-_~]'''] + 
            [r'''(?<=[a-zA-Z])\'(?=[a-zA-Z])''']  # 匹配引号作为单词内部字符
        )
        nlp.tokenizer.infix_finditer = infix_re.finditer

        return nlp
    except OSError:
        print("Warning: English model not found. Please install it with 'python -m spacy download en_core_web_sm'")
        raise


class WordExtractor:
    """从字幕中提取英语单词并存储到数据库"""
    
    def __init__(self, user):
        self.user = user
        self.language = 'en'  # 固定为英语
        # 加载英语模型
        self.nlp = load_english_model()
    
    def clean_text(self, text):
        """清理文本，移除标点符号和特殊字符"""
        # 移除HTML标签
        text = re.sub(r'<.*?>', '', text)
        # 移除URL
        text = re.sub(r'http\S+', '', text)
        # 移除特殊字符但保留字母、数字和空格
        text = re.sub(r'[^\w\s]', ' ', text)
        # 移除多余空格
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    
    def get_word_data(self, word_text, download_audio=False):
        """
        使用有道词典获取单词的翻译、音标和检查发音是否可用
        :param word_text: 单词文本
        :param download_audio: 是否下载音频文件，默认为否
        """
        try:
            spider = YoudaoSpider(word_text)
            result = spider.get_result(use_api=False)
            
            # 检查是否有有效的翻译结果
            if result['errorCode'] == 0 and 'basic' in result and 'explains' in result['basic'] and result['basic']['explains']:
                # 构建返回数据
                word_data = {
                    'translation': '\n'.join(result['basic']['explains']),
                    'uk_phonetic': '',
                    'us_phonetic': '',
                    'phonetic': '',
                    'has_audio': False,
                    'web_translation': ''  # 添加网络释义字段
                }
                
                # 处理音标信息
                if 'basic' in result:
                    if 'uk-phonetic' in result['basic']:
                        word_data['uk_phonetic'] = result['basic']['uk-phonetic']
                    if 'us-phonetic' in result['basic']:
                        word_data['us_phonetic'] = result['basic']['us-phonetic']
                    if 'phonetic' in result['basic']:
                        word_data['phonetic'] = result['basic']['phonetic']
                
                # 处理网络释义 - 完全重写以改进格式
                if 'web' in result and result['web']:
                    web_trans_formatted = []
                    
                    for item in result['web']:
                        key = item.get('key', '')
                        values = item.get('value', [])
                        if key and values:
                            # 每个词组单独一行，并使用符号进行分隔
                            web_trans_formatted.append(f"● {key}: {' | '.join(values)}")
                    
                    if web_trans_formatted:
                        word_data['web_translation'] = '\n'.join(web_trans_formatted)
                
                # 只检查是否有音频文件，不下载
                try:
                    if download_audio:
                        # 如果需要下载音频
                        voice_file = spider.get_voice(word_text, download=True)
                        if voice_file:
                            word_data['has_audio'] = True
                    else:
                        # 只检查是否有音频文件，不下载
                        voice_file = spider.get_voice(word_text, download=False)
                        if voice_file:
                            word_data['has_audio'] = True
                except Exception as audio_err:
                    print(f"检查单词 '{word_text}' 的发音出错: {str(audio_err)}")
                    # 发音检查失败不影响单词添加
                    pass
                    
                return word_data
            return None
        except Exception as e:
            print(f"获取单词 '{word_text}' 的数据出错: {str(e)}")
            return None
    
    def is_valid_word(self, text):
        """检查是否是有效的单词或缩写词"""
        # 检查是否是缩写词（如it's, can't）
        contraction_pattern = r"[A-Za-z]+'[a-zA-Z]+"
        if re.match(contraction_pattern, text) and "'" in text:
            return True
            
        # 排除只有特殊字符的情况
        if not any(c.isalpha() for c in text):
            return False
            
        # 排除异常长的单词（可能是多个单词错误合并）
        if len(text) > 30:
            return False
            
        return True
    
    def extract_words_from_subtitle(self, subtitle):
        """从单个字幕中提取单词及其上下文，并添加翻译、音标，但不下载发音"""
        # 获取字幕文本
        text = subtitle.text
        if not text:
            return []
        
        # 使用spaCy分析文本
        doc = self.nlp(text)
        
        # 收集识别的单词位置
        word_positions = []
        
        # 遍历所有标记
        for token in doc:
            token_text = token.text.strip()
            
            # 跳过空白、标点和已经处理过的单词
            if token_text and not token.is_punct and not token.is_space:
                if not any(token.idx >= start and token.idx + len(token_text) <= end 
                       for _, start, end in word_positions):
                    # 筛选合法的单词
                    if self.is_valid_word(token_text):
                        word_positions.append((token_text, token.idx, token.idx + len(token_text)))
        
        # 收集处理所有单词的数据
        words_data = []
        
        # 处理每个找到的单词
        for word_text, start, end in word_positions:
            # 获取单词数据（翻译、音标、发音），并自动下载发音文件
            word_data = self.get_word_data(word_text, download_audio=True)
            
            # 如果没有获取到翻译，跳过该单词
            if word_data is None:
                continue
                
            # 构建单词数据
            word_info = {
                'text': word_text.lower(),
                'language': self.language,
                # 移除硬编码的频率，频率将通过引用计数动态计算
                'translation': word_data['translation'],
                'uk_phonetic': word_data['uk_phonetic'],
                'us_phonetic': word_data['us_phonetic'],
                'phonetic': word_data['phonetic'],
                'has_audio': word_data['has_audio'],
                'web_translation': word_data.get('web_translation', ''),
                'reference_data': {
                    'subtitle_id': subtitle.id,
                    'context_start': start,
                    'context_end': end
                }
            }
            
            # 添加到批量处理列表
            words_data.append(word_info)
        
        # 批量保存单词
        if words_data:
            result = batch_save_words(self.user, words_data)
            return result
        
        return {
            'success': True,
            'saved_count': 0,
            'message': '没有找到有效单词'
        }
    
    def process_video(self, video):
        """处理单个视频的所有字幕"""
        subtitles = Subtitle.objects.filter(video=video)
        word_count = 0
        
        for subtitle in subtitles:
            result = self.extract_words_from_subtitle(subtitle)
            word_count += result.get('saved_count', 0)
            
        return word_count
    
    def process_all_videos(self, force_reprocess=False):
        """处理用户的所有视频，提取单词"""
        videos = Video.objects.filter(user=self.user)
        total_word_count = 0
        
        for video in videos:
            # 注意：由于数据模型变化，现在不再删除旧词引用
            # 而是直接处理视频
            word_count = self.process_video(video)
            total_word_count += word_count
            
        return total_word_count
        
    def get_word_context(self, user_word_id, subtitle_id=None, context_chars=40):
        """获取单词在字幕中的上下文片段，并高亮显示目标单词
        
        注意：由于数据模型变化，现在需要通过其他方式获取上下文
        暂时先返回空字符串，后续需要重新设计此功能
        """
        # 获取用户单词
        try:
            user_word = UserWord.objects.get(id=user_word_id, user=self.user)
            word_text = user_word.word_definition.text
            
            # 如果提供了字幕ID，则尝试从该字幕获取上下文
            if subtitle_id:
                subtitle = Subtitle.objects.get(id=subtitle_id)
                subtitle_text = subtitle.text
                
                # 尝试在文本中查找单词位置
                pattern = r'\b' + re.escape(word_text.lower()) + r'\b'
                matches = list(re.finditer(pattern, subtitle_text.lower()))
                
                if matches:
                    # 使用第一个匹配项
                    match = matches[0]
                    start_pos = match.start()
                    end_pos = match.end()
                    
                    # 计算上下文的起始和结束位置
                    context_start = max(0, start_pos - context_chars)
                    context_end = min(len(subtitle_text), end_pos + context_chars)
                    
                    # 提取上下文文本
                    context_before = subtitle_text[context_start:start_pos]
                    word_in_context = subtitle_text[start_pos:end_pos]
                    context_after = subtitle_text[end_pos:context_end]
                    
                    # 添加省略号，如果上下文被截断
                    if context_start > 0:
                        context_before = "..." + context_before
                    if context_end < len(subtitle_text):
                        context_after = context_after + "..."
                        
                    # 组合上下文，并高亮显示目标单词
                    full_context = f"{context_before}<strong>{word_in_context}</strong>{context_after}"
                    return full_context
            
            # 如果没有找到上下文，仅返回单词本身
            return f"<strong>{word_text}</strong> (无上下文)"
            
        except (UserWord.DoesNotExist, Subtitle.DoesNotExist):
            return ""

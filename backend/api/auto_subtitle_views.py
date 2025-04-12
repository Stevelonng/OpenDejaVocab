from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import re
import logging
import sys
import requests
import random
import os

logger = logging.getLogger(__name__)

def merge_english_subtitles(subtitles, max_gap=1.0, max_duration=10.0, max_chars=200):
    """
    Merge English subtitle segments into more meaningful units without splitting any original subtitles
    
    Parameters:
    - subtitles: Original subtitle list, each item contains start, end, text
    - max_gap: Maximum time gap allowed for merging (seconds)
    - max_duration: Maximum total duration after merging (seconds)
    - max_chars: Maximum number of characters after merging
    
    Returns: List of merged subtitles
    """
    if not subtitles or len(subtitles) <= 1:
        return subtitles
    
    # Lazy load spaCy model, only when needed
    import spacy
    nlp = None
    
    merged_subtitles = []
    current_group = [subtitles[0]]
    
    for i in range(1, len(subtitles)):
        next_sub = subtitles[i]
        prev_sub = current_group[-1]
        
        # Calculate time gap
        time_gap = next_sub["start"] - prev_sub["end"]
        
        # Calculate total duration after merging
        merged_duration = next_sub["end"] - current_group[0]["start"]
        
        # Calculate merged text
        current_text = " ".join([s["text"] for s in current_group])
        merged_text = current_text + " " + next_sub["text"]
        
        # Decide whether to merge
        should_merge = True
        
        # Check time limits
        if time_gap > max_gap or merged_duration > max_duration or len(merged_text) > max_chars:
            should_merge = False
        
        # Check semantic completeness (only for text above a certain length)
        if should_merge and len(current_text) > 10:
            if nlp is None:  # Lazy load spaCy model
                try:
                    nlp = spacy.load("en_core_web_sm")
                except:
                    # If model is not installed, try downloading
                    import subprocess
                    subprocess.call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
                    nlp = spacy.load("en_core_web_sm")
            
            # Check if current text is already a complete sentence
            if current_text and current_text.strip()[-1] in ['.', '?', '!', ':', ';']:
                should_merge = False  # Current text is a complete sentence, don't merge
            
            # Check if ending with conjunction indicates incomplete sentence
            ending_with_conjunction = any(current_text.lower().endswith(word) for word in 
                                          [" and", " but", " or", " nor", " so", " yet", " for"])
            if ending_with_conjunction:
                should_merge = True  # If ending with conjunction, force merge
                
            # Check if next subtitle begins with lowercase (may indicate sentence continuation)
            next_text = next_sub["text"].strip()
            if next_text and next_text[0].islower():
                should_merge = True  # If next sentence starts with lowercase, it may be continuation of current sentence
            elif next_text and next_text[0].isupper() and not current_text.endswith(','):
                # If next sentence starts with uppercase and current doesn't end with comma, it may be a new sentence
                # Check deeper semantics
                first_word = next_text.split()[0].lower() if next_text.split() else ""
                connecting_words = ["and", "but", "or", "so", "because", "however", "though", "although", "yet", "still"]
                if first_word in connecting_words:
                    should_merge = True  # Starts with connecting word, merge
                else:
                    should_merge = False  # May be a new sentence
        
        if should_merge:
            # Add subtitle to current group
            current_group.append(next_sub)
        else:
            # Save current group and start a new one
            # Maintain original subtitle timing logic: first subtitle's start as beginning, last subtitle's end as ending
            merged_subtitles.append({
                "start": current_group[0]["start"],
                "end": current_group[-1]["end"],
                "text": " ".join([s["text"] for s in current_group])
            })
            current_group = [next_sub]  # Start new group
    
    # Process the last group
    if current_group:
        merged_subtitles.append({
            "start": current_group[0]["start"],
            "end": current_group[-1]["end"],
            "text": " ".join([s["text"] for s in current_group])
        })
    
    return merged_subtitles

def extract_youtube_id(url):
    """Extract video ID from YouTube URL"""
    youtube_regex = r'(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})'
    match = re.search(youtube_regex, url)
    return match.group(1) if match else None

def get_proxy_list(api_key=None):
    """
    获取Webshare代理服务列表
    
    参数:
    - api_key: Webshare API密钥，如果未提供则使用环境变量或默认值
    
    返回: 格式化的代理URL列表 ["http://ip:port", ...]
    """
    if not api_key:
        api_key = os.getenv("WEBSHARE_API_KEY", "mardhw1qhirkyzi3lqqa2xhnwlnnev2j3y61580j")
    
    url = "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct"
    headers = {"Authorization": f"Token {api_key}"}
    
    try:
        logger.info("正在从Webshare API获取代理列表(direct模式)...")
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        proxies_data = response.json()["results"]
        
        # 由于使用IP授权(8.211.168.18)，不需要凭证
        proxy_list = [f"http://{proxy['proxy_address']}:{proxy['port']}" for proxy in proxies_data]
        logger.info(f"成功获取 {len(proxy_list)} 个代理")
        return proxy_list
    except Exception as e:
        logger.error(f"获取代理列表失败: {str(e)}")
        # 如果API获取失败，返回空列表
        return []

def test_proxy(proxy, test_url="https://api.ipify.org", retries=1):
    """
    测试代理连接是否可用
    
    参数:
    - proxy: 代理地址 "http://ip:port"
    - test_url: 测试URL，默认为api.ipify.org
    - retries: 重试次数
    
    返回: 成功则返回代理地址，失败则返回None
    """
    proxies = {"http": proxy, "https": proxy}
    for attempt in range(retries):
        try:
            response = requests.get(test_url, proxies=proxies, timeout=10)
            response.raise_for_status()
            logger.info(f"代理 {proxy} 测试成功，返回IP: {response.text}")
            return proxy
        except requests.RequestException as e:
            logger.warning(f"代理 {proxy} 测试失败 (尝试 {attempt+1}/{retries}): {e}")
    return None

def get_youtube_subtitles_with_proxy(video_id, proxy_list=None):
    """
    使用代理获取YouTube字幕
    
    参数:
    - video_id: YouTube视频ID
    - proxy_list: 代理列表，如果未提供则自动获取
    
    返回: (字幕数据, 语言代码) 元组，或在失败时抛出异常
    """
    if not proxy_list:
        proxy_list = get_proxy_list()
    
    if not proxy_list:
        logger.warning("没有可用代理，尝试直接连接")
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    else:
        # 复制代理列表，避免修改原始列表
        available_proxies = proxy_list.copy()
        random.shuffle(available_proxies)  # 打乱列表顺序
        
        # 最多尝试10个代理
        max_attempts = min(len(available_proxies), 10)
        success = False
        
        # 保存原始环境变量
        original_http_proxy = os.environ.get('HTTP_PROXY')
        original_https_proxy = os.environ.get('HTTPS_PROXY')
        
        try:
            for attempt in range(max_attempts):
                if not available_proxies:
                    break
                    
                # 随机选择一个代理
                proxy = available_proxies.pop(0)  # 取出第一个代理
                logger.info(f"使用代理 ({attempt+1}/{max_attempts}): {proxy}")
                
                try:
                    # 设置环境变量代理
                    os.environ['HTTP_PROXY'] = proxy
                    os.environ['HTTPS_PROXY'] = proxy
                    
                    # 直接获取字幕，不进行代理测试
                    logger.info("正在使用代理获取字幕...")
                    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                    logger.info("成功获取字幕列表!")
                    success = True
                    break  # 成功获取，跳出循环
                    
                except Exception as e:
                    # 当前代理失败，尝试下一个
                    logger.error(f"代理 {proxy} 获取字幕失败: {str(e)}")
                    # 清除代理设置，为下一次尝试做准备
                    os.environ.pop('HTTP_PROXY', None)
                    os.environ.pop('HTTPS_PROXY', None)
            
            # 如果所有代理都尝试失败，尝试直接连接
            if not success:
                logger.warning("所有代理都失败，尝试直接连接YouTube...")
                # 直接连接
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                
        finally:
            # 恢复原始环境变量
            if original_http_proxy:
                os.environ['HTTP_PROXY'] = original_http_proxy
            else:
                os.environ.pop('HTTP_PROXY', None)
                
            if original_https_proxy:
                os.environ['HTTPS_PROXY'] = original_https_proxy
            else:
                os.environ.pop('HTTPS_PROXY', None)
    
    # 优先获取英文字幕
    try:
        transcript = transcript_list.find_transcript(['en'])
        raw_subtitles = transcript.fetch()
        language = 'en'
        logger.info(f"成功获取英文字幕，数量: {len(raw_subtitles)}")
    except:
        # 如果没有英文字幕，尝试获取其他语言
        try:
            transcript = transcript_list.find_transcript(['zh-Hans', 'zh', 'ja', 'ko'])
            raw_subtitles = transcript.fetch()
            language = transcript.language_code
            logger.info(f"没有英文字幕，使用 {language} 字幕，数量: {len(raw_subtitles)}")
        except Exception as e:
            # 如果没有找到常规字幕，尝试自动生成的字幕
            try:
                transcript = transcript_list.find_generated_transcript(['en'])
                raw_subtitles = transcript.fetch()
                language = 'en-generated'
                logger.info(f"使用自动生成的英文字幕，数量: {len(raw_subtitles)}")
            except Exception as e2:
                logger.error(f"无法获取任何字幕: {str(e2)}")
                raise NoTranscriptFound(f"无法找到任何字幕: {str(e2)}")
    
    return raw_subtitles, language

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def auto_fetch_subtitles(request):
    """
    API endpoint for automatically fetching YouTube video subtitles
    Does not save to database, only returns merged subtitle data
    """
    url = request.query_params.get('url', '')
    if not url:
        return Response({"error": "Must provide YouTube video URL"}, status=400)
    
    video_id = extract_youtube_id(url)
    if not video_id:
        return Response({"error": "Failed to extract YouTube video ID from URL"}, status=400)
    
    try:
        logger.info(f"Starting auto fetch subtitles for video {video_id}")
        
        # 使用代理轮换获取字幕
        try:
            raw_subtitles, language = get_youtube_subtitles_with_proxy(video_id)
            logger.info(f"成功获取字幕，语言: {language}, 数量: {len(raw_subtitles)}")
            
        except (TranscriptsDisabled, NoTranscriptFound) as e:
            logger.error(f"Failed to fetch subtitles: {str(e)}")
            return Response({"error": f"Video has no available subtitles: {str(e)}"}, status=404)
        
        # 标准化格式
        subtitles = []
        for i, item in enumerate(raw_subtitles):
            # Convert the transcript object to a dictionary to ensure we can access attributes uniformly
            # The youtube_transcript_api might return objects or dictionaries depending on version
            if not isinstance(item, dict):
                # If it's not a dictionary, access attributes as object properties
                item_dict = {
                    "start": getattr(item, "start", 0),
                    "duration": getattr(item, "duration", 0),
                    "text": getattr(item, "text", "")
                }
            else:
                item_dict = item
                
            if i < len(raw_subtitles) - 1:
                # Not the last entry, end time is the start time of the next entry
                next_item = raw_subtitles[i+1]
                next_start = next_item["start"] if isinstance(next_item, dict) else getattr(next_item, "start", 0)
                
                subtitles.append({
                    "start": item_dict["start"],
                    "end": next_start,
                    "text": item_dict["text"]
                })
            else:
                # Last entry, use duration
                subtitles.append({
                    "start": item_dict["start"],
                    "end": item_dict["start"] + item_dict["duration"],
                    "text": item_dict["text"]
                })
        
        logger.info(f"Processed timestamps for {len(subtitles)} subtitles")
        
        # Preprocess subtitles: filter out auto-generated noise markers and single character subtitles
        filtered_subtitles = []
        for sub in subtitles:
            # Get original text
            text = sub["text"]
            
            # 1. Filter YouTube auto-generated noise markers: [Applause], [Music], etc.
            # Remove content inside brackets
            text = re.sub(r'\[.*?\]', '', text)
            
            # 2. Filter single character subtitles (excluding cases where only one letter remains after removing punctuation)
            # Delete punctuation and spaces then check length
            clean_text = re.sub(r'[^\w]', '', text)
            
            # If processed text is not empty and not just a single character, keep it
            if clean_text and len(clean_text) > 1:
                sub["text"] = text.strip()
                filtered_subtitles.append(sub)
        
        logger.info(f"Subtitle filtering completed, before: {len(subtitles)}, after: {len(filtered_subtitles)}")
        
        # Merge English subtitles
        if language == 'en':
            try:
                logger.info(f"Starting subtitle merging, original count: {len(filtered_subtitles)}")
                merged_subtitles = merge_english_subtitles(
                    filtered_subtitles,
                    max_gap=2.0,      # Allow 2 second gap
                    max_duration=10.0, # Maximum 10 seconds
                    max_chars=300      # Maximum 300 characters
                )
                logger.info(f"Subtitle merging completed, merged count: {len(merged_subtitles)}")
            except Exception as e:
                logger.error(f"Subtitle merging failed: {str(e)}")
                merged_subtitles = filtered_subtitles
        else:
            # Don't merge non-English subtitles
            merged_subtitles = filtered_subtitles
        
        # Standardize response format
        formatted_subtitles = []
        for sub in merged_subtitles:
            formatted_subtitles.append({
                "start_time": sub["start"],
                "end_time": sub["end"],
                "text": sub["text"]
            })
        
        return Response({
            "videoId": video_id,
            "language": language,
            "subtitles": formatted_subtitles,
            "auto_collected": True,
            "saved_to_db": False
        })
        
    except Exception as e:
        logger.error(f"Failed to fetch subtitles: {str(e)}")
        return Response({"error": f"Failed to fetch subtitles: {str(e)}"}, status=500)
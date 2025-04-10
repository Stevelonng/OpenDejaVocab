from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import re
import logging
import sys

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
        
        # Try to get subtitles
        try:
            # 配置Webshare代理来解决IP封禁问题
            from youtube_transcript_api.proxies import WebshareProxyConfig
            import requests
            
            # 使用Webshare代理
            proxy_config = WebshareProxyConfig(
                proxy_username="qkapqaxf",  # Webshare代理用户名
                proxy_password="ykth1r98h37y"  # Webshare代理密码
            )
            
            # 记录我们正在使用的代理信息
            logger.info(f"使用的Webshare代理设置 - 用户名: {proxy_config.proxy_username}")
            print(f"\n===> 正在使用Webshare代理 (用户名: {proxy_config.proxy_username}) <===\n")
            
            # 我们将使用YouTube Transcript API内置的代理机制来获取字幕
            # 这样可以验证代理是否起作用
            
            # 直接使用代理初始化API并获取字幕列表
            logger.info("正在使用代理配置初始化YouTube Transcript API...")
            transcript_api = YouTubeTranscriptApi(proxy_config=proxy_config)
            transcript_list = transcript_api.list_transcripts(video_id)
            logger.info("成功使用代理获取字幕列表!")
            
            # 在成功获取字幕后验证我们的IP地址
            try:
                # 1. 使用代理检查IP
                # 从 WebshareProxyConfig 获取完整的代理URL
                proxies = {"http": proxy_config.url, "https": proxy_config.url}
                proxy_ip_response = requests.get("https://api.ipify.org?format=json", proxies=proxies, timeout=10)
                
                if proxy_ip_response.status_code == 200:
                    proxy_ip = proxy_ip_response.json().get('ip')
                    logger.info(f"通过代理的IP地址: {proxy_ip}")
                    print(f"\n===> 通过代理的IP地址: {proxy_ip} <===\n")
                
                # 2. 不使用代理检查IP(仅作对比)
                direct_ip_response = requests.get("https://api.ipify.org?format=json", timeout=10)
                if direct_ip_response.status_code == 200:
                    direct_ip = direct_ip_response.json().get('ip')
                    logger.info(f"直接连接的IP地址: {direct_ip}")
                    print(f"\n===> 直接连接的IP地址: {direct_ip} <===\n")
                    
                # 验证代理是否生效
                if 'proxy_ip' in locals() and 'direct_ip' in locals() and proxy_ip != direct_ip:
                    logger.info("代理验证成功: IP地址不同说明代理有效")
                    print(f"\n===> 代理验证成功！代理IP与直连 IP 不同 <===\n")
            except Exception as e:
                logger.warning(f"IP验证时出错: {str(e)}")
                print(f"\n===> 无法验证IP地址: {str(e)} <===\n")
            logger.info("成功使用代理获取字幕列表!")
            
            # Prioritize English subtitles
            try:
                transcript = transcript_list.find_transcript(['en'])
                raw_subtitles = transcript.fetch()
                language = 'en'
                logger.info(f"Successfully fetched English subtitles, count: {len(raw_subtitles)}")
            except:
                # If English subtitles not found, get any available subtitles
                transcript = transcript_list.find_transcript(['zh-Hans', 'zh', 'ja', 'ko'])
                raw_subtitles = transcript.fetch()
                language = transcript.language_code
                logger.info(f"No English subtitles, using {language} subtitles, count: {len(raw_subtitles)}")
                
        except (TranscriptsDisabled, NoTranscriptFound) as e:
            logger.error(f"Failed to fetch subtitles: {str(e)}")
            return Response({"error": f"Video has no available subtitles: {str(e)}"}, status=404)
        
        # Standardize format
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

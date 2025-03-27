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
    合并英语字幕片段为更有意义的单位，不会拆分任何原始字幕
    
    参数:
    - subtitles: 原始字幕列表，每项包含 start, end, text
    - max_gap: 允许合并的最大时间间隔(秒)
    - max_duration: 合并后的最大总持续时间(秒)
    - max_chars: 合并后的最大字符数
    
    返回: 合并后的字幕列表
    """
    if not subtitles or len(subtitles) <= 1:
        return subtitles
    
    # 懒加载spaCy模型，只有在需要时才加载
    import spacy
    nlp = None
    
    merged_subtitles = []
    current_group = [subtitles[0]]
    
    for i in range(1, len(subtitles)):
        next_sub = subtitles[i]
        prev_sub = current_group[-1]
        
        # 计算时间间隔
        time_gap = next_sub["start"] - prev_sub["end"]
        
        # 计算合并后的总持续时间
        merged_duration = next_sub["end"] - current_group[0]["start"]
        
        # 计算合并后的文本
        current_text = " ".join([s["text"] for s in current_group])
        merged_text = current_text + " " + next_sub["text"]
        
        # 决定是否应该合并
        should_merge = True
        
        # 检查时间限制
        if time_gap > max_gap or merged_duration > max_duration or len(merged_text) > max_chars:
            should_merge = False
        
        # 检查语义完整性（只对一定长度以上的文本进行检查）
        if should_merge and len(current_text) > 10:
            if nlp is None:  # 懒加载spaCy模型
                try:
                    nlp = spacy.load("en_core_web_sm")
                except:
                    # 如果模型未安装，尝试下载
                    import subprocess
                    subprocess.call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
                    nlp = spacy.load("en_core_web_sm")
            
            # 检查当前文本是否已经是一个完整句子
            if current_text and current_text.strip()[-1] in ['.', '?', '!', ':', ';']:
                should_merge = False  # 当前已是完整句子，不合并
            
            # 检查是否有连接词表明句子未完成
            ending_with_conjunction = any(current_text.lower().endswith(word) for word in 
                                          [" and", " but", " or", " nor", " so", " yet", " for"])
            if ending_with_conjunction:
                should_merge = True  # 如果以连接词结尾，强制合并
                
            # 检查下一个字幕是否以小写字母开头（可能表示句子延续）
            next_text = next_sub["text"].strip()
            if next_text and next_text[0].islower():
                should_merge = True  # 如果下一句以小写开头，可能是当前句子的延续
            elif next_text and next_text[0].isupper() and not current_text.endswith(','):
                # 如果下一句以大写开头且当前句不以逗号结尾，可能是新句子
                # 检查更深层的语义
                first_word = next_text.split()[0].lower() if next_text.split() else ""
                connecting_words = ["and", "but", "or", "so", "because", "however", "though", "although", "yet", "still"]
                if first_word in connecting_words:
                    should_merge = True  # 连接词开头，合并
                else:
                    should_merge = False  # 可能是新句子
        
        if should_merge:
            # 将字幕添加到当前组
            current_group.append(next_sub)
        else:
            # 保存当前组并开始新组
            # 保持原始字幕的时间逻辑：第一个字幕的start作为开始，最后一个字幕的end作为结束
            merged_subtitles.append({
                "start": current_group[0]["start"],
                "end": current_group[-1]["end"],
                "text": " ".join([s["text"] for s in current_group])
            })
            current_group = [next_sub]  # 开始新组
    
    # 处理最后一组
    if current_group:
        merged_subtitles.append({
            "start": current_group[0]["start"],
            "end": current_group[-1]["end"],
            "text": " ".join([s["text"] for s in current_group])
        })
    
    return merged_subtitles

def extract_youtube_id(url):
    """从YouTube URL中提取视频ID"""
    youtube_regex = r'(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})'
    match = re.search(youtube_regex, url)
    return match.group(1) if match else None

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def auto_fetch_subtitles(request):
    """
    自动获取YouTube视频字幕的API端点
    不保存到数据库，只返回合并后的字幕数据
    """
    url = request.query_params.get('url', '')
    if not url:
        return Response({"error": "Must provide YouTube video URL"}, status=400)
    
    video_id = extract_youtube_id(url)
    if not video_id:
        return Response({"error": "Failed to extract YouTube video ID from URL"}, status=400)
    
    try:
        logger.info(f"Starting auto fetch subtitles for video {video_id}")
        
        # 尝试获取字幕
        try:
            # 尝试获取英文字幕
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # 优先尝试获取英文字幕
            try:
                transcript = transcript_list.find_transcript(['en'])
                raw_subtitles = transcript.fetch()
                language = 'en'
                logger.info(f"Successfully fetched English subtitles, count: {len(raw_subtitles)}")
            except:
                # 如果找不到英文字幕，获取任意可用的字幕
                transcript = transcript_list.find_transcript(['zh-Hans', 'zh', 'ja', 'ko'])
                raw_subtitles = transcript.fetch()
                language = transcript.language_code
                logger.info(f"No English subtitles, using {language} subtitles, count: {len(raw_subtitles)}")
                
        except (TranscriptsDisabled, NoTranscriptFound) as e:
            logger.error(f"Failed to fetch subtitles: {str(e)}")
            return Response({"error": f"Video has no available subtitles: {str(e)}"}, status=404)
        
        # 标准化格式
        subtitles = []
        for i, item in enumerate(raw_subtitles):
            if i < len(raw_subtitles) - 1:
                # 非最后一条，结束时间为下一条的开始时间
                subtitles.append({
                    "start": item["start"],
                    "end": raw_subtitles[i+1]["start"],
                    "text": item["text"]
                })
            else:
                # 最后一条，使用duration
                subtitles.append({
                    "start": item["start"],
                    "end": item["start"] + item["duration"],
                    "text": item["text"]
                })
        logger.info(f"Processed timestamps for {len(subtitles)} subtitles")
        
        # 预处理字幕：过滤掉自动生成的噪音标记和单字符字幕
        filtered_subtitles = []
        for sub in subtitles:
            # 获取原文本
            text = sub["text"]
            
            # 1. 过滤YouTube自动生成的噪音标记：[Applause], [Music]等
            # 移除方括号内的内容
            text = re.sub(r'\[.*?\]', '', text)
            
            # 2. 过滤单字符字幕 (排除标点符号后只有一个字母的情况)
            # 删除标点符号和空格后检查长度
            clean_text = re.sub(r'[^\w]', '', text)
            
            # 如果处理后的文本非空且不只是单个字符，则保留
            if clean_text and len(clean_text) > 1:
                sub["text"] = text.strip()
                filtered_subtitles.append(sub)
        
        logger.info(f"Subtitle filtering completed, before: {len(subtitles)}, after: {len(filtered_subtitles)}")
        
        # 对英文字幕进行合并处理
        if language == 'en':
            try:
                logger.info(f"Starting subtitle merging, original count: {len(filtered_subtitles)}")
                merged_subtitles = merge_english_subtitles(
                    filtered_subtitles,
                    max_gap=2.0,      # 允许2秒的间隔
                    max_duration=10.0, # 最长10秒
                    max_chars=300      # 最多300字符
                )
                logger.info(f"Subtitle merging completed, merged count: {len(merged_subtitles)}")
            except Exception as e:
                logger.error(f"Subtitle merging failed: {str(e)}")
                merged_subtitles = filtered_subtitles
        else:
            # 非英文字幕不进行合并
            merged_subtitles = filtered_subtitles
        
        # 标准化响应格式
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

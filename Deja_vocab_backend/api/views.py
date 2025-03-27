from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.authtoken.models import Token
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.authtoken.views import ObtainAuthToken
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import re
import sys
import logging

# 配置日志
logger = logging.getLogger(__name__)

from .models import Video, Subtitle, Sentence
from .serializers import VideoSerializer, SubtitleSerializer, SentenceSerializer


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

class VideoViewSet(viewsets.ModelViewSet):
    """API endpoint for managing videos"""
    serializer_class = VideoSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = Video.objects.filter(user=self.request.user)
        url = self.request.query_params.get('url', None)
        if url is not None:
            queryset = queryset.filter(url=url)
        return queryset
    
    def create(self, request, *args, **kwargs):
        # 检查是否已存在相同URL的视频记录
        url = request.data.get('url')
        existing_video = Video.objects.filter(user=self.request.user, url=url).first()
        
        if existing_video:
            # 如果已存在相同URL的视频，则返回已存在的视频的序列化数据
            serializer = self.get_serializer(existing_video)
            return Response(serializer.data, status=status.HTTP_200_OK)
        
        # 如果不存在，则创建新视频
        return super().create(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class SubtitleViewSet(viewsets.ModelViewSet):
    """API endpoint for managing subtitles"""
    serializer_class = SubtitleSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # 禁用分页，返回所有字幕
    
    def get_queryset(self):
        video_id = self.request.query_params.get('video_id')
        if video_id:
            return Subtitle.objects.filter(video__user=self.request.user, video_id=video_id).order_by('start_time')
        return Subtitle.objects.filter(video__user=self.request.user).order_by('start_time')

class SentenceViewSet(viewsets.ModelViewSet):
    """API endpoint for managing saved sentences from video subtitles"""
    serializer_class = SentenceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Sentence.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# Token Authentication view
@method_decorator(csrf_exempt, name='dispatch')
class CustomAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data,
                                           context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user_id': user.pk,
            'username': user.username
        })


# Public API endpoints for testing
@api_view(['GET'])
@permission_classes([AllowAny])
def api_root(request):
    """Public endpoint to verify the API is working"""
    return Response({
        'message': 'Welcome to Déjà Vocab  API',
        'status': 'API is running',
        'version': '1.0.0',
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """Public endpoint to register a new user"""
    username = request.data.get('username')
    password = request.data.get('password')
    email = request.data.get('email', '')
    
    if not username or not password:
        return Response({
            'error': 'Username and password are required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if user already exists
    if User.objects.filter(username=username).exists():
        return Response({
            'error': 'Username already exists'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Create new user
    user = User.objects.create_user(username=username, password=password, email=email)
    
    # Generate auth token
    token, _ = Token.objects.get_or_create(user=user)
    
    return Response({
        'message': 'User registered successfully',
        'token': token.key,
        'user_id': user.pk,
        'username': user.username
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fetch_subtitles(request, video_id):
    """Endpoint to fetch and save subtitles for a YouTube video using YouTube API"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Starting fetch_subtitles for video_id: {video_id}")
    logger.info(f"Platform: {sys.platform}")
    logger.info(f"Python version: {sys.version}")
    
    # Check if video already exists with matching URL
    video_url = f'https://www.youtube.com/watch?v={video_id}'
    video = None
    try:
        # Try to find a video with matching URL
        video = Video.objects.get(url=video_url, user=request.user)
        
        # Check if this video already has subtitles
        existing_subtitles = Subtitle.objects.filter(video=video).count()
        if existing_subtitles > 0:
            # If subtitles already exist, return success without re-fetching
            logger.info(f"Video already has {existing_subtitles} subtitles")
            return Response({
                "message": f"Video already has {existing_subtitles} subtitles",
                "video_id": video.id,
                "url": video.url,
                "title": video.title,
                "subtitles_count": existing_subtitles,
                "existing": True
            }, status=status.HTTP_200_OK)
    except Video.DoesNotExist:
        # Create new video if it doesn't exist
        logger.info(f"Video does not exist, creating new one")
        video_title = request.data.get('title', f'YouTube Video {video_id}')
        
        # Clean up the title to remove notification numbers like (19)
        if video_title:
            video_title = re.sub(r'^\(\d+\)\s+', '', video_title)
            
        video = Video.objects.create(
            title=video_title,
            url=video_url,
            user=request.user
        )
        logger.info(f"New video created (title omitted for encoding safety)")
    
    # 使用youtube-transcript-api获取字幕
    try:
        # 从视频URL中提取视频ID
        video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', video_url)
        if not video_id_match:
            logger.error(f"Invalid YouTube URL: {video_url}")
            return Response({
                "error": "Invalid YouTube URL"
            }, status=status.HTTP_400_BAD_REQUEST)
        
        youtube_id = video_id_match.group(1)
        logger.info(f"Extracted YouTube ID: {youtube_id}")
        
        try:
            # 仅获取英文字幕
            logger.info(f"Attempting to list transcripts for {youtube_id}")
            transcript_list = YouTubeTranscriptApi.list_transcripts(youtube_id)
            logger.info(f"Successfully listed transcripts for {youtube_id}")
            
            # 首先尝试获取英文字幕
            try:
                # 尝试获取手动添加的英文字幕
                transcript = None
                logger.info("Searching for manually added English subtitles")
                for t in transcript_list:
                    if t.language_code.startswith('en') and not t.is_generated:
                        transcript = t
                        print(f"找到手动添加的英文字幕: {t.language_code}")
                        logger.info(f"Found manually added English subtitles: {t.language_code}")
                        break
                
                # 如果没有手动添加的英文字幕，尝试自动生成的英文字幕
                if transcript is None:
                    logger.info("No manually added English subtitles found, looking for auto-generated")
                    for t in transcript_list:
                        if t.language_code.startswith('en') and t.is_generated:
                            transcript = t
                            print(f"找到自动生成的英文字幕: {t.language_code}")
                            logger.info(f"Found auto-generated English subtitles: {t.language_code}")
                            break
                
                # 如果没有任何英文字幕，抛出异常
                if transcript is None:
                    logger.error("No English subtitles available")
                    raise NoTranscriptFound("没有可用的英文字幕")
                    
            except NoTranscriptFound:
                # 如果没有找到英文字幕，尝试将其他语言翻译成英文
                logger.info("No English subtitles found, attempting to translate")
                try:
                    # 获取首个可用字幕并尝试翻译成英文
                    other_transcript = transcript_list[0]
                    logger.info(f"Found other language transcript: {other_transcript.language_code}")
                    transcript = other_transcript.translate('en')
                    print(f"将 {other_transcript.language_code} 字幕翻译成英文")
                    logger.info(f"Translated {other_transcript.language_code} subtitles to English")
                except Exception as e:
                    # 如果翻译也失败，抛出异常
                    logger.error(f"Failed to translate: {str(e)}")
                    raise Exception(f"无法找到或翻译成英文字幕: {str(e)}")
            
            # 获取字幕数据
            logger.info("Fetching transcript data")
            transcript_data = transcript.fetch()
            logger.info(f"Fetched {len(transcript_data)} subtitle items")
            
            # 使用原始字幕，并根据规律处理时间戳
            # 规律：非最后一条字幕的结束时间是下一条的开始时间
            raw_subtitles = []
            for item in transcript_data:
                # 根据对象类型获取属性
                if hasattr(item, 'text') and hasattr(item, 'start') and hasattr(item, 'duration'):
                    # 对象模式 - 直接访问属性
                    start = item.start
                    duration = item.duration
                    text = item.text
                else:
                    # 字典模式 - 使用键访问
                    start = item['start']
                    duration = item['duration']
                    text = item['text']
                
                # 清理文本
                text = re.sub(r'<[^>]+>', '', text)  # 移除HTML标签
                
                if text:  # 只添加非空字幕
                    raw_subtitles.append({
                        "start": start,
                        "duration": duration,
                        "text": text
                    })
            logger.info(f"Created {len(raw_subtitles)} raw subtitles after cleaning")
            
            # 处理时间戳：非最后一条字幕，结束时间为下一条的开始时间
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
            logger.info(f"Processed timestamp for {len(subtitles)} subtitles")
            
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
            
            logger.info(f"Filtered subtitles: before={len(subtitles)}, after={len(filtered_subtitles)}")
            print(f"字幕过滤完成，过滤前字幕数量: {len(subtitles)}, 过滤后字幕数量: {len(filtered_subtitles)}")
            
            # 应用字幕合并算法 - 处理依赖项安装
            logger.info(f"Starting to merge subtitles, count: {len(filtered_subtitles)}")
            print(f"开始合并字幕，原始字幕数量: {len(filtered_subtitles)}")
            try:
                # 尝试合并字幕，但捕获spaCy相关错误
                merged_subtitles = merge_english_subtitles(
                    filtered_subtitles, 
                    max_gap=0.8,          # 相邻字幕允许的最大时间间隔
                    max_duration=8.0,     # 合并后的最大持续时间
                    max_chars=160         # 合并后的最大字符数
                )
                logger.info(f"Successfully merged subtitles, count: {len(merged_subtitles)}")
                print(f"字幕合并完成，合并后字幕数量: {len(merged_subtitles)}")
            except Exception as e:
                # 如果字幕合并失败，使用过滤后的字幕继续
                logger.error(f"Error merging subtitles: {str(e)}")
                logger.info("Falling back to filtered subtitles without merging")
                merged_subtitles = filtered_subtitles
                print(f"字幕合并失败，使用过滤后的字幕：{str(e)}")
            
            # 只创建并保存合并后的字幕对象
            logger.info("Creating subtitle objects")
            subtitle_objects = [
                Subtitle(
                    video=video,
                    start_time=sub["start"],
                    end_time=sub["end"],
                    text=sub["text"]
                ) for sub in merged_subtitles
            ]
            
            # 批量保存合并后的字幕（减少数据库调用次数）
            logger.info(f"Bulk creating {len(subtitle_objects)} subtitle objects")
            Subtitle.objects.bulk_create(subtitle_objects)
            logger.info("Subtitle creation complete")
            
            # 批量创建字幕后立即启动单词提取（因为bulk_create不会触发signals）
            import threading
            from .word_extractor import WordExtractor
            
            def process_video_words(video_id, user_id):
                try:
                    from django.contrib.auth.models import User
                    from .models import Video
                    
                    # 重新获取视频和用户对象（在新线程中必要）
                    video_obj = Video.objects.get(id=video_id)
                    user = User.objects.get(id=user_id)
                    
                    # 初始化单词提取器并处理视频
                    extractor = WordExtractor(user)
                    count = extractor.process_video(video_obj)
                    print(f"字幕保存后提取完成: 从视频 '{video_obj.title}' 中提取了 {count} 个单词")
                except Exception as e:
                    print(f"单词提取错误: {str(e)}")
            
            # 保存当前视频的ID以便在线程中使用
            video_id_for_thread = video.id
            
            # 启动后台线程处理单词提取
            logger.info(f"Starting word extraction thread after saving subtitles for video ID: {video_id_for_thread}")
            thread = threading.Thread(target=process_video_words, args=(video_id_for_thread, request.user.id))
            thread.daemon = True
            thread.start()
            
            logger.info("Fetch subtitles completed successfully")
            return Response({
                # "message": f"Successfully fetched {len(subtitles)} subtitles for video {video_id}",
                "video_id": video.id,
                "url": video.url,
                "title": video.title
            }, status=status.HTTP_200_OK)
            
        except TranscriptsDisabled:
            logger.error("Transcripts are disabled for this video")
            # Delete the video record since it has no subtitles
            if video:
                video.delete()
                logger.info(f"Deleted video without subtitles: {video_id}")
            return Response({
                "error": "Transcripts are disabled for this video",
                "message": "The video owner has disabled subtitles for this video",
                "video_id": video_id,
                "status": "disabled"
            }, status=status.HTTP_404_NOT_FOUND)
        except NoTranscriptFound:
            logger.error("No transcript available for this video")
            # Delete the video record since it has no subtitles
            if video:
                video.delete()
                logger.info(f"Deleted video without subtitles: {video_id}")
            return Response({
                "error": "No transcript available",
                "message": "Could not find any subtitles for this video",
                "video_id": video_id,
                "status": "not_found"
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            # In case of other errors, also remove the video if no subtitles were saved
            logger.error(f"General exception in fetch_subtitles: {str(e)}")
            if video:
                # Check if this video has any subtitles
                if Subtitle.objects.filter(video=video).count() == 0:
                    video.delete()
                    logger.info(f"Deleted video without subtitles due to error: {video_id}")
            return Response({
                "error": str(e),
                "message": "Failed to fetch subtitles from YouTube",
                "video_id": video_id,
                "status": "error"
            }, status=status.HTTP_400_BAD_REQUEST)
            
    except Exception as e:
        # 捕获内部YouTubeTranscriptApi异常
        logger.error(f"Exception in transcript processing: {str(e)}")
        raise e


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_subtitles(request):
    """Endpoint to save multiple subtitles for a video"""
    try:
        video_id = request.data.get('video_id')
        video_title = request.data.get('video_title')  # 获取视频标题
        subtitles_data = request.data.get('subtitles', [])
        
        if not video_id or not subtitles_data:
            return Response({'error': 'Missing video_id or subtitles data'}, status=status.HTTP_400_BAD_REQUEST)
        
        # 尝试找到视频，如果不存在则创建新视频
        try:
            # 使用url或外部ID查找视频，而不是主键id
            youtube_url = f"https://www.youtube.com/watch?v={video_id}"
            video = Video.objects.get(
                user=request.user,
                url__contains=video_id  # 查找URL中包含视频ID的记录
            )
            
            # 如果找到视频且标题是默认的，但现在有了真实标题，则更新标题
            if video.title.startswith("YouTube Video") and video_title:
                video.title = video_title
                video.save()
                logger.info(f"更新视频标题: {video_title}, 视频ID: {video_id}")
                
            logger.info(f"找到现有视频URL包含: {video_id}, 用户: {request.user.username}")
        except Video.DoesNotExist:
            # 视频不存在，创建新视频
            logger.info(f"视频不存在，创建新视频: {video_id}, 用户: {request.user.username}")
            
            # 使用传入的标题，如果没有则使用默认标题
            title = video_title if video_title else f"YouTube Video {video_id}"
            
            video = Video.objects.create(
                user=request.user,
                title=title,  # 使用真实标题
                url=f"https://www.youtube.com/watch?v={video_id}"  # YouTube URL
            )
        
        # 先检查视频是否已经有字幕
        existing_subtitles_count = Subtitle.objects.filter(video=video).count()
        if existing_subtitles_count > 0:
            # 已经有字幕，不要重复添加
            logger.info(f"视频 {video_id} 已有 {existing_subtitles_count} 条字幕，跳过保存")
            return Response({'message': f'视频已有 {existing_subtitles_count} 条字幕，跳过保存'}, status=status.HTTP_200_OK)
        
        # 检查重复字幕
        seen_timestamps = set()
        unique_subtitles_data = []
        
        for subtitle_data in subtitles_data:
            start_time = subtitle_data.get('start_time', 0)
            end_time = subtitle_data.get('end_time', 0)
            text = subtitle_data.get('text', '')
            
            # 创建唯一标识
            key = f"{start_time}_{end_time}_{text}"
            
            if key not in seen_timestamps:
                seen_timestamps.add(key)
                unique_subtitles_data.append(subtitle_data)
        
        # Create subtitles in bulk
        subtitles = []
        for subtitle_data in unique_subtitles_data:
            subtitle = Subtitle(
                video=video,
                text=subtitle_data.get('text', ''),
                start_time=subtitle_data.get('start_time', 0),
                end_time=subtitle_data.get('end_time', 0)
            )
            subtitles.append(subtitle)
        
        # Save all subtitles
        if subtitles:
            Subtitle.objects.bulk_create(subtitles)
            
            # 添加：批量创建字幕后立即启动单词提取（因为bulk_create不会触发signals）
            import threading
            from .word_extractor import WordExtractor
            
            def process_video_words(video_id, user_id):
                try:
                    from django.contrib.auth.models import User
                    from .models import Video
                    
                    # 重新获取视频和用户对象（在新线程中必要）
                    video_obj = Video.objects.get(id=video_id)
                    user = User.objects.get(id=user_id)
                    
                    # 初始化单词提取器并处理视频
                    extractor = WordExtractor(user)
                    count = extractor.process_video(video_obj)
                    print(f"字幕保存后提取完成: 从视频 '{video_obj.title}' 中提取了 {count} 个单词")
                except Exception as e:
                    print(f"单词提取错误: {str(e)}")
            
            # 保存当前视频的ID以便在线程中使用
            video_id_for_thread = video.id
            
            # 启动后台线程处理单词提取
            logger.info("Starting word extraction thread after saving subtitles")
            thread = threading.Thread(target=process_video_words, args=(video_id_for_thread, request.user.id))
            thread.daemon = True
            thread.start()
        
        return Response({'message': f'{len(subtitles)} 条字幕保存成功'}, status=status.HTTP_201_CREATED)
    
    except Exception as e:
        logger.error(f"Error saving subtitles: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_sentence(request):
    """Endpoint to add a sentence from a subtitle"""
    # 获取请求数据
    text = request.data.get('text')
    translation = request.data.get('translation', '')
    subtitle_id = request.data.get('subtitle_id')
    
    if not text or not subtitle_id:
        return Response({
            'error': 'Missing required fields: text or subtitle_id'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 获取字幕
    try:
        subtitle = Subtitle.objects.get(id=subtitle_id)
        # 确保字幕属于当前用户
        if subtitle.video.user != request.user:
            return Response({
                'error': 'Subtitle does not belong to this user'
            }, status=status.HTTP_403_FORBIDDEN)
    except Subtitle.DoesNotExist:
        return Response({
            'error': 'Subtitle not found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # 创建或更新句子
    from django.db import transaction, OperationalError
    import time
    
    max_retries = 3
    retry_count = 0
    retry_delay = 0.5  # 初始延迟0.5秒
    
    while retry_count < max_retries:
        try:
            # 使用普通事务而不是select_for_update来减少锁定
            with transaction.atomic():
                sentence, created = Sentence.objects.get_or_create(
                    user=request.user,
                    text=text,
                    defaults={
                        'translation': translation,
                        'video': subtitle.video,
                        'start_time': subtitle.start_time,
                        'end_time': subtitle.end_time
                    }
                )
                
                # 如果找到现有句子但需要更新
                if not created and (sentence.translation != translation or 
                                    sentence.video != subtitle.video or
                                    sentence.start_time != subtitle.start_time or
                                    sentence.end_time != subtitle.end_time):
                    sentence.translation = translation
                    sentence.video = subtitle.video
                    sentence.start_time = subtitle.start_time
                    sentence.end_time = subtitle.end_time
                    sentence.save()
            
            # 如果成功，跳出循环
            break
            
        except OperationalError as e:
            # 检查是否是数据库锁定错误
            if "database is locked" in str(e) and retry_count < max_retries - 1:
                # 增加重试计数并等待
                retry_count += 1
                logger.warning(f"Database locked, retrying ({retry_count}/{max_retries})...")
                # 使用指数退避，每次延迟加倍
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                # 如果是其他错误或已达到最大重试次数，重新抛出异常
                logger.error(f"Database error after {retry_count} retries: {str(e)}")
                raise
    
    # 返回响应
    return Response({
        'message': 'Sentence added successfully',
        'sentence_id': sentence.id,
        'created': created
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_subtitle(request, video_id):
    """Endpoint to mark the subtitle at the current time and save it as a sentence"""
    current_time = request.data.get('time')
    if current_time is None:
        return Response({
            "error": "Current time not provided"
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Get the video by URL
        video_url = f'https://www.youtube.com/watch?v={video_id}'
        video = get_object_or_404(Video, url=video_url, user=request.user)
        
        # Find the subtitle that contains the current time
        subtitle = Subtitle.objects.filter(
            video=video,
            start_time__lte=current_time,
            end_time__gte=current_time
        ).first()
        
        if not subtitle:
            return Response({
                "error": "No subtitle found at the specified time"
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Create a sentence from the subtitle text
        sentence, created = Sentence.objects.get_or_create(
            text=subtitle.text,
            user=request.user,
            defaults={
                'translation': '', 
                'video': video,
                'start_time': subtitle.start_time,
                'end_time': subtitle.end_time
            }
        )
        
        # 如果句子已存在但未关联视频或时间信息，则更新
        if not created and (not sentence.video or sentence.start_time is None):
            sentence.video = video
            sentence.start_time = subtitle.start_time
            sentence.end_time = subtitle.end_time
            sentence.save()
        
        # 我们不再需要创建 SentenceReference，因为 Sentence 已经直接关联了视频和时间戳
        
        return Response({
            "message": "Subtitle successfully marked and saved as a sentence",
            "sentence_id": sentence.id,
            "text": sentence.text,
            "subtitle_id": subtitle.id,
            "video_title": video.title
        }, status=status.HTTP_200_OK)
    
    except Exception as e:
        return Response({
            "error": str(e),
            "message": "Failed to mark subtitle"
        }, status=status.HTTP_400_BAD_REQUEST)

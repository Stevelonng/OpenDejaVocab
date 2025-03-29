from rest_framework import viewsets, status
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

# Configure logging
logger = logging.getLogger(__name__)

from .models import Video, Subtitle, Sentence
from .serializers import VideoSerializer, SubtitleSerializer, SentenceSerializer


def merge_english_subtitles(subtitles, max_gap=1.0, max_duration=10.0, max_chars=200):
    """
    Merge English subtitle segments into more meaningful units without splitting any original subtitles
    
    Parameters:
    - subtitles: Original subtitle list, each item contains start, end, text
    - max_gap: Maximum allowed time gap for merging (seconds)
    - max_duration: Maximum total duration after merging (seconds)
    - max_chars: Maximum number of characters after merging
    
    Returns: List of merged subtitles
    """
    if not subtitles or len(subtitles) <= 1:
        return subtitles
    
    # Lazy load spaCy model, only load when needed
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
                    # If model is not installed, try to download it
                    import subprocess
                    subprocess.call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
                    nlp = spacy.load("en_core_web_sm")
            
            # Check if current text is already a complete sentence
            if current_text and current_text.strip()[-1] in ['.', '?', '!', ':', ';']:
                should_merge = False  # Current text is already a complete sentence, don't merge
            
            # Check if there are conjunctions indicating incomplete sentence
            ending_with_conjunction = any(current_text.lower().endswith(word) for word in 
                                         [" and", " but", " or", " nor", " so", " yet", " for"])
            if ending_with_conjunction:
                should_merge = True  # If ending with conjunction, force merge
                
            # Check if next subtitle starts with lowercase letter (possibly indicating sentence continuation)
            next_text = next_sub["text"].strip()
            if next_text and next_text[0].islower():
                should_merge = True  # If next sentence starts with lowercase, it's likely a continuation
            elif next_text and next_text[0].isupper() and not current_text.endswith(','):
                # If next sentence starts with uppercase and current doesn't end with comma, it might be a new sentence
                # Check deeper semantics
                first_word = next_text.split()[0].lower() if next_text.split() else ""
                connecting_words = ["and", "but", "or", "so", "because", "however", "though", "although", "yet", "still"]
                if first_word in connecting_words:
                    should_merge = True  # Starts with connecting word, merge
                else:
                    should_merge = False  # Might be a new sentence
        
        if should_merge:
            # Add subtitle to current group
            current_group.append(next_sub)
        else:
            # Save current group and start a new one
            # Maintain original subtitle time logic: first subtitle's start as beginning, last subtitle's end as ending
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
        # Check if a video record with the same URL already exists
        url = request.data.get('url')
        existing_video = Video.objects.filter(user=self.request.user, url=url).first()
        
        if existing_video:
            # If a video with the same URL already exists, return the serialized data of the existing video
            serializer = self.get_serializer(existing_video)
            return Response(serializer.data, status=status.HTTP_200_OK)
        
        # If it doesn't exist, create a new video
        return super().create(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class SubtitleViewSet(viewsets.ModelViewSet):
    """API endpoint for managing subtitles"""
    serializer_class = SubtitleSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Disable pagination, return all subtitles
    
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
    
    # Use youtube-transcript-api to get subtitles
    try:
        # Extract video ID from video URL
        video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', video_url)
        if not video_id_match:
            logger.error(f"Invalid YouTube URL: {video_url}")
            return Response({
                "error": "Invalid YouTube URL"
            }, status=status.HTTP_400_BAD_REQUEST)
        
        youtube_id = video_id_match.group(1)
        logger.info(f"Extracted YouTube ID: {youtube_id}")
        
        try:
            # Only get English subtitles
            logger.info(f"Attempting to list transcripts for {youtube_id}")
            transcript_list = YouTubeTranscriptApi.list_transcripts(youtube_id)
            logger.info(f"Successfully listed transcripts for {youtube_id}")
            
            # First try to get manually added English subtitles
            try:
                # Try to get manually added English subtitles
                transcript = None
                logger.info("Searching for manually added English subtitles")
                for t in transcript_list:
                    if t.language_code.startswith('en') and not t.is_generated:
                        transcript = t
                        print(f"Found manually added English subtitles: {t.language_code}")
                        logger.info(f"Found manually added English subtitles: {t.language_code}")
                        break
                
                # If no manually added English subtitles, try auto-generated English subtitles
                if transcript is None:
                    logger.info("No manually added English subtitles found, looking for auto-generated")
                    for t in transcript_list:
                        if t.language_code.startswith('en') and t.is_generated:
                            transcript = t
                            print(f"Found auto-generated English subtitles: {t.language_code}")
                            logger.info(f"Found auto-generated English subtitles: {t.language_code}")
                            break
                
                # If no English subtitles available, raise exception
                if transcript is None:
                    logger.error("No English subtitles available")
                    raise NoTranscriptFound("No English subtitles available")
                    
            except NoTranscriptFound:
                # If no English subtitles, try to translate other language subtitles
                logger.info("No English subtitles found, attempting to translate")
                try:
                    # Get the first available transcript and try to translate it to English
                    other_transcript = transcript_list[0]
                    logger.info(f"Found other language transcript: {other_transcript.language_code}")
                    transcript = other_transcript.translate('en')
                    print(f"Translated {other_transcript.language_code} subtitles to English")
                    logger.info(f"Translated {other_transcript.language_code} subtitles to English")
                except Exception as e:
                    # If translation fails, raise exception
                    logger.error(f"Failed to translate: {str(e)}")
                    raise Exception(f"Failed to translate subtitles: {str(e)}")
            
            # Get transcript data
            logger.info("Fetching transcript data")
            transcript_data = transcript.fetch()
            logger.info(f"Fetched {len(transcript_data)} subtitle items")
            
            # Use original subtitles and adjust timestamps
            # Rule: non-last subtitle's end time is the next subtitle's start time
            raw_subtitles = []
            for item in transcript_data:
                # Get attributes based on object type
                if hasattr(item, 'text') and hasattr(item, 'start') and hasattr(item, 'duration'):
                    # Object mode - access attributes directly
                    start = item.start
                    duration = item.duration
                    text = item.text
                else:
                    # Dictionary mode - access attributes using keys
                    start = item['start']
                    duration = item['duration']
                    text = item['text']
                
                # Clean up text
                text = re.sub(r'<[^>]+>', '', text)  # Remove HTML tags
                
                if text:  # Only add non-empty subtitles
                    raw_subtitles.append({
                        "start": start,
                        "duration": duration,
                        "text": text
                    })
            logger.info(f"Created {len(raw_subtitles)} raw subtitles after cleaning")
            
            # Adjust timestamps: non-last subtitle's end time is the next subtitle's start time
            subtitles = []
            for i, item in enumerate(raw_subtitles):
                if i < len(raw_subtitles) - 1:
                    # Non-last subtitle, end time is the next subtitle's start time
                    subtitles.append({
                        "start": item["start"],
                        "end": raw_subtitles[i+1]["start"],
                        "text": item["text"]
                    })
                else:
                    # Last subtitle, use duration
                    subtitles.append({
                        "start": item["start"],
                        "end": item["start"] + item["duration"],
                        "text": item["text"]
                    })
            logger.info(f"Processed timestamp for {len(subtitles)} subtitles")
            
            # Pre-process subtitles: filter out auto-generated noise markers and single-character subtitles
            filtered_subtitles = []
            for sub in subtitles:
                # Get original text
                text = sub["text"]
                
                # 1. Filter out YouTube auto-generated noise markers: [Applause], [Music] etc.
                # Remove content within square brackets
                text = re.sub(r'\[.*?\]', '', text)
                
                # 2. Filter out single-character subtitles (excluding punctuation)
                # Remove punctuation and spaces, then check length
                clean_text = re.sub(r'[^\w]', '', text)
                
                # If processed text is not empty and not just a single character, keep it
                if clean_text and len(clean_text) > 1:
                    sub["text"] = text.strip()
                    filtered_subtitles.append(sub)
            
            logger.info(f"Filtered subtitles: before={len(subtitles)}, after={len(filtered_subtitles)}")
            print(f"Subtitle filtering completed, before: {len(subtitles)}, after: {len(filtered_subtitles)}")
            
            # Apply subtitle merging algorithm - handle dependency installation
            logger.info(f"Starting to merge subtitles, count: {len(filtered_subtitles)}")
            print(f"Starting to merge subtitles, original subtitle count: {len(filtered_subtitles)}")
            try:
                # Try to merge subtitles, but catch spaCy-related errors
                merged_subtitles = merge_english_subtitles(
                    filtered_subtitles, 
                    max_gap=0.8,          # Maximum allowed time gap for merging
                    max_duration=8.0,     # Maximum total duration after merging
                    max_chars=160         # Maximum number of characters after merging
                )
                logger.info(f"Successfully merged subtitles, count: {len(merged_subtitles)}")
                print(f"Subtitle merging completed, merged subtitle count: {len(merged_subtitles)}")
            except Exception as e:
                # If subtitle merging fails, use filtered subtitles
                logger.error(f"Error merging subtitles: {str(e)}")
                logger.info("Falling back to filtered subtitles without merging")
                merged_subtitles = filtered_subtitles
                print(f"Subtitle merging failed, using filtered subtitles: {str(e)}")
            
            # Only create and save merged subtitle objects
            logger.info("Creating subtitle objects")
            subtitle_objects = [
                Subtitle(
                    video=video,
                    start_time=sub["start"],
                    end_time=sub["end"],
                    text=sub["text"]
                ) for sub in merged_subtitles
            ]
            
            # Bulk create merged subtitles (reduce database calls)
            logger.info(f"Bulk creating {len(subtitle_objects)} subtitle objects")
            Subtitle.objects.bulk_create(subtitle_objects)
            logger.info("Subtitle creation complete")
            
            # Start word extraction after bulk creating subtitles (since bulk_create doesn't trigger signals)
            import threading
            from .word_extractor import WordExtractor
            
            def process_video_words(video_id, user_id):
                try:
                    from django.contrib.auth.models import User
                    from .models import Video
                    
                    # Re-get video and user objects (necessary in new thread)
                    video_obj = Video.objects.get(id=video_id)
                    user = User.objects.get(id=user_id)
                    
                    # Initialize word extractor and process video
                    extractor = WordExtractor(user)
                    result = extractor.process_video(video_obj)
                    
                    # 获取详细结果
                    processed_count = result.get('processed_count', 0)
                    new_count = result.get('new_count', 0)
                    updated_count = result.get('updated_count', 0)
                    
                    print(f"Word extraction has been completed. Video '{video_obj.title}' processed {processed_count} words "
                          f"(new: {new_count}, updated: {updated_count})")
                except Exception as e:
                    print(f"Word extraction error: {str(e)}")
            
            # Save current video ID for use in thread
            video_id_for_thread = video.id
            
            # Start background thread for word extraction
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
        # Catch internal YouTubeTranscriptApi exceptions
        logger.error(f"Exception in transcript processing: {str(e)}")
        raise e


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_subtitles(request):
    """Endpoint to save multiple subtitles for a video"""
    try:
        video_id = request.data.get('video_id')
        video_title = request.data.get('video_title')  # Get video title
        subtitles_data = request.data.get('subtitles', [])
        
        if not video_id or not subtitles_data:
            return Response({'error': 'Missing video_id or subtitles data'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Try to find a video with matching URL, or create a new one if it doesn't exist
        try:
            # Try to find a video with matching URL
            youtube_url = f"https://www.youtube.com/watch?v={video_id}"
            video = Video.objects.get(
                user=request.user,
                url__contains=video_id  # Find video with URL containing video ID
            )
            
            # If found video and title is default, but now has a real title, update title
            if video.title.startswith("YouTube Video") and video_title:
                video.title = video_title
                video.save()
                logger.info(f"Updated video title: {video_title}, video ID: {video_id}")
                
            logger.info(f"Found existing video with URL containing: {video_id}, user: {request.user.username}")
        except Video.DoesNotExist:
            # Video doesn't exist, create a new one
            logger.info(f"Video does not exist, creating new one: {video_id}, user: {request.user.username}")
            
            # Use provided title, or default title if not provided
            title = video_title if video_title else f"YouTube Video {video_id}"
            
            video = Video.objects.create(
                user=request.user,
                title=title,  # Use real title
                url=f"https://www.youtube.com/watch?v={video_id}"  # YouTube URL
            )
        
        # Check if video already has subtitles
        existing_subtitles_count = Subtitle.objects.filter(video=video).count()
        if existing_subtitles_count > 0:
            # Video already has subtitles, don't add again
            logger.info(f"Video {video_id} already has {existing_subtitles_count} subtitles, skipping save")
            return Response({'message': f'Video already has {existing_subtitles_count} subtitles, skipping save'}, status=status.HTTP_200_OK)
        
        # Check for duplicate subtitles
        seen_timestamps = set()
        unique_subtitles_data = []
        
        for subtitle_data in subtitles_data:
            start_time = subtitle_data.get('start_time', 0)
            end_time = subtitle_data.get('end_time', 0)
            text = subtitle_data.get('text', '')
            
            # Create unique key
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
            
            # Start word extraction after bulk creating subtitles (since bulk_create doesn't trigger signals)
            import threading
            from .word_extractor import WordExtractor
            
            def process_video_words(video_id, user_id):
                try:
                    from django.contrib.auth.models import User
                    from .models import Video
                    
                    # Re-get video and user objects (necessary in new thread)
                    video_obj = Video.objects.get(id=video_id)
                    user = User.objects.get(id=user_id)
                    
                    # Initialize word extractor and process video
                    extractor = WordExtractor(user)
                    result = extractor.process_video(video_obj)
                    
                    # 获取详细结果
                    processed_count = result.get('processed_count', 0)
                    new_count = result.get('new_count', 0)
                    updated_count = result.get('updated_count', 0)
                    
                    print(f"单词提取已完成: 视频'{video_obj.title}'处理了 {processed_count} 个单词 "
                          f"(新增: {new_count}, 更新引用: {updated_count})")
                except Exception as e:
                    print(f"Word extraction error: {str(e)}")
            
            # Save current video ID for use in thread
            video_id_for_thread = video.id
            
            # Start background thread for word extraction
            logger.info("Starting word extraction thread after saving subtitles")
            thread = threading.Thread(target=process_video_words, args=(video_id_for_thread, request.user.id))
            thread.daemon = True
            thread.start()
        
        return Response({'message': f'{len(subtitles)} subtitles saved successfully'}, status=status.HTTP_201_CREATED)
    
    except Exception as e:
        logger.error(f"Error saving subtitles: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_sentence(request):
    """Endpoint to add a sentence from a subtitle"""
    # Get request data
    text = request.data.get('text')
    translation = request.data.get('translation', '')
    subtitle_id = request.data.get('subtitle_id')
    
    if not text or not subtitle_id:
        return Response({
            'error': 'Missing required fields: text or subtitle_id'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Get subtitle
    try:
        subtitle = Subtitle.objects.get(id=subtitle_id)
        # Ensure subtitle belongs to current user
        if subtitle.video.user != request.user:
            return Response({
                'error': 'Subtitle does not belong to this user'
            }, status=status.HTTP_403_FORBIDDEN)
    except Subtitle.DoesNotExist:
        return Response({
            'error': 'Subtitle not found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Create or update sentence
    from django.db import transaction, OperationalError
    import time
    
    max_retries = 3
    retry_count = 0
    retry_delay = 0.5  # Initial delay 0.5 seconds
    
    while retry_count < max_retries:
        try:
            # Use regular transaction instead of select_for_update to reduce locking
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
                
                # If existing sentence needs update
                if not created and (sentence.translation != translation or 
                                    sentence.video != subtitle.video or
                                    sentence.start_time != subtitle.start_time or
                                    sentence.end_time != subtitle.end_time):
                    sentence.translation = translation
                    sentence.video = subtitle.video
                    sentence.start_time = subtitle.start_time
                    sentence.end_time = subtitle.end_time
                    sentence.save()
            
            # If successful, break loop
            break
            
        except OperationalError as e:
            # Check if database is locked
            if "database is locked" in str(e) and retry_count < max_retries - 1:
                # Increase retry count and wait
                retry_count += 1
                logger.warning(f"Database locked, retrying ({retry_count}/{max_retries})...")
                # Use exponential backoff, doubling delay each time
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                # If other error or max retries reached, re-raise exception
                logger.error(f"Database error after {retry_count} retries: {str(e)}")
                raise
    
    # Return response
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
        # Get video by URL
        video_url = f'https://www.youtube.com/watch?v={video_id}'
        video = get_object_or_404(Video, url=video_url, user=request.user)
        
        # Find subtitle that contains the current time
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
        
        # If sentence already exists but not associated with video or time, update
        if not created and (not sentence.video or sentence.start_time is None):
            sentence.video = video
            sentence.start_time = subtitle.start_time
            sentence.end_time = subtitle.end_time
            sentence.save()
        
        # We no longer need to create SentenceReference, as Sentence is directly associated with video and timestamp
        
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

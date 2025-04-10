from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.generic import ListView, DetailView, View
from django.utils.decorators import method_decorator
from django.contrib import messages
from django.http import JsonResponse, HttpResponse, Http404

import os
from youdao.spider import YoudaoSpider
from youdao.config import VOICE_DIR
from .word_models import WordDefinition, UserWord, WordReference
from .models import Video, Subtitle
from .word_adapter import get_user_words, delete_word, update_word, toggle_favorite, delete_all_words as adapter_delete_all_words, get_word_detail, check_word_favorite
from .word_extractor import WordExtractor

@method_decorator(login_required, name='dispatch')
class DictionaryView(ListView):
    """Personal dictionary view - displays all words for the user"""
    template_name = 'api/dictionary.html'
    context_object_name = 'words'
    paginate_by = 10
    
    def get_queryset(self):
        # Use adapter to get user's words, sorted by frequency
        # Handle filtering and sorting
        search_query = self.request.GET.get('q')
        sort_by = self.request.GET.get('sort', 'frequency')
        
        # Use adapter to get word list - no pagination parameters needed, ListView handles pagination
        words = get_user_words(self.request.user, search_query=search_query, sort_by=sort_by)
        return words
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Add sorting and search information
        context['current_sort'] = self.request.GET.get('sort', 'frequency')
        context['search_query'] = self.request.GET.get('q', '')
        
        # Add dictionary statistics - using new model
        context['total_words'] = UserWord.objects.filter(user=self.request.user).count()
        
        # Check if each word is favorited - this part should already be handled in get_user_words, but kept for consistency
        words = context['words']
        for i, word in enumerate(words):
            # Check if word is favorited - note: word is a dictionary, not an object
            result = check_word_favorite(self.request.user, word)
            words[i]['is_favorite'] = result.get('is_favorite', False)
        
        return context


@method_decorator(login_required, name='dispatch')
class WordDetailView(DetailView):
    """Word detail view - displays all context references for a word"""
    template_name = 'api/word_detail.html'
    context_object_name = 'word'
    
    def get_object(self, queryset=None):
        # Get primary key from URL
        pk = self.kwargs.get('pk')
        
        try:
            # Output debug information
            print(f"Processing word ID: {pk}")
            
            # Check if the ID is in the format "the_hash"
            if pk.startswith('the_'):
                # This is the new format where the word text isn't in the ID
                hash_code = pk[4:]  # Extract hash part (after "the_")
                print(f"ID is in the_hash format, hash: {hash_code}")
                
                # Try to find the word based on the hash code by checking all user's words
                from .word_adapter import generate_secure_word_id
                
                # Get all user's word definitions
                user_words = UserWord.objects.filter(user=self.request.user).select_related('word_definition')
                print(f"Checking {user_words.count()} user words")
                
                # Find the word that matches the hash
                for user_word in user_words:
                    word_text = user_word.word_definition.text
                    expected_id = generate_secure_word_id(word_text, self.request.user.id)
                    expected_hash = expected_id.split('_')[-1]
                    
                    if hash_code == expected_hash:
                        # Found matching word
                        print(f"Found matching word: {word_text}")
                        word_def = user_word.word_definition
                        break
                else:
                    # No match found
                    raise Http404("Word not found")
                
            else:
                # Try to parse the primary key in the format "word_hash"
                parts = pk.split('_')
                print(f"Parsed parts: {parts}, length: {len(parts)}")
                
                if len(parts) < 2:
                    raise ValueError("Invalid word ID format")
                    
                # The word part is all parts except the last one (handle words containing underscores)
                word_text = '_'.join(parts[:-1])
                hash_code = parts[-1]
                
                print(f"Parsed word text: {word_text}, hash code: {hash_code}")
                
                # Use word text to find
                word_def = WordDefinition.objects.filter(text=word_text).first()
                print(f"Found word definition: {word_def}")
                
                if not word_def:
                    raise Http404(f"Word not found: {word_text}")
            
            # Find the user's word relationship
            user_word = UserWord.objects.filter(
                user=self.request.user,
                word_definition=word_def
            ).first()
            
            print(f"Found user word: {user_word}")
            
            if not user_word:
                raise Http404(f"Your dictionary does not contain the word: {word_def.text}")

            # Validate hash code (optional, for added security)
            from .word_adapter import generate_secure_word_id
            expected_id = generate_secure_word_id(word_def.text, self.request.user.id)
            expected_hash = expected_id.split('_')[-1]
            
            print(f"Expected hash: {expected_hash}, actual hash: {hash_code}")
            
            if hash_code != expected_hash:
                raise Http404("Invalid word access request")
                
            # Build complete word data
            word_data = {
                'id': expected_id,
                'text': word_def.text,
                'language': word_def.language,
                'translation': word_def.translation,
                'uk_phonetic': word_def.uk_phonetic,
                'us_phonetic': word_def.us_phonetic,
                'phonetic': word_def.phonetic,
                'has_audio': word_def.has_audio,
                'web_translation': word_def.web_translation,
                'notes': user_word.notes,
                'frequency': WordReference.objects.filter(user_word=user_word).count(),  # 使用引用计数替代frequency字段
                'is_favorite': user_word.is_favorite,
                'created_at': user_word.created_at
            }
            
            return word_data
            
        except Exception as e:
            # Print detailed error information for debugging
            import traceback
            print(f"Error processing word ID: {str(e)}")
            print(traceback.format_exc())
            
            # If parsing fails, try using adapter method
            result = get_word_detail(self.request.user, pk)
            if not result['success']:
                raise Http404(result['message'])
            return result['word']
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        word = self.get_object()
        
        # Get the is_favorite property correctly, depending on whether word is a dictionary or an object
        if isinstance(word, dict):
            context['is_favorite'] = word.get('is_favorite', False)
        else:
            context['is_favorite'] = getattr(word, 'is_favorite', False)
        
        # Get user authentication token, if not in session, create one
        if 'auth_token' not in self.request.session:
            from rest_framework.authtoken.models import Token
            token, created = Token.objects.get_or_create(user=self.request.user)
            self.request.session['auth_token'] = token.key
        
        try:
            # Get current word object
            word = self.object
            word_text = word['text']
            
            # Try to find user word and related references
            try:
                # Find word definition
                word_def = WordDefinition.objects.filter(text=word_text).first()
                
                if word_def:
                    # Find user word
                    user_word = UserWord.objects.filter(
                        user=self.request.user,
                        word_definition=word_def
                    ).first()
                    
                    if user_word:
                        # Find word references
                        word_references = WordReference.objects.filter(
                            user_word=user_word
                        ).select_related('subtitle', 'subtitle__video').order_by('-created_at')
                        
                        if word_references.exists():
                            # Extract video ID from URL
                            video_url_map = {}
                            normalized_references = []
                            
                            for ref in word_references:
                                video = ref.subtitle.video
                                video_url = video.url
                                # Extract video ID from URL
                                if 'youtube.com' in video_url or 'youtu.be' in video_url:
                                    video_id = None
                                    if 'v=' in video_url:
                                        video_id = video_url.split('v=')[1].split('&')[0]
                                    elif 'youtu.be/' in video_url:
                                        video_id = video_url.split('youtu.be/')[1].split('?')[0]
                                        
                                    if video_id:
                                        if video_id not in video_url_map:
                                            video_url_map[video_id] = []
                                        video_url_map[video_id].append(ref)
                                else:
                                    # For non-Youtube videos, use full URL as key
                                    if video_url not in video_url_map:
                                        video_url_map[video_url] = []
                                    video_url_map[video_url].append(ref)
                            
                            # Pass grouped references to template
                            context['video_url_map'] = video_url_map
                            # Pass original references to template
                            context['references'] = word_references
                            # Use reference count instead of manually incremented frequency
                            word['frequency'] = word_references.count()
                            context['model_changed'] = False
                        else:
                            # No references found, but not due to model change
                            word['frequency'] = 0  # If no references, frequency is 0
                            context['model_changed'] = False
                    else:
                        # Set to not display "Model updated" message
                        context['model_changed'] = False
                else:
                    # Set to not display "Model updated" message
                    context['model_changed'] = False
                    
            except Exception as e:
                # When an error occurs, do not display "Model updated" message
                context['model_changed'] = False
                context['error_message'] = str(e)
                
        except Exception as e:
            print(f"Error getting context data: {str(e)}")
            # Ensure even if an error occurs, basic context is provided
            context['references'] = []
            context['reference_count'] = 0
            context['video_count'] = 0
        
        return context
        
    def _extract_youtube_id(self, url):
        """Extract YouTube video ID from URL"""
        import re
        youtube_regex = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
        match = re.search(youtube_regex, url)
        return match.group(1) if match else ''


from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

class WordPronunciationView(APIView):
    """Provide word pronunciation API view
    Support session and token authentication, compatible with web and Chrome extension
    """
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    # Allow unauthenticated users to access, but will attempt to authenticate first
    permission_classes = []  # Remove IsAuthenticated
    
    def get(self, request, text):
        text = text.lower()
        print(f"Trying to get pronunciation for word '{text}'")
        
        # Check if token is passed via URL parameter
        token_param = request.GET.get('token')
        print(f"Query parameters: {request.GET}")
        print(f"Token parameter: {token_param}")
        
        if token_param and not request.user.is_authenticated:
            try:
                # Get user from token parameter
                from rest_framework.authtoken.models import Token
                token_obj = Token.objects.get(key=token_param)
                request.user = token_obj.user
                print(f"Authenticated user via URL parameter token: {request.user.username}")
            except Exception as e:
                print(f"Token parameter authentication failed: {str(e)}")
        
        # Check if the word belongs to the current user
        word = None
        if request.user.is_authenticated:
            try:
                word = WordDefinition.objects.get(text=text)
                print(f"Found word: {text}")
            except WordDefinition.DoesNotExist:
                print(f"Word not found: {text}")
                # If the word is not in the database, try to get the pronunciation immediately
                word = None
        else:
            print("User not authenticated, trying to get pronunciation directly")
            
        try:
            # Check if the pronunciation file already exists
            voice_file_path = os.path.join(VOICE_DIR, text + '.mp3')
            if not os.path.isfile(voice_file_path):
                print(f"Pronunciation file does not exist, trying to download: {voice_file_path}")
                # Explicitly specify download pronunciation
                spider = YoudaoSpider(text)
                voice_file_path = spider.get_voice(text, download=True)
                print(f"Download result: {voice_file_path}")
                
                # If successfully downloaded and word exists, update word's has_audio flag
                if word and voice_file_path:
                    word.has_audio = True
                    word.save()
                    print(f"Updating word '{text}' has_audio flag")
            else:
                print(f"Pronunciation file already exists: {voice_file_path}")
            
            # If pronunciation file exists, provide it to the user
            if voice_file_path and os.path.isfile(voice_file_path):
                print(f"Providing pronunciation file: {voice_file_path}")
                with open(voice_file_path, 'rb') as f:
                    # Read audio file content
                    audio_data = f.read()
                    
                    # Create response object
                    response = HttpResponse(audio_data, content_type='audio/mpeg')
                    
                    # Add necessary response headers, allow cross-origin access
                    response['Access-Control-Allow-Origin'] = '*'
                    response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                    response['Access-Control-Allow-Headers'] = 'Origin, Content-Type, Accept, Authorization'
                    response['Content-Disposition'] = f'inline; filename="{text}.mp3"'
                    
                    # Tell the browser this is not a download file but can be played directly
                    response['X-Content-Type-Options'] = 'nosniff'
                    
                    # Record return size
                    print(f"Returning audio file size: {len(audio_data)} bytes")
                    
                    return response
            else:
                print(f"Pronunciation file does not exist: {voice_file_path}")
                raise Http404("Word pronunciation does not exist")
                
        except Exception as e:
            print(f"Failed to get pronunciation for word '{text}': {str(e)}")
            raise Http404(f"Failed to get word pronunciation: {str(e)}")


@method_decorator(login_required, name='dispatch')
class FavoriteDictionaryView(ListView):
    template_name = 'api/dictionary.html'
    context_object_name = 'words'
    paginate_by = 10
    
    def get_queryset(self):
        # Get sort and search parameters
        sort_by = self.request.GET.get('sort', 'newest')
        search_query = self.request.GET.get('q')
        
        # Use adapter to get word list, only favorites
        words = get_user_words(
            self.request.user, 
            search_query=search_query, 
            sort_by=sort_by, 
            favorites_only=True
        )
        
        return words
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Add view type marker and sort information
        context['is_favorite_view'] = True
        context['current_sort'] = self.request.GET.get('sort', 'newest')
        context['search_query'] = self.request.GET.get('q', '')
        
        # Add dictionary statistics
        context['total_words'] = UserWord.objects.filter(user=self.request.user, is_favorite=True).count()
        
        return context


from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def verify_token(request):
    """Verify token validity"""
    auth_header = request.headers.get('Authorization', '')
    print(f"Received verification request - authentication header: {auth_header}")
    print(f"Authentication user information: {request.user}, authentication method: {request.auth}")
    
    # Try to manually verify token
    if auth_header.startswith('Token '):
        token_key = auth_header.split(' ')[1]
        try:
            from rest_framework.authtoken.models import Token
            token = Token.objects.get(key=token_key)
            return Response({
                'status': 'success',
                'message': 'Token verification successful',
                'user_id': token.user.id,
                'username': token.user.username
            })
        except Exception as e:
            return Response({
                'status': 'error',
                'message': f'Token verification failed: {str(e)}',
                'received_token': token_key
            }, status=400)
    
    return Response({
        'status': 'error',
        'message': 'Token missing or format incorrect',
        'received_header': auth_header
    }, status=400)

from rest_framework.authtoken.models import Token

def get_user_from_token(request):
    """Extracts token from request and returns the corresponding user"""
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header:
        print("No authentication header provided")
        return None
        
    if not auth_header.startswith('Token '):
        print(f"Invalid authentication header format: {auth_header}")
        return None
    
    token_key = auth_header.split(' ')[1]
    
    try:
        token = Token.objects.get(key=token_key)
        return token.user
    except Token.DoesNotExist:
        return None
    except Exception as e:
        return None

def verify_token(request):
    """Verifies token and returns user information for debugging"""
    user = get_user_from_token(request)
    
    if user:
        return JsonResponse({
            'status': 'success',
            'message': 'Token verification successful',
            'user_id': user.id,
            'username': user.username,
            'is_authenticated': user.is_authenticated
        })
    else:
        return JsonResponse({
            'status': 'error',
            'message': 'Token invalid or does not exist',
            'auth_header': request.headers.get('Authorization', 'None')
        }, status=401)

def get_favorite_words(request):
    """Gets a list of the user's favorite words"""
    user = get_user_from_token(request)
    
    if not user or not user.is_authenticated:
        return JsonResponse({
            'status': 'error',
            'message': 'User not authenticated',
        }, status=401)
    
    try:
        # Get user's favorite words using new model UserWord
        favorite_words = UserWord.objects.filter(user=user, is_favorite=True).select_related('word_definition')
        
        # Prepare response data
        words_data = [{
            'id': f"new_{user_word.id}",
            'text': user_word.word_definition.text,
            'phonetic': user_word.word_definition.phonetic,
            'translation': user_word.word_definition.translation
        } for user_word in favorite_words]
        
        return JsonResponse({
            'status': 'success',
            'count': len(words_data),
            'words': words_data
        })
    except Exception as e:
        print(f"Error getting favorite words: {str(e)}")
        return JsonResponse({
            'status': 'error',
            'message': f'Error getting favorite words: {str(e)}'
        }, status=500)

@api_view(['POST', 'GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def check_favorite_word(request):
    """Check if a word is already favorited"""
    user = get_user_from_token(request)
    
    # Support POST and GET requests
    if request.method == 'POST':
        word_id = request.POST.get('word_id')
        word_text = request.POST.get('word')
    else:
        word_id = request.GET.get('word_id')
        word_text = request.GET.get('word')
    
    if not word_id and not word_text:
        return JsonResponse({'status': 'error', 'message': 'Missing required parameters'}, status=400)
    
    try:
        # Build word information for adapter
        word_info = {}
        if word_id:
            word_info['id'] = word_id
        elif word_text:
            word_info['text'] = word_text.lower()
        
        # Use adapter to check word favorite status
        result = check_word_favorite(user, word_info)
        
        return JsonResponse({
            'status': 'success',
            'is_favorite': result['is_favorite'],
            'word_id': result['word_id']
        })
        
    except Exception as e:
        return JsonResponse({
            'status': 'error', 
            'message': str(e),
            'is_favorite': False
        }, status=500)

@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def toggle_favorite_word(request):
    """Add or remove a favorite word"""
    user = get_user_from_token(request)
    word_id = request.POST.get('word_id')
    word_text = request.POST.get('word')  # Add support for directly using word text
    action = request.POST.get('action')  # 'add-favorite' or 'remove-favorite'
    
    if not action or (not word_id and not word_text):
        return JsonResponse({'status': 'error', 'message': 'Missing required parameters'}, status=400)
    
    try:
        # Set operation type
        is_add = (action == 'add-favorite')
        
        # Directly call toggle_favorite function, pass word_id or word_text
        result = toggle_favorite(user, word_id, word_text)
        
        if result['success']:
            return JsonResponse({
                'status': 'success',
                'message': result['message'],
                'word_id': result.get('word_id', word_id),  # If result doesn't have word_id, use word_id from request
                'is_favorite': result['is_favorite']
            })
        else:
            return JsonResponse({'status': 'error', 'message': result['message']}, status=400)
            
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
def extract_words_view(request, video_id=None):
    """Extract words from video or all videos"""
    if request.method == 'POST':
        language = request.POST.get('language', 'en')
        force_reprocess = request.POST.get('force_reprocess') == 'on'
        
        try:
            extractor = WordExtractor(request.user)
            
            if video_id:
                # Process single video
                video = get_object_or_404(Video, id=video_id, user=request.user)
                
                if force_reprocess:
                    # Delete existing word associations
                    subtitles = Subtitle.objects.filter(video=video)
                    # Use new model, delete user words associated with these subtitles
                    # Note: due to new model architecture, words and subtitles are not directly linked, this operation may need to be moved to WordExtractor
                word_count = extractor.process_video(video)
                messages.success(request, f'Successfully extracted words from video {video.title}!')
                return redirect('video_detail', pk=video_id)
            else:
                # Process all videos, performance optimization mode, no pronunciation file download
                word_count = extractor.process_all_videos(force_reprocess)
                messages.success(request, f'Successfully processed all videos, extracted words!')
                return redirect('dictionary')
                
        except Exception as e:
            messages.error(request, f'Error extracting words: {str(e)}')
            if video_id:
                return redirect('video_detail', pk=video_id)
            else:
                return redirect('dictionary')
    
    # GET request, display form
    context = {
        'video_id': video_id
    }
    
    if video_id:
        video = get_object_or_404(Video, id=video_id, user=request.user)
        context['video'] = video
    
    return render(request, 'api/extract_words_form.html', context)


@login_required
def update_word_view(request, word_id):
    """Update word translation and notes"""
    # Get word to display form
    try:
        word = UserWord.objects.get(id=word_id, user=request.user)
    except UserWord.DoesNotExist:
        messages.error(request, "Word does not exist or does not belong to current user")
        return redirect('dictionary')
    
    if request.method == 'POST':
        # Prepare update data
        updates = {
            'translation': request.POST.get('translation', ''),
            'notes': request.POST.get('notes', '')
        }
        
        # Use adapter to update word
        result = update_word(request.user, word_id, updates)
        
        if result['success']:
            messages.success(request, result['message'])
            
            # If Ajax request, return JSON response
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'success': True,
                    'message': result['message'],
                    'word': result['word']
                })
            
            # Redirect back to word detail page
            return redirect('word_detail', pk=word_id)
        else:
            messages.error(request, result['message'])
            # If Ajax request, return error response
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'success': False,
                    'message': result['message']
                })
    
    context = {
        'word': word
    }
    
    return render(request, 'api/update_word_form.html', context)


@login_required
def delete_word_view(request, word_id):
    """Delete a word"""
    if request.method == 'POST':
        # Use adapter to delete word
        result = delete_word(request.user, word_id)
        
        if result['success']:
            messages.success(request, result['message'])
        else:
            messages.error(request, result['message'])
            
        # Redirect back to dictionary page
        return redirect('dictionary')
    
    # If not POST request, redirect to dictionary page
    return redirect('dictionary')


@login_required
def delete_all_words(request):
    """Delete all words and word references for the user"""
    if request.method == 'POST':
        # Use adapter to delete all words
        result = adapter_delete_all_words(request.user)
        
        if result['success']:
            messages.success(request, result['message'])
        else:
            messages.error(request, result['message'])
            
        return redirect('dictionary')
    
    # For GET request, display confirmation page
    word_count = UserWord.objects.filter(user=request.user).count()
    return render(request, 'api/delete_all_words_confirm.html', {'word_count': word_count})


@login_required
def get_video_subtitles(request, pk=None, video_id=None):
    """Get all subtitles for a video as JSON data
    Supports specifying video via pk or video_id parameter
    """
    try:
        # Ensure video belongs to current user
        if pk is not None:
            # If using pk parameter
            video = get_object_or_404(Video, id=pk, user=request.user)
            video_id = pk  # For compatibility with return value
        elif video_id is not None:
            # If using video_id parameter
            video = get_object_or_404(Video, id=video_id, user=request.user)
        else:
            return JsonResponse({
                'success': False,
                'message': 'Missing required parameters'
            }, status=400) 
        
        # Get all subtitles for this video
        subtitles = Subtitle.objects.filter(video=video).order_by('start_time')
        
        # Format subtitle data as JSON
        subtitles_data = [{
            'id': subtitle.id,
            'text': subtitle.text,
            'start_time': subtitle.start_time,
            'end_time': subtitle.end_time
        } for subtitle in subtitles]
        
        return JsonResponse({
            'success': True,
            'video_id': video_id,
            'video_title': video.title,
            'subtitles_count': len(subtitles_data),
            'subtitles': subtitles_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Error getting subtitles: {str(e)}'
        }, status=400)

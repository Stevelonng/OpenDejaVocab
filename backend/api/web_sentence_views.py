from django.views.generic import ListView
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.db.models import Count
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
import re
import math
from .models import Sentence, Video

@method_decorator(login_required, name='dispatch')
class SentenceListView(ListView):
    """Display all sentences saved by the user, grouped by video"""
    model = Sentence
    template_name = 'api/sentence_list.html'
    context_object_name = 'video_sentences'
    
    def extract_youtube_id(self, url):
        """Extract YouTube video ID from URL"""
        if not url:
            return ''
        
        youtube_regex = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/)|youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})'
        match = re.search(youtube_regex, url)
        
        if not match:
            return ''
            
        return match.group(1)
    
    def format_time(self, seconds):
        """Format seconds to MM:SS.MS format"""
        if seconds is None:
            return '00:00'
        
        # Round to 1 decimal place
        seconds = round(seconds, 1)
        
        minutes = math.floor(seconds / 60)
        remaining_seconds = seconds % 60
        
        return f"{minutes:02d}:{remaining_seconds:04.1f}"
    
    def get_queryset(self):
        # Get videos with at least one sentence, along with their sentence count
        videos_with_sentences = Video.objects.filter(
            sentences__user=self.request.user
        ).annotate(
            sentence_count=Count('sentences')
        ).order_by('-created_at')
        
        result = []
        for video in videos_with_sentences:
            # Get all sentences for this video
            sentences = Sentence.objects.filter(
                user=self.request.user,
                video=video
            ).order_by('start_time')
            
            # Extract YouTube ID
            youtube_id = self.extract_youtube_id(video.url)
            
            # Process each sentence to add additional info
            processed_sentences = []
            for sentence in sentences:
                processed_sentences.append({
                    'id': sentence.id,
                    'text': sentence.text,
                    'translation': sentence.translation,
                    'start_time': sentence.start_time,
                    'end_time': sentence.end_time,
                    'formatted_time': self.format_time(sentence.start_time),
                    'formatted_end_time': self.format_time(sentence.end_time),
                    'created_at': sentence.created_at
                })
            
            # Add to result with video info and sentences
            result.append({
                'video': video,
                'youtube_id': youtube_id,
                'sentences': processed_sentences,
                'sentence_count': video.sentence_count
            })
        
        return result
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Get the auth token for the YouTube API
        if self.request.user.is_authenticated:
            from rest_framework.authtoken.models import Token
            token, _ = Token.objects.get_or_create(user=self.request.user)
            context['token'] = token.key
        return context


@login_required
def delete_sentence(request, sentence_id):
    """Delete a sentence by its ID"""
    # Get the sentence object or return 404
    sentence = get_object_or_404(Sentence, id=sentence_id, user=request.user)
    
    # Handle both AJAX and form submissions
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        try:
            # Delete the sentence
            sentence.delete()
            
            # Return success response
            return JsonResponse({
                'status': 'success',
                'message': 'The sentence was successfully deleted'
            })
        except Exception as e:
            # Return error response
            return JsonResponse({
                'status': 'error',
                'message': f'Failed to delete sentence: {str(e)}'
            }, status=400)
    else:
        # For form submissions (POST requests)
        if request.method == 'POST':
            try:
                # Delete the sentence
                sentence.delete()
                messages.success(request, 'The sentence was successfully deleted')
            except Exception as e:
                messages.error(request, f'Failed to delete sentence: {str(e)}')
            
            # Redirect back to sentence list page
            return redirect('sentence_list')
        else:
            # For direct GET requests, redirect to sentence list
            # This should not happen with our current UI but handled for completeness
            return redirect('sentence_list')

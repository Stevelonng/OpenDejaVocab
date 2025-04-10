from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.views.generic import TemplateView, View
from django.utils import timezone
from django.http import JsonResponse
from datetime import timedelta

from .word_models import UserWord, WordReference
from .word_adapter import generate_secure_word_id


@method_decorator(login_required, name='dispatch')
class WordStatisticsView(TemplateView):
    """Word statistics view"""
    template_name = 'api/word_statistics.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Get user
        user = self.request.user
        
        # Get selected time range (days)
        days = self.request.GET.get('days', '1')
        try:
            days = int(days)
        except ValueError:
            days = 1
            
        context['days'] = days
        
        # Set time range
        now = timezone.now()
        start_date = None
        if days > 0:
            start_date = now - timedelta(days=days)
            
        # 1. Gets the total number of words for the user
        context['total_unique_words'] = UserWord.objects.filter(user=user).count()
        
        # 2. Gets the count of unique words within the selected time range
        user_words_query = UserWord.objects.filter(user=user)
        if start_date:
            unique_words_count = user_words_query.filter(created_at__gte=start_date).count()
        else:
            unique_words_count = user_words_query.count()
        
        context['unique_words_count'] = unique_words_count
        
        # 3. Gets the count of new words added within the selected time range
        if start_date:
            new_words_count = user_words_query.filter(created_at__gte=start_date).count()
        else:
            new_words_count = 0  # If all time range, no "new words"
            
        context['new_words_count'] = new_words_count
        
        # No longer load all words at once, instead get dynamically via API
        context['unique_words'] = []
        context['new_words'] = []
        context['all_word_occurrences'] = []
        context['total_word_occurrences'] = 0
        
        # Forward Chrome extension ID for possible communication with extension
        context['extension_id'] = 'fbkhlnenfchhkkmcodebhiiklcpdjehj'
        
        return context


@method_decorator(login_required, name='dispatch')
class WordListAPIView(View):
    """Provides paginated word list data API"""
    
    def get(self, request):
        # Get parameters
        list_type = request.GET.get('type', 'unique')  # unique or new
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 10))
        days = request.GET.get('days', '1')
        
        try:
            days = int(days)
        except ValueError:
            days = 1
        
        # Set time range
        now = timezone.now()
        start_date = None
        if days > 0:
            start_date = now - timedelta(days=days)
        
        # Query user words
        user_words_query = UserWord.objects.filter(user=request.user).select_related('word_definition')
        
        # Filter by type
        if list_type == 'new' and start_date:
            # New words only show words added within the time range
            filtered_words = user_words_query.filter(created_at__gte=start_date)
        elif list_type == 'unique' and start_date:
            # Unique words show words encountered within the time range
            filtered_words = user_words_query.filter(created_at__gte=start_date)
        else:
            # All time range
            filtered_words = user_words_query
        
        # Calculate total count and total pages
        total_count = filtered_words.count()
        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
        
        # Pagination
        start = (page - 1) * page_size
        end = start + page_size
        paginated_words = filtered_words[start:end]
        
        # Build result data
        word_list = []
        for user_word in paginated_words:
            word_def = user_word.word_definition
            
            # Calculate word occurrence count in references
            reference_count = WordReference.objects.filter(user_word=user_word).count()
            
            # Generate secure word ID format
            secure_word_id = generate_secure_word_id(word_def.text, request.user.id)
            
            word_data = {
                'id': secure_word_id,
                'text': word_def.text,
                'language': word_def.language,
                'translation': word_def.translation,
                'phonetic': word_def.phonetic,
                'uk_phonetic': word_def.uk_phonetic, 
                'us_phonetic': word_def.us_phonetic,
                'web_translation': word_def.web_translation,
                'notes': user_word.notes,
                'frequency': reference_count,
                'created_at': user_word.created_at.strftime('%Y-%m-%d %H:%M'),
                'occurrence_count': reference_count,
                'is_new': user_word.created_at >= start_date if start_date else False,
                'is_favorite': user_word.is_favorite
            }
            word_list.append(word_data)
        
        # Return JSON response
        return JsonResponse({
            'words': word_list,
            'total_count': total_count,
            'total_pages': total_pages,
            'current_page': page,
            'page_size': page_size
        })

from django.shortcuts import render
from .word_models import UserWord
from .models import Sentence

def home_view(request):
    """
    Home page view, displaying application introduction and basic functions.
    For logged-in users, display their learning overview data.
    """
    context = {}
    
    # If the user is logged in, add personal statistics data
    if request.user.is_authenticated:
        # Query the user's dictionary size
        word_count = UserWord.objects.filter(user=request.user).count()
        # Query the user's sentence count
        sentence_count = Sentence.objects.filter(user=request.user).count()
        # Query the user's favorite word count
        favorite_count = UserWord.objects.filter(user=request.user, is_favorite=True).count()
        
        context.update({
            'word_count': word_count,
            'sentence_count': sentence_count,
            'favorite_count': favorite_count
        })
        
    return render(request, 'api/home.html', context)

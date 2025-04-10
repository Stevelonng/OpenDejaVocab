from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.generic import ListView, DetailView
from django.utils.decorators import method_decorator
from django.http import HttpResponse
from django.db.models import Count
from django.contrib.auth.models import User
import re
import csv
import threading
from .models import Video, Subtitle
from .word_models import UserWord


def login_view(request):
    """Handle user login"""
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            
            # Get or create user token and store in session
            from rest_framework.authtoken.models import Token
            token, created = Token.objects.get_or_create(user=user)
            request.session['auth_token'] = token.key
            
            messages.success(request, f'Welcome back, {username}!')
            return redirect('dashboard')
        else:
            messages.error(request, 'Invalid username or password.')
    
    return render(request, 'api/login.html')


def register_view(request):
    """Handle user registration"""
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        password2 = request.POST.get('password2')
        
        if password != password2:
            messages.error(request, 'The two passwords do not match.')
            return render(request, 'api/register.html')
            
        if User.objects.filter(username=username).exists():
            messages.error(request, 'Username already exists.')
            return render(request, 'api/register.html')
        
        # Create user
        user = User.objects.create_user(username=username, email=email, password=password)
        login(request, user)
        
        # Get or create user token and store in session
        from rest_framework.authtoken.models import Token
        token, created = Token.objects.get_or_create(user=user)
        request.session['auth_token'] = token.key
        messages.success(request, f'Account created successfully! Welcome, {username}!')
        return redirect('dashboard')
    
    return render(request, 'api/register.html')


def logout_view(request):
    """Handle user logout"""
    logout(request)
    messages.info(request, 'You have successfully logged out.')
    return redirect('login')


@method_decorator(login_required, name='dispatch')
class DashboardView(ListView):
    """Display all videos collected by the user"""
    model = Video
    template_name = 'api/dashboard.html'
    context_object_name = 'videos'
    paginate_by = 12
    
    def get_queryset(self):
        # No longer return all videos, we will handle it in get_context_data
        return Video.objects.filter(user=self.request.user) \
                           .annotate(subtitle_count=Count('subtitles')) \
                           .order_by('-created_at')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Obtain all videos
        all_videos = Video.objects.filter(user=self.request.user) \
                               .annotate(subtitle_count=Count('subtitles')) \
                               .order_by('-created_at')
        
        # Separate videos with and without subtitles
        videos_with_subtitles = []
        videos_without_subtitles = []
        
        for video in all_videos:
            # Add YouTube ID
            video.youtube_id = extract_youtube_id(video.url)
            
            # Group by subtitle count
            if video.subtitle_count > 0:
                videos_with_subtitles.append(video)
            else:
                videos_without_subtitles.append(video)
        
        # Add to context
        context['videos_with_subtitles'] = videos_with_subtitles
        context['videos_without_subtitles'] = videos_without_subtitles
        
        # Statistics
        context['total_videos'] = len(all_videos)
        context['total_with_subtitles'] = len(videos_with_subtitles)
        context['total_without_subtitles'] = len(videos_without_subtitles)
        
        return context


@method_decorator(login_required, name='dispatch')
class VideoDetailView(DetailView):
    """Display detail view of a single video with its subtitles"""
    model = Video
    template_name = 'api/video_detail.html'
    context_object_name = 'video'
    
    def get_queryset(self):
        # Only allow users to view their own videos
        return Video.objects.filter(user=self.request.user)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        video = self.get_object()
        context['subtitles'] = Subtitle.objects.filter(video=video).order_by('start_time')
        context['video'].youtube_id = extract_youtube_id(video.url)
        
        # Check if the video has already processed words
        has_processed_words = UserWord.objects.filter(
            references__subtitle__video=video
        ).exists()
        
        # Only start background word extraction if words haven't been processed
        if context['subtitles'].exists() and not has_processed_words:
            self.start_background_word_extraction(video)
        
        # Get user's authentication token and pass it to the frontend for API calls
        if self.request.user.is_authenticated:
            from rest_framework.authtoken.models import Token
            token, _ = Token.objects.get_or_create(user=self.request.user)
            context['token'] = token.key
        
        return context
    
    def start_background_word_extraction(self, video):
        """Start word extraction in the background"""
        def process_video_words(video_id, user_id):
            try:
                from django.contrib.auth.models import User
                from .models import Video
                from .word_extractor import WordExtractor
                
                # Re-get video and user objects (necessary in new thread)
                video = Video.objects.get(id=video_id)
                user = User.objects.get(id=user_id)
                
                # Initialize word extractor and process video
                extractor = WordExtractor(user)
                count = extractor.process_video(video)
                print(f"Word extraction completed: Extracted {count} words from video '{video.title}'")
            except Exception as e:
                print(f"Word extraction error: {str(e)}")
        
        # Start new thread
        thread = threading.Thread(
            target=process_video_words,
            args=(video.id, video.user.id)
        )
        thread.daemon = True
        thread.start()


@login_required
def download_subtitles(request, pk):
    """Download video subtitles as CSV file"""
    video = get_object_or_404(Video, pk=pk, user=request.user)
    subtitles = Subtitle.objects.filter(video=video).order_by('start_time')
    
    # Create CSV file
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{video.title.replace(" ", "_")}_subtitles.csv"'
    
    # Write CSV data
    writer = csv.writer(response)
    writer.writerow(['Start Time', 'End Time', 'Text'])
    
    for subtitle in subtitles:
        writer.writerow([
            format_time(subtitle.start_time), 
            format_time(subtitle.end_time), 
            subtitle.text
        ])
    
    return response


@login_required
def delete_video(request, pk):
    """Delete a video and all its subtitles, and clean up orphaned words"""
    if request.method == 'POST':
        video = get_object_or_404(Video, pk=pk, user=request.user)
        video_title = video.title
        
        # Delete video (will automatically delete related subtitles)
        video.delete()
        
        # Clean up orphaned words - may need to implement specialized cleanup function in word_adapter.py
        # Since data model has changed, this logic needs to be re-evaluated
        # For now, skip cleanup
        
        messages.success(request, f'Deleted video: {video_title}')
        return redirect('dashboard')
    
    # GET request, show confirmation page
    video = get_object_or_404(Video, pk=pk, user=request.user)
    return render(request, 'api/video_confirm_delete.html', {'video': video})


def format_time(seconds):
    """Format seconds to MM:SS.MS format"""
    minutes = int(seconds // 60)
    seconds_remainder = seconds % 60
    return f"{minutes:02d}:{seconds_remainder:05.2f}"


def extract_youtube_id(url):
    """Extract YouTube video ID from URL"""
    youtube_regex = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(youtube_regex, url)
    return match.group(1) if match else ''

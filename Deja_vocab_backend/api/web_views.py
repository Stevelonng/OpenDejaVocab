from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.generic import ListView, DetailView
from django.utils.decorators import method_decorator
from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.db.models import Count, Exists, OuterRef
from django.contrib.auth.models import User
import re
import csv
import io
import threading
from .models import Video, Subtitle
from .word_models import WordDefinition, UserWord
from .word_extractor import WordExtractor


def login_view(request):
    """Handle user login"""
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            
            # 获取或创建用户的认证令牌，并将其存储在会话中
            from rest_framework.authtoken.models import Token
            token, created = Token.objects.get_or_create(user=user)
            request.session['auth_token'] = token.key
            
            messages.success(request, f'欢迎回来，{username}!')
            return redirect('dashboard')
        else:
            messages.error(request, '用户名或密码错误。')
    
    return render(request, 'api/login.html')


def register_view(request):
    """Handle user registration"""
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        password2 = request.POST.get('password2')
        
        if password != password2:
            messages.error(request, '两次输入的密码不匹配。')
            return render(request, 'api/register.html')
            
        if User.objects.filter(username=username).exists():
            messages.error(request, '用户名已被使用。')
            return render(request, 'api/register.html')
        
        # 创建用户
        user = User.objects.create_user(username=username, email=email, password=password)
        login(request, user)
        
        # 获取或创建用户的认证令牌，并将其存储在会话中
        from rest_framework.authtoken.models import Token
        token, created = Token.objects.get_or_create(user=user)
        request.session['auth_token'] = token.key
        messages.success(request, f'账号创建成功！欢迎，{username}！')
        return redirect('dashboard')
    
    return render(request, 'api/register.html')


def logout_view(request):
    """Handle user logout"""
    logout(request)
    messages.info(request, '您已退出登录。')
    return redirect('login')


@method_decorator(login_required, name='dispatch')
class DashboardView(ListView):
    """Display all videos collected by the user"""
    model = Video
    template_name = 'api/dashboard.html'
    context_object_name = 'videos'
    paginate_by = 12
    
    def get_queryset(self):
        # 获取用户的视频并添加字幕数量
        return Video.objects.filter(user=self.request.user) \
                           .annotate(subtitle_count=Count('subtitles')) \
                           .order_by('-created_at')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # 为每个视频添加YouTube ID
        for video in context['videos']:
            video.youtube_id = extract_youtube_id(video.url)
        return context


@method_decorator(login_required, name='dispatch')
class VideoDetailView(DetailView):
    """Display detail view of a single video with its subtitles"""
    model = Video
    template_name = 'api/video_detail.html'
    context_object_name = 'video'
    
    def get_queryset(self):
        # 只允许用户查看自己的视频
        return Video.objects.filter(user=self.request.user)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        video = self.get_object()
        context['subtitles'] = Subtitle.objects.filter(video=video).order_by('start_time')
        context['video'].youtube_id = extract_youtube_id(video.url)
        
        # 检查该视频是否已提取单词
        has_processed_words = UserWord.objects.filter(
            references__subtitle__video=video
        ).exists()
        
        # 只有在没有处理过单词时才启动后台提取线程
        if context['subtitles'].exists() and not has_processed_words:
            self.start_background_word_extraction(video)
        
        # 获取用户的认证Token，传递给前端用于API调用
        if self.request.user.is_authenticated:
            from rest_framework.authtoken.models import Token
            token, _ = Token.objects.get_or_create(user=self.request.user)
            context['token'] = token.key
        
        return context
    
    def start_background_word_extraction(self, video):
        """在后台启动单词提取线程"""
        def process_video_words(video_id, user_id):
            try:
                from django.contrib.auth.models import User
                from .models import Video
                from .word_extractor import WordExtractor
                
                # 重新获取视频和用户对象（在新线程中必要）
                video = Video.objects.get(id=video_id)
                user = User.objects.get(id=user_id)
                
                # 初始化单词提取器并处理视频
                extractor = WordExtractor(user)
                count = extractor.process_video(video)
                print(f"后台提取完成: 从视频 '{video.title}' 中提取了 {count} 个单词")
            except Exception as e:
                print(f"后台单词提取错误: {str(e)}")
        
        # 启动新线程
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
    
    # 创建CSV文件
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{video.title.replace(" ", "_")}_subtitles.csv"'
    
    # 写入CSV数据
    writer = csv.writer(response)
    writer.writerow(['开始时间', '结束时间', '文本'])
    
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
        
        # 删除视频（会自动删除相关联的字幕）
        video.delete()
        
        # 清理用户的孤立单词 - 可能需要在word_adapter.py中实现专门的清理函数
        # 由于数据模型的变化，这部分逻辑需要重新评估
        # 现在先不执行清理操作
        
        messages.success(request, f'已删除视频: {video_title}')
        return redirect('dashboard')
    
    # GET请求，显示确认页面
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

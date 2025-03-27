from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.generic import ListView, DetailView, View
from django.utils.decorators import method_decorator
from django.contrib import messages
from django.http import JsonResponse, HttpResponse, Http404
from django.views.decorators.http import require_GET, require_POST
from django.urls import reverse
from django.utils import timezone
from django.db.models import F
from django.template.loader import render_to_string
from django.db import transaction

import json
import os
from youdao.spider import YoudaoSpider
from youdao.config import VOICE_DIR
from .word_models import WordDefinition, UserWord, WordReference
from .models import Video, Subtitle, Sentence
from .word_adapter import get_user_words, save_word, delete_word, update_word, batch_save_words, toggle_favorite, delete_all_words as adapter_delete_all_words, get_word_detail, check_word_favorite
from .word_extractor import WordExtractor

@method_decorator(login_required, name='dispatch')
class DictionaryView(ListView):
    """个人词典视图 - 显示用户的所有单词"""
    template_name = 'api/dictionary.html'
    context_object_name = 'words'
    paginate_by = 10
    
    def get_queryset(self):
        # 使用适配器获取用户的所有单词，按照频率排序
        # 处理过滤和排序
        search_query = self.request.GET.get('q')
        sort_by = self.request.GET.get('sort', 'frequency')
        
        # 使用适配器获取单词列表 - 不需要分页参数，因为ListView本身会处理分页
        words = get_user_words(self.request.user, search_query=search_query, sort_by=sort_by)
        return words
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # 添加排序和搜索信息
        context['current_sort'] = self.request.GET.get('sort', 'frequency')
        context['search_query'] = self.request.GET.get('q', '')
        
        # 添加词典统计信息 - 使用新模型
        context['total_words'] = UserWord.objects.filter(user=self.request.user).count()
        
        # 检查每个单词是否已收藏 - 这部分应该已经在get_user_words中处理了，但为确保一致性仍保留此代码
        words = context['words']
        for i, word in enumerate(words):
            # 检查单词是否被收藏 - 注意：word是字典，不是对象
            result = check_word_favorite(self.request.user, word)
            words[i]['is_favorite'] = result.get('is_favorite', False)
        
        return context


@method_decorator(login_required, name='dispatch')
class WordDetailView(DetailView):
    """单词详情视图 - 显示单词的所有上下文引用"""
    template_name = 'api/word_detail.html'
    context_object_name = 'word'
    
    def get_object(self, queryset=None):
        # 从URL中获取主键
        pk = self.kwargs.get('pk')
        
        try:
            # 输出调试信息
            print(f"正在处理单词ID: {pk}")
            
            # 尝试解析格式为 "word_hash" 的主键
            parts = pk.split('_')
            print(f"解析后的部分: {parts}, 长度: {len(parts)}")
            
            if len(parts) < 2:
                raise ValueError("无效的单词ID格式")
                
            # 单词部分是除了最后一个部分以外的所有部分（处理包含下划线的单词）
            word_text = '_'.join(parts[:-1])
            hash_code = parts[-1]
            
            print(f"解析出的单词文本: {word_text}, 哈希码: {hash_code}")
            
            # 在这里不需要验证哈希码，因为我们会检查当前用户是否有此单词
            # 如果不是当前用户的单词，无论哈希码是否正确，都会返回404
            
            # 使用单词文本查找
            word_def = WordDefinition.objects.filter(text=word_text).first()
            print(f"找到的单词定义: {word_def}")
            
            if not word_def:
                raise Http404(f"找不到单词: {word_text}")
                
            # 查找当前用户的单词关系
            user_word = UserWord.objects.filter(
                user=self.request.user,
                word_definition=word_def
            ).first()
            
            print(f"找到的用户单词: {user_word}")
            
            if not user_word:
                raise Http404(f"您的词典中没有单词: {word_text}")

            # 验证哈希码是否匹配（可选，增加额外安全性）
            from .word_adapter import generate_secure_word_id
            expected_id = generate_secure_word_id(word_text, self.request.user.id)
            expected_hash = expected_id.split('_')[-1]
            
            print(f"期望的哈希: {expected_hash}, 实际哈希: {hash_code}")
            
            if hash_code != expected_hash:
                raise Http404("无效的单词访问请求")
                
            # 构建完整的单词数据
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
            # 打印详细的异常信息以进行调试
            import traceback
            print(f"处理单词ID时出错: {str(e)}")
            print(traceback.format_exc())
            
            # 如果解析失败，尝试使用适配器方法
            result = get_word_detail(self.request.user, pk)
            if not result['success']:
                raise Http404(result['message'])
            return result['word']
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        word = self.get_object()
        
        # 根据word是字典还是对象不同，正确获取is_favorite属性
        if isinstance(word, dict):
            context['is_favorite'] = word.get('is_favorite', False)
        else:
            context['is_favorite'] = getattr(word, 'is_favorite', False)
        
        # 获取用户的认证令牌，如果会话中没有，则获取或创建一个
        if 'auth_token' not in self.request.session:
            from rest_framework.authtoken.models import Token
            token, created = Token.objects.get_or_create(user=self.request.user)
            self.request.session['auth_token'] = token.key
        
        try:
            # 获取当前单词对象
            word = self.object
            word_text = word['text']
            
            # 尝试查找用户单词和相关引用
            try:
                # 查找单词定义
                word_def = WordDefinition.objects.filter(text=word_text).first()
                
                if word_def:
                    # 查找用户单词
                    user_word = UserWord.objects.filter(
                        user=self.request.user,
                        word_definition=word_def
                    ).first()
                    
                    if user_word:
                        # 查找单词的上下文引用
                        word_references = WordReference.objects.filter(
                            user_word=user_word
                        ).select_related('subtitle', 'subtitle__video').order_by('-created_at')
                        
                        if word_references.exists():
                            # 将视频ID提取到URL为基础
                            video_url_map = {}
                            normalized_references = []
                            
                            for ref in word_references:
                                video = ref.subtitle.video
                                video_url = video.url
                                # 从URL中提取视频ID
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
                                    # 对于非YouTube视频，使用完整URL作为键
                                    if video_url not in video_url_map:
                                        video_url_map[video_url] = []
                                    video_url_map[video_url].append(ref)
                            
                            # 将分组后的引用传递给模板
                            context['video_url_map'] = video_url_map
                            # 将原始引用也传递给模板
                            context['references'] = word_references
                            # 使用引用计数替代手动增加的frequency
                            word['frequency'] = word_references.count()
                            context['model_changed'] = False
                        else:
                            # 没有找到引用，但不是因为模型变更
                            word['frequency'] = 0  # 如果没有引用，则频率为0
                            context['model_changed'] = False
                    else:
                        # 设置为不显示"模型已更新"消息
                        context['model_changed'] = False
                else:
                    # 设置为不显示"模型已更新"消息
                    context['model_changed'] = False
                    
            except Exception as e:
                # 出现错误时，也不显示"模型已更新"消息
                context['model_changed'] = False
                context['error_message'] = str(e)
                
        except Exception as e:
            print(f"获取上下文数据时出错: {str(e)}")
            # 确保即使发生错误，也会提供基本的上下文
            context['references'] = []
            context['reference_count'] = 0
            context['video_count'] = 0
        
        return context
        
    def _extract_youtube_id(self, url):
        """从 URL 中提取 YouTube 视频 ID"""
        import re
        youtube_regex = r'(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
        match = re.search(youtube_regex, url)
        return match.group(1) if match else ''


from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

class WordPronunciationView(APIView):
    """提供单词发音的API视图
    支持会话和Token认证，兼容网页和Chrome扩展端
    """
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    # 允许未登录用户访问，但会尝试先认证
    permission_classes = []  # 移除IsAuthenticated
    
    def get(self, request, text):
        text = text.lower()
        print(f"尝试获取单词 '{text}' 的发音")
        
        # 检查是否通过URL参数传递了token
        token_param = request.GET.get('token')
        print(f"查询参数: {request.GET}")
        print(f"获取的token参数: {token_param}")
        
        if token_param and not request.user.is_authenticated:
            try:
                # 从Token参数获取用户
                from rest_framework.authtoken.models import Token
                token_obj = Token.objects.get(key=token_param)
                request.user = token_obj.user
                print(f"通过URL参数token认证用户: {request.user.username}")
            except Exception as e:
                print(f"Token参数认证失败: {str(e)}")
        
        # 检查是否是当前用户的单词
        word = None
        if request.user.is_authenticated:
            try:
                word = WordDefinition.objects.get(text=text)
                print(f"找到单词: {text}")
            except WordDefinition.DoesNotExist:
                print(f"没有找到单词: {text}")
                # 如果数据库中没有这个单词，则尝试即时获取发音
                word = None
        else:
            print("用户未认证，尝试直接获取发音")
            
        try:
            # 检查发音文件是否已经存在
            voice_file_path = os.path.join(VOICE_DIR, text + '.mp3')
            if not os.path.isfile(voice_file_path):
                print(f"发音文件不存在，尝试下载: {voice_file_path}")
                # 显式指定下载发音
                spider = YoudaoSpider(text)
                voice_file_path = spider.get_voice(text, download=True)
                print(f"下载结果: {voice_file_path}")
                
                # 如果成功下载且单词存在，更新单词的has_audio标志
                if word and voice_file_path:
                    word.has_audio = True
                    word.save()
                    print(f"更新单词 '{text}' 的has_audio标志")
            else:
                print(f"发音文件已存在: {voice_file_path}")
            
            # 如果发音文件存在，提供给用户
            if voice_file_path and os.path.isfile(voice_file_path):
                print(f"提供发音文件: {voice_file_path}")
                with open(voice_file_path, 'rb') as f:
                    # 读取音频文件内容
                    audio_data = f.read()
                    
                    # 创建响应对象
                    response = HttpResponse(audio_data, content_type='audio/mpeg')
                    
                    # 添加必要的响应头，允许跨域访问
                    response['Access-Control-Allow-Origin'] = '*'
                    response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                    response['Access-Control-Allow-Headers'] = 'Origin, Content-Type, Accept, Authorization'
                    response['Content-Disposition'] = f'inline; filename="{text}.mp3"'
                    
                    # 告诉浏览器这不是一个下载文件而是可以直接播放
                    response['X-Content-Type-Options'] = 'nosniff'
                    
                    # 记录返回大小
                    print(f"返回音频文件大小: {len(audio_data)} 字节")
                    
                    return response
            else:
                print(f"发音文件不存在: {voice_file_path}")
                raise Http404("单词发音不存在")
                
        except Exception as e:
            print(f"获取单词 '{text}' 的发音出错: {str(e)}")
            raise Http404(f"获取单词发音失败: {str(e)}")


@method_decorator(login_required, name='dispatch')
class FavoriteDictionaryView(ListView):
    """收藏词典视图 - 显示用户收藏的所有单词"""
    template_name = 'api/dictionary.html'
    context_object_name = 'words'
    paginate_by = 10
    
    def get_queryset(self):
        # 获取排序参数
        sort_by = self.request.GET.get('sort', 'newest')
        search_query = self.request.GET.get('q')
        
        # 使用适配器获取单词列表，仅限收藏的单词
        words = get_user_words(
            self.request.user, 
            search_query=search_query, 
            sort_by=sort_by, 
            favorites_only=True
        )
        
        return words
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # 添加视图类型标记和排序信息
        context['is_favorite_view'] = True
        context['current_sort'] = self.request.GET.get('sort', 'newest')
        context['search_query'] = self.request.GET.get('q', '')
        
        # 添加词典统计
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
    """验证Token是否有效"""
    auth_header = request.headers.get('Authorization', '')
    print(f"收到验证请求 - 认证头: {auth_header}")
    print(f"认证用户信息: {request.user}, 认证方式: {request.auth}")
    
    # 尝试手动验证Token
    if auth_header.startswith('Token '):
        token_key = auth_header.split(' ')[1]
        try:
            from rest_framework.authtoken.models import Token
            token = Token.objects.get(key=token_key)
            return Response({
                'status': 'success',
                'message': '认证成功',
                'user_id': token.user.id,
                'username': token.user.username
            })
        except Exception as e:
            return Response({
                'status': 'error',
                'message': f'认证失败: {str(e)}',
                'received_token': token_key
            }, status=400)
    
    return Response({
        'status': 'error',
        'message': '缺少Token或格式不正确',
        'received_header': auth_header
    }, status=400)

from rest_framework.authtoken.models import Token
from django.contrib.auth import get_user_model

def get_user_from_token(request):
    """从请求中提取Token并返回相应的用户"""
    auth_header = request.headers.get('Authorization', '')
    # print(f"处理用户认证 - 收到认证头: {auth_header}")
    
    if not auth_header:
        print("没有提供认证头")
        return None
        
    if not auth_header.startswith('Token '):
        print(f"认证头格式不正确: {auth_header}")
        return None
    
    token_key = auth_header.split(' ')[1]
    # print(f"提取的Token值: {token_key}")
    
    try:
        token = Token.objects.get(key=token_key)
        # print(f"找到用户: {token.user.username}")
        return token.user
    except Token.DoesNotExist:
        # print(f"没有找到对应的Token: {token_key}")
        return None
    except Exception as e:
        # print(f"处理Token时出错: {str(e)}")
        return None

def verify_token(request):
    """验证Token并返回用户信息，用于调试"""
    user = get_user_from_token(request)
    
    if user:
        return JsonResponse({
            'status': 'success',
            'message': 'Token验证成功',
            'user_id': user.id,
            'username': user.username,
            'is_authenticated': user.is_authenticated
        })
    else:
        return JsonResponse({
            'status': 'error',
            'message': 'Token无效或不存在',
            'auth_header': request.headers.get('Authorization', 'None')
        }, status=401)

def get_favorite_words(request):
    """获取用户收藏的单词列表"""
    user = get_user_from_token(request)
    
    if not user or not user.is_authenticated:
        return JsonResponse({
            'status': 'error',
            'message': '用户未认证',
        }, status=401)
    
    try:
        # 获取用户收藏的单词，使用新模型UserWord
        favorite_words = UserWord.objects.filter(user=user, is_favorite=True).select_related('word_definition')
        
        # 准备响应数据
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
        print(f"获取收藏单词时出错: {str(e)}")
        return JsonResponse({
            'status': 'error',
            'message': f'获取收藏单词失败: {str(e)}'
        }, status=500)

@api_view(['POST', 'GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def check_favorite_word(request):
    """检查单词是否已被收藏"""
    user = request.user
    
    # 支持POST和GET请求
    if request.method == 'POST':
        word_id = request.POST.get('word_id')
        word_text = request.POST.get('word')
    else:
        word_id = request.GET.get('word_id')
        word_text = request.GET.get('word')
    
    if not word_id and not word_text:
        return JsonResponse({'status': 'error', 'message': '缺少必要参数'}, status=400)
    
    try:
        # 构建单词信息用于适配器
        word_info = {}
        if word_id:
            word_info['id'] = word_id
        elif word_text:
            word_info['text'] = word_text.lower()
        
        # 使用适配器检查单词是否被收藏
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
    """添加或移除收藏的单词"""
    user = request.user
    word_id = request.POST.get('word_id')
    word_text = request.POST.get('word')  # 添加支持直接使用单词文本
    action = request.POST.get('action')  # 'add-favorite' 或 'remove-favorite'
    
    if not action or (not word_id and not word_text):
        return JsonResponse({'status': 'error', 'message': '缺少必要参数'}, status=400)
    
    try:
        # 设置操作类型
        is_add = (action == 'add-favorite')
        
        # 直接调用toggle_favorite函数，传递word_id或word_text
        result = toggle_favorite(user, word_id, word_text)
        
        if result['success']:
            return JsonResponse({
                'status': 'success',
                'message': result['message'],
                'word_id': result.get('word_id', word_id),  # 如果结果中没有word_id，使用请求中的word_id
                'is_favorite': result['is_favorite']
            })
        else:
            return JsonResponse({'status': 'error', 'message': result['message']}, status=400)
            
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
def extract_words_view(request, video_id=None):
    """从视频或所有视频中提取单词的视图"""
    if request.method == 'POST':
        language = request.POST.get('language', 'en')
        force_reprocess = request.POST.get('force_reprocess') == 'on'
        
        try:
            extractor = WordExtractor(request.user)
            
            if video_id:
                # 处理单个视频
                video = get_object_or_404(Video, id=video_id, user=request.user)
                
                if force_reprocess:
                    # 先删除现有单词关联
                    subtitles = Subtitle.objects.filter(video=video)
                    # 使用新模型，删除与这些字幕相关的用户单词
                    # 注：由于新模型架构，单词与字幕没有直接关联，这个操作可能需要移至WordExtractor中
                word_count = extractor.process_video(video)
                messages.success(request, f'成功从视频《{video.title}》中提取了单词！')
                return redirect('video_detail', pk=video_id)
            else:
                # 处理所有视频，性能优化模式，不下载发音文件
                word_count = extractor.process_all_videos(force_reprocess)
                messages.success(request, f'成功处理了所有视频，提取了单词！')
                return redirect('dictionary')
                
        except Exception as e:
            messages.error(request, f'提取单词时出错: {str(e)}')
            if video_id:
                return redirect('video_detail', pk=video_id)
            else:
                return redirect('dictionary')
    
    # GET请求，显示表单
    context = {
        'video_id': video_id
    }
    
    if video_id:
        video = get_object_or_404(Video, id=video_id, user=request.user)
        context['video'] = video
    
    return render(request, 'api/extract_words_form.html', context)


@login_required
def update_word_view(request, word_id):
    """更新单词翻译和笔记的视图"""
    # 先获取单词以显示表单
    try:
        word = UserWord.objects.get(id=word_id, user=request.user)
    except UserWord.DoesNotExist:
        messages.error(request, "单词不存在或不属于当前用户")
        return redirect('dictionary')
    
    if request.method == 'POST':
        # 准备更新数据
        updates = {
            'translation': request.POST.get('translation', ''),
            'notes': request.POST.get('notes', '')
        }
        
        # 使用适配器更新单词
        result = update_word(request.user, word_id, updates)
        
        if result['success']:
            messages.success(request, result['message'])
            
            # 如果是Ajax请求，返回JSON响应
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'success': True,
                    'message': result['message'],
                    'word': result['word']
                })
            
            # 普通表单提交，重定向回单词详情页
            return redirect('word_detail', pk=word_id)
        else:
            messages.error(request, result['message'])
            # 如果是Ajax请求，返回错误响应
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
    """删除单词的视图"""
    if request.method == 'POST':
        # 使用适配器删除单词
        result = delete_word(request.user, word_id)
        
        if result['success']:
            messages.success(request, result['message'])
        else:
            messages.error(request, result['message'])
            
        # 重定向回词典页面
        return redirect('dictionary')
    
    # 如果不是POST请求，重定向到词典页面
    return redirect('dictionary')


@login_required
def delete_all_words(request):
    """删除用户所有的单词和单词引用"""
    if request.method == 'POST':
        # 使用适配器删除所有单词
        result = adapter_delete_all_words(request.user)
        
        if result['success']:
            messages.success(request, result['message'])
        else:
            messages.error(request, result['message'])
            
        return redirect('dictionary')
    
    # 对于GET请求，显示确认页面
    word_count = UserWord.objects.filter(user=request.user).count()
    return render(request, 'api/delete_all_words_confirm.html', {'word_count': word_count})


# 删除不再需要的视图函数
# @login_required
# def delete_all_words_confirm(request):
#     """显示删除所有单词的确认页面"""
#     word_count = UserWord.objects.filter(user=request.user).count()
#     return render(request, 'api/delete_all_words_confirm.html', {'word_count': word_count})


@login_required
def get_video_subtitles(request, pk=None, video_id=None):
    """获取视频的所有字幕作为JSON数据返回
    支持通过pk或video_id参数来指定视频
    """
    try:
        # 确保视频属于当前用户
        if pk is not None:
            # 如果使用pk参数
            video = get_object_or_404(Video, id=pk, user=request.user)
            video_id = pk  # 为了兼容返回值
        elif video_id is not None:
            # 如果使用video_id参数
            video = get_object_or_404(Video, id=video_id, user=request.user)
        else:
            return JsonResponse({
                'success': False,
                'message': '需要指定视频ID'
            }, status=400)
        
        # 获取该视频的所有字幕
        subtitles = Subtitle.objects.filter(video=video).order_by('start_time')
        
        # 格式化字幕数据为JSON
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
            'message': f'获取字幕时出错: {str(e)}'
        }, status=400)

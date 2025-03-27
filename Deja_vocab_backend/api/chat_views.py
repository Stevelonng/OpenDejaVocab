import json
import logging
from django.http import JsonResponse
from django.utils import timezone
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .models import Video
from .chat_models import ChatSession, ChatMessage

# 设置日志
logger = logging.getLogger(__name__)

# 缓存设置
SESSION_CACHE_TIMEOUT = 60 * 60 * 24 * 7  # 会话缓存保留7天


def get_or_create_chat_session(request):
    """
    获取或创建一个活跃的聊天会话
    确保只返回活跃会话，如果没有活跃会话则创建新会话
    注意：新会话不会自动继承任何视频关联
    确保每个用户只有一个活跃会话
    """
    # 检查会话ID是否存在于请求中
    session_id = request.session.get('current_chat_session_id')
    
    # 检查当前会话是否有效
    active_session = None
    if session_id:
        try:
            # 尝试获取已存在的会话，严格检查是否处于活跃状态
            active_session = ChatSession.objects.get(
                id=session_id, 
                user=request.user, 
                is_active=True,   # 确保会话处于活跃状态
                ended_at__isnull=True  # 确保会话没有结束时间
            )
            logger.info(f"Found active session ID: {active_session.id} for user {request.user.username}")
        except ChatSession.DoesNotExist:
            # 会话不存在或已结束，清除当前会话ID
            request.session.pop('current_chat_session_id', None)
            logger.info(f"Session {session_id} not found or inactive for user {request.user.username}, will check other active sessions")
    
    # 如果找不到指定的活跃会话，检查是否有其他活跃会话
    if not active_session:
        # 查找该用户的所有活跃会话，按创建时间逆序排列（最新的优先）
        other_active_sessions = ChatSession.objects.filter(
            user=request.user,
            is_active=True,
            ended_at__isnull=True
        ).order_by('-created_at')
        
        if other_active_sessions.exists():
            # 使用最近的活跃会话
            active_session = other_active_sessions.first()
            # 更新Django会话中的会话ID
            request.session['current_chat_session_id'] = active_session.id
            logger.info(f"Found another active session ID: {active_session.id} for user {request.user.username}")
    
    # 如果没有找到活跃会话，创建新会话
    if not active_session:
        # 创建新会话，但不自动继承任何视频关联
        # 使用原始 SQL 创建而不是 ORM，以避免触发可能的信号或事件
        from django.db import connection
        cursor = connection.cursor()
        
        # 首先创建会话记录
        cursor.execute(
            """
            INSERT INTO api_chatsession 
            (user_id, created_at, ended_at, is_active, title, summary) 
            VALUES (%s, %s, %s, %s, %s, %s) 
            RETURNING id
            """, 
            [
                request.user.id, 
                timezone.now(), 
                None, 
                True, 
                f"对话 {timezone.now().strftime('%Y-%m-%d %H:%M')}", 
                ""
            ]
        )
        
        # 获取新插入的记录ID
        new_session_id = cursor.fetchone()[0]
        
        # 使用数据库ID获取新创建的会话对象
        active_session = ChatSession.objects.get(id=new_session_id)
        logger.info(f"Created brand new session ID: {active_session.id} for user {request.user.username} (no video associations)")
        
        # 保存会话ID到Django会话
        request.session['current_chat_session_id'] = active_session.id
        
        logger.info(f"Created new chat session ID: {active_session.id} for user {request.user.username}")
    
    return active_session


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def end_chat_session(request):
    """结束当前聊天会话并生成总结，确保下一个会话是全新的（不继承视频关联）"""
    session_id = request.session.get('current_chat_session_id')
    
    if not session_id:
        return JsonResponse({'status': 'error', 'message': '没有活跃的会话'})
    
    try:
        session = ChatSession.objects.get(id=session_id, user=request.user)
        
        # 生成会话总结
        summary = generate_ai_summary(session)
        
        # 更新会话记录
        session.is_active = False
        session.ended_at = timezone.now()
        session.summary = summary
        session.save()
        
        # 清除当前会话ID - 确保下次会话是全新的
        request.session.pop('current_chat_session_id', None)
        
        # 清除缓存中的会话数据，确保不会继承旧视频关联
        cache_key = f"chat_session:{request.user.id}"
        cache.delete(cache_key)
        
        # 准备响应数据
        result = {
            'status': 'success', 
            'message': '会话已结束并生成总结',
            'summary': summary,
            'session_id': session.id,
            'duration': session.get_duration(),
            'videos_count': session.get_videos_count(),
            'messages_count': session.get_messages_count(),
        }
        
        logger.info(f"User {request.user.username} ended chat session ID: {session.id}, duration: {session.get_duration()} minutes")
        return JsonResponse(result)
        
    except ChatSession.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '会话不存在'})


def generate_ai_summary(session):
    """使用AI生成会话总结"""
    try:
        # 获取会话中的所有消息
        messages = session.messages.all().order_by('timestamp')
        
        if not messages:
            return "本次对话中没有消息内容。"
        
        # 获取关联的视频标题
        video_titles = [video.title for video in session.session_videos.all() if video.title]
        video_info = ""
        if video_titles:
            video_info = f"本次会话中讨论的视频: {', '.join(video_titles)}\n\n"
        
        # 准备提示词
        prompt = "请根据以下对话内容，生成一个简洁的学习总结，重点关注以下几点：\n"
        prompt += "1. 主要讨论的话题和内容\n"
        prompt += "2. 重要的语言学习点（词汇、表达、语法等）\n"
        prompt += "3. 文化背景知识\n"
        prompt += "总结应该简明扼要，突出最有价值的信息。\n\n"
        
        if video_info:
            prompt += video_info
        
        # 添加对话内容
        for msg in messages:
            role = "用户" if msg.role == "user" else "AI助手"
            prompt += f"{role}: {msg.content}\n\n"
        
        # 调用AI模型，在运行时导入避免循环引用
        try:
            # 动态导入 gemini_views 的内容
            from .gemini_views import client, GEMINI_MODEL
            
            logger.info(f"Generating session summary, message count: {len(messages)}")
            
            # 使用正确的API调用方式
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt
            )
            
            # 从响应中获取文本
            if hasattr(response, 'text'):
                summary = response.text
            elif hasattr(response, 'parts'):
                summary = ''.join([part.text for part in response.parts if hasattr(part, 'text')])
            else:
                summary = "无法生成摘要，API响应格式未知"
                
            logger.info(f"Summary generation successful, length: {len(summary)}")
            return summary
        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            return "无法生成总结。系统可能遇到临时性问题，请稍后再试。"
    except Exception as e:
        logger.error(f"Error preparing summary prompt: {str(e)}")
        return "无法生成会话总结。"


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def delete_chat_session(request):
    """
    完全删除当前活跃的聊天会话，不保存任何记录
    与end_chat_session不同，这个函数会从数据库中彻底删除会话及其消息
    """
    try:
        # 获取当前会话ID
        session_id = request.session.get('current_chat_session_id')
        
        if not session_id:
            return Response(
                {"error": "没有找到活跃的聊天会话"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # 查找会话，确保只能删除自己的会话
        try:
            chat_session = ChatSession.objects.get(
                id=session_id,
                user=request.user
            )
        except ChatSession.DoesNotExist:
            return Response(
                {"error": "找不到指定的聊天会话"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # 记录删除操作
        logger.info(f"Deleting chat session {session_id} for user {request.user.username}")
        
        # 首先删除所有相关的消息
        ChatMessage.objects.filter(session=chat_session).delete()
        
        # 然后删除会话本身
        chat_session.delete()
        
        # 从Django会话中移除会话ID
        request.session.pop('current_chat_session_id', None)
        
        return Response(
            {"success": True, "message": "聊天会话已彻底删除"},
            status=status.HTTP_200_OK
        )
    
    except Exception as e:
        logger.error(f"Error deleting chat session: {str(e)}")
        return Response(
            {"error": f"删除聊天会话时出错: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_chat_sessions(request):
    """获取用户的聊天会话列表"""
    # 分页参数
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 10))
    
    # 计算偏移量
    start = (page - 1) * page_size
    end = start + page_size
    
    # 获取用户的会话列表
    sessions = ChatSession.objects.filter(user=request.user).order_by('-created_at')[start:end]
    
    # 统计总数
    total_count = ChatSession.objects.filter(user=request.user).count()
    
    # 准备响应数据
    session_list = []
    for session in sessions:
        session_data = {
            'id': session.id,
            'title': session.title,
            'created_at': session.created_at.strftime('%Y-%m-%d %H:%M'),
            'ended_at': session.ended_at.strftime('%Y-%m-%d %H:%M') if session.ended_at else None,
            'is_active': session.is_active,
            'duration': session.get_duration(),
            'videos_count': session.get_videos_count(),
            'messages_count': session.get_messages_count(),
            'has_summary': bool(session.summary)
        }
        session_list.append(session_data)
    
    return JsonResponse({
        'status': 'success',
        'sessions': session_list,
        'total': total_count,
        'page': page,
        'page_size': page_size,
        'pages': (total_count + page_size - 1) // page_size  # 计算总页数
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_chat_session(request, session_id):
    """获取指定会话的详细信息"""
    try:
        session = ChatSession.objects.get(id=session_id, user=request.user)
        
        # 获取会话消息
        messages = session.messages.all().order_by('timestamp')
        message_list = []
        for msg in messages:
            message_data = {
                'id': msg.id,
                'role': msg.role,
                'content': msg.content,
                'timestamp': msg.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                'video_id': msg.video.id if msg.video else None
            }
            message_list.append(message_data)
        
        # 获取关联视频
        videos = session.session_videos.all()
        video_list = []
        for video in videos:
            video_data = {
                'id': video.id,
                'title': video.title,
                'url': video.url
            }
            video_list.append(video_data)
        
        # 准备响应数据
        session_data = {
            'id': session.id,
            'title': session.title,
            'created_at': session.created_at.strftime('%Y-%m-%d %H:%M'),
            'ended_at': session.ended_at.strftime('%Y-%m-%d %H:%M') if session.ended_at else None,
            'is_active': session.is_active,
            'summary': session.summary,
            'duration': session.get_duration(),
            'messages': message_list,
            'videos': video_list
        }
        
        return JsonResponse({
            'status': 'success',
            'session': session_data
        })
        
    except ChatSession.DoesNotExist:
        return JsonResponse({
            'status': 'error',
            'message': '会话不存在'
        }, status=404)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_session_videos(request):
    """
    获取当前活跃会话关联的所有视频列表
    """
    try:
        # 获取当前用户的活跃会话
        active_session = ChatSession.objects.filter(
            user=request.user,
            is_active=True
        ).first()
        
        if not active_session:
            return Response(
                {"error": "没有活跃的会话"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # 获取关联的视频列表
        session_videos = Video.objects.filter(
            chat_session=active_session
        ).order_by('-created_at')  # 按添加时间倒序排列
        
        # 格式化视频数据
        videos_data = []
        for video in session_videos:
            videos_data.append({
                'id': video.id,
                'video_id': video.url.split('=')[-1] if '=' in video.url else video.url,  # 提取YouTube视频ID
                'title': video.title,
                'url': video.url,
                'added_at': video.created_at.strftime('%Y-%m-%d %H:%M'),
                'is_current': video.id == request.GET.get('current_video_id')  # 标记当前视频
            })
        
        return Response({
            'session_id': active_session.id,
            'session_title': active_session.title,
            'created_at': active_session.created_at.strftime('%Y-%m-%d %H:%M'),
            'videos_count': len(videos_data),
            'videos': videos_data
        })
    
    except Exception as e:
        return Response(
            {"error": f"获取会话视频失败: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_chat_notes(request, session_id=None):
    """导出聊天笔记"""
    # 如果没有指定会话ID，使用当前活跃会话
    if not session_id:
        session_id = request.session.get('current_chat_session_id')
        if not session_id:
            return JsonResponse({'status': 'error', 'message': '没有活跃的会话'})
    
    try:
        # 获取指定的会话
        session = ChatSession.objects.get(id=session_id, user=request.user)
        
        # 只返回会话 ID 和用户信息，不生成导出文件
        # 获取基本信息
        videos_count = session.session_videos.count()
        messages_count = session.messages.count()
        
        # 创建简化的响应
        response = JsonResponse({
            'status': 'success',
            'message': '会话已结束',
            'session_id': session.id,
            'videos_count': videos_count,
            'messages_count': messages_count,
            'summary': session.summary or ''
        })
        
        logger.info(f"User {request.user.username} exported chat notes for session ID: {session.id}")
        return response
        
    except ChatSession.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '会话不存在'}, status=404)

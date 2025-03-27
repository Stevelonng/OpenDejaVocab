from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .feedback_models import Feedback

# API端点处理来自Chrome扩展和其他前端的反馈
@api_view(['POST'])
@permission_classes([AllowAny])
def feedback_api(request):
    """
    处理API反馈提交
    允许未登录用户提交反馈
    """
    data = request.data
    
    # 创建反馈记录
    feedback = Feedback(
        type=data.get('type', 'other'),
        content=data.get('content', ''),
        wechat=data.get('wechat', None),
        source=data.get('source', 'api'),
        url=data.get('url', None),
        user_agent=data.get('user_agent', None),
    )
    
    # 如果用户已登录，关联到用户
    if request.user.is_authenticated:
        feedback.user = request.user
    
    feedback.save()
    
    return Response({
        'status': 'success',
        'message': '感谢您的反馈！我们将认真对待您的每一条建议。'
    }, status=status.HTTP_201_CREATED)

# 网站端处理反馈提交
@require_POST
def submit_feedback(request):
    """
    处理网站上的反馈表单提交
    """
    feedback_type = request.POST.get('type', 'other')
    content = request.POST.get('content', '')
    email = request.POST.get('email', None)
    
    # 创建反馈记录
    feedback = Feedback(
        type=feedback_type,
        content=content,
        wechat=request.POST.get('wechat', None),
        source='web',
        url=request.META.get('HTTP_REFERER', None),
        user_agent=request.META.get('HTTP_USER_AGENT', None),
    )
    
    # 如果用户已登录，关联到用户
    if request.user.is_authenticated:
        feedback.user = request.user
    
    feedback.save()
    
    # 如果是AJAX请求，返回JSON响应
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'status': 'success',
            'message': '感谢您的反馈！我们将认真对待您的每一条建议。'
        })
    
    # 否则重定向回引用页面
    referer = request.META.get('HTTP_REFERER', '/')
    return redirect(referer)

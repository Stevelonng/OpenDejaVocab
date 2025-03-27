from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .feedback_models import Feedback

# API endpoint for handling feedback from Chrome extension and other frontends
@api_view(['POST'])
@permission_classes([AllowAny])
def feedback_api(request):
    """
    Process API feedback submissions
    Allows unauthenticated users to submit feedback
    """
    data = request.data
    
    # Create feedback record
    feedback = Feedback(
        type=data.get('type', 'other'),
        content=data.get('content', ''),
        wechat=data.get('wechat', None),
        source=data.get('source', 'api'),
        url=data.get('url', None),
        user_agent=data.get('user_agent', None),
    )
    
    # If user is logged in, associate with user
    if request.user.is_authenticated:
        feedback.user = request.user
    
    feedback.save()
    
    return Response({
        'status': 'success',
        'message': 'Thank you for your feedback! We will carefully consider every suggestion.'
    }, status=status.HTTP_201_CREATED)

# Website handling of feedback submissions
@require_POST
def submit_feedback(request):
    """
    Process feedback form submissions from the website
    """
    feedback_type = request.POST.get('type', 'other')
    content = request.POST.get('content', '')
    email = request.POST.get('email', None)
    
    # Create feedback record
    feedback = Feedback(
        type=feedback_type,
        content=content,
        wechat=request.POST.get('wechat', None),
        source='web',
        url=request.META.get('HTTP_REFERER', None),
        user_agent=request.META.get('HTTP_USER_AGENT', None),
    )
    
    # If user is logged in, associate with user
    if request.user.is_authenticated:
        feedback.user = request.user
    
    feedback.save()
    
    # If AJAX request, return JSON response
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'status': 'success',
            'message': 'Thank you for your feedback! We will carefully consider every suggestion.'
        })
    
    # Otherwise redirect back to referrer page
    referer = request.META.get('HTTP_REFERER', '/')
    return redirect(referer)

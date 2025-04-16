import logging
import requests
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fetch_bilibili_subtitle(request):
    """
    获取B站视频字幕
    
    请求参数:
    - subtitle_url: 字幕URL
    - video_id: 视频ID
    - title: 视频标题
    
    返回: 字幕数据
    """
    try:
        data = request.data
        subtitle_url = data.get('subtitle_url')
        video_id = data.get('video_id')
        title = data.get('title')
        
        if not subtitle_url:
            return Response({'error': '缺少字幕URL参数'}, status=400)
        
        logger.info(f"获取B站字幕: {subtitle_url}")
        
        # 发送请求获取B站字幕
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Referer': 'https://www.bilibili.com/',
            'Origin': 'https://www.bilibili.com',
            'Accept': 'application/json, text/plain, */*'
        }
        
        response = requests.get(
            subtitle_url,
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return Response({
                'error': f'获取字幕失败: HTTP {response.status_code}'
            }, status=400)
        
        # 解析B站字幕数据
        subtitle_data = response.json()
        
        # 记录日志
        subtitle_count = len(subtitle_data.get('body', []))
        logger.info(f"成功获取B站字幕，共{subtitle_count}条")
        
        return Response(subtitle_data)
        
    except Exception as e:
        logger.error(f"获取B站字幕出错: {str(e)}", exc_info=True)
        return Response({'error': f'获取字幕出错: {str(e)}'}, status=500)

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import Video, Subtitle
from .word_models import WordDefinition, UserWord, WordReference
from .word_extractor import WordExtractor
from .word_adapter import save_word, update_word as update_user_word, delete_word as delete_user_word


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def extract_words_from_video(request, video_id):
    """提取特定视频中的所有单词并添加到用户词典"""
    try:
        video = get_object_or_404(Video, id=video_id, user=request.user)
        language = request.data.get('language', 'en')
        
        # 创建单词提取器并处理视频
        extractor = WordExtractor(request.user, language)
        
        # 如果请求要求重新处理，则先删除旧单词
        force_reprocess = request.data.get('force_reprocess', False)
        if force_reprocess:
            # 这部分功能需要在 WordExtractor 中重新实现
            pass
        
        word_count = extractor.process_video(video)
        
        # 统计视频字幕中的单词数
        # 注意：这部分逻辑需要改变，因为我们不再使用 WordReference
        # 这里只是简单地返回处理结果
        unique_words = word_count  # 简化处理，实际上应该通过其他方式获取
        
        return Response({
            'success': True,
            'message': f'Successfully extracted {word_count} word occurrences from video',
            'unique_words': unique_words,
            'video_id': video.id,
            'video_title': video.title
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error extracting words: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def extract_words_from_all_videos(request):
    """提取用户所有视频中的单词并添加到词典"""
    try:
        language = request.data.get('language', 'en')
        force_reprocess = request.data.get('force_reprocess', False)
        
        # 创建单词提取器并处理所有视频
        extractor = WordExtractor(request.user, language)
        word_count = extractor.process_all_videos(force_reprocess)
        
        # 获取用户的单词统计
        total_unique_words = UserWord.objects.filter(user=request.user).count()
        
        return Response({
            'success': True,
            'message': f'Successfully processed all videos',
            'unique_words': total_unique_words,
            'total_occurrences': word_count,
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error extracting words: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_word(request, word_id):
    """从用户词典中删除单词"""
    try:
        # 使用适配器删除单词
        word_id_clean = word_id
        if word_id.startswith('new_'):
            word_id_clean = word_id[4:]  # 移除前缀
            
        word = get_object_or_404(UserWord, id=word_id_clean, user=request.user)
        word_text = word.word_definition.text
        
        delete_user_word(request.user, word_id)
        
        return Response({
            'success': True,
            'message': f'Successfully deleted word "{word_text}"'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error deleting word: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_word(request, word_id):
    """更新单词的翻译和笔记"""
    try:
        # 使用适配器更新单词
        word_id_clean = word_id
        if word_id.startswith('new_'):
            word_id_clean = word_id[4:]  # 移除前缀
            
        user_word = get_object_or_404(UserWord, id=word_id_clean, user=request.user)
        word_def = user_word.word_definition
        
        # 准备更新的数据
        update_data = {}
        if 'translation' in request.data:
            update_data['translation'] = request.data['translation']
        if 'notes' in request.data:
            update_data['notes'] = request.data['notes']
        
        # 使用适配器更新单词
        updated_word = update_user_word(request.user, word_id, **update_data)
        
        # 查找单词引用次数
        reference_count = WordReference.objects.filter(user_word=user_word).count()
        
        return Response({
            'success': True,
            'message': f'Successfully updated word "{word_def.text}"',
            'word': {
                'id': f"new_{user_word.id}",
                'text': word_def.text,
                'translation': updated_word.get('translation', word_def.translation),
                'notes': updated_word.get('notes', user_word.notes),
                'frequency': reference_count
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error updating word: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

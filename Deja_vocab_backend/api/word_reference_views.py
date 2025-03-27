from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status, viewsets
from django.shortcuts import get_object_or_404
from .models import Subtitle
from .word_models import WordDefinition, UserWord, WordReference
from .serializers import WordReferenceSerializer


class WordReferenceViewSet(viewsets.ModelViewSet):
    """API endpoint for managing word references"""
    serializer_class = WordReferenceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Return word references for the current user only"""
        user = self.request.user
        return WordReference.objects.filter(
            user_word__user=user
        ).select_related('user_word', 'user_word__word_definition', 'subtitle', 'subtitle__video')
    
    def perform_create(self, serializer):
        """Save the word reference with the user_word linked to the current user"""
        serializer.save()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_word_reference(request):
    """创建单词引用，关联用户单词和字幕"""
    try:
        data = request.data
        word_text = data.get('word_text')
        subtitle_id = data.get('subtitle_id')
        context_start = data.get('context_start', 0)
        context_end = data.get('context_end', 0)
        
        if not word_text or not subtitle_id:
            return Response({
                'success': False,
                'message': 'Missing required fields: word_text and subtitle_id'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 获取字幕
        subtitle = get_object_or_404(Subtitle, id=subtitle_id)
        
        # 查找或创建单词定义
        word_def, created = WordDefinition.objects.get_or_create(
            text=word_text,
            defaults={
                'language': 'en',  # 默认英语
                'translation': data.get('translation', '')
            }
        )
        
        # 查找或创建用户单词
        user_word, created = UserWord.objects.get_or_create(
            user=request.user,
            word_definition=word_def
        )
        
        # 创建或更新单词引用
        word_ref, created = WordReference.objects.get_or_create(
            user_word=user_word,
            subtitle=subtitle,
            defaults={
                'context_start': context_start,
                'context_end': context_end
            }
        )
        
        # 如果引用已存在，更新上下文位置
        if not created:
            word_ref.context_start = context_start
            word_ref.context_end = context_end
            word_ref.save()
        
        serializer = WordReferenceSerializer(word_ref)
        
        return Response({
            'success': True,
            'message': f'Successfully created reference for "{word_text}"',
            'reference': serializer.data
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error creating word reference: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_word_references(request, word_text=None):
    """获取特定单词或所有单词的引用"""
    try:
        # 如果提供了单词文本，过滤该单词的引用
        if word_text:
            word_def = get_object_or_404(WordDefinition, text=word_text)
            user_word = get_object_or_404(UserWord, user=request.user, word_definition=word_def)
            references = WordReference.objects.filter(
                user_word=user_word
            ).select_related('subtitle', 'subtitle__video')
        else:
            # 否则获取所有单词引用
            references = WordReference.objects.filter(
                user_word__user=request.user
            ).select_related('user_word', 'user_word__word_definition', 'subtitle', 'subtitle__video')
        
        serializer = WordReferenceSerializer(references, many=True)
        
        return Response({
            'success': True,
            'count': references.count(),
            'references': serializer.data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error getting word references: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_word_reference(request, reference_id):
    """删除单词引用"""
    try:
        reference = get_object_or_404(WordReference, id=reference_id, user_word__user=request.user)
        word_text = reference.user_word.word_definition.text
        reference.delete()
        
        return Response({
            'success': True,
            'message': f'Successfully deleted reference for "{word_text}"'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error deleting word reference: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def process_existing_words(request):
    """处理用户现有单词，为它们创建引用"""
    try:
        processed = 0
        errors = 0
        
        # 获取用户所有单词
        user_words = UserWord.objects.filter(user=request.user)
        
        for user_word in user_words:
            word_text = user_word.word_definition.text
            
            # 查找包含该单词的字幕
            subtitles = Subtitle.objects.filter(
                video__user=request.user,
                text__icontains=word_text
            )
            
            for subtitle in subtitles:
                text = subtitle.text.lower()
                word_lower = word_text.lower()
                
                # 查找单词在字幕中的位置
                start_index = text.find(word_lower)
                if start_index >= 0:
                    end_index = start_index + len(word_lower)
                    
                    # 创建或更新单词引用
                    try:
                        word_ref, created = WordReference.objects.get_or_create(
                            user_word=user_word,
                            subtitle=subtitle,
                            defaults={
                                'context_start': start_index,
                                'context_end': end_index
                            }
                        )
                        processed += 1
                    except Exception:
                        errors += 1
        
        return Response({
            'success': True,
            'message': f'Successfully processed {processed} references with {errors} errors',
            'processed': processed,
            'errors': errors
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Error processing existing words: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

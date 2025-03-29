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
    """Create word reference, link user word and subtitle"""
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
        
        # Find or create word definitions
        word_def, created = WordDefinition.objects.get_or_create(
            text=word_text,
            defaults={
                'language': 'en',  # Default English
                'translation': data.get('translation', '')
            }
        )
        
        # Find or create user word
        user_word, created = UserWord.objects.get_or_create(
            user=request.user,
            word_definition=word_def
        )
        
        # Create or update word reference
        word_ref, created = WordReference.objects.get_or_create(
            user_word=user_word,
            subtitle=subtitle,
            defaults={
                'context_start': context_start,
                'context_end': context_end
            }
        )
        
        # If reference exists, update context position
        if not created:
            word_ref.context_start = context_start
            word_ref.context_end = context_end
            word_ref.save()
        
        serializer = WordReferenceSerializer
        
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
    """Get word references for a specific word or all words"""
    try:
        # If a word text is provided, filter references for that word
        if word_text:
            word_def = get_object_or_404(WordDefinition, text=word_text)
            user_word = get_object_or_404(UserWord, user=request.user, word_definition=word_def)
            references = WordReference.objects.filter(
                user_word=user_word
            ).select_related('subtitle', 'subtitle__video')
        else:
            # Otherwise, get all word references
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
    """Delete word reference"""
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
    """Process existing words, create references for them"""
    try:
        processed = 0
        errors = 0
        
        # Get user's all words
        user_words = UserWord.objects.filter(user=request.user)
        
        for user_word in user_words:
            word_text = user_word.word_definition.text
            
            # Find subtitles containing the word
            subtitles = Subtitle.objects.filter(
                video__user=request.user,
                text__icontains=word_text
            )
            
            for subtitle in subtitles:
                text = subtitle.text.lower()
                word_lower = word_text.lower()
                
                # Find word position in subtitle
                start_index = text.find(word_lower)
                if start_index >= 0:
                    end_index = start_index + len(word_lower)
                    
                    # Create or update word reference
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

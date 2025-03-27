from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import Video
from .word_models import UserWord, WordReference
from .word_extractor import WordExtractor
from .word_adapter import update_word as update_user_word, delete_word as delete_user_word


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def extract_words_from_video(request, video_id):
    """Extract all words from a specific video and add them to the user's dictionary"""
    try:
        video = get_object_or_404(Video, id=video_id, user=request.user)
        language = request.data.get('language', 'en')
        
        # Create word extractor and process video
        extractor = WordExtractor(request.user, language)
        
        # If request requires reprocessing, delete old words first
        force_reprocess = request.data.get('force_reprocess', False)
        if force_reprocess:
            # This functionality needs to be reimplemented in WordExtractor
            pass
        
        word_count = extractor.process_video(video)
        
        # Count words in video subtitles
        # Note: This logic needs to change because we no longer use WordReference
        # This is just a simplified return of the processing result
        unique_words = word_count  # Simplified processing, should actually be obtained through other means
        
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
    """Extract words from all of the user's videos and add them to the dictionary"""
    try:
        language = request.data.get('language', 'en')
        force_reprocess = request.data.get('force_reprocess', False)
        
        # Create word extractor and process all videos
        extractor = WordExtractor(request.user, language)
        word_count = extractor.process_all_videos(force_reprocess)
        
        # Get user's word statistics
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
    """Delete a word from the user's dictionary"""
    try:
        # Use adapter to delete word
        word_id_clean = word_id
        if word_id.startswith('new_'):
            word_id_clean = word_id[4:]  # Remove prefix
            
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
    """Update a word's translation and notes"""
    try:
        # Use adapter to update word
        word_id_clean = word_id
        if word_id.startswith('new_'):
            word_id_clean = word_id[4:]  # Remove prefix
            
        user_word = get_object_or_404(UserWord, id=word_id_clean, user=request.user)
        word_def = user_word.word_definition
        
        # Prepare update data
        update_data = {}
        if 'translation' in request.data:
            update_data['translation'] = request.data['translation']
        if 'notes' in request.data:
            update_data['notes'] = request.data['notes']
        
        # Use adapter to update word
        updated_word = update_user_word(request.user, word_id, **update_data)
        
        # Find word reference count
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

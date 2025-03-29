from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Video, Subtitle, UserActivity
from .word_models import UserWord
from .word_extractor import WordExtractor
import threading

def process_video_in_background(video_id, user_id):
    """Process video and extract words in the background"""
    from .models import Video
    
    try:
        video = Video.objects.get(id=video_id)
        user = User.objects.get(id=user_id)
        
        # Initialize word extractor
        extractor = WordExtractor(user)
        # Process video
        extractor.process_video(video)
        print(f"Background processing complete: Words extracted from video {video.title}")
    except Exception as e:
        print(f"Error processing video: {str(e)}")

@receiver(post_save, sender=Video)
def extract_words_after_video_save(sender, instance, created, **kwargs):
    """
    When a video is saved, start a background thread to process subtitles and extract words
    This runs when the video is first created
    """
    if created:  # Only run when the video is first created
        # Get all subtitles for the video
        subtitles = Subtitle.objects.filter(video=instance)
        if subtitles.exists():
            # Start background thread to process video
            thread = threading.Thread(
                target=process_video_in_background,
                args=(instance.id, instance.user.id)
            )
            thread.daemon = True  # Set thread as daemon so it terminates automatically when main thread exits
            thread.start()
            print(f"Background task started: Processing video {instance.title} and extracting words")


def process_subtitle_in_background(subtitle_id, user_id):
    """Process subtitle and extract words in the background"""
    from django.contrib.auth.models import User
    from .models import Subtitle
    
    try:
        subtitle = Subtitle.objects.get(id=subtitle_id)
        user = User.objects.get(id=user_id)
        
        # Initialize word extractor
        extractor = WordExtractor(user)
        # Process individual subtitle
        extractor.extract_words_from_subtitle(subtitle)
        print(f"Background processing complete: Words extracted from subtitle segment")
    except Exception as e:
        print(f"Error processing subtitle: {str(e)}")

@receiver(post_save, sender=Subtitle)
def extract_words_after_subtitle_save(sender, instance, created, **kwargs):
    """
    When a subtitle is saved, start a background thread to process it and extract words
    """
    if created:  # Only run when subtitle is first created
        # Start background thread to process subtitle
        thread = threading.Thread(
            target=process_subtitle_in_background,
            args=(instance.id, instance.video.user.id)
        )
        thread.daemon = True  # Set thread as daemon
        thread.start()
        # print(f"Background task started: Processing subtitle and extracting words")

@receiver(post_delete, sender=Video)
def delete_orphaned_user_words(sender, instance, **kwargs):
    """
    After a video is deleted, check and delete user words that have no references
    """
    user = instance.user
    
    try:
        # Get latest state from database
        from django.db import connection
        
        # Find all words for this user that have no references
        # Use raw SQL for more precise queries to ensure words without references are correctly identified
        with connection.cursor() as cursor:
            # First get all IDs of words without references
            cursor.execute("""
                SELECT uw.id, wd.text
                FROM api_userword uw
                LEFT JOIN api_worddefinition wd ON uw.word_definition_id = wd.id
                LEFT JOIN api_wordreference wr ON wr.user_word_id = uw.id
                WHERE uw.user_id = %s AND wr.id IS NULL
            """, [user.id])
            
            orphaned_word_ids = []
            orphaned_word_texts = []
            
            for row in cursor.fetchall():
                orphaned_word_ids.append(row[0])
                orphaned_word_texts.append(row[1])
        
        # If there are words without references, delete them
        if orphaned_word_ids:
            # Use queryset delete method
            deleted_count = UserWord.objects.filter(id__in=orphaned_word_ids).delete()[0]
            
            # Log deletion information
            print(f"Deleted {deleted_count} unreferenced words for {user.username}: {', '.join(orphaned_word_texts[:10])}{' etc.' if len(orphaned_word_texts) > 10 else ''}")
            
            # Record user activity
            if deleted_count > 0:
                UserActivity.objects.create(
                    user=user,
                    action_type='other',
                    details={
                        'action': 'delete_orphaned_words',
                        'video_id': instance.id,
                        'video_title': instance.title,
                        'word_count': deleted_count,
                        'words': orphaned_word_texts[:20] if len(orphaned_word_texts) <= 20 else orphaned_word_texts[:20] + ['...']
                    }
                )
            
            print(f"Successfully deleted {deleted_count} unreferenced words")
    except Exception as e:
        import traceback
        print(f"Error deleting unreferenced words: {str(e)}")
        print(traceback.format_exc())

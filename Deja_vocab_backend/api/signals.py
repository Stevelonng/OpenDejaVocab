from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.utils import timezone
from .models import Video, Subtitle, Sentence, UserActivity, UserSession, UserMetrics
from .word_models import WordDefinition, UserWord
from .word_extractor import WordExtractor
import threading

def process_video_in_background(video_id, user_id):
    """在后台处理视频并提取单词"""
    from django.contrib.auth.models import User
    from .models import Video
    
    try:
        video = Video.objects.get(id=video_id)
        user = User.objects.get(id=user_id)
        
        # 初始化单词提取器
        extractor = WordExtractor(user)
        # 处理视频
        extractor.process_video(video)
        print(f"后台处理完成: 已从视频 {video.title} 中提取单词")
    except Exception as e:
        print(f"处理视频时出错: {str(e)}")

@receiver(post_save, sender=Video)
def extract_words_after_video_save(sender, instance, created, **kwargs):
    """
    当视频被保存时，在后台启动一个线程来处理字幕并提取单词
    这会在视频第一次创建时运行
    """
    if created:  # 只在视频第一次创建时运行
        # 获取视频的所有字幕
        subtitles = Subtitle.objects.filter(video=instance)
        if subtitles.exists():
            # 启动后台线程处理视频
            thread = threading.Thread(
                target=process_video_in_background,
                args=(instance.id, instance.user.id)
            )
            thread.daemon = True  # 将线程设置为守护线程，这样当主线程退出时它会自动终止
            thread.start()
            print(f"已启动后台任务: 处理视频 {instance.title} 并提取单词")


def process_subtitle_in_background(subtitle_id, user_id):
    """在后台处理字幕并提取单词"""
    from django.contrib.auth.models import User
    from .models import Subtitle
    
    try:
        subtitle = Subtitle.objects.get(id=subtitle_id)
        user = User.objects.get(id=user_id)
        
        # 初始化单词提取器
        extractor = WordExtractor(user)
        # 处理单个字幕
        extractor.extract_words_from_subtitle(subtitle)
        print(f"后台处理完成: 已从字幕片段提取单词")
    except Exception as e:
        print(f"处理字幕时出错: {str(e)}")

@receiver(post_save, sender=Subtitle)
def extract_words_after_subtitle_save(sender, instance, created, **kwargs):
    """
    当字幕被保存时，在后台启动一个线程来处理该字幕并提取单词
    """
    if created:  # 只在字幕第一次创建时运行
        # 启动后台线程处理字幕
        thread = threading.Thread(
            target=process_subtitle_in_background,
            args=(instance.id, instance.video.user.id)
        )
        thread.daemon = True  # 将线程设置为守护线程
        thread.start()
        # print(f"已启动后台任务: 处理字幕并提取单词")

@receiver(post_delete, sender=Video)
def delete_orphaned_user_words(sender, instance, **kwargs):
    """
    当视频被删除后，检查并删除没有任何引用的用户单词
    """
    user = instance.user
    
    try:
        # 从数据库获取最新状态
        from django.db import connection
        
        # 查找该用户所有没有引用的单词
        # 使用原始SQL执行更精确的查询，确保没有引用的单词被正确识别
        with connection.cursor() as cursor:
            # 先获取所有无引用单词的ID
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
        
        # 如果有无引用单词，删除它们
        if orphaned_word_ids:
            # 使用查询集的删除方法
            deleted_count = UserWord.objects.filter(id__in=orphaned_word_ids).delete()[0]
            
            # 记录删除情况
            print(f"删除 {user.username} 的 {deleted_count} 个无引用单词: {', '.join(orphaned_word_texts[:10])}{' 等' if len(orphaned_word_texts) > 10 else ''}")
            
            # 记录用户活动
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
            
            print(f"成功删除 {deleted_count} 个无引用的单词")
    except Exception as e:
        import traceback
        print(f"删除无引用单词时出错: {str(e)}")
        print(traceback.format_exc())

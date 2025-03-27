#!/usr/bin/env python
import os
import sys
import django
from collections import defaultdict

# 设置Django环境
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'subtitle_collector.settings')
django.setup()

from api.models import Video, Subtitle
from django.db.models import Count
from django.db import transaction

def find_and_remove_duplicates():
    """
    查找并移除重复的视频记录，保留每个用户的每个URL的最新记录
    """
    print("正在查找重复的视频记录...")
    
    # 找出所有具有重复URL的用户-URL组合
    duplicates = Video.objects.values('user_id', 'url').annotate(
        count=Count('id')
    ).filter(count__gt=1)
    
    print(f"找到 {len(duplicates)} 组重复的视频记录")
    
    if not duplicates:
        print("没有找到重复记录。")
        return
    
    for dup in duplicates:
        user_id = dup['user_id']
        url = dup['url']
        
        # 获取该用户和URL的所有视频记录，按创建时间降序排序
        videos = Video.objects.filter(
            user_id=user_id,
            url=url
        ).order_by('-created_at')
        
        # 保留最新的视频记录，删除其他重复记录
        keep_video = videos.first()
        duplicate_videos = videos.exclude(id=keep_video.id)
        
        print(f"用户 {user_id} 的URL '{url}' 有 {duplicate_videos.count()+1} 条记录，将保留ID为 {keep_video.id} 的记录")
        
        # 将重复视频关联的字幕重新关联到保留的视频
        with transaction.atomic():
            for dup_video in duplicate_videos:
                # 重新关联字幕
                Subtitle.objects.filter(video=dup_video).update(video=keep_video)
                
                # 记录将被删除的视频信息
                print(f"  - 删除视频ID {dup_video.id} (标题: {dup_video.title or '无标题'})")
                
                # 删除重复的视频记录
                dup_video.delete()
    
    print("重复视频记录清理完成！")

if __name__ == "__main__":
    find_and_remove_duplicates()

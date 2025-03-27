#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
from youdao.model import Word, db
from youdao.config import BASE_DIR, DATABASE, DB_DIR

def clear_all_cache():
    """清空所有缓存的单词和词组"""
    try:
        # 删除所有单词记录
        query = Word.delete()
        deleted_count = query.execute()
        print(f"成功删除 {deleted_count} 条缓存记录")
        
        # 压缩数据库文件
        db.execute_sql('VACUUM;')
        print(f"数据库已压缩")
        
        return True
    except Exception as e:
        print(f"清空缓存失败: {str(e)}")
        return False

def clear_specific_word(keyword):
    """删除特定单词的缓存"""
    try:
        query = Word.delete().where(Word.keyword == keyword)
        deleted_count = query.execute()
        if deleted_count > 0:
            print(f"成功删除 '{keyword}' 的缓存")
        else:
            print(f"未找到 '{keyword}' 的缓存")
        return deleted_count > 0
    except Exception as e:
        print(f"删除缓存失败: {str(e)}")
        return False

def show_cache_info():
    """显示缓存信息"""
    try:
        total_count = Word.select().count()
        print(f"当前缓存中共有 {total_count} 条记录")
        
        # 显示数据库文件大小
        if os.path.exists(DB_DIR):
            size_kb = os.path.getsize(DB_DIR) / 1024
            print(f"数据库文件大小: {size_kb:.2f} KB")
            print(f"数据库位置: {DB_DIR}")
        else:
            print("数据库文件不存在")
        
        # 显示最近的5个缓存
        if total_count > 0:
            print("\n最近的5个缓存:")
            recent_words = Word.select().order_by(Word.query_time.desc()).limit(5)
            for word in recent_words:
                print(f"  - {word.keyword} (查询次数: {word.count})")
    except Exception as e:
        print(f"获取缓存信息失败: {str(e)}")

def main():
    if len(sys.argv) == 1:
        # 无参数，显示帮助信息
        print("有道词典缓存管理工具")
        print("用法:")
        print("  python -m youdao.clear_cache info    # 显示缓存信息")
        print("  python -m youdao.clear_cache clear   # 清空所有缓存")
        print("  python -m youdao.clear_cache delete <单词>  # 删除特定单词的缓存")
        show_cache_info()
    elif sys.argv[1] == "info":
        show_cache_info()
    elif sys.argv[1] == "clear":
        confirm = input("确定要清空所有缓存吗? (y/n): ")
        if confirm.lower() == 'y':
            clear_all_cache()
    elif sys.argv[1] == "delete" and len(sys.argv) > 2:
        keyword = sys.argv[2]
        clear_specific_word(keyword)
    else:
        print("无效的命令")
        print("用法:")
        print("  python -m youdao.clear_cache info    # 显示缓存信息")
        print("  python -m youdao.clear_cache clear   # 清空所有缓存")
        print("  python -m youdao.clear_cache delete <单词>  # 删除特定单词的缓存")

if __name__ == "__main__":
    main()

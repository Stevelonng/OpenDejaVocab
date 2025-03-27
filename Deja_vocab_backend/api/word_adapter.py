from django.db import transaction
from django.contrib.auth.models import User
from .word_models import WordDefinition, UserWord
import hashlib
import base64

def get_user_words(user, search_query=None, sort_by='newest', favorites_only=False, paginate=None):
    """获取用户的所有单词
    
    仅使用新模型获取用户单词
    
    Args:
        user: 用户对象
        search_query: 搜索查询参数
        sort_by: 排序方式，可选值：newest, oldest, frequency, frequency_asc, az, za
        favorites_only: 是否只返回收藏的单词
        paginate: 分页参数，格式为 (page, per_page)，如果提供则只返回指定页的数据
    
    Returns:
        list: 用户单词列表
    """
    # 导入必要的模型
    from .word_models import WordReference
    from django.db.models import Count, Q
    
    # 基础查询 - 使用select_related减少数据库查询
    query = UserWord.objects.filter(user=user).select_related('word_definition')
    
    # 过滤收藏的单词
    if favorites_only:
        query = query.filter(is_favorite=True)
    
    # 搜索过滤
    if search_query:
        query = query.filter(word_definition__text__icontains=search_query)
    
    # 使用annotate来获取每个单词的引用数量，避免在Python中循环计算
    query = query.annotate(frequency=Count('references'))
    
    # 排序
    if sort_by == 'frequency':
        query = query.order_by('-frequency')
    elif sort_by == 'frequency_asc':
        query = query.order_by('frequency')
    elif sort_by == 'az':
        query = query.order_by('word_definition__text')
    elif sort_by == 'za':
        query = query.order_by('-word_definition__text')
    elif sort_by == 'newest':
        query = query.order_by('-created_at')
    elif sort_by == 'oldest':
        query = query.order_by('created_at')
    else:
        # 默认按频率降序
        query = query.order_by('-frequency')
    
    # 如果需要分页
    if paginate:
        page, per_page = paginate
        start = (page - 1) * per_page
        end = start + per_page
        query = query[start:end]
    
    # 转换为字典格式
    words_data = []
    for user_word in query:
        word_def = user_word.word_definition
        
        word_data = {
            'id': generate_secure_word_id(word_def.text, user.id),  # 使用安全ID
            'text': word_def.text,
            'language': word_def.language,
            'translation': word_def.translation,
            'uk_phonetic': word_def.uk_phonetic,
            'us_phonetic': word_def.us_phonetic,
            'phonetic': word_def.phonetic,
            'has_audio': word_def.has_audio,
            'web_translation': word_def.web_translation,
            'notes': user_word.notes,
            'frequency': user_word.frequency,  # 使用annotate计算的频率
            'is_favorite': user_word.is_favorite,
            'created_at': user_word.created_at
        }
        words_data.append(word_data)
    
    return words_data


@transaction.atomic
def save_word(user, word_data):
    """保存单词到新模型
    
    Args:
        user: 用户对象
        word_data: 单词数据，可以是字典
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        # 提取基本单词信息
        text = word_data.get('text', '').lower().strip()
        translation = word_data.get('translation', '')
        language = word_data.get('language', 'en')
        notes = word_data.get('notes', '')
        uk_phonetic = word_data.get('uk_phonetic', '')
        us_phonetic = word_data.get('us_phonetic', '')
        phonetic = word_data.get('phonetic', '')
        web_translation = word_data.get('web_translation', '')
        has_audio = word_data.get('has_audio', False)
        
        # 处理引用数据
        reference_data = word_data.get('reference_data', None)
        
        # 验证必要字段
        if not text:
            return {'success': False, 'message': '单词文本不能为空'}
        
        # 保存到新模型中
        try:
            # 1. 获取或创建单词定义
            word_def, def_created = WordDefinition.objects.get_or_create(
                text=text,
                language=language,
                defaults={
                    'translation': translation,
                    'uk_phonetic': uk_phonetic,
                    'us_phonetic': us_phonetic,
                    'phonetic': phonetic,
                    'has_audio': has_audio,
                    'web_translation': web_translation
                }
            )
            
            # 如果单词定义已存在，可能需要更新某些字段
            if not def_created:
                update_fields = []
                
                # 如果之前没有翻译，则更新
                if not word_def.translation and translation:
                    word_def.translation = translation
                    update_fields.append('translation')
                
                # 如果之前没有音标，则更新
                if not word_def.uk_phonetic and uk_phonetic:
                    word_def.uk_phonetic = uk_phonetic
                    update_fields.append('uk_phonetic')
                if not word_def.us_phonetic and us_phonetic:
                    word_def.us_phonetic = us_phonetic
                    update_fields.append('us_phonetic')
                if not word_def.phonetic and phonetic:
                    word_def.phonetic = phonetic
                    update_fields.append('phonetic')
                    
                # 如果之前没有发音，则更新
                if not word_def.has_audio and has_audio:
                    word_def.has_audio = has_audio
                    update_fields.append('has_audio')
                    
                # 更新web翻译
                if not word_def.web_translation and web_translation:
                    word_def.web_translation = web_translation
                    update_fields.append('web_translation')
                    
                if update_fields:
                    word_def.save(update_fields=update_fields)
            
            # 2. 获取或创建用户单词
            user_word, user_word_created = UserWord.objects.get_or_create(
                user=user,
                word_definition=word_def,
                defaults={
                    'notes': notes,
                }
            )
            
            # 如果用户单词已存在，仅更新笔记
            if not user_word_created:
                # 不再更新频率，频率将通过引用计数动态计算
                
                # 如果提供了新笔记，则追加到现有笔记
                if notes:
                    if user_word.notes:
                        user_word.notes += "\n" + notes
                    else:
                        user_word.notes = notes
                        
                user_word.save()
            
            # 3. 处理单词引用
            if reference_data and isinstance(reference_data, dict):
                # 从reference_data中提取字幕ID和上下文位置
                subtitle_id = reference_data.get('subtitle_id')
                context_start = reference_data.get('context_start')
                context_end = reference_data.get('context_end')
                
                # 如果提供了必要的引用数据，创建引用
                if subtitle_id is not None and context_start is not None and context_end is not None:
                    try:
                        from .models import Subtitle
                        from .word_models import WordReference
                        
                        # 获取字幕对象
                        subtitle = Subtitle.objects.get(id=subtitle_id)
                        
                        # 创建或更新单词引用
                        word_ref, reference_created = WordReference.objects.get_or_create(
                            user_word=user_word,
                            subtitle=subtitle,
                            defaults={
                                'context_start': context_start,
                                'context_end': context_end
                            }
                        )
                        
                        # 不再更新频率，频率将通过引用计数动态计算
                        
                    except Exception as ref_err:
                        # 引用创建失败不影响单词保存的整体结果
                        print(f"创建单词引用时出错: {str(ref_err)}")
            
            # 返回新模型的单词ID
            return {
                'success': True, 
                'message': '单词保存成功',
                'word_id': generate_secure_word_id(word_def.text, user.id),
                'is_new': def_created or user_word_created
            }
            
        except Exception as e:
            return {'success': False, 'message': f'保存单词时出错: {str(e)}'}
            
    except Exception as e:
        return {'success': False, 'message': f'保存单词时出错: {str(e)}'}


def toggle_favorite(user, word_id=None, word_text=None):
    """切换单词收藏状态
    
    Args:
        user: 用户对象
        word_id: 单词ID，可以是整数ID、"new_"开头的ID或"the_哈希"格式的安全ID
        word_text: 单词文本，如果没有提供word_id则使用文本查找
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        # 通过ID查找
        if word_id:
            try:
                user_word = None
                word_def = None
                
                # 检查是否是安全ID格式 (the_哈希格式)
                if isinstance(word_id, str) and '_' in word_id:
                    parts = word_id.split('_')
                    if len(parts) >= 2:
                        # 单词部分是除了最后一个部分以外的所有部分（处理包含下划线的单词）
                        word_text = '_'.join(parts[:-1])
                        
                        # 使用单词文本查找单词定义
                        word_def = WordDefinition.objects.filter(text=word_text).first()
                        if word_def:
                            user_word = UserWord.objects.filter(user=user, word_definition=word_def).first()
                
                # 如果没有找到用户单词，尝试其他ID格式
                if not user_word:
                    # 如果ID以new_开头，则去掉前缀
                    if isinstance(word_id, str) and word_id.startswith('new_'):
                        user_word_id = int(word_id.replace('new_', ''))
                        user_word = UserWord.objects.get(id=user_word_id, user=user)
                    else:
                        # 尝试直接转换为整数ID
                        try:
                            user_word_id = int(word_id)
                            user_word = UserWord.objects.get(id=user_word_id, user=user)
                        except ValueError:
                            # 如果不是整数ID，直接返回错误
                            return {
                                'success': False,
                                'message': f'无效的单词ID格式: {word_id}'
                            }
                
                if not user_word:
                    return {
                        'success': False,
                        'message': f'单词不存在或不属于当前用户'
                    }
                
                # 切换收藏状态
                user_word.is_favorite = not user_word.is_favorite
                user_word.save(update_fields=['is_favorite'])
                
                action = "添加到" if user_word.is_favorite else "从"
                return {
                    'success': True,
                    'is_favorite': user_word.is_favorite,
                    'message': f'单词 "{user_word.word_definition.text}" 已{action}收藏夹',
                    'word_id': generate_secure_word_id(user_word.word_definition.text, user.id)
                }
            except UserWord.DoesNotExist as e:
                return {
                    'success': False,
                    'message': f'单词不存在或不属于当前用户: {str(e)}'
                }
        # 通过文本查找
        elif word_text:
            try:
                word_def = WordDefinition.objects.get(text=word_text)
                user_word, created = UserWord.objects.get_or_create(
                    user=user,
                    word_definition=word_def,
                    defaults={'is_favorite': True}  # frequency字段已移除，现在通过引用计数动态计算
                )
                
                if not created:
                    # 如果不是新创建的，则切换收藏状态
                    user_word.is_favorite = not user_word.is_favorite
                    user_word.save(update_fields=['is_favorite'])
            
                action = "添加到" if user_word.is_favorite else "从"
                return {
                    'success': True,
                    'is_favorite': user_word.is_favorite,
                    'message': f'单词 "{word_text}" 已{action}收藏夹',
                    'word_id': generate_secure_word_id(word_def.text, user.id)
                }
            except WordDefinition.DoesNotExist:
                # 如果单词定义不存在，则创建一个
                word_def = WordDefinition.objects.create(
                    text=word_text,
                    language='en'  # 默认为英语
                )
                
                # 创建用户单词并设为收藏
                user_word = UserWord.objects.create(
                    user=user,
                    word_definition=word_def,
                    is_favorite=True,
                    # frequency字段已移除，现在通过引用计数动态计算
                )
                
                return {
                    'success': True,
                    'is_favorite': True,
                    'message': f'单词 "{word_text}" 已添加到收藏夹',
                    'word_id': generate_secure_word_id(word_def.text, user.id)
                }
        
        return {
            'success': False,
            'message': '未提供单词ID或文本'
        }
    except Exception as e:
        return {
            'success': False,
            'message': f'切换收藏状态时出错: {str(e)}'
        }


def check_word_favorite(user, word_id=None, word_text=None):
    """检查单词是否被收藏
    
    Args:
        user: 用户对象
        word_id: 单词ID，可以是整数ID、"new_"开头的ID或"the_哈希"格式的安全ID
        word_text: 单词文本，如果没有提供word_id则使用文本查找
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        # 如果传入的是字典，从字典中提取id或text
        if isinstance(word_id, dict):
            word_dict = word_id
            word_id = word_dict.get('id')
            word_text = word_dict.get('text')
        
        # 通过ID查找
        if word_id:
            try:
                user_word = None
                word_def = None
                
                # 检查是否是安全ID格式 (the_哈希格式)
                if isinstance(word_id, str) and '_' in word_id:
                    parts = word_id.split('_')
                    if len(parts) >= 2:
                        # 单词部分是除了最后一个部分以外的所有部分（处理包含下划线的单词）
                        word_text = '_'.join(parts[:-1])
                        
                        # 使用单词文本查找单词定义
                        word_def = WordDefinition.objects.filter(text=word_text).first()
                        if word_def:
                            user_word = UserWord.objects.filter(user=user, word_definition=word_def).first()
                
                # 如果没有找到用户单词，尝试其他ID格式
                if not user_word:
                    # 如果ID以new_开头，则去掉前缀
                    if isinstance(word_id, str) and word_id.startswith('new_'):
                        user_word_id = int(word_id.replace('new_', ''))
                        user_word = UserWord.objects.get(id=user_word_id, user=user)
                    else:
                        # 尝试直接转换为整数ID
                        try:
                            user_word_id = int(word_id)
                            user_word = UserWord.objects.get(id=user_word_id, user=user)
                        except ValueError:
                            # 如果不是整数ID，直接返回错误
                            return {
                                'success': False,
                                'message': f'无效的单词ID格式: {word_id}'
                            }
                
                if not user_word:
                    return {
                        'success': False,
                        'message': f'单词不存在或不属于当前用户'
                    }
                
                return {
                    'success': True,
                    'is_favorite': user_word.is_favorite,
                    'word_id': generate_secure_word_id(user_word.word_definition.text, user.id)
                }
            except UserWord.DoesNotExist as e:
                return {
                    'success': False,
                    'message': f'单词不存在或不属于当前用户: {str(e)}',
                    'is_favorite': False
                }
        
        # 通过文本查找
        elif word_text:
            try:
                word_def = WordDefinition.objects.get(text=word_text)
                user_word = UserWord.objects.filter(
                    user=user,
                    word_definition=word_def
                ).first()
                
                return {
                    'success': True,
                    'is_favorite': user_word.is_favorite if user_word else False,
                    'word_id': generate_secure_word_id(word_def.text, user.id) if user_word else None
                }
            except WordDefinition.DoesNotExist:
                return {
                    'success': True,
                    'is_favorite': False,
                    'word_id': None
                }
        
        return {
            'success': False,
            'message': '未提供单词ID或文本',
            'is_favorite': False
        }
    except Exception as e:
        return {
            'success': False,
            'message': f'检查收藏状态时出错: {str(e)}',
            'is_favorite': False
        }


def delete_word(user, word_id):
    """删除用户单词
    
    Args:
        user: 用户对象
        word_id: 单词ID，以new_开头
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        if isinstance(word_id, str) and word_id.startswith('new_'):
            user_word_id = int(word_id.replace('new_', ''))
            try:
                user_word = UserWord.objects.get(id=user_word_id, user=user)
                word_text = user_word.word_definition.text
                user_word.delete()
                
                return {
                    'success': True,
                    'message': f'单词 "{word_text}" 已成功删除！'
                }
            except UserWord.DoesNotExist:
                return {
                    'success': False,
                    'message': '单词不存在或不属于当前用户'
                }
        else:
            return {
                'success': False,
                'message': '无效的单词ID格式'
            }
    except Exception as e:
        return {
            'success': False,
            'message': f'删除单词时出错: {str(e)}'
        }


def update_word(user, word_id, updates):
    """更新用户单词的翻译和笔记
    
    Args:
        user: 用户对象
        word_id: 单词ID，以new_开头
        updates: 包含要更新字段的字典
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        if isinstance(word_id, str) and word_id.startswith('new_'):
            user_word_id = int(word_id.replace('new_', ''))
            try:
                user_word = UserWord.objects.get(id=user_word_id, user=user)
                word_def = user_word.word_definition
                
                # 更新笔记（用户级别）
                if 'notes' in updates:
                    user_word.notes = updates['notes']
                    user_word.save(update_fields=['notes'])
                
                # 更新翻译（单词定义级别）
                if 'translation' in updates and updates['translation']:
                    word_def.translation = updates['translation']
                    word_def.save(update_fields=['translation'])
                
                return {
                    'success': True,
                    'message': f'单词 "{word_def.text}" 已成功更新！',
                    'word': {
                        'id': generate_secure_word_id(word_def.text, user.id),
                        'text': word_def.text,
                        'translation': word_def.translation,
                        'notes': user_word.notes
                    }
                }
            except UserWord.DoesNotExist:
                return {
                    'success': False,
                    'message': '单词不存在或不属于当前用户'
                }
        else:
            return {
                'success': False,
                'message': '无效的单词ID格式'
            }
    except Exception as e:
        return {
            'success': False,
            'message': f'更新单词时出错: {str(e)}'
        }


def delete_all_words(user):
    """删除用户的所有单词
    
    Args:
        user: 用户对象
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        # 获取用户单词数量
        word_count = UserWord.objects.filter(user=user).count()
        
        # 获取用户单词的所有ID
        user_word_ids = UserWord.objects.filter(user=user).values_list('id', flat=True)
        
        # 先删除与这些单词相关的所有引用
        from .word_models import WordReference
        reference_count = WordReference.objects.filter(user_word_id__in=user_word_ids).count()
        WordReference.objects.filter(user_word_id__in=user_word_ids).delete()
        
        # 然后删除用户所有单词
        UserWord.objects.filter(user=user).delete()
        
        return {
            'success': True,
            'message': f'成功删除了 {word_count} 个单词和 {reference_count} 个引用'
        }
    except Exception as e:
        return {
            'success': False,
            'message': f'删除所有单词时出错: {str(e)}'
        }


def get_word_detail(user, word_id):
    """获取单词详细信息
    
    Args:
        user: 用户对象
        word_id: 单词ID，以new_开头
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        if isinstance(word_id, str) and word_id.startswith('new_'):
            user_word_id = int(word_id.replace('new_', ''))
            try:
                user_word = UserWord.objects.get(id=user_word_id, user=user)
                word_definition = user_word.word_definition
                
                # 计算单词出现的引用数量
                from .word_models import WordReference
                frequency = WordReference.objects.filter(user_word=user_word).count()
                
                # 包装为统一结构
                word = type('WordWrapper', (), {
                    'id': generate_secure_word_id(word_definition.text, user.id),
                    'text': word_definition.text,
                    'language': word_definition.language,
                    'translation': word_definition.translation,
                    'uk_phonetic': word_definition.uk_phonetic,
                    'us_phonetic': word_definition.us_phonetic,
                    'phonetic': word_definition.phonetic,
                    'has_audio': word_definition.has_audio,
                    'web_translation': word_definition.web_translation,
                    'frequency': frequency,  # 使用计算出的引用频率
                    'notes': user_word.notes,
                    'created_at': user_word.created_at,
                    'is_favorite': user_word.is_favorite,
                    'references': []  # 新模型暂不支持引用
                })
                
                return {
                    'success': True,
                    'word': word,
                    'is_new_model': True
                }
            except UserWord.DoesNotExist:
                return {
                    'success': False,
                    'message': '单词不存在或不属于当前用户'
                }
        else:
            return {
                'success': False,
                'message': '无效的单词ID格式'
            }
    except Exception as e:
        return {
            'success': False,
            'message': f'获取单词详情出错: {str(e)}'
        }


def batch_save_words(user, words_data):
    """批量保存单词
    
    Args:
        user: 用户对象
        words_data: 要保存的单词数据列表，每个元素包含单词信息
    
    Returns:
        dict: 包含操作结果的字典
    """
    try:
        saved_words = []
        failed_words = []
        
        for word_data in words_data:
            # 为每个单词调用save_word
            result = save_word(user, word_data)
            
            if result['success']:
                saved_words.append(word_data.get('text', ''))
            else:
                failed_words.append({
                    'text': word_data.get('text', ''),
                    'error': result.get('message', '未知错误')
                })
        
        return {
            'success': True,
            'saved_count': len(saved_words),
            'failed_count': len(failed_words),
            'saved_words': saved_words,
            'failed_words': failed_words,
            'message': f'成功保存了 {len(saved_words)} 个单词, 失败 {len(failed_words)} 个'
        }
        
    except Exception as e:
        return {
            'success': False,
            'message': f'批量保存单词时出错: {str(e)}'
        }


def generate_secure_word_id(word_text, user_id):
    """生成安全的单词ID，不直接暴露用户ID"""
    # 将单词和用户ID组合后创建哈希值
    key = f"{word_text}_{user_id}_dejavocabsalt"
    hash_obj = hashlib.sha256(key.encode())
    # 取哈希值的前8个字符，生成短且不易猜测的ID
    hash_short = hash_obj.hexdigest()[:8]
    # 返回"单词_哈希"格式
    return f"{word_text}_{hash_short}"

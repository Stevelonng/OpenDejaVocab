from django.db import transaction
from django.contrib.auth.models import User
from .word_models import WordDefinition, UserWord
import hashlib

def get_user_words(user, search_query=None, sort_by='newest', favorites_only=False, paginate=None):
    """Get all words for a user
    
    Only uses the new model to retrieve user words
    
    Args:
        user: User object
        search_query: Search query parameter
        sort_by: Sort method, options: newest, oldest, frequency, frequency_asc, az, za
        favorites_only: Whether to only return favorite words
        paginate: Pagination parameters, format (page, per_page), if provided only returns data for the specified page
    
    Returns:
        list: List of user words
    """
    # Import necessary models
    from django.db.models import Count
    
    # Base query - use select_related to reduce database queries
    query = UserWord.objects.filter(user=user).select_related('word_definition')
    
    # Filter favorite words
    if favorites_only:
        query = query.filter(is_favorite=True)
    
    # Search filter
    if search_query:
        query = query.filter(word_definition__text__icontains=search_query)
    
    # Use annotate to get the number of references for each word, avoid calculating in Python loops
    query = query.annotate(frequency=Count('references'))
    
    # Sorting
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
        # Default sort by frequency descending
        query = query.order_by('-frequency')
    
    # If pagination is needed
    if paginate:
        page, per_page = paginate
        start = (page - 1) * per_page
        end = start + per_page
        query = query[start:end]
    
    # Convert to dictionary format
    words_data = []
    for user_word in query:
        word_def = user_word.word_definition
        
        word_data = {
            'id': generate_secure_word_id(word_def.text, user.id),  # Use secure ID
            'text': word_def.text,
            'language': word_def.language,
            'translation': word_def.translation,
            'uk_phonetic': word_def.uk_phonetic,
            'us_phonetic': word_def.us_phonetic,
            'phonetic': word_def.phonetic,
            'has_audio': word_def.has_audio,
            'web_translation': word_def.web_translation,
            'notes': user_word.notes,
            'frequency': user_word.frequency,  # Use frequency calculated by annotate
            'is_favorite': user_word.is_favorite,
            'created_at': user_word.created_at
        }
        words_data.append(word_data)
    
    return words_data


@transaction.atomic
def save_word(user, word_data):
    """Save word to the new model
    
    Args:
        user: User object
        word_data: Word data, can be a dictionary
    
    Returns:
        dict: Dictionary containing operation results
    """
    try:
        # Extract basic word information
        text = word_data.get('text', '').lower().strip()
        translation = word_data.get('translation', '')
        language = word_data.get('language', 'en')
        notes = word_data.get('notes', '')
        uk_phonetic = word_data.get('uk_phonetic', '')
        us_phonetic = word_data.get('us_phonetic', '')
        phonetic = word_data.get('phonetic', '')
        web_translation = word_data.get('web_translation', '')
        has_audio = word_data.get('has_audio', False)
        
        # Process reference data
        reference_data = word_data.get('reference_data', None)
        
        # Validate required fields
        if not text:
            return {'success': False, 'message': 'Word text cannot be empty'}
        
        # Save to the new model
        try:
            # 1. Get or create word definition
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
            
            # If word definition already exists, may need to update some fields
            if not def_created:
                update_fields = []
                
                # If no translation before, update it
                if not word_def.translation and translation:
                    word_def.translation = translation
                    update_fields.append('translation')
                
                # If no phonetics before, update them
                if not word_def.uk_phonetic and uk_phonetic:
                    word_def.uk_phonetic = uk_phonetic
                    update_fields.append('uk_phonetic')
                if not word_def.us_phonetic and us_phonetic:
                    word_def.us_phonetic = us_phonetic
                    update_fields.append('us_phonetic')
                if not word_def.phonetic and phonetic:
                    word_def.phonetic = phonetic
                    update_fields.append('phonetic')
                    
                # If no audio before, update it
                if not word_def.has_audio and has_audio:
                    word_def.has_audio = has_audio
                    update_fields.append('has_audio')
                    
                # Update web translation
                if not word_def.web_translation and web_translation:
                    word_def.web_translation = web_translation
                    update_fields.append('web_translation')
                    
                if update_fields:
                    word_def.save(update_fields=update_fields)
            
            # 2. Get or create user word
            user_word, user_word_created = UserWord.objects.get_or_create(
                user=user,
                word_definition=word_def,
                defaults={
                    'notes': notes,
                }
            )
            
            # If user word already exists, only update notes
            if not user_word_created:
                # No longer update frequency, frequency will be calculated dynamically through reference count
                
                # If new notes provided, append to existing notes
                if notes:
                    if user_word.notes:
                        user_word.notes += "\n" + notes
                    else:
                        user_word.notes = notes
                        
                user_word.save()
            
            # 3. Process word reference
            if reference_data and isinstance(reference_data, dict):
                # Extract subtitle ID and context position from reference_data
                subtitle_id = reference_data.get('subtitle_id')
                context_start = reference_data.get('context_start')
                context_end = reference_data.get('context_end')
                
                # If necessary reference data provided, create reference
                if subtitle_id is not None and context_start is not None and context_end is not None:
                    try:
                        from .models import Subtitle
                        from .word_models import WordReference
                        
                        # Find the subtitle
                        try:
                            subtitle = Subtitle.objects.get(id=subtitle_id)
                            
                            # Create reference if it doesn't exist
                            word_ref, created = WordReference.objects.get_or_create(
                                user_word=user_word,
                                subtitle=subtitle,
                                defaults={
                                    'context_start': context_start,
                                    'context_end': context_end
                                }
                            )
                            
                            # If reference already exists but context positions have changed, update them
                            if not created:
                                update_ref_fields = []
                                if word_ref.context_start != context_start:
                                    word_ref.context_start = context_start
                                    update_ref_fields.append('context_start')
                                if word_ref.context_end != context_end:
                                    word_ref.context_end = context_end
                                    update_ref_fields.append('context_end')
                                
                                if update_ref_fields:
                                    word_ref.save(update_fields=update_ref_fields)
                            
                        except Subtitle.DoesNotExist:
                            # Subtitle doesn't exist, ignore reference creation
                            pass
                    except Exception as e:
                        # Handle reference creation errors
                        return {'success': False, 'message': f'Error creating word reference: {str(e)}'}
            
            # Generate and return successful result
            return {
                'success': True,
                'message': 'Word saved successfully',
                'is_new': def_created or user_word_created,
                'word': {
                    'id': generate_secure_word_id(word_def.text, user.id),
                    'text': word_def.text,
                    'language': word_def.language,
                    'translation': word_def.translation,
                    'uk_phonetic': word_def.uk_phonetic,
                    'us_phonetic': word_def.us_phonetic,
                    'phonetic': word_def.phonetic,
                    'has_audio': word_def.has_audio,
                    'web_translation': word_def.web_translation,
                    'notes': user_word.notes,
                    'is_favorite': user_word.is_favorite,
                    'created_at': user_word.created_at
                }
            }
            
        except Exception as e:
            # Handle database operation errors
            return {'success': False, 'message': f'Error saving word: {str(e)}'}
    
    except Exception as e:
        # Handle general errors
        return {'success': False, 'message': f'Error processing word data: {str(e)}'}


def toggle_favorite(user, word_id=None, word_text=None):
    """Toggle word favorite status
    
    Args:
        user: User object
        word_id: Word ID, can be integer ID, ID starting with "new_", or secure ID in "the_hash" format
        word_text: Word text, used for lookup if word_id is not provided
    
    Returns:
        dict: Dictionary containing operation results
    """
    try:
        # First find the UserWord object
        user_word = None
        
        if word_id:
            # Parse word_id
            if word_id.startswith('the_'):
                # This is a secure ID, we need to find the actual word
                # Loop through user's words to find the match
                all_words = UserWord.objects.filter(user=user).select_related('word_definition')
                for uw in all_words:
                    secure_id = generate_secure_word_id(uw.word_definition.text, user.id)
                    if secure_id == word_id:
                        user_word = uw
                        break
                if not user_word:
                    return {'success': False, 'message': 'Word not found with given ID'}
            else:
                # Attempting to parse legacy ID (for backward compatibility)
                try:
                    # Try to parse the ID
                    word_numeric_id = word_id
                    if word_id.startswith('new_'):
                        word_numeric_id = word_id[4:]  # Remove 'new_' prefix
                    
                    word_numeric_id = int(word_numeric_id)
                    
                    # First try to find by word_definition id for legacy compatibility
                    try:
                        word_def = WordDefinition.objects.get(id=word_numeric_id)
                        user_word = UserWord.objects.get(user=user, word_definition=word_def)
                    except (WordDefinition.DoesNotExist, UserWord.DoesNotExist):
                        # If not found, try to find directly by UserWord id
                        try:
                            user_word = UserWord.objects.get(id=word_numeric_id, user=user)
                        except UserWord.DoesNotExist:
                            pass
                except (ValueError, TypeError):
                    # If ID parsing fails, proceed to text-based lookup
                    pass
        
        # If not found by ID, try to find by text
        if not user_word and word_text:
            try:
                # Find word definition by text
                word_def = WordDefinition.objects.get(text__iexact=word_text.strip().lower())
                
                # Find user word
                user_word = UserWord.objects.get(user=user, word_definition=word_def)
            except (WordDefinition.DoesNotExist, UserWord.DoesNotExist):
                # Word not found
                return {'success': False, 'message': 'Word not found'}
        
        # If still not found
        if not user_word:
            return {'success': False, 'message': 'Word not found'}
        
        # Toggle favorite status
        user_word.is_favorite = not user_word.is_favorite
        user_word.save(update_fields=['is_favorite'])
        
        # Return result
        return {
            'success': True,
            'message': f'Word {"added to" if user_word.is_favorite else "removed from"} favorites',
            'is_favorite': user_word.is_favorite,
            'word_id': generate_secure_word_id(user_word.word_definition.text, user.id)
        }
    
    except Exception as e:
        # Handle errors
        return {'success': False, 'message': f'Error toggling favorite: {str(e)}'}


def check_word_favorite(user, word_id=None, word_text=None):
    """Check if a word is favorited
    
    Args:
        user: User object
        word_id: Word ID, can be integer ID, ID starting with "new_", or secure ID in "the_hash" format
        word_text: Word text, used for lookup if word_id is not provided
    
    Returns:
        dict: Dictionary containing operation results
    """
    try:
        # First find the UserWord object
        user_word = None
        
        if word_id:
            # Parse word_id
            if word_id.startswith('the_'):
                # This is a secure ID, we need to find the actual word
                # Loop through user's words to find the match
                all_words = UserWord.objects.filter(user=user).select_related('word_definition')
                for uw in all_words:
                    secure_id = generate_secure_word_id(uw.word_definition.text, user.id)
                    if secure_id == word_id:
                        user_word = uw
                        break
                if not user_word:
                    return {'success': False, 'message': 'Word not found with given ID'}
            else:
                # Attempting to parse legacy ID (for backward compatibility)
                try:
                    # Try to parse the ID
                    word_numeric_id = word_id
                    if word_id.startswith('new_'):
                        word_numeric_id = word_id[4:]  # Remove 'new_' prefix
                    
                    word_numeric_id = int(word_numeric_id)
                    
                    # First try to find by word_definition id for legacy compatibility
                    try:
                        word_def = WordDefinition.objects.get(id=word_numeric_id)
                        user_word = UserWord.objects.get(user=user, word_definition=word_def)
                    except (WordDefinition.DoesNotExist, UserWord.DoesNotExist):
                        # If not found, try to find directly by UserWord id
                        try:
                            user_word = UserWord.objects.get(id=word_numeric_id, user=user)
                        except UserWord.DoesNotExist:
                            pass
                except (ValueError, TypeError):
                    # If ID parsing fails, proceed to text-based lookup
                    pass
        
        # If not found by ID, try to find by text
        if not user_word and word_text:
            try:
                # Find word definition by text
                word_def = WordDefinition.objects.get(text__iexact=word_text.strip().lower())
                
                # Find user word
                user_word = UserWord.objects.get(user=user, word_definition=word_def)
            except (WordDefinition.DoesNotExist, UserWord.DoesNotExist):
                # Word not found
                return {'success': False, 'message': 'Word not found'}
        
        # If still not found
        if not user_word:
            return {'success': False, 'message': 'Word not found'}
        
        # Return favorite status
        return {
            'success': True,
            'is_favorite': user_word.is_favorite,
            'word_id': generate_secure_word_id(user_word.word_definition.text, user.id)
        }
    
    except Exception as e:
        # Handle errors
        return {'success': False, 'message': f'Error checking favorite status: {str(e)}'}


def delete_word(user, word_id):
    """Delete user word
    
    Args:
        user: User object
        word_id: Word ID, starting with new_
    
    Returns:
        dict: Dictionary containing operation results
    """
    try:
        user_word = None
        
        # Parse word_id - support secure ID format
        if word_id.startswith('the_'):
            # This is a secure ID, find the actual word
            all_words = UserWord.objects.filter(user=user).select_related('word_definition')
            for uw in all_words:
                secure_id = generate_secure_word_id(uw.word_definition.text, user.id)
                if secure_id == word_id:
                    user_word = uw
                    break
        else:
            # Try legacy ID format
            if word_id.startswith('new_'):
                word_id = word_id[4:]  # Remove 'new_' prefix
            try:
                word_id = int(word_id)
                user_word = UserWord.objects.get(id=word_id, user=user)
            except (ValueError, UserWord.DoesNotExist):
                pass
        
        if not user_word:
            return {'success': False, 'message': 'Word not found'}
        
        # Delete the word
        user_word.delete()
        
        return {'success': True, 'message': 'Word deleted successfully'}
    
    except Exception as e:
        return {'success': False, 'message': f'Error deleting word: {str(e)}'}


def update_word(user, word_id, updates):
    """Update user word translation and notes
    
    Args:
        user: User object
        word_id: Word ID, starting with new_
        updates: Dictionary containing fields to update
    
    Returns:
        dict: Dictionary containing operation results
    """
    try:
        user_word = None
        
        # Parse word_id - support secure ID format
        if word_id.startswith('the_'):
            # This is a secure ID, find the actual word
            all_words = UserWord.objects.filter(user=user).select_related('word_definition')
            for uw in all_words:
                secure_id = generate_secure_word_id(uw.word_definition.text, user.id)
                if secure_id == word_id:
                    user_word = uw
                    break
        else:
            # Try legacy ID format
            if word_id.startswith('new_'):
                word_id = word_id[4:]  # Remove 'new_' prefix
            try:
                word_id = int(word_id)
                user_word = UserWord.objects.get(id=word_id, user=user)
            except (ValueError, UserWord.DoesNotExist):
                pass
        
        if not user_word:
            return {'success': False, 'message': 'Word not found'}
        
        # Get updatable fields
        notes = updates.get('notes')
        translation = updates.get('translation')
        
        # Update UserWord notes
        if notes is not None:
            user_word.notes = notes
            user_word.save(update_fields=['notes'])
        
        # Update WordDefinition translation
        if translation is not None:
            user_word.word_definition.translation = translation
            user_word.word_definition.save(update_fields=['translation'])
        
        return {
            'success': True, 
            'message': 'Word updated successfully',
            'word': {
                'id': generate_secure_word_id(user_word.word_definition.text, user.id),
                'notes': user_word.notes,
                'translation': user_word.word_definition.translation
            }
        }
    
    except Exception as e:
        return {'success': False, 'message': f'Error updating word: {str(e)}'}


def delete_all_words(user):
    """Delete all words for a user
    
    Args:
        user: User object
    
    Returns:
        dict: Dictionary containing operation results
    """
    try:
        # Count words before deletion
        word_count = UserWord.objects.filter(user=user).count()
        
        # Delete all user words
        # This will also cascade delete all word references
        UserWord.objects.filter(user=user).delete()
        
        # Potentially orphaned WordDefinitions could be cleaned up separately if needed
        # WordDefinition.objects.filter(userword__isnull=True).delete()
        
        return {
            'success': True,
            'message': f'Successfully deleted {word_count} words',
            'count': word_count
        }
    
    except Exception as e:
        return {'success': False, 'message': f'Error deleting words: {str(e)}'}


def get_word_detail(user, word_id):
    """Get detailed word information
    
    Args:
        user: User object
        word_id: Word ID, starting with new_
    
    Returns:
        dict: Dictionary containing operation results
    """
    from django.db.models import Count, F
    
    try:
        user_word = None
        
        # Parse word_id - support secure ID format
        if word_id.startswith('the_'):
            # This is a secure ID, find the actual word
            all_words = UserWord.objects.filter(user=user).select_related('word_definition')
            for uw in all_words:
                secure_id = generate_secure_word_id(uw.word_definition.text, user.id)
                if secure_id == word_id:
                    user_word = uw
                    break
        else:
            # Try legacy ID format
            if word_id.startswith('new_'):
                word_id = word_id[4:]  # Remove 'new_' prefix
            try:
                word_id = int(word_id)
                user_word = UserWord.objects.get(id=word_id, user=user)
            except (ValueError, UserWord.DoesNotExist):
                pass
        
        if not user_word:
            return {'success': False, 'message': 'Word not found'}
        
        # Get word definition
        word_def = user_word.word_definition
        
        # Get references with related subtitles and videos
        from .word_models import WordReference
        from .models import Subtitle, Video
        
        refs = WordReference.objects.filter(user_word=user_word) \
            .select_related('subtitle', 'subtitle__video') \
            .order_by('-created_at')
        
        # Format references for output
        references = []
        for ref in refs:
            if ref.subtitle and ref.subtitle.video:
                references.append({
                    'id': ref.id,
                    'text': ref.subtitle.text,
                    'video_title': ref.subtitle.video.title,
                    'video_url': ref.subtitle.video.url,
                    'start_time': ref.subtitle.start_time,
                    'end_time': ref.subtitle.end_time,
                    'created_at': ref.created_at
                })
        
        # Return word details
        return {
            'success': True,
            'word': {
                'id': generate_secure_word_id(word_def.text, user.id),
                'text': word_def.text,
                'language': word_def.language,
                'translation': word_def.translation,
                'uk_phonetic': word_def.uk_phonetic,
                'us_phonetic': word_def.us_phonetic,
                'phonetic': word_def.phonetic,
                'has_audio': word_def.has_audio,
                'web_translation': word_def.web_translation,
                'notes': user_word.notes,
                'is_favorite': user_word.is_favorite,
                'created_at': user_word.created_at,
                'references': references,
                'references_count': len(references)
            }
        }
    
    except Exception as e:
        return {'success': False, 'message': f'Error getting word details: {str(e)}'}


@transaction.atomic
def batch_save_words(user, words_data):
    """Batch save words
    
    Args:
        user: User object
        words_data: List of word data to save, each element contains word information
    
    Returns:
        dict: Dictionary containing operation results
    """
    try:
        if not isinstance(words_data, list):
            return {'success': False, 'message': 'words_data must be a list'}
        
        results = []
        new_word_count = 0  # 新添加的单词计数
        updated_word_count = 0  # 更新了引用的已有单词计数
        processed_count = 0  # 总处理单词计数（新添加+更新引用）
        
        for word_data in words_data:
            result = save_word(user, word_data)
            results.append(result)
            if result.get('success'):
                processed_count += 1
                # 判断是新添加的单词还是更新了引用的已有单词
                if result.get('is_new', False):
                    new_word_count += 1
                else:
                    updated_word_count += 1
        
        return {
            'success': True,
            'message': f'成功处理 {processed_count} 个单词（新增: {new_word_count}, 更新引用: {updated_word_count}）',
            'total': len(words_data),
            'saved_count': processed_count,  # 总处理单词数
            'new_word_count': new_word_count,  # 新添加的单词数
            'updated_word_count': updated_word_count,  # 更新了引用的已有单词数
            'results': results
        }
    
    except Exception as e:
        return {'success': False, 'message': f'Error batch saving words: {str(e)}'}


def generate_secure_word_id(word_text, user_id):
    """Generate secure word ID, does not directly expose user ID"""
    # Combine word text and user ID
    combined = f"{word_text.lower().strip()}_{user_id}"
    # Create hash
    hashed = hashlib.md5(combined.encode()).hexdigest()
    # Return secure ID with prefix
    return f"the_{hashed}"

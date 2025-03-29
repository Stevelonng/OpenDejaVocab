import re
from collections import Counter
import spacy
from .models import Video, Subtitle
from .word_models import UserWord
from .word_adapter import save_word, toggle_favorite, batch_save_words
from youdao.spider import YoudaoSpider

# Load English model
def load_english_model():
    """Load English spaCy model and configure it to not split contractions"""
    try:
        # Load model
        nlp = spacy.load('en_core_web_sm')
        
        # Define list of common contractions
        contractions = [
            "'s", "'ve", "'re", "'d", "'ll", "'m", "n't", "'t",
            "ain't", "aren't", "can't", "couldn't", "didn't", "doesn't", "don't", "hadn't",
            "hasn't", "haven't", "he's", "here's", "i'm", "isn't", "it's", "let's",
            "mustn't", "shan't", "she's", "shouldn't", "that's", "there's", "they're",
            "wasn't", "we're", "we've", "weren't", "what's", "where's", "who's", "won't",
            "wouldn't", "y'all", "you're", "you've", "you'll", "you'd"
        ]
        
        # Custom tokenization rules to treat contractions as complete words
        infix_re = spacy.util.compile_infix_regex(
            list(nlp.Defaults.infixes) + [r'''[\-_~]'''] + 
            [r'''(?<=[a-zA-Z])\'(?=[a-zA-Z])''']  # Match apostrophes as part of words
        )
        nlp.tokenizer.infix_finditer = infix_re.finditer

        return nlp
    except OSError:
        print("Warning: English model not found. Please install it with 'python -m spacy download en_core_web_sm'")
        raise


class WordExtractor:
    """Extract English words from subtitles and store them in the database"""
    
    def __init__(self, user):
        self.user = user
        self.language = 'en'  # Fixed to English
        # Load English model
        self.nlp = load_english_model()
    
    def clean_text(self, text):
        """Clean text by removing punctuation and special characters"""
        # Remove HTML tags
        text = re.sub(r'<.*?>', '', text)
        # Remove URLs
        text = re.sub(r'http\S+', '', text)
        # Remove special characters but keep letters, numbers and spaces
        text = re.sub(r'[^\w\s]', ' ', text)
        # Remove extra spaces
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    
    def get_word_data(self, word_text, download_audio=False):
        """
        Use Youdao Dictionary to get word translation, phonetic symbols, and check if pronunciation is available
        :param word_text: Word text
        :param download_audio: Whether to download audio file, default is False
        """
        try:
            spider = YoudaoSpider(word_text)
            result = spider.get_result(use_api=False)
            
            # Check if there are valid translation results
            if result['errorCode'] == 0 and 'basic' in result and 'explains' in result['basic'] and result['basic']['explains']:
                # Build return data
                word_data = {
                    'translation': '\n'.join(result['basic']['explains']),
                    'uk_phonetic': '',
                    'us_phonetic': '',
                    'phonetic': '',
                    'has_audio': False,
                    'web_translation': ''  # Add web translation field
                }
                
                # Process phonetic information
                if 'basic' in result:
                    if 'uk-phonetic' in result['basic']:
                        word_data['uk_phonetic'] = result['basic']['uk-phonetic']
                    if 'us-phonetic' in result['basic']:
                        word_data['us_phonetic'] = result['basic']['us-phonetic']
                    if 'phonetic' in result['basic']:
                        word_data['phonetic'] = result['basic']['phonetic']
                
                # Process web translations - completely rewritten to improve formatting
                if 'web' in result and result['web']:
                    web_trans_formatted = []
                    
                    for item in result['web']:
                        key = item.get('key', '')
                        values = item.get('value', [])
                        if key and values:
                            # Each phrase on a separate line, using symbols for separation
                            web_trans_formatted.append(f"● {key}: {' | '.join(values)}")
                    
                    if web_trans_formatted:
                        word_data['web_translation'] = '\n'.join(web_trans_formatted)
                
                # Only check if audio file is available, don't download
                try:
                    if download_audio:
                        # If need to download audio
                        voice_file = spider.get_voice(word_text, download=True)
                        if voice_file:
                            word_data['has_audio'] = True
                    else:
                        # Only check if audio file is available, don't download
                        voice_file = spider.get_voice(word_text, download=False)
                        if voice_file:
                            word_data['has_audio'] = True
                except Exception as audio_err:
                    print(f"Error checking pronunciation for word '{word_text}': {str(audio_err)}")
                    # Pronunciation check failure doesn't affect word addition
                    pass
                    
                return word_data
            return None
        except Exception as e:
            print(f"Error getting data for word '{word_text}': {str(e)}")
            return None
    
    def is_valid_word(self, text):
        """Check if it's a valid word or contraction"""
        # Check if it's a contraction (like it's, can't)
        contraction_pattern = r"[A-Za-z]+'[a-zA-Z]+"
        if re.match(contraction_pattern, text) and "'" in text:
            return True
            
        # Exclude cases with only special characters
        if not any(c.isalpha() for c in text):
            return False
            
        # Exclude abnormally long words (possibly multiple words incorrectly merged)
        if len(text) > 30:
            return False
            
        return True
    
    def extract_words_from_subtitle(self, subtitle):
        """Extract words and their context from a single subtitle, add translations and phonetic symbols, but don't download pronunciations"""
        # Get subtitle text
        text = subtitle.text
        if not text:
            return []
        
        # Use spaCy to analyze text
        doc = self.nlp(text)
        
        # Collect positions of identified words
        word_positions = []
        
        # Iterate through all tokens
        for token in doc:
            token_text = token.text.strip()
            
            # Skip whitespace, punctuation, and already processed words
            if token_text and not token.is_punct and not token.is_space:
                if not any(token.idx >= start and token.idx + len(token_text) <= end 
                       for _, start, end in word_positions):
                    # Filter valid words
                    if self.is_valid_word(token_text):
                        word_positions.append((token_text, token.idx, token.idx + len(token_text)))
        
        # Collect data for all processed words
        words_data = []
        
        # Process each found word
        for word_text, start, end in word_positions:
            # Get word data (translation, phonetics, pronunciation), and automatically download pronunciation files
            word_data = self.get_word_data(word_text, download_audio=True)
            
            # If translation couldn't be obtained, skip this word
            if word_data is None:
                continue
                
            # Build word data
            word_info = {
                'text': word_text.lower(),
                'language': self.language,
                # Remove hardcoded frequency, frequency will be calculated dynamically through reference counts
                'translation': word_data['translation'],
                'uk_phonetic': word_data['uk_phonetic'],
                'us_phonetic': word_data['us_phonetic'],
                'phonetic': word_data['phonetic'],
                'has_audio': word_data['has_audio'],
                'web_translation': word_data.get('web_translation', ''),
                'reference_data': {
                    'subtitle_id': subtitle.id,
                    'context_start': start,
                    'context_end': end
                }
            }
            
            # Add to batch processing list
            words_data.append(word_info)
        
        # Batch save words
        if words_data:
            result = batch_save_words(self.user, words_data)
            return result
        
        return {
            'success': True,
            'saved_count': 0,
            'message': 'No valid words found'
        }
    
    def process_video(self, video):
        """Process all subtitles of a single video"""
        subtitles = Subtitle.objects.filter(video=video)
        word_count = 0
        new_word_count = 0
        updated_count = 0
        
        for subtitle in subtitles:
            result = self.extract_words_from_subtitle(subtitle)
            word_count += result.get('saved_count', 0)
            new_word_count += result.get('new_word_count', 0)
            updated_count += result.get('updated_word_count', 0)
            
        # Return the detailed processing result.    
        return {
            'processed_count': word_count,
            'new_count': new_word_count, 
            'updated_count': updated_count
        }
    
    def process_all_videos(self, force_reprocess=False):
        """Process all videos of the user, extract words"""
        videos = Video.objects.filter(user=self.user)
        total_results = {
            'processed_count': 0,
            'new_count': 0,
            'updated_count': 0
        }
        
        for video in videos:
            # 处理每个视频，聚合结果
            result = self.process_video(video)
            total_results['processed_count'] += result.get('processed_count', 0)
            total_results['new_count'] += result.get('new_count', 0)
            total_results['updated_count'] += result.get('updated_count', 0)
            
        return total_results
        
    def get_word_context(self, user_word_id, subtitle_id=None, context_chars=40):
        """Get the context of a word in a subtitle, and highlight the target word
        
        Note: Due to changes in the data model, this function needs to be redesigned
        For now, it returns an empty string
        """
        # Get user word
        try:
            user_word = UserWord.objects.get(id=user_word_id, user=self.user)
            word_text = user_word.word_definition.text
            
            # If a subtitle ID is provided, try to get the context from that subtitle
            if subtitle_id:
                subtitle = Subtitle.objects.get(id=subtitle_id)
                subtitle_text = subtitle.text
                
                # Try to find the word position in the text
                pattern = r'\b' + re.escape(word_text.lower()) + r'\b'
                matches = list(re.finditer(pattern, subtitle_text.lower()))
                
                if matches:
                    # Use the first match
                    match = matches[0]
                    start_pos = match.start()
                    end_pos = match.end()
                    
                    # Calculate the start and end positions of the context
                    context_start = max(0, start_pos - context_chars)
                    context_end = min(len(subtitle_text), end_pos + context_chars)
                    
                    # Extract the context text
                    context_before = subtitle_text[context_start:start_pos]
                    word_in_context = subtitle_text[start_pos:end_pos]
                    context_after = subtitle_text[end_pos:context_end]
                    
                    # Add ellipsis if the context is truncated
                    if context_start > 0:
                        context_before = "..." + context_before
                    if context_end < len(subtitle_text):
                        context_after = context_after + "..."
                        
                    # Combine the context, and highlight the target word
                    full_context = f"{context_before}<strong>{word_in_context}</strong>{context_after}"
                    return full_context
            
            # If no context is found, return the word itself
            return f"<strong>{word_text}</strong> (no context)"
            
        except (UserWord.DoesNotExist, Subtitle.DoesNotExist):
            return ""

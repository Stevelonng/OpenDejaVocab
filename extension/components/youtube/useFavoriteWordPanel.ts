import { ref, computed, nextTick, Ref, onMounted, onUnmounted } from 'vue';
import { WordReferenceInVideo } from './useVideoFavoriteWords';

/**
 * Subtitle data structure definition
 */
export interface Subtitle {
  id?: number;
  startTime: number;
  endTime: number;
  text: string;
  saved?: boolean;
}

/**
 * Favorite word occurrences in the video
 */
export interface FavoriteWordInVideo {
  word: string;
  subtitle: Subtitle;
  contextStart: number;
  contextEnd: number;
  isFavorite: boolean;
}

/**
 * Provides utility functions for the favorite word panel
 * Includes subtitle filtering, word highlighting, and other features
 * 
 * @param subtitles Subtitle data
 * @param favoriteWordsInVideo Favorite words data in the video
 * @param processTextToHighlightWords Function to process text to highlight words
 * @returns Favorite word panel related functionality
 */
export function useFavoriteWordPanel(
  subtitles: Ref<Subtitle[]>,
  favoriteWordsInVideo: Ref<FavoriteWordInVideo[]>,
  processTextToHighlightWords: (text: string) => string,
  seekToWordInVideo?: (wordReference: WordReferenceInVideo) => void
) {
  // Currently active (filtered) word
  const activeWord = ref<string | null>(null);
  
  // Get all occurrences of a word
  const getWordOccurrences = (word: string) => {
    if (!favoriteWordsInVideo.value) return [];
    return favoriteWordsInVideo.value.filter(item => item.word === word);
  };

  // Filtered subtitle list
  const filteredSubtitles = computed(() => {
    if (!activeWord.value) return subtitles.value;
    
    // Get information about word occurrences
    const occurrences = getWordOccurrences(activeWord.value);
    if (!occurrences.length) return subtitles.value;
    
    // Filter using subtitles where the word appears
    return occurrences.map(occurrence => occurrence.subtitle);
  });

  /**
   * Filter subtitles based on word
   * @param word Word to filter by
   */
  const filterSubtitlesByWord = (word: string) => {
    // If this word is already selected, clear the filter
    if (activeWord.value === word) {
      activeWord.value = null;
      return;
    }
    
    // Set active word
    activeWord.value = word;
    
    // Get word occurrence information
    const occurrences = getWordOccurrences(word);
    if (occurrences.length === 0) return;
    
    // Scroll to the first match after the next render cycle
    nextTick(() => {
      setTimeout(() => {
        const firstMatch = document.querySelector('.filter-match');
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Original highlight effect has been removed
      }, 150);
    });
  };

  // addVisualMarkerToFirstMatch function has been removed

  // clearSubtitleFilter function has been removed, directly set activeWord.value = null when needed

  /**
   * Process subtitle text to make words hoverable and clickable
   * @param text Original subtitle text
   * @returns Processed HTML string
   */
  const getProcessedSubtitleText = (text: string) => {
    return processTextToHighlightWords(text);
  };



  /**
   * Create a global click handler
   * If click is not inside the menu or on a word item, close the menu
   */
  const handleGlobalClick = (event: MouseEvent) => {
    if (activeWord.value !== null) {
      const target = event.target as HTMLElement;
      const isMenuClick = target.closest('.word-occurrences-menu') !== null;
      const isWordClick = target.closest('.favorite-word-item') !== null;
      const isSubtitleClick = target.closest('.subtitle-item') !== null;
      
      if (!isMenuClick && !isWordClick && !isSubtitleClick) {
        activeWord.value = null;
      }
    }
  };

  // Add and clean up global click event
  onMounted(() => {
    document.addEventListener('click', handleGlobalClick);
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleGlobalClick);
  });

  return {
    activeWord,
    filteredSubtitles,
    getWordOccurrences,
    filterSubtitlesByWord,
    getProcessedSubtitleText,
    handleGlobalClick
  };
}

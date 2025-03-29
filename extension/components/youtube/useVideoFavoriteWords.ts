import { ref, Ref, computed, watch } from 'vue';
import { browser } from 'wxt/browser';

// Word reference in video
export interface WordReferenceInVideo {
  word: string;
  subtitle: {
    id: number;
    text: string;
    startTime: number;
    endTime: number;
  };
  contextStart: number;
  contextEnd: number;
  isFavorite: boolean;
}

/**
 * Video favorite words functionality
 * Extracts words from the current video that are in the user's favorites
 */
export function useVideoFavoriteWords(
  currentVideoTime: Ref<number>,
  currentVideoInfo: Ref<any>,
  subtitles: Ref<any[]>,
  favoriteWords: Ref<Set<string>>
) {
  // State
  const loading = ref(false);
  const error = ref<string | null>(null);
  const videoWordReferences = ref<WordReferenceInVideo[]>([]);
  
  // Computed property: words in the current video that are in the user's favorites
  const favoriteWordsInVideo = computed(() => {
    return videoWordReferences.value.filter(ref => 
      favoriteWords.value.has(ref.word.toLowerCase())
    );
  });
  
  // Computed property: unique words from the user's favorites that appear in the current video
  const uniqueFavoriteWords = computed(() => {
    // Extract all words
    const words = favoriteWordsInVideo.value.map(ref => ref.word);
    // Remove duplicates
    return [...new Set(words)];
  });
  
  /**
   * When backend API is not available, extract words from subtitles and create references
   */
  const createReferencesFromSubtitles = () => {
    
    if (!subtitles.value || subtitles.value.length === 0) {
      return;
    }
    
    if (!favoriteWords.value || favoriteWords.value.size === 0) {
      return;
    }
    
    // Store all found word references
    const references: WordReferenceInVideo[] = [];
    
    // Filter out words from the user's favorites that appear in the current video
    const favWords = Array.from(favoriteWords.value);
    
    // Iterate through all subtitles
    for (const subtitle of subtitles.value) {
      const text = subtitle.text;
      
      // Find if any of the user's favorite words appear in the current subtitle
      for (const word of favWords) {
        try {
          // Use regex to match entire word, avoid partial matches
          // Use word boundary \b to ensure complete word matching, ignoring case
          const regex = new RegExp(`\\b${word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
          const match = text.match(regex);
          
          // If match found
          if (match) {
            const matchedWord = match[0]; // Actual matched word (preserves original case)
            const index = text.indexOf(matchedWord);
            
            references.push({
              word: word, // Save original favorited word
              subtitle: {
                id: subtitle.id || 0,
                text: subtitle.text,
                startTime: subtitle.startTime,
                endTime: subtitle.endTime
              },
              contextStart: index,
              contextEnd: index + matchedWord.length,
              isFavorite: true
            });
          }
        } catch (e) {
        }
      }
    }
    
    videoWordReferences.value = references;
    
    // If no references found, clear error state
    if (references.length === 0) {
    } else {
      // Successfully extracted, clear error
      error.value = null;
    }
  };
  
  /**
   * Fetch word references in video from backend
   */
  const fetchVideoWordReferences = async (): Promise<void> => {
    if (!currentVideoInfo.value) {
      error.value = 'No current video information';
      // If subtitle information exists, try to extract from subtitles
      if (subtitles.value && subtitles.value.length > 0 && favoriteWords.value.size > 0) {
        createReferencesFromSubtitles();
      }
      return;
    }
    
    try {
      loading.value = true;
      error.value = null;
      
      // If subtitles exist and there are favorited words, extract from subtitles first for quick display
      if (subtitles.value && subtitles.value.length > 0 && favoriteWords.value.size > 0) {
        createReferencesFromSubtitles();
      }
      
      // Get API settings and authentication token from storage
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      
      if (!authToken) {
        throw new Error('Authentication token not found, cannot fetch data from backend');
      }
      
      // Build API URL
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      // Get video details to obtain video ID
      const videoUrl = `https://www.youtube.com/watch?v=${currentVideoInfo.value.videoId}`;
      const videoResponse = await fetch(`${baseUrl}videos/?url=${encodeURIComponent(videoUrl)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!videoResponse.ok) {
        throw new Error('Failed to get video information');
      }
      
      const videoData = await videoResponse.json();
      
      // Check if video data exists
      if (!videoData.results || videoData.results.length === 0) {
        throw new Error('Video data not found');
      }
      
      // Find matching video
      let videoId = null;
      for (const video of videoData.results) {
        const urlVideoId = video.url.match(/(?:youtube\.com\/watch\?v=|\/videos\/|youtu\.be\/|embed\/|\?v=)([^&?\n]+)/)?.[1];
        if (urlVideoId === currentVideoInfo.value.videoId) {
          videoId = video.id;
          break;
        }
      }
      
      if (!videoId) {
        throw new Error('Could not find matching video ID');
      }      
      
      // Get all word references in the video
      const wordReferencesResponse = await fetch(`${baseUrl}video/${videoId}/word-references/`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!wordReferencesResponse.ok) {
        // If API endpoint doesn't exist, try to extract words from existing subtitles
        createReferencesFromSubtitles();
        return;
      }
      
      const wordReferencesData = await wordReferencesResponse.json();
      
      // Format data
      videoWordReferences.value = wordReferencesData.map((ref: any) => ({
        word: ref.user_word.word_definition.text,
        subtitle: {
          id: ref.subtitle.id,
          text: ref.subtitle.text,
          startTime: ref.subtitle.start_time,
          endTime: ref.subtitle.end_time
        },
        contextStart: ref.context_start,
        contextEnd: ref.context_end,
        isFavorite: ref.user_word.is_favorite
      }));      
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      
      // Set error state
      error.value = `Fetch failed: ${errorMessage}`;
      
      // If subtitle information exists and there are favorited words, try to extract from subtitles
      if (subtitles.value && subtitles.value.length > 0 && favoriteWords.value.size > 0) {
        createReferencesFromSubtitles();
      }
    } finally {
      loading.value = false;
    }
  };
  
  /**
   * Jump to the time point where the word appears in the video
   * @param wordReference Word reference information
   */
  const seekToWordInVideo = (wordReference: WordReferenceInVideo): void => {
    // Get video element and set current time
    const videoElement = document.querySelector('video');
    if (videoElement) {
      videoElement.currentTime = wordReference.subtitle.startTime;
      videoElement.play().catch(err => console.error('Failed to play:', err));
    }
  };
  
  // Watch for video changes and automatically fetch word references for new videos
  watch(() => currentVideoInfo.value?.videoId, (newVideoId, oldVideoId) => {
    if (newVideoId) {
      // Reset states
      videoWordReferences.value = [];
      error.value = null;
      // Get word references for new video
      fetchVideoWordReferences();
    }
  }, { immediate: true }); // Add immediate: true to ensure trigger on initial load
  
  // Watch for favorite word changes and update word list
  watch(favoriteWords, () => {
    // Always re-extract favorited words from subtitles to ensure data is up-to-date
    if (subtitles.value && subtitles.value.length > 0) {
      createReferencesFromSubtitles();
    }
  }, { deep: true, immediate: true }); // Add immediate: true to ensure trigger on initial load
  
  // Watch for subtitle changes
  watch(subtitles, (newSubtitles) => {
    // When subtitles finish loading, try to extract favorited words from subtitles
    if (newSubtitles && newSubtitles.length > 0 && favoriteWords.value.size > 0) {
      // If backend loading failed or no word references yet, use subtitle extraction
      if (error.value || videoWordReferences.value.length === 0) {
        createReferencesFromSubtitles();
      }
    }
  }, { deep: true, immediate: true }); // Add immediate: true to ensure trigger on initial load
  
  // Initial load - cancel this call here since we already use immediate: true in watch to trigger
  
  return {
    loading,
    error,
    videoWordReferences,
    favoriteWordsInVideo,
    uniqueFavoriteWords,
    fetchVideoWordReferences,
    seekToWordInVideo
  };
}

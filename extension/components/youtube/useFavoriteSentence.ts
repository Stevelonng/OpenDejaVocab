import { ref, Ref, computed, watch, onMounted } from 'vue';
import { browser } from 'wxt/browser';

/**
 * Subtitle favorite functionality
 * Provides add, remove, and check favorite status
 * Integrates with backend API for permanent storage
 */
export const useFavoriteSentence = (subtitles: Ref<any[]>) => {
  // Array of favorited subtitle indices and ID mappings
  const favoritedIndices = ref<number[]>([]);
  const subtitleIdMapping = ref<Record<number, number>>({});
  const sentenceIdMapping = ref<Record<number, number>>({}); // New sentence ID mapping
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);


  // Save subtitle to backend
  const saveSentenceToBackend = async (text: string, subtitle: any) => {
    const { apiUrl: storedApiUrl, authToken } = await browser.storage.local.get(['apiUrl', 'authToken']);
    const apiUrl = storedApiUrl || 'https://dejavocab.com/';
    
    if (!apiUrl || !authToken) return;

    // Ensure API URL ends with /
    const baseApiUrl = typeof apiUrl === 'string' && apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    
    const subtitleId = subtitle.id || subtitleIdMapping.value[subtitle.index];
    const videoId = subtitle.videoId;
    const videoTitle = subtitle.videoTitle || 'YouTube Video';
    const videoUrl = subtitle.videoUrl || window.location.href;
    
    if (!videoId) return;
    
    // First check whether the video exists. If it does not exist, create it
    try {
      const videoResponse = await fetch(`${baseApiUrl}videos/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        },
        body: JSON.stringify({
          url: videoUrl,
          title: videoTitle,
          platform: 'YouTube'
        })
      });
      
      if (!videoResponse.ok) return;
    } catch (error) {
      // Continue execution, because the video may already exist
    }
    
    let finalSubtitleId = subtitleId;
    if (!finalSubtitleId) {
      // Find subtitle ID
      try {
        const findResponse = await fetch(`${baseApiUrl}subtitles/?video_id=${videoId}&text=${encodeURIComponent(text)}`, {
          headers: {
            'Authorization': `Token ${authToken}`
          }
        });
        
        if (findResponse.ok) {
          const subtitles = await findResponse.json();
          
          if (subtitles.results && subtitles.results.length > 0) {
            finalSubtitleId = subtitles.results[0].id;
            subtitleIdMapping.value[subtitle.index] = finalSubtitleId;
          }
        }
      } catch (error) {
        // Continue execution, because the subtitle may already exist
      }
    }
    
    // Build request data
    const requestData: any = {
      text,
      subtitle_id: finalSubtitleId,
      translation: '', // Add translation API
      notes: `From video: ${subtitle.videoTitle || 'YouTube Video'}`
    };
    
    // Prepare request
    
    // Send save sentence request to backend API
    const sentenceResponse = await fetch(`${baseApiUrl}add-sentence/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${authToken}`
      },
      body: JSON.stringify(requestData)
    });
    
    if (!sentenceResponse.ok) {
      const errorText = await sentenceResponse.text();
      throw new Error(`Failed to save sentence: ${sentenceResponse.status} ${errorText}`);
    }
    
    const savedSentence = await sentenceResponse.json();
    
    // Update sentence ID mapping for future unfavoriting
    if (savedSentence && savedSentence.sentence_id) {
      sentenceIdMapping.value[subtitle.index] = savedSentence.sentence_id;
    } else if (savedSentence && savedSentence.id) {
      sentenceIdMapping.value[subtitle.index] = savedSentence.id;
    }
    
    return savedSentence;
  };

  // Remove sentence from backend
  const removeSentenceFromBackend = async (sentenceId: number) => {
    const { apiUrl: storedApiUrl, authToken } = await browser.storage.local.get(['apiUrl', 'authToken']);
    const apiUrl = storedApiUrl || 'https://dejavocab.com/';
    
    if (!apiUrl || !authToken) {
      throw new Error('Missing API URL or authentication token');
    }
    
    // Ensure API URL ends with /
    const baseApiUrl = typeof apiUrl === 'string' && apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    
    // Record the information of the deletion request.
    console.log(`[DEBUG] Removing sentence ID: ${sentenceId}`);
    
    // First try the explicit unfavorite endpoint
    let url = `${baseApiUrl}unfavorite-sentence/`;
    console.log(`[DEBUG] Trying POST request to unfavorite endpoint: ${url}`);
    
    try {
      // First try the explicit unfavorite endpoint
      let response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        },
        body: JSON.stringify({ sentence_id: sentenceId })
      });
      
      // Record the response status
      console.log(`[DEBUG] Response status from unfavorite endpoint: ${response.status}`);
      
      // If the explicit endpoint fails, fallback to standard REST DELETE method
      if (!response.ok) {
        console.log(`[DEBUG] Unfavorite endpoint failed, trying standard DELETE request`);
        
        // Try the standard REST DELETE method
        url = `${baseApiUrl}sentences/${sentenceId}/`;
        console.log(`[DEBUG] Sending DELETE request to: ${url}`);
        
        response = await fetch(url, {
          method: 'DELETE', // REST API typically employs the DELETE method to delete resources.
          headers: {
            'Authorization': `Token ${authToken}`
          }
        });
        
        // Record the response status
        console.log(`[DEBUG] Response status from DELETE request: ${response.status}`);
      }
      
      if (!response.ok) {
        const responseBody = await response.text();
        console.log(`[DEBUG] Error response body: ${responseBody}`);
        throw new Error(`Failed to delete sentence ${sentenceId}: ${response.status} ${responseBody}`);
      }
      
      // Finally, try a forced refresh of the favorite status
      try {
        const refreshUrl = `${baseApiUrl}refresh-favorites/?sentence_id=${sentenceId}`;
        console.log(`[DEBUG] Sending refresh request to: ${refreshUrl}`);
        
        await fetch(refreshUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Token ${authToken}`
          }
        });
      } catch (refreshErr) {
        // Ignore refresh errors, it won't affect the main process.
        console.log(`[DEBUG] Refresh request failed, but continuing: `, refreshErr);
      }
      
      console.log(`[DEBUG] Successfully deleted sentence ${sentenceId}`);
      return true;
    } catch (error) {
      console.error(`[ERROR] Failed to delete sentence:`, error);
      throw error;
    }
  };


  /**
   * Check if a subtitle is favorited
   * @param index subtitle index
   * @returns true if favorited, false otherwise
   */
  const isFavorited = (index: number): boolean => {
    return favoritedIndices.value.includes(index);
  };

  /**
   * Toggle the favorite status of a subtitle
   * @param index subtitle index
   * @param subtitle subtitle object
   */
  const toggleFavorite = async (index: number, subtitle: any) => {
    try {
      if (isFavorited(index)) {
        // If already favorited, then unfavor
        loading.value = true;
        error.value = null;
        
        // Get sentence ID
        let sentenceId = sentenceIdMapping.value[index];
        console.log(`[DEBUG] Attempting to unfavorite index ${index}, sentence ID: ${sentenceId}`);
        console.log(`[DEBUG] Current sentenceIdMapping:`, sentenceIdMapping.value);
        console.log(`[DEBUG] Favorited indices:`, favoritedIndices.value);
        
        if (!sentenceId && subtitle?.text) {
          // If the sentence ID is not found by index, try to find it from the API
          console.log(`[DEBUG] Trying to find sentence ID by text: "${subtitle.text}"`);
          
          try {
            const { apiUrl: storedApiUrl, authToken } = await browser.storage.local.get(['apiUrl', 'authToken']);
            const apiUrl = storedApiUrl || 'https://dejavocab.com/';
            
            if (apiUrl && authToken) {
              // Ensure API URL ends with /
              const baseApiUrl = typeof apiUrl === 'string' && apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
              
              // Try to find the sentence by text
              const findResponse = await fetch(
                `${baseApiUrl}sentences/?text=${encodeURIComponent(subtitle.text)}`, 
                {
                  headers: {
                    'Authorization': `Token ${authToken}`
                  }
                }
              );
              
              if (findResponse.ok) {
                const data = await findResponse.json();
                if (data.results && data.results.length > 0) {
                  // Use the first matching result
                  sentenceId = data.results[0].id;
                  console.log(`[DEBUG] Found sentence by text match: ID ${sentenceId}`);
                  
                  // Update the mapping
                  sentenceIdMapping.value[index] = sentenceId;
                }
              }
            }
          } catch (err) {
            console.error('[ERROR] Failed to find sentence by text:', err);
          }
        }
        
        if (!sentenceId) {
          error.value = 'Unable to find sentence ID';
          console.error(`[ERROR] No sentence ID found for index ${index}`);
          loading.value = false;
          return;
        }
        
        // Call backend API to delete sentence
        console.log(`[INFO] Removing sentence from backend: ${sentenceId}`);
        await removeSentenceFromBackend(sentenceId);
        console.log(`[INFO] Successfully removed sentence ${sentenceId}`);
        
        // Remove from favorites list
        const indexInFavorites = favoritedIndices.value.indexOf(index);
        if (indexInFavorites !== -1) {
          favoritedIndices.value.splice(indexInFavorites, 1);
        }
        
        // Remove from ID mapping
        delete sentenceIdMapping.value[index];
      } else {
        // If not favorited, then favor
        loading.value = true;
        error.value = null;
        
        // Check if subtitle has text
        if (!subtitle || !subtitle.text) {
          error.value = 'Invalid subtitle';
          return;
        }
        
        // Ensure subtitle object has video ID and title
        if (!subtitle.videoId) {
          error.value = 'Missing video ID';
          return;
        }
        
        // Save sentence to backend
        const result = await saveSentenceToBackend(subtitle.text, subtitle);
        
        // If save successful, add to favorites list
        if (result) {
          favoritedIndices.value.push(index);
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      loading.value = false;
    }
  };

  /**
   * Load favorited sentences from backend
   * @param videoId video ID
   * @param retryCount retry count, default is 0
   */
  const loadFavoritesFromBackend = async (videoId: string, retryCount = 0) => {
    try {
      loading.value = true;
      error.value = null;
      
      // Reset favorite state
      favoritedIndices.value = [];
      sentenceIdMapping.value = {};
      
      // Check if subtitles array is empty
      if (subtitles.value.length === 0) {
        if (retryCount < 5) {
          // Retry mechanism
          setTimeout(() => {
            loadFavoritesFromBackend(videoId, retryCount + 1);
          }, 1000);
        }
        loading.value = false;
        return;
      }
      
      const { apiUrl: storedApiUrl, authToken } = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = storedApiUrl || 'https://dejavocab.com/';
      
      if (!apiUrl || !authToken) return;
      
      // Ensure API URL ends with /
      const baseApiUrl = typeof apiUrl === 'string' && apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      // Request API to get favorited sentences for this video
      const response = await fetch(`${baseApiUrl}sentences/?video_id=${videoId}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      // Process favorited sentence data
      const favorites = data.results || [];
      
      // Match current subtitles with favorited sentences
      for (const favorite of favorites) {
        // Check if there is timestamp information
        if (favorite.start_time !== null && favorite.end_time !== null) {
          // Find matching subtitle index - using timestamp matching
          const matchingSubtitleIndex = subtitles.value.findIndex(subtitle => {
            // Allow small timestamp matching error (0.5 second tolerance)
            const startTimeMatch = Math.abs(subtitle.startTime - favorite.start_time) < 0.5;
            const endTimeMatch = Math.abs(subtitle.endTime - favorite.end_time) < 0.5;
            return startTimeMatch && endTimeMatch;
          });
          
          if (matchingSubtitleIndex !== -1) {
            // Find matching subtitle
            favoritedIndices.value.push(matchingSubtitleIndex);
            sentenceIdMapping.value[matchingSubtitleIndex] = favorite.id;
            continue; // Already found match, continue to next
          }
        }
        
        // Timestamp matching failed, try text matching
        const matchingSubtitleByTextIndex = subtitles.value.findIndex(subtitle => {
          return subtitle.text === favorite.text;
        });
        
        if (matchingSubtitleByTextIndex !== -1) {
          // Find matching subtitle
          favoritedIndices.value.push(matchingSubtitleByTextIndex);
          sentenceIdMapping.value[matchingSubtitleByTextIndex] = favorite.id;
        }
      }
      
      // Load completed
    } catch (err) {
      // Error handling
    } finally {
      loading.value = false;
    }
  };

  return {
    favoritedIndices,
    loading,
    error,
    isFavorited,
    toggleFavorite,
    loadFavoritesFromBackend,
    saveSentenceToBackend,
    removeSentenceFromBackend,
  };
}

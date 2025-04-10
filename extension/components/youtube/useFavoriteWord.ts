import { ref, computed, onMounted, onUnmounted } from 'vue';

// Storage key constants
const STORAGE_KEY = 'favoritedWords';
const FAVORITE_SECTION_VISIBLE_KEY = 'favoriteSectionVisible';
// Custom event names for cross-tab communication
const FAVORITE_WORD_UPDATED_EVENT = 'dejavocab-favorite-word-updated';
const FAVORITE_SECTION_TOGGLE_EVENT = 'dejavocab-favorite-section-toggle';

/**
 * Favorite Word Functionality
 * Handles favoriting and unfavoriting words, always using the backend server as the data source, local storage only serves as offline cache
 */
export function useFavoriteWord() {
  // Collection of favorited words
  const favoriteWords = ref<Set<string>>(new Set());
  // Loading state
  const isLoading = ref(false);
  // API base URL - dynamically retrieved at runtime
  const apiBaseUrl = ref<string>('');
  // Whether already loaded from backend
  const loadedFromBackend = ref(false);
  // Whether favorite UI is enabled (always true, variable kept for compatibility with existing code)
  const favoriteUIEnabled = ref(true);
  // Whether to show favorite words section
  const favoriteSectionVisible = ref(true);

  /**
   * Load favorited words from backend
   */
  const loadFavoriteWords = async (): Promise<void> => {
    isLoading.value = true;

    try {
      // Get API settings and authentication token
      const { apiUrl, authToken } = await chrome.storage.local.get(['apiUrl', 'authToken']);

      // Set API URL
      if (!apiUrl) {
        throw new Error('API URL not configured, please configure in extension settings');
      }
      apiBaseUrl.value = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;

      // If no authentication token, try loading from local cache
      if (!authToken) {
        await loadFromLocalCache();
        return;
      }

      // Get all favorite words from backend API
      const response = await fetch(`${apiBaseUrl.value}favorite-words/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.words)) {
          // Clear existing collection
          favoriteWords.value.clear();

          // Add words retrieved from backend
          data.words.forEach((wordObj: { text: string }) => {
            favoriteWords.value.add(wordObj.text.toLowerCase());
          });

          // Update loading state
          loadedFromBackend.value = true;

          // Save loaded words to local cache
          await updateLocalCache();
        }
      } else {
        // Handle unauthenticated or other errors        
        if (response.status === 401) {
          // Mark as attempted to load - avoid repeated requests
          loadedFromBackend.value = true;
        }
        
        // Load from local cache
        await loadFromLocalCache();
      }
    } catch (error) {
      // If an error occurs, try loading from local cache
      await loadFromLocalCache();
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load favorite words from local cache (only used for offline or when loading fails)
   */
  const loadFromLocalCache = async (): Promise<void> => {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      const storedWords = result[STORAGE_KEY] || [];

      // Clear existing collection and add stored words
      favoriteWords.value.clear();
      storedWords.forEach((word: string) => {
        favoriteWords.value.add(word.toLowerCase());
      });
  };

  /**
   * Update local cache to stay consistent with current favorite words collection
   */
  const updateLocalCache = async (): Promise<void> => {
      const wordsArray = Array.from(favoriteWords.value);
      await chrome.storage.local.set({ [STORAGE_KEY]: wordsArray });
  };

  /**
   * Load UI display settings from local storage
   */
  const loadUISettings = async (): Promise<void> => {
    try {
      const result = await chrome.storage.local.get([
        FAVORITE_SECTION_VISIBLE_KEY
      ]);
      
      // If setting exists, use it; otherwise default to enabled (true)
      favoriteSectionVisible.value = result[FAVORITE_SECTION_VISIBLE_KEY] !== false;  
      // Update style of all word elements based on settings
      updateAllWordElementsStyle();
    } catch (error) {
      // Default to enabled if error occurs
      favoriteSectionVisible.value = true;
    }
  };

  /**
   * Save UI display settings to local storage
   */
  const saveUISettings = async (): Promise<void> => {
      await chrome.storage.local.set({ 
        [FAVORITE_SECTION_VISIBLE_KEY]: favoriteSectionVisible.value
      });
  };

  /**
   * Toggle visibility of favorite words section
   */
  const toggleFavoriteSection = async (): Promise<boolean> => {
    // Toggle state
    favoriteSectionVisible.value = !favoriteSectionVisible.value;
    
    // Save settings
    await saveUISettings();
    
    // Broadcast state change
    broadcastFavoriteSectionToggle(favoriteSectionVisible.value);
    
    return favoriteSectionVisible.value;
  };

  /**
   * Broadcast favorite section state change
   * @param visible Whether visible
   */
  const broadcastFavoriteSectionToggle = (visible: boolean): void => {
      // Create custom event
      const event = new CustomEvent(FAVORITE_SECTION_TOGGLE_EVENT, {
        detail: { visible }
      });
      
      // Dispatch event
      document.dispatchEvent(event);    
  };

  /**
   * Handle favorite section state change event
   * @param event Custom event object
   */
  const handleFavoriteSectionToggle = (event: CustomEvent): void => {
    const { visible } = event.detail;
    
    // Update state
    favoriteSectionVisible.value = visible;
  };

  /**
   * Update style of all word elements on the page
   */
  const updateAllWordElementsStyle = (): void => {
      // Find all word elements on the page
      const wordElements = document.querySelectorAll('.hoverable-word');
      
      // Iterate and update styles
      wordElements.forEach(element => {
        // Get word content
        const word = element.textContent?.trim().toLowerCase();
        
        if (!word) return;
        
        // Unconditionally apply favorite style, no longer using favoriteUIEnabled
        if (favoriteWords.value.has(word)) {
          element.classList.add('favorite-word');
          element.classList.remove('favorite-ui-hidden');
        } else {
          // Not a favorite word, remove related styles
          element.classList.remove('favorite-word', 'favorite-ui-hidden');
        }
      });
  };

  /**
   * Broadcast favorite word state change
   * Notify all pages and tabs to update favorite status via custom event
   * @param word Changed word
   * @param isFavorite Whether favorited
   */
  const broadcastFavoriteWordChange = (word: string, isFavorite: boolean): void => {
      // Create custom event to notify other content scripts
      const event = new CustomEvent(FAVORITE_WORD_UPDATED_EVENT, {
        detail: { word: word.toLowerCase(), isFavorite }
      });

      // Dispatch event to current document
      document.dispatchEvent(event);
  };

  /**
   * Handle favorite word state change event
   * @param event Custom event object
   */
  const handleFavoriteWordChange = (event: CustomEvent): void => {
    const { word, isFavorite } = event.detail;

    if (!word) return;

    // Update local state based on event
    if (isFavorite) {
      favoriteWords.value.add(word.toLowerCase());

      // Update all matching word elements on the page
      updateWordElementsStyle(word, true);
    } else {
      favoriteWords.value.delete(word.toLowerCase());

      // Update all matching word elements on the page
      updateWordElementsStyle(word, false);
    }
  };

  /**
   * Update style of all matching word elements on the page
   * @param word Word
   * @param isFavorite Whether favorited
   */
  const updateWordElementsStyle = (word: string, isFavorite: boolean): void => {
      // Find all matching word elements on the page
      const elements = document.querySelectorAll(`.hoverable-word[data-word="${word.toLowerCase()}"]`);

      // Update styles
      elements.forEach(el => {
        if (isFavorite) {
          el.classList.add('favorite-word');
        } else {
          el.classList.remove('favorite-word');
        }
      });
  };

  /**
   * Sync word favorite status with backend API
   * @param word Word to sync
   * @param isFavorite Whether favorited
   */
  const syncFavoriteWordWithBackend = async (word: string, isFavorite: boolean): Promise<boolean> => {
    try {
      // Get API URL and authentication token from storage
      const { apiUrl, authToken } = await chrome.storage.local.get(['apiUrl', 'authToken']);

      // Cannot sync to backend without authentication token
      if (!authToken) {
        return false;  // Default to failed operation when no token
      }

      // Build API URL
      if (!apiUrl) {
        throw new Error('API URL not configured, please configure in extension settings');
      }
      
      // Ensure API URL ends with /
      const baseApiUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      // Check if the URL already contains 'api/' to avoid duplicate path segments
      const toggleUrl = baseApiUrl.includes('api/') ? 
        `${baseApiUrl}web/toggle-favorite/` : 
        `${baseApiUrl}api/web/toggle-favorite/`;
      
      // Build request body
      const formData = new FormData();
      formData.append('word', word);
      formData.append('action', isFavorite ? 'add-favorite' : 'remove-favorite');

      // Send request
      const response = await fetch(toggleUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${authToken}`
        },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          // Immediately broadcast change to ensure all pages update in real-time
          broadcastFavoriteWordChange(word, data.is_favorite);
          return data.is_favorite;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  /**
   * Check if a word is favorited
   * @param word Word to check
   * @returns Whether favorited
   */
  const isFavoriteWord = (word: string): boolean => {
    return favoriteWords.value.has(word.toLowerCase());
  };

  /**
   * Toggle favorite status of a word
   * @param word Word to toggle
   * @returns Favorite status after toggle
   */
  const toggleFavoriteWord = async (word: string): Promise<boolean> => {
    const lowerWord = word.toLowerCase();
    const isCurrentlyFavorited = favoriteWords.value.has(lowerWord);

    try {
      // Immediately update UI for instant feedback (optimistic update)
      if (isCurrentlyFavorited) {
        favoriteWords.value.delete(lowerWord);
        updateWordElementsStyle(lowerWord, false);
      } else {
        favoriteWords.value.add(lowerWord);
        updateWordElementsStyle(lowerWord, true);
      }

      // Try to toggle favorite status in backend
      const backendResult = await syncFavoriteWordWithBackend(word, !isCurrentlyFavorited);

      // If backend result is inconsistent with local expectation, revert to backend state
      if (backendResult !== !isCurrentlyFavorited) {
        if (backendResult) {
          favoriteWords.value.add(lowerWord);
          updateWordElementsStyle(lowerWord, true);
        } else {
          favoriteWords.value.delete(lowerWord);
          updateWordElementsStyle(lowerWord, false);
        }
      }

      // Update local cache
      await updateLocalCache();

      return backendResult;
    } catch (error) {
      // Revert to original state
      if (isCurrentlyFavorited) {
        favoriteWords.value.add(lowerWord);
        updateWordElementsStyle(lowerWord, true);
      } else {
        favoriteWords.value.delete(lowerWord);
        updateWordElementsStyle(lowerWord, false);
      }
      await updateLocalCache();
      return isCurrentlyFavorited;
    }
  };

  /**
   * Get list of all favorite words
   */
  const allFavoriteWords = computed(() => {
    return Array.from(favoriteWords.value);
  });

  /**
   * Add word to favorites
   * @param word Word to favorite
   */
  const addFavoriteWord = async (word: string): Promise<boolean> => {
    const lowerWord = word.toLowerCase();

    if (favoriteWords.value.has(lowerWord)) {
      return true; // Already favorited, no need to operate
    }

    // Optimistic UI update
    favoriteWords.value.add(lowerWord);
    updateWordElementsStyle(lowerWord, true);

    // Try to add favorite in backend
    const backendResult = await syncFavoriteWordWithBackend(word, true);

    // If backend operation fails, restore UI state
    if (!backendResult) {
      favoriteWords.value.delete(lowerWord);
      updateWordElementsStyle(lowerWord, false);
    }

    // Update local cache
    await updateLocalCache();

    return backendResult;
  };

  /**
   * Remove word from favorites
   * @param word Word to remove
   */
  const removeFavoriteWord = async (word: string): Promise<boolean> => {
    const lowerWord = word.toLowerCase();

    if (!favoriteWords.value.has(lowerWord)) {
      return true; // Already not in favorites, no need to operate
    }

    // Optimistic UI update
    favoriteWords.value.delete(lowerWord);
    updateWordElementsStyle(lowerWord, false);

    // Try to remove favorite in backend
    const backendResult = await syncFavoriteWordWithBackend(word, false);

    // If backend operation fails (returns true means still in favorites), restore UI state
    if (backendResult) {
      favoriteWords.value.add(lowerWord);
      updateWordElementsStyle(lowerWord, true);
      await updateLocalCache();
      return false;
    }

    // Update local cache
    await updateLocalCache();
    return true;
  };

  /**
   * Clear all favorite words
   */
  const clearFavoriteWords = async (): Promise<void> => {
    // Save copy of current favorite words to remove from backend one by one
    const wordsToRemove = Array.from(favoriteWords.value);

    // Clear local collection
    favoriteWords.value.clear();

    // Update local cache
    await updateLocalCache();

    // Remove from backend one by one
    for (const word of wordsToRemove) {
      await syncFavoriteWordWithBackend(word, false);
    }

    // Reload from backend to ensure consistency
    await loadFavoriteWords();
  };

  /**
   * Batch import favorite words
   * @param words Array of words
   */
  const importFavoriteWords = async (words: string[]): Promise<void> => {
    let successCount = 0;

    // Add words to backend one by one
    for (const word of words) {
      if (word) {
        const result = await syncFavoriteWordWithBackend(word, true);
        if (result) {
          successCount++;
        }
      }
    }
    // Reload from backend to ensure consistency
    await loadFavoriteWords();
  };

  /**
   * Export favorite words as array
   */
  const exportFavoriteWords = (): string[] => {
    return Array.from(favoriteWords.value);
  };

  // Automatically load favorite words and set up event listeners when component mounts
  onMounted(() => {
    // Load UI settings
    loadUISettings();
    
    // Load favorite words
    loadFavoriteWords();
    
    // Listen for authentication token changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['authToken']) {
        // Reload favorite words when authentication token changes
        loadFavoriteWords();
      }
      // Listen for favorite section setting changes
      if (area === 'local' && changes[FAVORITE_SECTION_VISIBLE_KEY]) {
        favoriteSectionVisible.value = changes[FAVORITE_SECTION_VISIBLE_KEY].newValue;
      }
    });
    
    // Add custom event listeners for real-time updates across pages
    document.addEventListener(
      FAVORITE_WORD_UPDATED_EVENT,
      ((e: CustomEvent) => handleFavoriteWordChange(e)) as EventListener
    );
    
    // Add favorite section setting change listener
    document.addEventListener(
      FAVORITE_SECTION_TOGGLE_EVENT,
      ((e: CustomEvent) => handleFavoriteSectionToggle(e)) as EventListener
    );
  });
  
  // Remove event listeners when component unmounts
  onUnmounted(() => {
    document.removeEventListener(
      FAVORITE_WORD_UPDATED_EVENT,
      ((e: CustomEvent) => handleFavoriteWordChange(e)) as EventListener
    );
    
    document.removeEventListener(
      FAVORITE_SECTION_TOGGLE_EVENT,
      ((e: CustomEvent) => handleFavoriteSectionToggle(e)) as EventListener
    );
  });
  
  // Return utility functions
  return {
    favoriteWords,
    isLoading,
    isFavoriteWord,
    toggleFavoriteWord,
    allFavoriteWords,
    addFavoriteWord,
    removeFavoriteWord,
    clearFavoriteWords,
    importFavoriteWords,
    exportFavoriteWords,
    loadFavoriteWords,
    favoriteSectionVisible,
    toggleFavoriteSection
  };
}
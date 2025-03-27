import { ref } from 'vue';

/**
 * Used to play the pronunciation of a word
 * Provides word pronunciation functionality, interacting with backend API to get pronunciation audio
 */
export function usePronunciation() {
  // Audio player instance
  const audioPlayer = ref<HTMLAudioElement | null>(null);
  // Pronunciation loading state
  const isLoading = ref(false);
  // Pronunciation error message
  const error = ref<string | null>(null);
  // Whether pronunciation is currently playing
  const isPlaying = ref(false);
  // Whether auto-play is enabled (default enabled)
  const autoPlayEnabled = ref(true);

  /**
   * Play the pronunciation of a word
   * @param word The word to play the pronunciation
   * @returns Whether the pronunciation was successfully played
   */
  const playPronunciation = async (word: string): Promise<boolean> => {
    if (!word) return false;
    
    // Clear previous errors
    error.value = null;
    
    try {
      isLoading.value = true;
      
      // Get API configuration
      const result = await chrome.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('Missing API URL or authentication information');
      }
      
      // Build pronunciation API URL
      const pronunciationUrl = `${baseUrl}web/word-pronunciation/${encodeURIComponent(word.toLowerCase())}/`;
      
      // Create or get audio player
      if (!audioPlayer.value) {
        audioPlayer.value = new Audio();
        
        // Add event listeners
        audioPlayer.value.addEventListener('ended', () => {
          isPlaying.value = false;
        });
        
        audioPlayer.value.addEventListener('error', (e) => {
          isPlaying.value = false;
          error.value = 'Failed to play pronunciation';
        });
      }
      
      // Stop current playing audio
      if (isPlaying.value && audioPlayer.value) {
        audioPlayer.value.pause();
        audioPlayer.value.currentTime = 0;
      }
      
      // Set audio source to pronunciation API URL and add authentication token
      const audioSrc = pronunciationUrl;
      
      // Set request headers (pass token through URL parameters, because Audio element does not support setting headers)
      const audioUrlWithToken = `${audioSrc}?token=${encodeURIComponent(authToken)}`;
      
      // Set audio source
      audioPlayer.value.src = audioUrlWithToken;
      
      // Play audio
      isPlaying.value = true;
      try {
        await audioPlayer.value.play();
      } catch (err) {
        throw err;
      }
      
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to play pronunciation';
      isPlaying.value = false;
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Stop current playing pronunciation
   */
  const stopPronunciation = (): void => {
    if (audioPlayer.value && isPlaying.value) {
      audioPlayer.value.pause();
      audioPlayer.value.currentTime = 0;
      isPlaying.value = false;
    }
  };

  /**
   * Toggle auto-play pronunciation
   * @returns The new state
   */
  const toggleAutoPlay = (): boolean => {
    autoPlayEnabled.value = !autoPlayEnabled.value;
    
    // Save to local storage
    chrome.storage.local.set({ 'pronunciationAutoPlay': autoPlayEnabled.value });
    
    return autoPlayEnabled.value;
  };

  /**
   * Load auto-play pronunciation setting from local storage
   */
  const loadSettings = async (): Promise<void> => {
    try {
      const result = await chrome.storage.local.get(['pronunciationAutoPlay']);
      // If setting exists, use it; otherwise default to enabled
      autoPlayEnabled.value = result.pronunciationAutoPlay !== false;
    } catch (error) {
      // If error, default to enabled
      autoPlayEnabled.value = true;
    }
  };

  // Initialize by loading settings
  loadSettings();

  return {
    isLoading,
    isPlaying,
    error,
    autoPlayEnabled,
    playPronunciation,
    stopPronunciation,
    toggleAutoPlay
  };
}

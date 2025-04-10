import { browser } from 'wxt/browser';
import { ref, onMounted } from 'vue';
import { getCurrentVideoInfo } from './StorageVideo';
import { VideoInfo } from './InfoVideo';
import { useVideoNavigation } from './useVideoNavigation';
import { 
  Subtitle, 
  ApiSubtitle, 
  convertApiSubtitleToInternal
} from './InfoSubtitles';
import {
  hasLocalSubtitles,
  saveSubtitlesToStorage
} from './StorageSubtitles';

/**
 * Auto Subtitle Collection Hook
 * Automatically collects subtitles and saves them to localStorage when a YouTube page loads
 */

// Default API configuration (production environment only)
const DEFAULT_API_URL = 'http://47.245.54.174:8000/';

// Create auto subtitle hook
export function useAutoSubtitles() {
  // State management
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const currentVideo = ref<VideoInfo | null>(null);
  const isAutoCollectEnabled = ref(true);

  // Initialization and setup
  onMounted(async () => {
    // Check if auto collection is enabled
    try {
      const storage = await browser.storage.local.get('autoCollectEnabled') as { autoCollectEnabled?: boolean };
      isAutoCollectEnabled.value = storage.autoCollectEnabled !== false; // Default is enabled
      
      // Set up video navigation listener
      const { updateCurrentVideo } = useVideoNavigation((videoId, title) => {
        // Automatically collect subtitles when video changes
        if (isAutoCollectEnabled.value) {
          autoFetchSubtitles();
        }
      });
      
      // Initial check of current video and attempt to collect
      updateCurrentVideo();
      
      // Also set up page navigation listener (for SPA in-page navigation)
      setupNavigationListener();
    } catch (error) {
      console.error('[Auto Subtitle] Initialization error:', error);
    }
  });
  
  // Get API base URL
  async function getApiBaseUrl(): Promise<{ baseUrl: string, authToken: string | null }> {
    // Get API configuration from local storage
    const storage = await browser.storage.local.get(['apiUrl', 'authToken']) as { apiUrl?: string, authToken?: string };
    let apiUrl = storage.apiUrl || '';
    const authToken = storage.authToken || '';
    
    // If API URL is not configured, use default production environment
    if (!apiUrl) {
      apiUrl = DEFAULT_API_URL;
    }
    
    // Ensure URL ends with "/"
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    return { baseUrl, authToken };
  }
  
  // Automatically fetch subtitles
  async function autoFetchSubtitles(): Promise<void> {
    if (isLoading.value) return; // Prevent duplicate requests
    
    try {
      isLoading.value = true;
      error.value = null;
      
      // Check if auto collection is enabled
      if (!isAutoCollectEnabled.value) {
        isLoading.value = false;
        return;
      }
      
      // Get current video information
      const videoInfo = await getCurrentVideoInfo();
      if (!videoInfo) {
        error.value = 'Unable to get video information';
        isLoading.value = false;
        return;
      }
      
      // Check if subtitles are already saved in local storage
      if (await hasLocalSubtitles(videoInfo.videoId)) {
        isLoading.value = false;
        return;
      }
      
      // Get API configuration
      const { baseUrl, authToken } = await getApiBaseUrl();
      
      if (!baseUrl) {
        error.value = 'Unable to determine API URL';
        isLoading.value = false;
        return;
      }
      
      if (!authToken) {
        error.value = 'Not logged in, please login first';
        isLoading.value = false;
        return;
      }
            
      // Call auto subtitle API to get subtitles
      const response = await fetch(`${baseUrl}auto-subtitles/?url=${encodeURIComponent(videoInfo.url)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // Record to local storage to avoid repeated attempts
          const noSubtitleVideos = await browser.storage.local.get(['noSubtitleVideos']) as { noSubtitleVideos?: string[] };
          const videos = noSubtitleVideos.noSubtitleVideos || [];
          
          if (!videos.includes(videoInfo.videoId)) {
            videos.push(videoInfo.videoId);
            await browser.storage.local.set({ noSubtitleVideos: videos });
          }
          
          error.value = 'No subtitles available for this video';
          isLoading.value = false;
          return;
        } else if (response.status === 401 || response.status === 403) {
          showNotification('Authentication failed, please login to your DejaVocab account again');
          error.value = 'Authentication failed, please login again';
          isLoading.value = false;
          return;
        } else {
          showNotification(`Failed to get subtitles (${response.status}), please try again later`);
          error.value = `Retrieval failed: ${response.status}`;
          isLoading.value = false;
          return;
        }
      }
      
      const data = await response.json();
      
      if (data.subtitles && Array.isArray(data.subtitles)) {
        // Convert subtitle format
        const formattedSubtitles: Subtitle[] = data.subtitles.map((sub: ApiSubtitle) => convertApiSubtitleToInternal(sub));
        
        // Save to local storage
        await saveSubtitlesToStorage({ subtitles: formattedSubtitles, videoInfo });
        
      } else {
        error.value = 'Returned data format is incorrect';
      }
      
      isLoading.value = false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error';
      isLoading.value = false;
    }
  }
  
  // Monitor YouTube video changes
  function setupNavigationListener(): void {
    // Current URL
    let lastUrl = window.location.href;
    
    // Create an observer to monitor URL changes
    const observer = new MutationObserver(() => {
      // Check if URL has changed
      if (window.location.href !== lastUrl) {
        // URL has changed, possibly a new video
        lastUrl = window.location.href;
        
        // If it's a YouTube video page, try to get subtitles for the new video
        if (window.location.href.includes('youtube.com/watch')) {
          // Delay execution to ensure page is fully loaded
          setTimeout(autoFetchSubtitles, 2000);
        }
      }
    });
    
    // Start observing document subtree changes
    observer.observe(document, { childList: true, subtree: true });
  }
  
  // Display notification message
  function showNotification(message: string, duration: number = 5000): void {
    try {
      // Check if notification element already exists
      let notificationElement = document.getElementById('dejavu-auto-subtitle-notification');
      
      if (!notificationElement) {
        // Create notification element
        notificationElement = document.createElement('div');
        notificationElement.id = 'dejavu-auto-subtitle-notification';
        notificationElement.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background-color: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px 15px;
          border-radius: 4px;
          z-index: 9999;
          font-family: Arial, sans-serif;
          font-size: 14px;
          max-width: 300px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          transition: opacity 0.3s ease-in-out;
        `;
        document.body.appendChild(notificationElement);
      }
      
      // Update message
      notificationElement.textContent = `DejaVocab: ${message}`;
      notificationElement.style.opacity = '1';
      
      // Set up automatic fade out
      setTimeout(() => {
        if (notificationElement) {
          notificationElement.style.opacity = '0';
          setTimeout(() => {
            // Ensure element still exists
            if (notificationElement && notificationElement.parentNode) {
              notificationElement.parentNode.removeChild(notificationElement);
            }
          }, 300); // Remove after fade out animation completes
        }
      }, duration);
    } catch (error) {
      console.error('[Auto Subtitle] Notification display error:', error);
    }
  }
  
  // Public methods
  return {
    isLoading,
    error,
    isAutoCollectEnabled,
    currentVideo,
    autoFetchSubtitles,
    
    // Set whether auto collection is enabled
    setAutoCollectEnabled: async (enabled: boolean) => {
      await browser.storage.local.set({ autoCollectEnabled: enabled });
      isAutoCollectEnabled.value = enabled;
      console.log(`[Auto Subtitle] Auto collection is ${enabled ? 'enabled' : 'disabled'}`);
    }
  };
}

// Get YouTube video ID
function getYouTubeVideoId(url: string): string | null {
  const urlParams = new URL(url);
  const videoId = urlParams.searchParams.get('v');
  return videoId || null;
}

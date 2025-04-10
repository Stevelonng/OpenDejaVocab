import { ref, onMounted, onUnmounted } from 'vue';
import { updateVideoInfoStorage } from './StorageVideo';
import { getYouTubeVideoId, cleanYouTubeTitle } from './InfoVideo';

/**
 * Handles YouTube video navigation and URL changes
 * @param onVideoChange Callback function when video changes
 * @returns Reactive object containing current video ID and title
 */
export function useVideoNavigation(onVideoChange?: (videoId: string, videoTitle: string) => void) {
  // Store current video information
  const currentVideoId = ref<string>('');
  const currentVideoTitle = ref<string>('');

  // Update current video information
  const updateCurrentVideo = () => {
      const url = window.location.href;
      const videoId = getYouTubeVideoId(url);
      const title = typeof document !== 'undefined' ? cleanYouTubeTitle(document.title) : '';

      // Update condition: check if video ID or title has changed
      if (videoId && (videoId !== currentVideoId.value || title !== currentVideoTitle.value)) {
        currentVideoId.value = videoId;
        currentVideoTitle.value = title;

        // If a callback function is provided, call it
        if (onVideoChange) {
          onVideoChange(videoId, title);
        }
        
        // Update video information in storage
        updateVideoInfoStorage(videoId, title);
      }
  };

  // Observe browser history changes
  const handleHistoryChange = () => {
    updateCurrentVideo();
  };

  // Observe URL changes in two ways
  // 1. Use MutationObserver to listen to document.title changes
  let titleObserver: MutationObserver | null = null;

  // 2. Intercept history API
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  // Initialize observers
  const initObservers = () => {
    // Listen to title changes
    titleObserver = new MutationObserver(() => {
      updateCurrentVideo();
    });

    titleObserver.observe(document.querySelector('title') || document.head, {
      subtree: true,
      characterData: true,
      childList: true
    });

    // Listen to popstate event (back/forward buttons)
    window.addEventListener('popstate', handleHistoryChange);

    // Intercept history.pushState
    window.history.pushState = function(...args) {
      const result = originalPushState.apply(this, args);
      handleHistoryChange();
      return result;
    };

    // Intercept history.replaceState
    window.history.replaceState = function(...args) {
      const result = originalReplaceState.apply(this, args);
      handleHistoryChange();
      return result;
    };

    // Update current video information immediately
    updateCurrentVideo();
  };

  // Cleanup observers
  const cleanupObservers = () => {
    if (titleObserver) {
      titleObserver.disconnect();
      titleObserver = null;
    }

    window.removeEventListener('popstate', handleHistoryChange);
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
  };

  // Initialize observers on mount
  onMounted(() => {
    // Wait a short time to ensure YouTube page is fully loaded
    setTimeout(() => {
      initObservers();
      
      // Force an immediate update attempt after a small delay
      setTimeout(() => {
        updateCurrentVideo();
      }, 500);
    }, 1000);
  });

  // Cleanup observers on unmount
  onUnmounted(() => {
    cleanupObservers();
  });

  // Return reactive references and methods
  return {
    currentVideoId,
    currentVideoTitle,
    updateCurrentVideo,
    updateVideoInfoStorage
  };
}

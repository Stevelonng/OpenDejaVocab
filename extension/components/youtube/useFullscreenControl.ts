import { ref, Ref } from 'vue';

export function useFullscreenControl(
  videoElement: Ref<HTMLVideoElement | null>, 
  restoreVideo: () => void, 
) {
  const isFullscreen = ref(false);
  const immersiveMode = ref(false);

  // Function to prevent scroll penetration
  const preventScroll = (e: Event) => {
    // Only prevent scrolling in fullscreen mode
    if (isFullscreen.value) {
      // Get the target element of the event
      const target = e.target as HTMLElement;
      
      // If the target element is inside the subtitles container, allow scrolling
      const subtitlesContainer = document.querySelector('.subtitles-container');
      if (subtitlesContainer && (subtitlesContainer.contains(target) || subtitlesContainer === target)) {
        // Allow scrolling, don't prevent default behavior
        return;
      }
      
      // Prevent scrolling in other areas
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Toggle fullscreen mode
  const toggleFullscreen = (captureVideo: () => boolean) => {
    isFullscreen.value = !isFullscreen.value;
    
    if (isFullscreen.value) {
      // Prevent the YouTube interface from scrolling behind and hide all scrollbars
      document.documentElement.style.overflow = 'hidden'; // Apply to <html> element
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      
      // Hide all scrollbars (for various browsers)
      const hideScrollbarsStyle = document.createElement('style');
      hideScrollbarsStyle.id = 'hide-scrollbars-style';
      hideScrollbarsStyle.textContent = `
        body::-webkit-scrollbar, html::-webkit-scrollbar { display: none !important; }
        body, html { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      `;
      document.head.appendChild(hideScrollbarsStyle);
      
      // Add scroll prevention events
      document.addEventListener('wheel', preventScroll, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });
      
      // Ensure we have the video element
      if (!videoElement.value) {
        if (!captureVideo()) {
          isFullscreen.value = false;
          return;
        }
      } else {
        // If we already have a video element but it's not in the fullscreen container, need to recapture
        captureVideo();
      }
    } else {
      // Restore scrolling
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      
      // Remove the style that hides scrollbars
      const hideScrollbarsStyle = document.getElementById('hide-scrollbars-style');
      if (hideScrollbarsStyle) {
        hideScrollbarsStyle.remove();
      }
      
      // Remove scroll prevention events
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      
      // Use the new restore function to ensure the video continues playing
      restoreVideo();
    }
  };

  // Subtitle dragging functionality has been removed
  
  // Toggle immersive mode
  const toggleImmersive = () => {
    immersiveMode.value = !immersiveMode.value;
  };


  /**
   * Enhanced toggle fullscreen function
   * Can receive additional parameters: subtitle fetch function and video capture function
   */
  const createEnhancedToggleFullscreen = (
    fetchSubtitles: (forceRefresh: boolean, collect: boolean) => Promise<void>,
    captureVideo: (updateFn: (time: number) => void) => boolean
  ) => {
    return async () => {
      // Fetch subtitles before entering fullscreen mode
      if (!isFullscreen.value) {
        // Only fetch subtitles when entering fullscreen mode, and allow collection
        await fetchSubtitles(false, true); // Call subtitle fetch function, second parameter indicates subtitles should be collected
      }
      
      // Call the basic fullscreen toggle function
      toggleFullscreen(() => captureVideo((time) => {}));
    };
  };
  
  return {
    isFullscreen,
    immersiveMode,
    preventScroll,
    toggleFullscreen,
    toggleImmersive,
    createEnhancedToggleFullscreen
  };
}
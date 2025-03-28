import { ref, onUnmounted } from 'vue';
import browser from 'webextension-polyfill';
import { getCurrentVideoTitle } from './InfoVideo';

export function useYouTubePlayer() {
  // Check if there is a YouTube video on the page
  const hasVideoOnPage = ref(false);
  // State variables
  const videoElement = ref<HTMLVideoElement | null>(null);
  const originalVideoContainer = ref<HTMLElement | null>(null);
  const currentVideoTime = ref(0);
  const youtubePlayer = ref<HTMLElement | null>(null);
  const videoPlaceholder = ref<HTMLElement | null>(null);
  const playerContainer = ref<HTMLElement | null>(null);
  const wasPlaying = ref(false);
  const lastVideoSrc = ref<string>('');
  const lastVideoDuration = ref<number>(0);
  const lastDetectedVideoId = ref<string | null>(null);
  
  // Video switch event
  const videoSwitchEvent = new CustomEvent('youtube-video-switched', {
    detail: { timestamp: Date.now() }
  });

  // Find the complete YouTube player container
  const findYouTubePlayerContainer = (element: HTMLElement): HTMLElement | null => {
    // First try to find the direct player container
    let container = element.closest('.html5-video-player') as HTMLElement;
    if (container) return container;
    
    // If not found, try to find a larger container
    container = document.querySelector('#player-container') as HTMLElement;
    if (container) return container;
    
    // Continue trying other possible containers
    container = document.querySelector('#player') as HTMLElement;
    if (container) return container;
    
    // If still can't find, return the original element
    return element;
  };
  
  // Create picture-in-picture effect (fallback solution)
  const createPictureInPicture = (originalVideo: HTMLVideoElement, container: HTMLElement) => {
    
    // Create a new video element
    const pipVideo = document.createElement('video');
    pipVideo.style.width = '100%';
    pipVideo.style.maxHeight = '80vh';
    pipVideo.style.borderRadius = '8px';
    pipVideo.controls = false; // Turn off native controls
    pipVideo.autoplay = true;
    
    // Try to capture each frame of the original video through canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match the video
    canvas.width = originalVideo.videoWidth;
    canvas.height = originalVideo.videoHeight;
    
    // Method 1: Try to use captureStream (not supported by all browsers)
    if ('captureStream' in originalVideo) {
      // @ts-ignore: captureStream may not be in all TypeScript type definitions
      const stream = originalVideo.captureStream();
      pipVideo.srcObject = stream;
      container.appendChild(pipVideo);
      return;
    }

    
    // Fallback: Create a mock video
    const mockVideoContainer = document.createElement('div');
    mockVideoContainer.className = 'mock-video';
    mockVideoContainer.style.width = '100%';
    mockVideoContainer.style.maxHeight = '80vh';
    mockVideoContainer.style.borderRadius = '8px';
    mockVideoContainer.style.backgroundColor = '#000';
    mockVideoContainer.style.position = 'relative';
    mockVideoContainer.style.display = 'flex';
    mockVideoContainer.style.alignItems = 'center';
    mockVideoContainer.style.justifyContent = 'center';
    
    const mockMessage = document.createElement('div');
    mockMessage.textContent = 'Due to browser security restrictions, the video cannot be displayed directly. Please use the original YouTube player to watch the video.';
    mockMessage.style.color = 'white';
    mockMessage.style.padding = '20px';
    mockMessage.style.textAlign = 'center';
    
    mockVideoContainer.appendChild(mockMessage);
    container.appendChild(mockVideoContainer);
  };

  // Capture the original YouTube video
  const captureYouTubeVideo = (updateSubtitleCallback: (time: number) => void) => {
    // Find the YouTube video player
    const ytPlayer = document.querySelector('#movie_player') as HTMLElement;

    // Try multiple selectors to find the video element
    let video = document.querySelector('video.video-stream.html5-main-video') as HTMLVideoElement;
    
    // If the first selector doesn't find it, try other possible selectors
    if (!video) {
      video = document.querySelector('#movie_player video') as HTMLVideoElement;
    }
    
    // Finally try a more generic selector
    if (!video) {
      video = document.querySelector('video') as HTMLVideoElement;
    }
    
    if (ytPlayer && video) {
      youtubePlayer.value = ytPlayer;
      videoElement.value = video;
      originalVideoContainer.value = video.parentElement;
      
      // Determine if the current video is playing
      wasPlaying.value = !video.paused;
      
      // Immediately update video time
      if (video.currentTime) {
        currentVideoTime.value = video.currentTime;
      }
      
      // Video processing logic
      setTimeout(() => {
        // Get the video container element
        const videoContainer = document.getElementById('yt-fullscreen-dejavocab-video-container');
        if (videoContainer) {
          // Only move the video element, not the entire player
          try {
            
            // Create a placeholder element for later restoration
            const placeholder = document.createElement('div');
            placeholder.id = 'yt-video-placeholder';
            placeholder.style.width = video.offsetWidth + 'px';
            placeholder.style.height = video.offsetHeight + 'px';
            placeholder.style.display = 'none';
            videoPlaceholder.value = placeholder;
            
            // Only process the video element
            if (video.parentElement) {
              // Place the placeholder element in the original position
              video.parentElement.insertBefore(placeholder, video);
              
              // Explicitly remove width and height inline styles set by YouTube
              video.style.removeProperty('width'); // Remove width restriction
              video.style.removeProperty('height'); // Remove height restriction
              
              // Add a MutationObserver to reset properties through JavaScript, in case YouTube reapplies these styles
              const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                  if (mutation.attributeName === 'style') {
                    // Force remove width and height again when styles change
                    video.style.removeProperty('width');
                    video.style.removeProperty('height');
                  }
                });
              });
              
              // Start monitoring style changes
              observer.observe(video, { attributes: true, attributeFilter: ['style'] });
              
              // Maintain control properties
              video.controls = false;
              
              // Add the video directly to the container
              videoContainer.appendChild(video);
            }
            
            // Ensure the video maintains its original playback state
            if (wasPlaying.value) {
              video.play();
            }            
          } catch (e) {
            createPictureInPicture(video, videoContainer);
          }
        }
      }, 100); // Reduce delay to improve responsiveness
      
      // Start listening for video time updates
      video.addEventListener('timeupdate', () => {
        currentVideoTime.value = video.currentTime;
        updateSubtitleCallback(video.currentTime);
      });
      
      return true;
    }
    return false;
  };
  
  // Restore video to original position
  const restoreYouTubeVideo = () => {
    try {      
      // Check if it's playing
      if (videoElement.value) {
        wasPlaying.value = !videoElement.value.paused;
      } else {
        return;
      }
      
      const currentContainer = document.getElementById('yt-fullscreen-dejavocab-video-container');
      
      // Check if the video is in the fullscreen container
      if (currentContainer && currentContainer.contains(videoElement.value)) {
        currentContainer.removeChild(videoElement.value);
      }
      
      // Reset various video parameters to ensure visibility
      if (videoElement.value) {
        // Reset any styles that may cause invisibility
        videoElement.value.style.display = 'block';
        videoElement.value.style.visibility = 'visible';
        videoElement.value.style.opacity = '1';
        videoElement.value.style.width = 'auto';
        videoElement.value.style.height = 'auto';
        videoElement.value.style.maxWidth = '100%';
        videoElement.value.style.maxHeight = '100%';
        videoElement.value.style.position = 'static';
        videoElement.value.style.zIndex = 'auto';
        videoElement.value.style.transform = 'none';
      }
      
      // Try multiple methods to restore the video
      
      // Method 1: Use placeholder
      if (videoPlaceholder.value && videoPlaceholder.value.parentElement) {
        // Find the element that should be restored - could be the player container or video element
        const elementToRestore = videoElement.value;
        
        if (elementToRestore) {
          videoPlaceholder.value.parentElement.replaceChild(elementToRestore, videoPlaceholder.value);
        }
      }
      // Method 2: Return to original container
      else if (originalVideoContainer.value) {
        originalVideoContainer.value.appendChild(videoElement.value);
      }
      // Method 3: Try to find YouTube's video container
      else {
        const ytVideoContainer = document.querySelector('.html5-video-container');
        if (ytVideoContainer) {
          ytVideoContainer.appendChild(videoElement.value);
        } else {
          // Last attempt, add it to any visible container
          const anyContainer = document.querySelector('#movie_player') || document.querySelector('#player') || document.body;
          if (anyContainer) {
            anyContainer.appendChild(videoElement.value);
          }
        }
      }
      
      // Ensure the video maintains its original playback state
      if (videoElement.value) {        
        // Try to trigger video redraw
        setTimeout(() => {
          if (videoElement.value) {
            // Trigger element size calculation to make element visible
            const currWidth = videoElement.value.offsetWidth;
            videoElement.value.style.width = (currWidth + 1) + 'px';
            setTimeout(() => {
              if (videoElement.value) {
                videoElement.value.style.width = 'auto';
              }
            }, 50);
            
            // Restore playback state
            if (wasPlaying.value) {
              videoElement.value.play().catch(() => {});
            }
          }
        }, 100);
      }
      
      // Clear references
      videoPlaceholder.value = null;
    } catch (e) {
      
      // If an error occurs, still try to continue playback
      if (videoElement.value && wasPlaying.value) {
        videoElement.value.style.display = 'block';
        videoElement.value.style.visibility = 'visible';
        videoElement.value.play().catch(() => {});
      }
    }
  };

  /**
   * Check if there is a YouTube video on the page
   * @returns Detection result (true/false)
   */
  const checkForYouTubeVideo = () => {
    // Check if it's a video page - determine by URL path
    const isVideoPage = window.location.href.includes('/watch?v=');
    
    // Check if there's a video element
    const videoElement = document.querySelector('video.html5-main-video');
    
    // Only return true if it's a video page and has a video element
    hasVideoOnPage.value = isVideoPage && !!videoElement;
    
    return hasVideoOnPage.value;
  };
  
  /**
   * Extract YouTube video ID from URL
   * @returns Video ID or null
   */
  const extractYouTubeVideoId = () => {
    const match = window.location.href.match(/(?:youtube\.com\/watch\?v=|\/videos\/|youtu\.be\/|embed\/|\?v=)([^&?\n]+)/);
    return match ? match[1] : null;
  };
  
  /**
   * Get current video title
   * @returns Video title
   */
  const getVideoTitle = () => {
    return getCurrentVideoTitle();
  };

  /**
   * Set up video detection timer
   * Periodically detect YouTube videos on the page and update status
   */
  const setupVideoDetectionInterval = (intervalTime = 1000) => {
    // Initial detection
    checkForYouTubeVideo();
    
    // Periodic detection to handle YouTube dynamically loading videos
    const checkVideoInterval = setInterval(() => {
      checkForYouTubeVideo();
    }, intervalTime);
    
    // Return cleanup function
    return () => {
      clearInterval(checkVideoInterval);
    };
  };

  return {
    videoElement,
    originalVideoContainer,
    currentVideoTime,
    youtubePlayer,
    videoPlaceholder,
    playerContainer,
    wasPlaying,
    hasVideoOnPage,
    findYouTubePlayerContainer,
    createPictureInPicture,
    captureYouTubeVideo,
    restoreYouTubeVideo,
    checkForYouTubeVideo,
    extractYouTubeVideoId,
    getVideoTitle,
    setupVideoDetectionInterval
  };
}

import { ref, computed, Ref, watch } from 'vue';

// Define module-level variables to store timer IDs
// Correct NodeJS timer type
let durationCheckIntervalId: ReturnType<typeof setInterval> | null = null;

export function useVideoControl(videoElement: Ref<HTMLVideoElement | null>) {
  const isPlaying = ref(false);
  const videoDuration = ref(0);
  const currentVideoTime = ref(0);
  
  // Progress percentage
  const progressPercent = computed(() => {
    if (!videoDuration.value || !currentVideoTime.value) return 0;
    return (currentVideoTime.value / videoDuration.value) * 100;
  });

  // Toggle play/pause
  const togglePlay = () => {
    if (!videoElement.value) return;
    
    if (isPlaying.value) {
      videoElement.value.pause();
    } else {
      videoElement.value.play();
    }
    
    isPlaying.value = !isPlaying.value;
  };

  // Progress bar click jump
  const seekToPosition = (event: MouseEvent) => {
    if (!videoElement.value || !videoDuration.value) return;
    
    const progressBar = event.currentTarget as HTMLElement;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    // Calculate time based on click position
    const seekTime = percentage * videoDuration.value;
    videoElement.value.currentTime = seekTime;
  };

  // Initialize playback state and duration
  const initVideoState = (video: HTMLVideoElement) => {
    // Synchronize playback state immediately
    isPlaying.value = !video.paused;
    
    // Get video duration
    if (video.duration) {
      videoDuration.value = video.duration;
    } else {
      video.addEventListener('loadedmetadata', () => {
        videoDuration.value = video.duration;
      });
    }
    
    // Set time update listener
    video.addEventListener('timeupdate', () => {
      currentVideoTime.value = video.currentTime;
      
      // Check if duration needs to be updated (to handle duration changes after ads)
      if (videoDuration.value !== video.duration && video.duration > 0) {
        videoDuration.value = video.duration;
      }
    });
    
    // Listen for duration changes (to handle duration changes after ads)
    video.addEventListener('durationchange', () => {
      if (video.duration > 0) {
        videoDuration.value = video.duration;
      }
    });
    
    // Listen for video data loading events (when video source changes, such as after ads or when changing videos)
    video.addEventListener('loadeddata', () => {
      if (video.duration > 0 && video.duration !== videoDuration.value) {
        videoDuration.value = video.duration;
      }
    });
    
    // Set timer to periodically check video duration (additional safety mechanism)
    // First clear previous timer (if any)
    if (durationCheckIntervalId) {
      clearInterval(durationCheckIntervalId);
      durationCheckIntervalId = null;
    }
    
    // Create new timer
    durationCheckIntervalId = setInterval(() => {
      if (video && video.duration > 0 && Math.abs(video.duration - videoDuration.value) > 1) {
        videoDuration.value = video.duration;
      }
    }, 3000); // Check every 3 seconds
    
    // Add play and pause event listeners to keep state synchronized
    video.addEventListener('play', () => {
      isPlaying.value = true;
    });
    
    video.addEventListener('pause', () => {
      isPlaying.value = false;
    });
  };

  // Listen for video element changes to ensure state synchronization
  watch(videoElement, (newVideo) => {
    if (newVideo) {
      // Whenever the video element changes, immediately synchronize the playback state
      isPlaying.value = !newVideo.paused;
    }
  });

  /**
   * Handle play/pause events, updating user pause state
   * @param userPaused User's manual pause state
   * @param pausedByHover Optional parameter, indicates whether paused due to hover
   */
  const handlePlayPauseClick = (userPaused: Ref<boolean>, pausedByHover?: Ref<boolean>) => {
    // If currently playing, user is about to manually pause
    if (isPlaying.value) {
      userPaused.value = true;
    } else {
      // If currently paused, user is about to manually play
      userPaused.value = false;
    }
    
    // Reset hover pause state (if provided)
    if (pausedByHover) {
      pausedByHover.value = false;
    }
    
    // Call toggle play function
    togglePlay();
  };

  // Cleanup function, called when component unmounts
  const cleanup = () => {
    if (durationCheckIntervalId) {
      clearInterval(durationCheckIntervalId);
      durationCheckIntervalId = null;
    }
  };

  return {
    isPlaying,
    videoDuration,
    currentVideoTime,
    progressPercent,
    togglePlay,
    seekToPosition,
    initVideoState,
    handlePlayPauseClick,
    cleanup 
  };
}
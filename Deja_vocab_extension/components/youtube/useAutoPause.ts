import { ref, watch, Ref, watchEffect } from 'vue';

/**
 * Auto-pause functionality
 * When this feature is enabled, the video will automatically pause after the current subtitle finishes playing
 */
export function useAutoPause(
  videoElement: Ref<HTMLVideoElement | null>, 
  currentVideoTime: Ref<number>,
  subtitles: Ref<Array<{ startTime: number; endTime: number; text: string }>>,
  currentSubtitleIndex: Ref<number>,
  isPlaying: Ref<boolean>,
  togglePlay: () => void
) {
  // Whether auto-pause is enabled
  const autoPauseEnabled = ref(false);

  // Toggle auto-pause state
  const toggleAutoPause = () => {
    autoPauseEnabled.value = !autoPauseEnabled.value;
  };

  // Create a marker to track the last paused position, preventing multiple triggers
  const lastPausedPosition = ref(-1);
  
  // Store previous subtitle index to detect subtitle changes
  const previousSubtitleIndex = ref(-1);
  
  // Monitor video time and current subtitle index, auto-pause at the end of subtitle
  watch([currentVideoTime, currentSubtitleIndex], () => {
    // Only execute when auto-pause is enabled
    if (!autoPauseEnabled.value) return;
    
    // Ensure video element exists and there is a subtitle playing
    if (!videoElement.value || currentSubtitleIndex.value < 0) return;
    
    // Get current subtitle
    const currentSubtitle = subtitles.value[currentSubtitleIndex.value];
    if (!currentSubtitle) return;
    
    // Use a more lenient error range to check if near subtitle end time
    const endTimeReached = currentVideoTime.value >= currentSubtitle.endTime - 0.2 && 
                          currentVideoTime.value <= currentSubtitle.endTime + 0.2;
                          
    // If already paused at this position, don't pause again
    const alreadyPausedHere = Math.abs(lastPausedPosition.value - currentVideoTime.value) < 0.5;
    
    // If subtitle index changes, reset pause state
    if (previousSubtitleIndex.value !== currentSubtitleIndex.value) {
      previousSubtitleIndex.value = currentSubtitleIndex.value;
      // Don't pause when subtitle changes, this prevents accidental pauses during subtitle transitions
      return;
    }
    
    // Only pause when playing, end time reached, and not already paused at this position
    if (isPlaying.value && endTimeReached && !alreadyPausedHere) {
      // Record current pause position
      lastPausedPosition.value = currentVideoTime.value;
      
      // First ensure video is directly paused
      if (videoElement.value && !videoElement.value.paused) {
        videoElement.value.pause();
      }
      
      // Then update UI state through togglePlay
      if (isPlaying.value) {
        togglePlay();
      }
    }
  });

  // Reset pause marker during navigation
  const resetAutoPauseState = () => {
    lastPausedPosition.value = -1;
  };
  
  // Seek to subtitle and force play
  const seekToSubtitleAndPlay = (index: number) => {
    // Ensure index is valid
    if (index < 0 || index >= subtitles.value.length || !videoElement.value) return;
    
    // Reset pause state
    resetAutoPauseState();
    
    // Jump to the start time of the subtitle
    videoElement.value.currentTime = subtitles.value[index].startTime;
    
    // Start playing and update UI
    if (!isPlaying.value) {
      togglePlay(); // This updates both UI and video playback state
    } else {
      // If already in "playing" state, ensure video is actually playing
      videoElement.value.play();
    }
  };

  return {
    autoPauseEnabled,
    toggleAutoPause,
    seekToSubtitleAndPlay,
    resetAutoPauseState
  };
}

import { ref, watch, Ref, watchEffect } from 'vue';

/**
 * 自动暂停功能
 * 当该功能开启时，视频会在当前字幕播放完后自动暂停
 */
export function useAutoPause(
  videoElement: Ref<HTMLVideoElement | null>, 
  currentVideoTime: Ref<number>,
  subtitles: Ref<Array<{ startTime: number; endTime: number; text: string }>>,
  currentSubtitleIndex: Ref<number>,
  isPlaying: Ref<boolean>,
  togglePlay: () => void
) {
  // 是否启用自动暂停
  const autoPauseEnabled = ref(false);

  // 切换自动暂停状态
  const toggleAutoPause = () => {
    autoPauseEnabled.value = !autoPauseEnabled.value;
  };

  // 创建一个标记来跟踪上次暂停的位置，防止多次触发
  const lastPausedPosition = ref(-1);
  
  // 存储前一个字幕索引以检测字幕变化
  const previousSubtitleIndex = ref(-1);
  
  // 监控视频时间和当前字幕索引，在字幕结束时自动暂停
  watch([currentVideoTime, currentSubtitleIndex], () => {
    // 仅在自动暂停开启时执行
    if (!autoPauseEnabled.value) return;
    
    // 确保视频元素存在，且有正在播放的字幕
    if (!videoElement.value || currentSubtitleIndex.value < 0) return;
    
    // 获取当前字幕
    const currentSubtitle = subtitles.value[currentSubtitleIndex.value];
    if (!currentSubtitle) return;
    
    // 使用更宽松的误差范围来检查是否接近字幕结束时间
    const endTimeReached = currentVideoTime.value >= currentSubtitle.endTime - 0.2 && 
                          currentVideoTime.value <= currentSubtitle.endTime + 0.2;
                          
    // 如果已经暂停过这个位置，不再重复暂停
    const alreadyPausedHere = Math.abs(lastPausedPosition.value - currentVideoTime.value) < 0.5;
    
    // 如果字幕索引变化，重置暂停状态
    if (previousSubtitleIndex.value !== currentSubtitleIndex.value) {
      previousSubtitleIndex.value = currentSubtitleIndex.value;
      // 在字幕变化时不进行暂停，这是为了防止字幕切换时意外暂停
      return;
    }
    
    // 只在正在播放、到达结束时间、并且这个位置还没暂停过时暂停
    if (isPlaying.value && endTimeReached && !alreadyPausedHere) {
      // 记录当前暂停位置
      lastPausedPosition.value = currentVideoTime.value;
      
      // 首先确保直接暂停视频
      if (videoElement.value && !videoElement.value.paused) {
        videoElement.value.pause();
      }
      
      // 然后通过togglePlay更新UI状态
      if (isPlaying.value) {
        togglePlay();
      }
    }
  });

  // 在导航时重置暂停标记
  const resetAutoPauseState = () => {
    lastPausedPosition.value = -1;
  };
  
  // 跳转到字幕并强制播放
  const seekToSubtitleAndPlay = (index: number) => {
    // 确保索引有效
    if (index < 0 || index >= subtitles.value.length || !videoElement.value) return;
    
    // 重置暂停状态
    resetAutoPauseState();
    
    // 跳转到字幕的开始时间
    videoElement.value.currentTime = subtitles.value[index].startTime;
    
    // 开始播放并更新 UI
    if (!isPlaying.value) {
      togglePlay(); // 这会同时更新 UI 和视频播放状态
    } else {
      // 如果已经在“播放”状态，确保视频真的在播放
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

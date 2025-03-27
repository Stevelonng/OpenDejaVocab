import { ref, computed, Ref, watch } from 'vue';

// 定义模块级变量来存储定时器ID
// 正确的NodeJS定时器类型
let durationCheckIntervalId: ReturnType<typeof setInterval> | null = null;

export function useVideoControl(videoElement: Ref<HTMLVideoElement | null>) {
  const isPlaying = ref(false);
  const videoDuration = ref(0);
  const currentVideoTime = ref(0);
  
  // 进度百分比
  const progressPercent = computed(() => {
    if (!videoDuration.value || !currentVideoTime.value) return 0;
    return (currentVideoTime.value / videoDuration.value) * 100;
  });

  // 切换播放/暂停
  const togglePlay = () => {
    if (!videoElement.value) return;
    
    if (isPlaying.value) {
      videoElement.value.pause();
    } else {
      videoElement.value.play();
    }
    
    isPlaying.value = !isPlaying.value;
  };

  // 进度条点击跳转
  const seekToPosition = (event: MouseEvent) => {
    if (!videoElement.value || !videoDuration.value) return;
    
    const progressBar = event.currentTarget as HTMLElement;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    // 根据点击位置计算时间
    const seekTime = percentage * videoDuration.value;
    videoElement.value.currentTime = seekTime;
  };

  // 初始化播放状态和时长
  const initVideoState = (video: HTMLVideoElement) => {
    // 立即同步播放状态
    isPlaying.value = !video.paused;
    
    // 获取视频时长
    if (video.duration) {
      videoDuration.value = video.duration;
    } else {
      video.addEventListener('loadedmetadata', () => {
        videoDuration.value = video.duration;
      });
    }
    
    // 设置时间更新监听
    video.addEventListener('timeupdate', () => {
      currentVideoTime.value = video.currentTime;
      
      // 检查是否需要更新视频时长（解决广告结束后时长不更新的问题）
      if (videoDuration.value !== video.duration && video.duration > 0) {
        videoDuration.value = video.duration;
      }
    });
    
    // 监听视频的时长变化（处理广告结束后的视频）
    video.addEventListener('durationchange', () => {
      if (video.duration > 0) {
        videoDuration.value = video.duration;
      }
    });
    
    // 监听视频数据加载事件（当视频源切换时触发，如广告结束或更换视频）
    video.addEventListener('loadeddata', () => {
      if (video.duration > 0 && video.duration !== videoDuration.value) {
        videoDuration.value = video.duration;
      }
    });
    
    // 设置定时器定期检查视频时长（额外的安全机制）
    // 先清除之前的定时器（如果有）
    if (durationCheckIntervalId) {
      clearInterval(durationCheckIntervalId);
      durationCheckIntervalId = null;
    }
    
    // 创建新的定时器
    durationCheckIntervalId = setInterval(() => {
      if (video && video.duration > 0 && Math.abs(video.duration - videoDuration.value) > 1) {
        videoDuration.value = video.duration;
      }
    }, 3000); // 每3秒检查一次
    
    // 添加播放和暂停事件监听器，保持状态同步
    video.addEventListener('play', () => {
      isPlaying.value = true;
    });
    
    video.addEventListener('pause', () => {
      isPlaying.value = false;
    });
  };

  // 监听视频元素变化，确保状态同步
  watch(videoElement, (newVideo) => {
    if (newVideo) {
      // 每当视频元素变化时，立即同步播放状态
      isPlaying.value = !newVideo.paused;
    }
  });

  /**
   * 处理播放/暂停事件，更新用户暂停状态
   * @param userPaused 用户是否手动暂停的状态
   * @param pausedByHover 可选参数，指示是否因悔停而暂停
   */
  const handlePlayPauseClick = (userPaused: Ref<boolean>, pausedByHover?: Ref<boolean>) => {
    // 如果当前正在播放，则用户即将手动暂停
    if (isPlaying.value) {
      userPaused.value = true;
    } else {
      // 如果当前已暂停，则用户即将手动播放
      userPaused.value = false;
    }
    
    // 重置悔停暂停状态（如果提供）
    if (pausedByHover) {
      pausedByHover.value = false;
    }
    
    // 调用切换播放状态函数
    togglePlay();
  };

  // 清理函数，在组件卸载时调用
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
    cleanup // 添加清理函数
  };
}
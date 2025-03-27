<template>
  <!-- 只保留 Inter 字体，使用本地 Material Icons 字体 -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  
  <div v-if="isFullscreen" :class="['fullscreen-container', darkMode ? 'dark-mode' : '']">
    
    <!-- Background decoration elements for visual interest -->
    <div class="bg-decoration">
      <div class="bg-blob blob-1"></div>
      <div class="bg-blob blob-2"></div>
    </div>
    
    <!-- Global word tooltip for word definitions -->
    <div id="global-word-tooltip" class="global-word-tooltip"></div>
    
    <!-- Exit fullscreen button -->
    <button @click="toggleFullscreen" class="exit-fullscreen-btn" aria-label="Exit fullscreen mode">
      <span class="material-icon">close</span>
    </button>
    
    <!-- Main content area -->
    <div class="main-content-area" :class="{ 'immersive': immersiveMode }">
      <!-- Video section -->
      <div class="video-section">
        <!-- Video container -->
        <div class="dejavocab-video-container" id="yt-fullscreen-dejavocab-video-container" @click="togglePlay">
          <!-- Video will be moved here via JavaScript -->
          <div v-if="!videoElement" class="video-placeholder">
            <div class="loading-message">正在加载视频...</div>
          </div>
        </div>
        
        <!-- Current subtitle display area -->
        <div class="current-subtitle-display" v-if="videoElement && subtitlesEnabled && (!immersiveMode || (immersiveMode && currentSubtitleIndex >= 0))">
          <div v-if="loading" class="subtitle-loading-animation">
            <div class="loading-spinner"></div>
            <div class="loading-text">正在加载字幕...</div>
          </div>
          <div v-else class="current-subtitle-text" v-html="processedCurrentSubtitle">
          </div>
          <button 
            v-if="currentSubtitleIndex >= 0" 
            @click.stop="toggleFavorite(currentSubtitleIndex, { 
              ...subtitles[currentSubtitleIndex], 
              videoId: currentVideoId || extractYouTubeVideoId(),
              videoTitle: currentVideoTitle || getVideoTitle()
            })" 
            class="subtitle-fav-btn"
            :aria-label="isFavorited(currentSubtitleIndex) ? '取消收藏' : '收藏字幕'"
          >
            <span class="material-icon">{{ isFavorited(currentSubtitleIndex) ? 'favorite' : 'favorite_border' }}</span>
          </button>
        </div>
      </div>
      
      <!-- Subtitles container -->
      <div class="subtitles-container" :class="{ 'immersive': immersiveMode, 'hidden': !subtitlesEnabled }">
        <!-- Favorite words section (at the top of subtitles container) -->
        <div v-if="favoriteSectionVisible" class="favorite-words-section simplified">
          <div class="simplified-header">
            <h4>收藏单词</h4>
            <button @click="favoriteSectionVisible = false" class="close-btn" aria-label="关闭收藏单词区域">
              <span class="material-icon">close</span>
            </button>
          </div>
          
          <div v-if="videoFavLoading" class="loading-state">
            <div class="loading-spinner"></div>
            <span>加载中...</span>
          </div>
          <div v-else-if="videoFavError" class="error-state">
            <span class="error-message">{{ videoFavError }}</span>
          </div>
          <div v-else-if="favoriteWordsInVideo.length === 0" class="no-favorites-message">
            暂无收藏单词
          </div>
          <div v-else class="simple-word-list">
            <div 
              v-for="(word, index) in uniqueFavoriteWords" 
              :key="word"
              class="favorite-word-container"
            >
              <span 
                class="favorite-word-item"
                @click="filterSubtitlesByWord(word)"
                :class="{ 'has-multiple': getWordOccurrences(word).length > 1, 'active': activeWord === word }"
              >
                {{ word }}
                <small v-if="getWordOccurrences(word).length > 1" class="count-badge">
                  {{ getWordOccurrences(word).length }}
                </small>
              </span>
            </div>
          </div>
        </div>

        <!-- Loading state for subtitles -->
        <div v-if="loading" class="loading-subtitles">
          <div class="loading-spinner"></div>
          <span>正在加载字幕数据...</span>
        </div>
        
        <!-- Subtitles list -->
        <div v-if="!loading" class="subtitles-list" ref="subtitlesList">
          <div 
            v-for="(subtitle, index) in filteredSubtitles" 
            :key="subtitle.startTime" 
            class="subtitle-item"
            :class="{ 
              'current': currentSubtitle && subtitle.startTime === currentSubtitle.startTime, 
              'filter-match': activeWord !== null 
            }"
            @click="(event) => {
              // Check if click was on a hoverable word, if so, don't seek
              const target = (event.target as HTMLElement);
              if (target && target.closest('.hoverable-word')) {
                return;
              }
              
              // Just seek to position, don't clear filter
              resetAutoPauseState();
              seekToSubtitle(subtitle.startTime);
              
              // 禁止滚动事件传播，防止在窄屏模式下上移
              if (isNarrowScreen) {
                event.stopPropagation();
                event.preventDefault();
              }
            }"
          >
            <div class="subtitle-content">
              <div class="subtitle-text-wrapper">
                <span class="time">{{ formatTime(subtitle.startTime) }} - {{ formatTime(subtitle.endTime) }}</span>
                <span class="text" v-html="getProcessedSubtitleText(subtitle.text)"></span>
              </div>
              <button 
                @click.stop="toggleFavorite(index, {
                  ...subtitle,
                  videoId: currentVideoId || extractYouTubeVideoId(),
                  videoTitle: currentVideoTitle || getVideoTitle()
                })" 
                class="subtitle-fav-btn"
                :aria-label="isFavorited(index) ? '取消收藏' : '收藏字幕'"
              >
                <span class="material-icon">{{ isFavorited(index) ? 'favorite' : 'favorite_border' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Bottom control bar -->
    <div 
      class="bottom-controls-container" 
      v-if="videoElement"
    >
      <!-- Progress bar -->
      <div class="progress-bar-container">
        <div class="progress-bar" @click="seekToPosition($event)" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="progress-time">{{ formatTime(currentVideoTime) }} / {{ formatTime(videoDuration) }}</div>
      </div>
      
      <!-- Control buttons -->
      <div class="controls-row">
        <!-- DejaVocab Logo 放在最左侧 -->
        <a href="https://dejavocab.com" target="_blank" class="dejavocab-logo controls-logo" title="Visit DejaVocab">
          <div class="logo-container">
            <div class="logo-icon">
              <div class="shine-effect"></div>
            </div>
            <div class="logo-text">
              <span class="logo-deja">deja</span>
              <span class="logo-vocab">vocab</span>
              <div class="logo-accent"></div>
            </div>
          </div>
        </a>
        
        <!-- 占位元素，确保其他按钮位置不变 -->
        <div class="flex-spacer"></div>
        <button @click="(e) => toggleFavoriteSection(e)" class="control-btn" :class="{ 'active': favoriteSectionVisible }" aria-label="显示/隐藏收藏单词">
          <span class="material-icon">{{ favoriteSectionVisible ? 'visibility' : 'visibility_off' }}</span>
          <span class="btn-label">{{ favoriteSectionVisible ? '隐藏收藏区域' : '显示收藏区域' }}</span>
        </button>
        
        <button @click="toggleAutoPause" class="control-btn" :class="{ 'active': autoPauseEnabled }" aria-label="切换自动暂停">
          <span class="material-icon">timer</span>
          <span class="btn-label">{{ autoPauseEnabled ? '关闭自动暂停' : '开启自动暂停' }}</span>
        </button>
        
        <button 
          @click="() => { resetAutoPauseState(); prevSubtitle(); }" 
          class="control-btn"
          aria-label="前一句"
        >
          <span class="material-icon">skip_previous</span>
          <span class="btn-label">前一句</span>
        </button>
        
        <button @click="handlePlayPauseClick" class="control-btn" aria-label="播放/暂停">
          <span class="material-icon">{{ isPlaying ? 'pause' : 'play_arrow' }}</span>
          <span class="btn-label">{{ isPlaying ? '暂停' : '播放' }}</span>
        </button>
        
        <button 
          @click="() => { resetAutoPauseState(); nextSubtitle(); }" 
          class="control-btn"
          aria-label="后一句"
        >
          <span class="material-icon">skip_next</span>
          <span class="btn-label">后一句</span>
        </button>
        
        <button @click="lookupWord" class="control-btn" :class="{'active': isWordLookupEnabled}" aria-label="查词">
          <span class="material-icon">search</span>
          <span class="btn-label">查词</span>
        </button>
        
        <!-- <button @click="summarizeContent" class="control-btn" aria-label="AI总结">
          <span class="material-icon">summarize</span>
          <span class="btn-label">AI总结</span>
        </button> -->
        
        <button @click="toggleImmersive" class="control-btn" aria-label="沉浸模式">
          <span class="material-icon">{{ immersiveMode ? 'fullscreen_exit' : 'fullscreen' }}</span>
          <span class="btn-label">沉浸模式</span>
        </button>
        
        <button @click="customToggleSubtitles" class="control-btn" aria-label="显示/隐藏字幕">
          <span class="material-icon">{{ subtitlesEnabled ? 'subtitles' : 'subtitles_off' }}</span>
          <span class="btn-label">{{ subtitlesEnabled ? '关闭字幕' : '显示字幕' }}</span>
        </button>
      </div>
    </div>
    
    <!-- AI Summary Modal -->
    <!-- <div v-if="showSummaryModal" class="summary-modal-overlay">
      <div class="summary-modal">
        <div class="summary-modal-header">
          <h3>AI内容总结</h3>
          <button @click="closeSummaryModal" class="close-modal-btn" aria-label="关闭">
            <span class="material-icon">close</span>
          </button>
        </div>
        <div class="summary-modal-body">
          <div v-if="summaryLoading" class="summary-loading">
            <div class="loading-spinner"></div>
            <p>正在生成AI总结...</p>
          </div>
          <div v-else class="summary-content">
            <p v-for="(line, index) in summaryContent.split('\n')" :key="index">{{ line }}</p>
          </div>
        </div>
      </div>
    </div> -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { useYouTubePlayer } from './useYouTubePlayer';
import { useSubtitles, useSubtitleNavigation } from './useSubtitles';
import { useVideoControl } from './useVideoControl';
import { useFullscreenControl } from './useFullscreenControl';
import { useFavoriteSentence } from './useFavoriteSentence';
import { useAutoPause } from './useAutoPause';
// import { useAISummary } from './useAISummary';
// 移除了useHidePanel导入
import { useVideoNavigation } from './useVideoNavigation';
import { useFullscreenIcon } from './useFullscreenIcon'; 
import { useWordProcessing } from './useWordProcessing';
import { useFavoriteWordPanel } from './useFavoriteWordPanel';
import { useFavoriteWord } from './useFavoriteWord';
import { useVideoFavoriteWords } from './useVideoFavoriteWords';

// Dark mode toggle state - this can be connected to system preference or user setting
const darkMode = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);

// 窗口宽度监听，用于响应式布局调整
const isNarrowScreen = ref(false);

// 保存收藏区域的原始状态
const originalFavSectionState = ref(false);

// 自定义切换收藏区域函数，考虑屏幕宽度
const toggleFavSectionWithScreenCheck = (show = null) => {
  // 如果是窄屏模式，直接禁止显示收藏区域
  if (isNarrowScreen.value) {
    if (favoriteSectionVisible.value && show !== true) {
      // 只有当尝试隐藏时才更新状态
      originalFavSectionState.value = true;
      favoriteSectionVisible.value = false;
    }
  } else {
    // 宽屏模式下正常切换
    if (show !== null) {
      favoriteSectionVisible.value = show;
    } else {
      favoriteSectionVisible.value = !favoriteSectionVisible.value;
    }
    // 记录当前状态
    originalFavSectionState.value = favoriteSectionVisible.value;
  }
};

// 初始化窗口宽度状态
const updateScreenWidth = () => {
  const wasNarrow = isNarrowScreen.value;
  const isNowNarrow = window.innerWidth <= 991.98;
  
  // 如果屏幕状态发生变化
  if (wasNarrow !== isNowNarrow) {
    // 从宽屏变为窄屏
    if (isNowNarrow) {
      // 保存当前收藏区域的状态
      originalFavSectionState.value = favoriteSectionVisible.value;
      // 在窄屏模式下隐藏收藏区域
      if (favoriteSectionVisible.value) {
        favoriteSectionVisible.value = false;
      }
    } else { // 从窄屏变为宽屏
      // 恢复原来的收藏区域状态
      // 延迟恢复，避免可能的闪烁
      setTimeout(() => {
        favoriteSectionVisible.value = originalFavSectionState.value;
      }, 200);
    }
  }
  
  // 更新屏幕状态
  isNarrowScreen.value = isNowNarrow;
};

// 设置窗口大小调整监听器
onMounted(() => {
  // 初始化窗口宽度状态
  originalFavSectionState.value = favoriteSectionVisible.value;
  updateScreenWidth();
  
  // 添加窗口大小变化监听
  window.addEventListener('resize', updateScreenWidth);
});

// 移除窗口大小调整监听器
onUnmounted(() => {
  window.removeEventListener('resize', updateScreenWidth);
  
  // 清理定时器
  if (cleanupVideoControl) {
    cleanupVideoControl();
  }
});

// Use favorite word functionality
const { 
  favoriteWords, 
  favoriteSectionVisible,
  toggleFavoriteSection: originalToggleFavoriteSection,
} = useFavoriteWord();

// 重写切换收藏区函数，使其能够考虑屏幕宽度
const toggleFavoriteSection = (e?: MouseEvent | null) => {
  // 如果收到事件对象，如按钮点击时，则无参数切换
  toggleFavSectionWithScreenCheck(null);
};

// Video navigation - track YouTube video changes
const { 
  currentVideoId, 
  currentVideoTitle, 
  updateCurrentVideo, 
  updateVideoInfoStorage 
} = useVideoNavigation((videoId, videoTitle) => {  
  // When video changes, reload subtitles
  setTimeout(() => {
    // Force refresh subtitles, ignore cache
    fetchSubtitles(true);
    
    // Load favorite words for the new video
    if (videoId) {
      loadFavoritesFromBackend(videoId);
    }
  }, 500);

  // Reset state
  currentSubtitleIndex.value = -1;

  // If in fullscreen mode, recapture video element
  if (isFullscreen.value && videoElement.value === null) {
    captureYouTubeVideo(updateCurrentSubtitle);
  }
});

// Get YouTube video player
const { 
  videoElement, 
  currentVideoTime,
  captureYouTubeVideo, 
  restoreYouTubeVideo,
  hasVideoOnPage,
  extractYouTubeVideoId,
  getVideoTitle,
  setupVideoDetectionInterval
} = useYouTubePlayer();

// Video control
const {
  isPlaying,
  videoDuration,
  progressPercent,
  togglePlay,
  seekToPosition,
  initVideoState,
  handlePlayPauseClick: videoControlPlayPauseHandler,
  cleanup: cleanupVideoControl // 获取清理函数
} = useVideoControl(videoElement);

// Subtitle control
const {
  subtitles,
  loading,
  currentSubtitleIndex,
  currentVideoInfo,
  formatTime,
  updateCurrentSubtitle,
  fetchSubtitles,
  currentSubtitle,
  getProcessedCurrentSubtitle,
  subtitlesEnabled,
  toggleSubtitles,
  saveSubtitlesToLocalStorage
} = useSubtitles(currentVideoTime);

// Word processing
const {
  processTextToHighlightWords,
  toggleWordLookup,
  isWordLookupEnabled,
  setupWordHoverVideoControl
} = useWordProcessing();

// Video playback state
const userPaused = ref(false);

// Use video favorite words
const {
  favoriteWordsInVideo,
  uniqueFavoriteWords, 
  loading: videoFavLoading,
  error: videoFavError,
  seekToWordInVideo
} = useVideoFavoriteWords(currentVideoTime, currentVideoInfo, subtitles, favoriteWords);

// Use favorite word panel
const { 
  activeWord,
  filteredSubtitles,
  getWordOccurrences,
  filterSubtitlesByWord,
  getProcessedSubtitleText
} = useFavoriteWordPanel(subtitles, favoriteWordsInVideo, processTextToHighlightWords, seekToWordInVideo);

// Process current subtitle text with hoverable words
const processedCurrentSubtitle = getProcessedCurrentSubtitle(getProcessedSubtitleText);

// Set up word hover video control
const { 
  pausedByHover, 
  setupWordHoverListeners,
  handlePlayPauseClick: wordHoverPlayPauseHandler 
} = setupWordHoverVideoControl(isPlaying, videoElement, togglePlay);

// Set up event listeners
onMounted(() => {
  const cleanup = setupWordHoverListeners();
  
  // Listen for system dark mode changes
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleDarkModeChange = (e: MediaQueryListEvent) => {
    darkMode.value = e.matches;
  };
  
  darkModeMediaQuery.addEventListener('change', handleDarkModeChange);
  
  // Clean up on unmount
  onUnmounted(() => {
    cleanup();
    darkModeMediaQuery.removeEventListener('change', handleDarkModeChange);
  });
});

// Handle play/pause with user paused state tracking
const handlePlayPauseClick = () => {
  videoControlPlayPauseHandler(userPaused, pausedByHover);
};

// Subtitle navigation
const {
  subtitlesList,
  prevSubtitle,
  nextSubtitle,
  seekToSubtitle
} = useSubtitleNavigation(videoElement, subtitles, currentSubtitleIndex, isPlaying, togglePlay);

// Fullscreen control
const {
  isFullscreen,
  immersiveMode,
  toggleImmersive,
  createEnhancedToggleFullscreen
} = useFullscreenControl(videoElement, restoreYouTubeVideo);

// Custom toggleSubtitles function
const customToggleSubtitles = () => {
  // Toggle subtitles
  toggleSubtitles();
};

// Toggle word lookup functionality
const lookupWord = () => {
  toggleWordLookup();
};

// Create enhanced fullscreen toggle with subtitle loading
const toggleFullscreen = createEnhancedToggleFullscreen(
  fetchSubtitles, 
  (updateFn) => {
    // 首先保存字幕到本地存储
    saveSubtitlesToLocalStorage().then(() => {
    }).catch(error => {
    });
    
    // 然后调用原始的captureYouTubeVideo函数，并返回其结果
    return captureYouTubeVideo(updateFn);
  }
);

// Watch for video element changes
watch(videoElement, (newVideo) => {
  if (!newVideo) return;
  initVideoState(newVideo);
});

// Subtitle favorite functionality
const { 
  isFavorited, 
  toggleFavorite, 
  loadFavoritesFromBackend
} = useFavoriteSentence(subtitles);

// AI summary functionality
// const { 
//   // showSummaryModal, 
//   // summaryLoading, 
//   // summaryContent, 
//   // summarizeContent, 
//   // closeSummaryModal 
// } = useAISummary();

// 删除了控制面板隐藏相关功能

// Auto-pause functionality
const { 
  autoPauseEnabled, 
  toggleAutoPause, 
  resetAutoPauseState 
} = useAutoPause(
  videoElement,
  currentVideoTime,
  subtitles,
  currentSubtitleIndex,
  isPlaying,
  togglePlay
);

// Set up fullscreen icon
onMounted(() => {
  // Set up video detection interval
  const clearVideoDetectionInterval = setupVideoDetectionInterval(1000);
  
  // Update video info in storage initially to ensure chat has latest info
  if (currentVideoId.value && currentVideoTitle.value) {
    updateVideoInfoStorage(currentVideoId.value, currentVideoTitle.value);
  } else {
    // 尝试获取当前视频信息
    const videoId = extractYouTubeVideoId();
    const title = getVideoTitle();
    if (videoId && title) {
      updateVideoInfoStorage(videoId, title);
    }
  }
  
  // 定义自定义事件的接口
  interface VideoInfoEvent {
    detail: {
      videoId: string;
      title: string;
      timestamp: number;
    }
  }
  
  // Listen for video changes that happen outside our component
  const handleVideoInfoUpdated = (event: Event) => {
    // 类型转换为自定义事件
    const customEvent = event as CustomEvent<VideoInfoEvent['detail']>;
    console.log('[INFO] Video info update event received');
    
    // 只处理事件数据，但不再触发新的存储更新，避免无限循环
    if (customEvent.detail && customEvent.detail.videoId) {
      console.log('[INFO] Video from event:', customEvent.detail.title);
    }
  };
  
  // Add event listener for video changes
  document.addEventListener('youtube-video-info-updated', handleVideoInfoUpdated);
  
  // Clean up interval on unmount
  onUnmounted(() => {
    clearVideoDetectionInterval();
    document.removeEventListener('youtube-video-info-updated', handleVideoInfoUpdated);
  });
});

// Initialize fullscreen icon
useFullscreenIcon(hasVideoOnPage, toggleFullscreen);
</script>

<style>
/* 导入本地Material Icons字体 */
@import '/assets/fonts/material-icons.css';
/* 导入主样式文件 */
@import './Modern-FullscreenView.css';
</style>
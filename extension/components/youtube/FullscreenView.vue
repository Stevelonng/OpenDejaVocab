<template>
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
            <div class="loading-message">Loading video...</div>
          </div>
        </div>

        <!-- Current subtitle display area -->
        <div class="current-subtitle-display" v-if="videoElement && subtitlesEnabled && (!immersiveMode || (immersiveMode && currentSubtitleIndex >= 0))">
          <div v-if="loading" class="subtitle-loading-animation">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading subtitles...</div>
          </div>
          <div v-else>
            <div class="current-subtitle-text" v-html="processedCurrentSubtitle"></div>
            <div v-if="isTranslationLoading && autoTranslateEnabled" class="subtitle-translation loading-translation">
              <div class="loading-text">Loading translation...</div>
            </div>
            <div class="subtitle-translation" v-else-if="subtitleTranslations[currentSubtitleIndex]">
              {{ subtitleTranslations[currentSubtitleIndex] }}
            </div>
          </div>
          <button
            v-if="currentSubtitleIndex >= 0"
            @click.stop="toggleFavorite(currentSubtitleIndex, {
              ...subtitles[currentSubtitleIndex],
              videoId: currentVideoId || extractYouTubeVideoId(),
              videoTitle: currentVideoTitle || getVideoTitle()
            })"
            class="subtitle-fav-btn"
            :aria-label="isFavorited(currentSubtitleIndex) ? 'Unfavorite' : 'Favorite subtitle'"
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
            <span>Loading...</span>
          </div>
          <div v-else-if="videoFavError" class="error-state">
            <span class="error-message">{{ videoFavError }}</span>
          </div>
          <div v-else-if="favoriteWordsInVideo.length === 0" class="no-favorites-message">
            No favorite words
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
          <span>Loading subtitles...</span>
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
                <div class="subtitle-translation" v-if="subtitleTranslations[index]">
                  {{ subtitleTranslations[index] }}
                </div>
              </div>
              <button
                @click.stop="toggleFavorite(index, {
                  ...subtitle,
                  videoId: currentVideoId || extractYouTubeVideoId(),
                  videoTitle: currentVideoTitle || getVideoTitle()
                })"
                class="subtitle-fav-btn"
                :aria-label="isFavorited(index) ? 'Unfavorite' : 'Favorite subtitle'"
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
        <a href="http://47.245.54.174:8000" target="_blank" class="dejavocab-logo controls-logo" title="Visit DejaVocab">
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

        <!-- Spacer to maintain button positions -->
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

        <button @click="toggleImmersive" class="control-btn" aria-label="沉浸模式">
          <span class="material-icon">{{ immersiveMode ? 'fullscreen_exit' : 'fullscreen' }}</span>
          <span class="btn-label">沉浸模式</span>
        </button>

        <button @click="customToggleSubtitles" class="control-btn" aria-label="显示/隐藏字幕">
          <span class="material-icon">{{ subtitlesEnabled ? 'subtitles' : 'subtitles_off' }}</span>
          <span class="btn-label">{{ subtitlesEnabled ? '关闭字幕' : '显示字幕' }}</span>
        </button>
        <button @click="toggleTranslation" class="control-btn" :class="{'active': autoTranslateEnabled}" aria-label="翻译">
          <span class="material-icon">translate</span>
          <span class="btn-label">{{ autoTranslateEnabled ? '关闭翻译' : '开启翻译' }}</span>
        </button>
      </div>
    </div>
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

import { useVideoNavigation } from './useVideoNavigation';
import { useFullscreenIcon } from './useFullscreenIcon';
import { useWordProcessing } from './useWordProcessing';
import { useFavoriteWordPanel } from './useFavoriteWordPanel';
import { useFavoriteWord } from './useFavoriteWord';
import { useVideoFavoriteWords } from './useVideoFavoriteWords';
import { useTranslate } from './useTranslate';
import { getYouTubeVideoId, getCurrentVideoTitle } from './InfoVideo';
import { browser } from 'wxt/browser';

// 为window对象添加__cachedTranslations属性类型声明
declare global {
  interface Window {
    __cachedTranslations?: Record<number, string>;
  }
}

// Dark mode toggle state - this can be connected to system preference or user setting
const darkMode = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);

// Translation functionality
const { 
  translateText, 
  batchTranslateSubtitles,
  translationState,
  formatTranslatedSubtitle,
  fetchTranslationsFromBackend 
} = useTranslate();

// Translation state variables
const subtitleTranslations = ref<Record<number, string>>({});
const autoTranslateEnabled = ref(false); // 默认关闭翻译功能
const isTranslationLoading = ref(false); // Loading state for translations

const isNarrowScreen = ref(false);

const originalFavSectionState = ref(false);

// Custom toggle collection area function, considering screen width
const toggleFavSectionWithScreenCheck = (show = null) => {
  // If narrow screen mode, directly prevent showing the collection area
  if (isNarrowScreen.value) {
    if (favoriteSectionVisible.value && show !== true) {
      // Only update state when trying to hide
      originalFavSectionState.value = true;
      favoriteSectionVisible.value = false;
    }
  } else {
    // In wide screen mode, normal toggle
    if (show !== null) {
      favoriteSectionVisible.value = show;
    } else {
      favoriteSectionVisible.value = !favoriteSectionVisible.value;
    }
    // Record current state
    originalFavSectionState.value = favoriteSectionVisible.value;
  }
};

// Initialize window width state
const updateScreenWidth = () => {
  const wasNarrow = isNarrowScreen.value;
  const isNowNarrow = window.innerWidth <= 991.98;

  // If screen state changes
  if (wasNarrow !== isNowNarrow) {
    // From wide screen to narrow screen
    if (isNowNarrow) {
      // Save current collection area state
      originalFavSectionState.value = favoriteSectionVisible.value;
      // In narrow screen mode, hide the collection area
      if (favoriteSectionVisible.value) {
        favoriteSectionVisible.value = false;
      }
    } else { // From narrow screen to wide screen
      // Restore the original collection area state
      // Delay recovery to avoid possible flickering
      setTimeout(() => {
        favoriteSectionVisible.value = originalFavSectionState.value;
      }, 200);
    }
  }

  // Update screen state
  isNarrowScreen.value = isNowNarrow;
};

// Set window size change listener
onMounted(() => {
  // Initialize window width state
  originalFavSectionState.value = favoriteSectionVisible.value;
  updateScreenWidth();

  // Add window size change listener
  window.addEventListener('resize', updateScreenWidth);
});

// Remove window size change listener
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

// Rewrite toggle favorite section function to consider screen width
const toggleFavoriteSection = (e?: MouseEvent | null) => {
  // If event object is received, such as button click, then switch without parameters
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
  cleanup: cleanupVideoControl // Get cleanup function
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
    try {
      // First save subtitles to local storage
      saveSubtitlesToLocalStorage();
      
      // Then call original captureYouTubeVideo function
      const captured = captureYouTubeVideo(updateFn);
      
      // After entering fullscreen and loading subtitles, load translations
      // Using setTimeout to ensure this happens after the fullscreen toggle completes
      setTimeout(async () => {
        try {
          const videoId = getYouTubeVideoId(window.location.href);
          if (videoId && subtitles.value && subtitles.value.length > 0) {
            console.log('[FullscreenView] Fetching translations after entering fullscreen mode');
            // Try to load saved translations from backend
            const savedTranslations = await fetchTranslationsFromBackend(videoId, subtitles.value);
            if (Object.keys(savedTranslations).length > 0) {
              console.log(`[FullscreenView] Loaded ${Object.keys(savedTranslations).length} translations from backend (cached)`);
              // 缓存翻译但不直接显示
              window.__cachedTranslations = { ...savedTranslations };
              
              // 仅当翻译开关打开时才应用翻译
              if (autoTranslateEnabled.value) {
                console.log('[FullscreenView] Translation already enabled, applying fetched translations');
                subtitleTranslations.value = { ...savedTranslations };
                isTranslationLoading.value = false; // 关闭加载状态
              }
            }
          }
        } catch (loadError) {
          console.error('[FullscreenView] Error loading translations:', loadError);
        }
      }, 500);
      
      return captured;
    } catch (error) {
      console.error('[FullscreenView] Error during fullscreen toggle:', error);
      return false;
    }
  }
);

// Toggle translation function with loading state
const toggleTranslation = async () => {
  // 切换翻译状态
  autoTranslateEnabled.value = !autoTranslateEnabled.value;
  
  // 如果开启翻译
  if (autoTranslateEnabled.value) {
    isTranslationLoading.value = true; // 显示加载状态
    
    // 记录开始时间，确保加载提示至少显示1秒
    const startTime = Date.now();
    
    try {
      // 检查是否有缓存的翻译
      if (window.__cachedTranslations && Object.keys(window.__cachedTranslations).length > 0) {
        console.log(`[FullscreenView] Using ${Object.keys(window.__cachedTranslations).length} cached translations`);
        subtitleTranslations.value = { ...window.__cachedTranslations };
        
        // 确保加载提示至少显示1秒
        const elapsed = Date.now() - startTime;
        if (elapsed < 1000) {
          console.log(`[FullscreenView] Waiting ${1000 - elapsed}ms to show loading state`);
          setTimeout(() => {
            isTranslationLoading.value = false;
          }, 1000 - elapsed);
        } else {
          isTranslationLoading.value = false;
        }
      } else {
        // 没有缓存，尝试从后端获取
        const videoId = getYouTubeVideoId(window.location.href);
        if (videoId && subtitles.value && subtitles.value.length > 0) {
          console.log('[FullscreenView] No cached translations, fetching from backend');
          const savedTranslations = await fetchTranslationsFromBackend(videoId, subtitles.value);
          if (Object.keys(savedTranslations).length > 0) {
            console.log(`[FullscreenView] Loaded ${Object.keys(savedTranslations).length} translations from backend`);
            window.__cachedTranslations = { ...savedTranslations };
            subtitleTranslations.value = { ...savedTranslations };
          }
        }
        
        // 确保加载提示至少显示1秒
        const elapsed = Date.now() - startTime;
        if (elapsed < 1000) {
          console.log(`[FullscreenView] Waiting ${1000 - elapsed}ms to show loading state`);
          setTimeout(() => {
            isTranslationLoading.value = false;
          }, 1000 - elapsed);
        } else {
          isTranslationLoading.value = false;
        }
      }
    } catch (error) {
      console.error('[FullscreenView] Error fetching translations:', error);
      
      // 即使出错，也确保加载提示显示一定时间
      const elapsed = Date.now() - startTime;
      if (elapsed < 1000) {
        setTimeout(() => {
          isTranslationLoading.value = false;
        }, 1000 - elapsed);
      } else {
        isTranslationLoading.value = false;
      }
    }
  } else {
    // 关闭翻译，清空翻译显示
    subtitleTranslations.value = {};
  }
};

// Function to manually refresh translations from backend
const refreshTranslations = async () => {
  try {
    const videoId = getYouTubeVideoId(window.location.href);
    if (videoId && subtitles.value && subtitles.value.length > 0) {
      console.log('[FullscreenView] Manually refreshing translations');
      const savedTranslations = await fetchTranslationsFromBackend(videoId, subtitles.value);
      if (Object.keys(savedTranslations).length > 0) {
        console.log(`[FullscreenView] Loaded ${Object.keys(savedTranslations).length} translations from backend`);
        window.__cachedTranslations = { ...savedTranslations };
        
        // 仅当翻译开关打开时才应用翻译
        if (autoTranslateEnabled.value) {
          console.log('[FullscreenView] Translation enabled, applying fetched translations');
          subtitleTranslations.value = { ...savedTranslations };
          isTranslationLoading.value = false; // 关闭加载状态
        }
      }
    }
  } catch (error) {
    console.error('[FullscreenView] Error refreshing translations:', error);
  }
};

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

// 在加载字幕后尝试从后台加载已保存的翻译，但不立即显示它们
watch(subtitles, async (newSubtitles) => {
  if (newSubtitles && newSubtitles.length > 0) {
    try {
      // 获取当前视频ID
      const videoId = getYouTubeVideoId(window.location.href);
      if (videoId) {
        console.log('[FullscreenView] Trying to fetch saved translations for video:', videoId);
        
        // 尝试从后台获取已保存的翻译并缓存下来（但不应用）
        const savedTranslations = await fetchTranslationsFromBackend(videoId, newSubtitles);
        
        if (Object.keys(savedTranslations).length > 0) {
          console.log(`[FullscreenView] Loaded ${Object.keys(savedTranslations).length} translations from backend (cached but not displayed)`);
          // 将翻译缓存到一个临时变量，而不是直接应用到UI
          window.__cachedTranslations = { ...savedTranslations };
          
          // 仅当翻译开关打开时才应用翻译
          if (autoTranslateEnabled.value) {
            console.log('[FullscreenView] Translation enabled, applying cached translations');
            subtitleTranslations.value = { ...savedTranslations };
          }
        } 
        // 如果没有已保存的翻译且启用了自动翻译，则进行在线翻译
        else if (autoTranslateEnabled.value) {
          console.log('[FullscreenView] No saved translations found, translating in real-time');
          const results = await batchTranslateSubtitles(newSubtitles, 'zh-CN', videoId, getCurrentVideoTitle());
          // 将翻译结果保存到映射中
          results.forEach((result, index) => {
            subtitleTranslations.value[index] = result.translatedText;
          });
        }
      }
    } catch (error) {
      console.error('[FullscreenView] Error handling subtitles translation:', error);
    }
  }
}, { immediate: true });

// 观察翻译开关状态
watch(autoTranslateEnabled, async (enabled) => {
  console.log(`[FullscreenView] Translation ${enabled ? 'enabled' : 'disabled'}`);
  
  if (enabled && subtitles.value && subtitles.value.length > 0) {
    try {
      // 首先检查是否有缓存的翻译
      if (window.__cachedTranslations && Object.keys(window.__cachedTranslations).length > 0) {
        console.log(`[FullscreenView] Using ${Object.keys(window.__cachedTranslations).length} cached translations`);
        subtitleTranslations.value = { ...window.__cachedTranslations };
        return; // 使用缓存的翻译，不需要重新获取或在线翻译
      }
      
      // 如果没有缓存，从后端获取翻译
      const videoId = getYouTubeVideoId(window.location.href);
      if (videoId) {
        console.log('[FullscreenView] Translation enabled - checking for saved translations first');
        
        // 尝试从后端获取已保存的翻译
        const savedTranslations = await fetchTranslationsFromBackend(videoId, subtitles.value);
        
        // 如果有已保存的翻译，则使用它们
        if (Object.keys(savedTranslations).length > 0) {
          console.log(`[FullscreenView] Loaded ${Object.keys(savedTranslations).length} saved translations`);
          subtitleTranslations.value = { ...savedTranslations };
          window.__cachedTranslations = { ...savedTranslations }; // 更新缓存
          return; // 已加载已保存的翻译，不需要在线翻译
        } else {
          console.log('[FullscreenView] No saved translations found, using online translation');
        }
      }
      
      // 如果没有找到已保存的翻译，或者出现错误，则使用在线翻译
      const results = await batchTranslateSubtitles(subtitles.value);
      results.forEach((result, index) => {
        subtitleTranslations.value[index] = result.translatedText;
      });
    } catch (error) {
      console.error('[FullscreenView] Failed to handle translation:', error);
    }
  } else if (!enabled) {
    // 禁用翻译时清空翻译
    subtitleTranslations.value = {};
  }
});

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
    // Try to get current video info
    const videoId = extractYouTubeVideoId();
    const title = getVideoTitle();
    if (videoId && title) {
      updateVideoInfoStorage(videoId, title);
    }
  }

  // Define custom event interface
  interface VideoInfoEvent {
    detail: {
      videoId: string;
      title: string;
      timestamp: number;
    }
  }

  // Listen for video changes that happen outside our component
  const handleVideoInfoUpdated = (event: Event) => {
    // Type conversion to custom event
    const customEvent = event as CustomEvent<VideoInfoEvent['detail']>;
    console.log('[INFO] Video info update event received');

    // Only process event data, no longer trigger new storage updates to avoid infinite loop
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

// 直接在组件中实现"C"键复制功能
const handleKeyDown = (event: KeyboardEvent) => {
  console.log('[DEBUG] 按键检测:', event.key, 'KeyCode:', event.keyCode);
  
  // 检查是否按下了"C"键（keyCode 67）
  if (event.key === 'c' || event.key === 'C') {
    console.log('[INFO] 检测到"C"键被按下，发送当前字幕到侧边栏');
    
    // 确保有有效的字幕
    if (
      !subtitles.value ||
      currentSubtitleIndex.value < 0 ||
      currentSubtitleIndex.value >= subtitles.value.length
    ) {
      console.log('[INFO] 没有可发送的当前字幕');
      return;
    }

    // 获取当前字幕文本
    const currentSubtitle = subtitles.value[currentSubtitleIndex.value];
    const subtitleText = currentSubtitle.text;

    // 日志记录
    console.log('[INFO] 发送字幕到侧边栏:', subtitleText);

    // 发送消息到后台脚本
    browser.runtime.sendMessage({
      action: 'sendSubtitleToSidePanel',
      subtitleText: subtitleText
    }).catch(error => {
      console.error('[ERROR] 发送字幕到侧边栏失败:', error);
    });
  }
};

// 设置键盘事件监听器
onMounted(() => {
  console.log('[DEBUG] 设置键盘事件监听器');
  document.addEventListener('keydown', handleKeyDown);
});

// 组件卸载时清理事件监听器
onUnmounted(() => {
  console.log('[DEBUG] 清理键盘事件监听器');
  document.removeEventListener('keydown', handleKeyDown);
});

// Initialize fullscreen icon
useFullscreenIcon(hasVideoOnPage, toggleFullscreen);
</script>

<style>
/* Import local Material Icons font */
@import '/assets/fonts/material-icons.css';
/* Import main style file */
@import './Modern-FullscreenView.css';
</style>
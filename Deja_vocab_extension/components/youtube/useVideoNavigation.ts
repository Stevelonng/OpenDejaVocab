import { ref, onMounted, onUnmounted } from 'vue';
import browser from 'webextension-polyfill';
import { updateVideoInfoStorage } from './useVideoStorage';

/**
 * 处理YouTube视频导航和URL变化的钩子函数
 * @param onVideoChange 当视频变化时的回调函数
 * @returns 包含当前视频ID和视频标题的响应式对象
 */
export function useVideoNavigation(onVideoChange?: (videoId: string, videoTitle: string) => void) {
  // 存储当前视频信息的响应式引用
  const currentVideoId = ref<string>('');
  const currentVideoTitle = ref<string>('');

  // 从URL中提取YouTube视频ID
  const extractVideoId = (url: string): string | null => {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v');
    }
    return null;
  };

  // 更新当前视频信息
  const updateCurrentVideo = () => {
      const url = window.location.href;
      const videoId = extractVideoId(url);
      const title = document.title.replace(' - YouTube', '');

      // 修改更新条件：检查视频ID或标题是否有变化
      if (videoId && (videoId !== currentVideoId.value || title !== currentVideoTitle.value)) {
        currentVideoId.value = videoId;
        currentVideoTitle.value = title;

        // 如果提供了回调函数，则调用
        if (onVideoChange) {
          onVideoChange(videoId, title);
        }
        
        // 更新存储中的视频信息
        console.log('检测到视频变化，更新存储信息，ID:', videoId, '标题:', title);
        updateVideoInfoStorage(videoId, title);
      }
  };

  // 观察浏览器历史记录变化
  const handleHistoryChange = () => {
    console.log('检测到浏览器历史记录变化');
    updateCurrentVideo();
  };

  // 观察URL变化的两种方法
  // 1. 使用MutationObserver监听document.title变化
  let titleObserver: MutationObserver | null = null;

  // 2. 拦截history API
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  // 初始化监听器
  const initObservers = () => {
    // 监听标题变化
    titleObserver = new MutationObserver(() => {
      console.log('标题变化:', document.title);
      updateCurrentVideo();
    });

    titleObserver.observe(document.querySelector('title') || document.head, {
      subtree: true,
      characterData: true,
      childList: true
    });

    // 监听popstate事件(后退/前进按钮)
    window.addEventListener('popstate', handleHistoryChange);

    // 拦截history.pushState
    window.history.pushState = function(...args) {
      const result = originalPushState.apply(this, args);
      handleHistoryChange();
      return result;
    };

    // 拦截history.replaceState
    window.history.replaceState = function(...args) {
      const result = originalReplaceState.apply(this, args);
      handleHistoryChange();
      return result;
    };

    // 立即更新当前视频信息
    updateCurrentVideo();
  };

  // 清理监听器
  const cleanupObservers = () => {
    if (titleObserver) {
      titleObserver.disconnect();
      titleObserver = null;
    }

    window.removeEventListener('popstate', handleHistoryChange);
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
  };

  // 挂载组件时初始化
  onMounted(() => {
    initObservers();
  });

  // 卸载组件时清理
  onUnmounted(() => {
    cleanupObservers();
  });

  // 返回响应式引用和方法
  return {
    currentVideoId,
    currentVideoTitle,
    updateCurrentVideo,
    updateVideoInfoStorage
  };
}

import { browser } from 'wxt/browser';
import { ref, onMounted } from 'vue';
import { VideoInfo, getCurrentVideoInfo } from './useVideoStorage';
import { useVideoNavigation } from './useVideoNavigation';

/**
 * 自动字幕收集钩子
 * 在YouTube页面加载时自动获取字幕并保存到localStorage
 */

// 定义字幕接口
export interface Subtitle {
  startTime: number;
  endTime: number;
  text: string;
}

// 定义存储数据接口
interface StorageData {
  currentSubtitles?: Subtitle[];
  currentVideoInfo?: VideoInfo;
  autoCollectEnabled?: boolean;
  apiUrl?: string;
  authToken?: string;
}

interface ApiSubtitle {
  text: string;
  start?: number;
  end?: number;
  start_time?: number;
  end_time?: number;
}

// 默认API配置（只保留生产环境）
const DEFAULT_API_URL = 'https://dejavocab.com/';

// 创建自动字幕钩子
export function useAutoSubtitles() {
  // 状态管理
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const currentVideo = ref<VideoInfo | null>(null);
  const isAutoCollectEnabled = ref(true);

  // 初始化和设置
  onMounted(async () => {
    // 检查是否启用了自动收集功能
    try {
      const storage = await browser.storage.local.get('autoCollectEnabled') as StorageData;
      isAutoCollectEnabled.value = storage.autoCollectEnabled !== false; // 默认为启用
      
      // 设置视频导航监听
      const { updateCurrentVideo } = useVideoNavigation((videoId, title) => {
        // 当视频变化时自动收集字幕
        if (isAutoCollectEnabled.value) {
          autoFetchSubtitles();
        }
      });
      
      // 初始检查当前视频并尝试收集
      updateCurrentVideo();
      
      // 同时设置页面导航监听（适用于SPA页面内部导航）
      setupNavigationListener();
    } catch (error) {
      console.error('[自动字幕] 初始化出错:', error);
    }
  });
  
  // 获取API基础URL
  async function getApiBaseUrl(): Promise<{ baseUrl: string, authToken: string | null }> {
    // 从本地存储获取API配置
    const storage = await browser.storage.local.get(['apiUrl', 'authToken']) as StorageData;
    let apiUrl = storage.apiUrl || '';
    const authToken = storage.authToken || '';
    
    // 如果没有配置API URL，使用默认生产环境
    if (!apiUrl) {
      apiUrl = DEFAULT_API_URL;
      console.log('[自动字幕] 使用默认生产环境API:', apiUrl);
    }
    
    // 确保URL以"/"结尾
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    return { baseUrl, authToken };
  }
  
  // 自动获取字幕
  async function autoFetchSubtitles(): Promise<void> {
    if (isLoading.value) return; // 防止重复请求
    
    try {
      isLoading.value = true;
      error.value = null;
      
      // 检查是否启用了自动收集
      if (!isAutoCollectEnabled.value) {
        console.log('[自动字幕] 自动收集已禁用');
        isLoading.value = false;
        return;
      }
      
      // 获取当前视频信息
      const videoInfo = await getCurrentVideoInfo();
      if (!videoInfo) {
        console.log('[自动字幕] 无法获取视频信息');
        error.value = '无法获取视频信息';
        isLoading.value = false;
        return;
      }
      
      // 检查本地存储是否已有字幕
      console.log('[自动字幕] 检查本地是否已保存字幕:', videoInfo.videoId);
      const localData = await browser.storage.local.get(['currentSubtitles', 'currentVideoInfo']);
      const currentSubtitles = localData.currentSubtitles || [];
      const currentVideoInfo = localData.currentVideoInfo as VideoInfo | undefined;
      
      // 检查本地字幕是否有效
      const isLocalSubtitlesValid = 
        currentSubtitles && 
        Array.isArray(currentSubtitles) && 
        currentSubtitles.length > 0 &&
        currentVideoInfo && 
        currentVideoInfo.videoId === videoInfo.videoId;
      
      if (isLocalSubtitlesValid) {
        console.log('[自动字幕] 本地已有字幕，跳过收集，数量:', currentSubtitles.length);
        isLoading.value = false;
        return;
      }
      
      // 获取API配置
      const { baseUrl, authToken } = await getApiBaseUrl();
      
      if (!baseUrl) {
        console.log('[自动字幕] 无法确定API URL');
        error.value = '无法确定API URL';
        isLoading.value = false;
        return;
      }
      
      if (!authToken) {
        console.log('[自动字幕] 未找到认证Token，需要登录后才能使用自动字幕功能');
        error.value = '未登录，请先登录';
        isLoading.value = false;
        return;
      }
            
      // 调用自动字幕API获取字幕
      console.log('[自动字幕] 开始获取视频字幕:', videoInfo.videoId);
      const response = await fetch(`${baseUrl}auto-subtitles/?url=${encodeURIComponent(videoInfo.url)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // 404错误通常表示没有找到字幕或视频不存在
          console.log('[自动字幕] 该视频没有可用的字幕');
          
          // 清空本地存储中的字幕数据，防止错误地保存其他视频的字幕
          await browser.storage.local.remove(['currentSubtitles']);
          console.log('[自动字幕] 已清空本地存储中的字幕数据');
          
          // 可选：在页面上显示一个通知
          showNotification('该视频没有可用的字幕，可能需要手动收集或使用第三方工具。');
          
          // 记录到本地存储，避免重复尝试
          const noSubtitleVideos = await browser.storage.local.get(['noSubtitleVideos']) as { noSubtitleVideos?: string[] };
          const videos = noSubtitleVideos.noSubtitleVideos || [];
          
          if (!videos.includes(videoInfo.videoId)) {
            videos.push(videoInfo.videoId);
            await browser.storage.local.set({ noSubtitleVideos: videos });
            console.log('[自动字幕] 已将视频标记为无字幕:', videoInfo.videoId);
          }
          
          error.value = '该视频没有可用的字幕';
          isLoading.value = false;
          return;
        } else if (response.status === 401 || response.status === 403) {
          console.log('[自动字幕] 认证失败，请重新登录');
          showNotification('认证失败，请重新登录您的DejaVocab账号');
          error.value = '认证失败，请重新登录';
          isLoading.value = false;
          return;
        } else {
          console.log(`[自动字幕] 获取失败: ${response.status} ${response.statusText}`);
          showNotification(`获取字幕失败 (${response.status})，请稍后再试`);
          error.value = `获取失败: ${response.status}`;
          isLoading.value = false;
          return;
        }
      }
      
      const data = await response.json();
      
      if (data.subtitles && Array.isArray(data.subtitles)) {
        // 转换字幕格式
        const formattedSubtitles: Subtitle[] = data.subtitles.map((sub: any) => ({
          text: sub.text,
          startTime: sub.start || sub.start_time || 0,
          endTime: sub.end || sub.end_time || 0
        }));
        
        // 保存到本地存储
        await saveSubtitlesToLocalStorage(formattedSubtitles, videoInfo);
        
        console.log('[自动字幕] 成功收集:', formattedSubtitles.length, '条字幕');
      } else {
        console.log('[自动字幕] 返回数据格式不正确');
        error.value = '返回数据格式不正确';
      }
      
      isLoading.value = false;
    } catch (err) {
      console.error('[自动字幕] 错误:', err);
      error.value = err instanceof Error ? err.message : '未知错误';
      isLoading.value = false;
    }
  }
  
  // 监听YouTube视频变化
  function setupNavigationListener(): void {
    // 当前URL
    let lastUrl = window.location.href;
    
    // 创建一个观察器来监视URL变化
    const observer = new MutationObserver(() => {
      // 检查URL是否变化
      if (window.location.href !== lastUrl) {
        // URL已变化，可能是新视频
        console.log('[自动字幕] URL变化检测:', lastUrl, '->', window.location.href);
        lastUrl = window.location.href;
        
        // 如果是YouTube视频页面，尝试获取新视频的字幕
        if (window.location.href.includes('youtube.com/watch')) {
          // 延迟执行，确保页面加载完成
          setTimeout(autoFetchSubtitles, 2000);
        }
      }
    });
    
    // 开始观察document的子树变化
    observer.observe(document, { childList: true, subtree: true });
  }
  
  // 保存字幕到本地存储
  async function saveSubtitlesToLocalStorage(subtitles: Subtitle[], videoInfo: VideoInfo): Promise<void> {
    try {
      if (!subtitles || subtitles.length === 0 || !videoInfo || !videoInfo.videoId) {
        console.error('[自动字幕] 保存到本地存储失败: 缺少视频信息或字幕数据');
        return;
      }
      
      // 为了防止覆盖来自 useVideoNavigation 的更准确视频信息，先获取当前存储的视频信息
      const storage = await browser.storage.local.get(['currentVideoInfo']) as StorageData;
      const existingVideoInfo = storage.currentVideoInfo;
      
      // 如果存储中已有视频信息，并且视频 ID 匹配，则仅更新字幕数据，不更新视频信息
      if (existingVideoInfo && existingVideoInfo.videoId === videoInfo.videoId) {
        // 只更新字幕数据，不修改视频信息
        await browser.storage.local.set({
          currentSubtitles: subtitles
        });
        
        console.log(`[自动字幕] 字幕已保存到本地存储，数量: ${subtitles.length}，保留现有视频信息`);
      } else {
        // 如果没有现有视频信息或视频ID不匹配，则同时更新字幕和视频信息
        await browser.storage.local.set({
          currentSubtitles: subtitles,
          currentVideoInfo: videoInfo
        });
        
        console.log(`[自动字幕] 字幕和视频信息已保存到本地存储，数量: ${subtitles.length}`);
      }
    } catch (error) {
      console.error('[自动字幕] 保存字幕到本地存储出错:', error);
    }
  }
  
  // 显示通知消息
  function showNotification(message: string, duration: number = 5000): void {
    try {
      // 检查是否已有通知元素
      let notificationElement = document.getElementById('dejavu-auto-subtitle-notification');
      
      if (!notificationElement) {
        // 创建通知元素
        notificationElement = document.createElement('div');
        notificationElement.id = 'dejavu-auto-subtitle-notification';
        notificationElement.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background-color: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px 15px;
          border-radius: 4px;
          z-index: 9999;
          font-family: Arial, sans-serif;
          font-size: 14px;
          max-width: 300px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          transition: opacity 0.3s ease-in-out;
        `;
        document.body.appendChild(notificationElement);
      }
      
      // 更新消息
      notificationElement.textContent = `DejaVocab: ${message}`;
      notificationElement.style.opacity = '1';
      
      // 设置自动淡出
      setTimeout(() => {
        if (notificationElement) {
          notificationElement.style.opacity = '0';
          setTimeout(() => {
            // 确保元素仍然存在
            if (notificationElement && notificationElement.parentNode) {
              notificationElement.parentNode.removeChild(notificationElement);
            }
          }, 300); // 淡出动画完成后移除
        }
      }, duration);
    } catch (error) {
      console.error('[自动字幕] 显示通知错误:', error);
    }
  }
  
  // 公开方法
  return {
    isLoading,
    error,
    isAutoCollectEnabled,
    currentVideo,
    autoFetchSubtitles,
    
    // 设置是否启用自动收集
    setAutoCollectEnabled: async (enabled: boolean) => {
      await browser.storage.local.set({ autoCollectEnabled: enabled });
      isAutoCollectEnabled.value = enabled;
      console.log(`[自动字幕] 自动收集已${enabled ? '启用' : '禁用'}`);
    }
  };
}

// 获取YouTube视频ID
function getYouTubeVideoId(url: string): string | null {
  const urlParams = new URL(url);
  const videoId = urlParams.searchParams.get('v');
  return videoId || null;
}

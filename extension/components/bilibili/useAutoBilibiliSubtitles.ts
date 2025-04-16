import { browser } from 'wxt/browser';
import { ref, onMounted, getCurrentInstance } from 'vue';
import { getCurrentBilibiliVideoInfo } from './StorageBilibili';
import { BilibiliVideoInfo, extractBilibiliInfo, isBilibiliVideoPage } from './InfoBilibili';
import { 
  Subtitle, 
  ApiSubtitle, 
  convertApiSubtitleToInternal
} from '../youtube/InfoSubtitles';
import {
  hasBilibiliLocalSubtitles,
  saveBilibiliSubtitlesToStorage
} from './StorageBilibili';

/**
 * Auto Bilibili Subtitle Collection Hook
 * Automatically collects subtitles from Bilibili videos and saves them to localStorage
 */

// Default API configuration
const DEFAULT_API_URL = 'http://localhost:8000/';

// 提前定义函数，避免在Vue钩子中调用导致警告
const checkAutoCollectEnabled = async (): Promise<boolean> => {
  try {
    const storage = await browser.storage.local.get('bilibiliAutoCollectEnabled') as { bilibiliAutoCollectEnabled?: boolean };
    return storage.bilibiliAutoCollectEnabled !== false; // Default is enabled
  } catch (error) {
    console.error('[Bilibili] 检查自动收集设置时出错:', error);
    return true; // 默认启用
  }
};

// 初始化检查函数，可以在非组件环境中调用
export const initBilibiliFeatures = async () => {
  // 检查是否在B站视频页面
  if (!isBilibiliVideoPage()) {
    console.log('[Bilibili] 不是视频页面，跳过初始化');
    return;
  }
  
  // 检查是否启用自动收集
  const isAutoCollectEnabled = await checkAutoCollectEnabled();
  if (!isAutoCollectEnabled) {
    console.log('[Bilibili] 自动收集字幕功能已禁用');
    return;
  }

  console.log('[Bilibili] 初始化B站视频功能');
  
  // 获取视频信息
  const videoInfo = extractBilibiliInfo();
  if (videoInfo) {
    console.log('[Bilibili] 当前视频信息:', videoInfo);
    
    // 自动获取字幕
    try {
      const { manualFetchBilibiliSubtitles } = useAutoBilibiliSubtitles();
      await manualFetchBilibiliSubtitles();
    } catch (error) {
      console.error('[Bilibili] 自动获取字幕失败:', error);
    }
  }
};

// Create auto subtitle hook for Bilibili
export function useAutoBilibiliSubtitles() {
  // State management
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const currentVideo = ref<BilibiliVideoInfo | null>(null);
  const isAutoCollectEnabled = ref(true);

  // 只在组件环境中使用onMounted
  // 判断当前是否在组件环境中
  const inComponentEnv = typeof getCurrentInstance === 'function' && getCurrentInstance();
  
  if (inComponentEnv) {
    // Initialization and setup
    onMounted(async () => {
      // Check if auto collection is enabled
      try {
        const enabled = await checkAutoCollectEnabled();
        isAutoCollectEnabled.value = enabled;
        
        // Initial check of current video and attempt to collect
        if (isBilibiliVideoPage()) {
          const videoInfo = extractBilibiliInfo();
          if (videoInfo) {
            currentVideo.value = videoInfo;
            
            // Automatically collect subtitles if enabled
            if (isAutoCollectEnabled.value) {
              autoFetchBilibiliSubtitles();
            }
          }
        }
        
        // Set up page navigation listener for SPA in-page navigation
        setupNavigationListener();
      } catch (error) {
        console.error('[Auto Bilibili Subtitle] Initialization error:', error);
      }
    });
  }
  
  // Get API base URL
  async function getApiBaseUrl(): Promise<{ baseUrl: string, authToken: string | null }> {
    // Get API configuration from local storage
    const storage = await browser.storage.local.get(['apiUrl', 'authToken']) as { apiUrl?: string, authToken?: string };
    let apiUrl = storage.apiUrl || '';
    const authToken = storage.authToken || '';
    
    // If API URL is not configured, use default
    if (!apiUrl) {
      apiUrl = DEFAULT_API_URL;
    }
    
    // Ensure URL ends with "/"
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    return { baseUrl, authToken };
  }
  
  // Set up navigation listener to detect video changes in SPA
  function setupNavigationListener() {
    // Use MutationObserver to detect page navigation
    const observer = new MutationObserver((mutations) => {
      if (isBilibiliVideoPage()) {
        const videoInfo = extractBilibiliInfo();
        if (videoInfo && (!currentVideo.value || videoInfo.videoId !== currentVideo.value.videoId)) {
          console.log('[Bilibili] Video changed:', videoInfo.title);
          currentVideo.value = videoInfo;
          
          // Auto collect subtitles when video changes
          if (isAutoCollectEnabled.value) {
            autoFetchBilibiliSubtitles();
          }
        }
      }
    });
    
    // Observe document title changes (Bilibili changes title on navigation)
    observer.observe(document.querySelector('title') || document.head, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Also observe URL changes (for hash-based routing)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          if (isBilibiliVideoPage()) {
            const videoInfo = extractBilibiliInfo();
            if (videoInfo) {
              currentVideo.value = videoInfo;
              
              // Auto collect subtitles when URL changes
              if (isAutoCollectEnabled.value) {
                autoFetchBilibiliSubtitles();
              }
            }
          }
        }, 500); // Small delay to ensure page has loaded
      }
    });
    
    urlObserver.observe(document, { subtree: true, childList: true });
  }
  
  // Automatically fetch Bilibili subtitles
  async function autoFetchBilibiliSubtitles(): Promise<void> {
    if (isLoading.value) return; // Prevent duplicate requests
    
    try {
      isLoading.value = true;
      error.value = null;
      
      console.log('[Bilibili INFO] 开始获取B站字幕');
      
      // Check if auto collection is enabled
      if (!isAutoCollectEnabled.value) {
        console.log('[Bilibili INFO] 自动收集字幕功能已禁用');
        isLoading.value = false;
        return;
      }
      
      // Get current video information
      const videoInfo = extractBilibiliInfo();
      console.log('[Bilibili INFO] 当前视频信息:', videoInfo);
      if (!videoInfo) {
        console.error('[Bilibili ERROR] 无法获取视频信息');
        error.value = 'Unable to get Bilibili video information';
        isLoading.value = false;
        return;
      }
      
      // Check if subtitles are already saved in local storage
      const hasLocal = await hasBilibiliLocalSubtitles(videoInfo.videoId);
      console.log('[Bilibili INFO] 本地是否已有B站字幕:', hasLocal);
      if (hasLocal) {
        console.log('[Bilibili INFO] 本地已存在B站字幕，跳过请求');
        isLoading.value = false;
        return;
      }
      
      // 检查是否有认证Token (虽然不再需要后端API，但保留这个检查以保持代码一致性)
      const { baseUrl, authToken } = await getApiBaseUrl();
      console.log('[Bilibili INFO] API基础URL:', baseUrl);
      console.log('[Bilibili INFO] 是否有有效的认证Token:', authToken ? '是' : '否');
      
      // 获取B站视频ID信息
      const bvid = videoInfo.bilibiliInfo?.bvid;
      const aid = videoInfo.bilibiliInfo?.aid || 
                 (videoInfo.videoId.startsWith('av') ? videoInfo.videoId.substring(2) : null);
      
      if (!bvid && !aid) {
        console.error('[Bilibili ERROR] 无法获取视频ID');
        error.value = 'Unable to get Bilibili video ID';
        isLoading.value = false;
        return;
      }
      
      try {
        console.log('[Bilibili INFO] 开始获取视频信息...');
        
        // 使用BV号或AV号获取视频详细信息
        let videoDetailUrl;
        if (bvid) {
          videoDetailUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        } else {
          videoDetailUrl = `https://api.bilibili.com/x/web-interface/view?aid=${aid}`;
        }
        
        // 通过后台脚本发送请求，避免CORS问题
        const videoDetailResponse = await browser.runtime.sendMessage({
          action: 'fetchBilibiliData',
          url: videoDetailUrl
        }) as { success: boolean; data?: any; error?: string };
        
        if (!videoDetailResponse.success || !videoDetailResponse.data) {
          throw new Error(videoDetailResponse.error || '获取视频信息失败');
        }
        
        const videoDetail = videoDetailResponse.data;
        if (!videoDetail.data || !videoDetail.data.cid) {
          throw new Error('视频信息中无法获取cid');
        }
        
        const actualAid = videoDetail.data.aid;
        const cid = videoDetail.data.cid;
        
        console.log('[Bilibili INFO] 获取到视频aid:', actualAid, 'cid:', cid);
        
        // 获取字幕信息
        const subtitleUrl = `https://api.bilibili.com/x/player/wbi/v2?aid=${actualAid}&cid=${cid}`;
        
        console.log('[Bilibili INFO] 请求字幕信息URL:', subtitleUrl);
        
        const subtitleResponse = await browser.runtime.sendMessage({
          action: 'fetchBilibiliData',
          url: subtitleUrl
        }) as { success: boolean; data?: any; error?: string };
        
        if (!subtitleResponse.success || !subtitleResponse.data) {
          throw new Error(subtitleResponse.error || '获取字幕信息失败');
        }
        
        const subtitleInfo = subtitleResponse.data;
        
        if (!subtitleInfo.data || !subtitleInfo.data.subtitle || !subtitleInfo.data.subtitle.subtitles) {
          console.log('[Bilibili INFO] 该视频没有字幕');
          
          // 记录到本地存储以避免重复尝试
          const noSubtitleVideos = await browser.storage.local.get(['noSubtitleBilibiliVideos']) as { noSubtitleBilibiliVideos?: string[] };
          const videos = noSubtitleVideos.noSubtitleBilibiliVideos || [];
          
          if (!videos.includes(videoInfo.videoId)) {
            videos.push(videoInfo.videoId);
            await browser.storage.local.set({ noSubtitleBilibiliVideos: videos });
            console.log('[Bilibili INFO] 已将视频添加到B站无字幕列表');
          }
          
          error.value = 'No subtitles available for this Bilibili video';
          isLoading.value = false;
          return;
        }
        
        // 过滤掉没有字幕URL的项目
        const availableSubtitles = subtitleInfo.data.subtitle.subtitles.filter((item: any) => item.subtitle_url);
        
        if (availableSubtitles.length === 0) {
          console.log('[Bilibili INFO] 无可用字幕');
          error.value = 'No available subtitles';
          isLoading.value = false;
          return;
        }
        
        console.log('[Bilibili INFO] 找到字幕数量:', availableSubtitles.length);
        
        // 获取第一个字幕的内容（通常是中文字幕）
        const firstSubtitle = availableSubtitles[0];
        let subtitleContentUrl = firstSubtitle.subtitle_url;
        
        // 修复相对URL（如果以//开头，添加https:前缀）
        if (subtitleContentUrl.startsWith('//')) {
          subtitleContentUrl = 'https:' + subtitleContentUrl;
          console.log('[Bilibili INFO] 修复后的字幕内容URL:', subtitleContentUrl);
        }
        
        console.log('[Bilibili INFO] 字幕内容URL:', subtitleContentUrl);
        
        try {
          // 获取API基础URL和认证令牌
          const { baseUrl, authToken } = await getApiBaseUrl();
          
          // 添加调试日志
          console.log('[Bilibili DEBUG] 原始baseUrl:', baseUrl);
          
          if (!baseUrl || !authToken) {
            throw new Error('无法获取API基础URL或认证令牌');
          }
          
          // 修复路径拼接逻辑
          let apiPath;
          if (baseUrl.endsWith('/api/')) {
            apiPath = 'bilibili/subtitle';
          } else if (baseUrl.endsWith('/api')) {
            apiPath = '/bilibili/subtitle';
          } else {
            apiPath = 'api/bilibili/subtitle';
          }
          
          const fullUrl = `${baseUrl}${apiPath}`;
          console.log('[Bilibili INFO] 请求API路径:', fullUrl);
          
          const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              subtitle_url: subtitleContentUrl,
              video_id: videoInfo.videoId,
              title: videoInfo.title
            })
          });
          
          if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
          }
          
          const subtitleData = await response.json();
          console.log('[Bilibili INFO] 成功获取字幕内容:', subtitleData);
          
          // 将B站字幕格式转换为内部格式
          const formattedSubtitles: Subtitle[] = subtitleData.body.map((item: any, index: number) => ({
            id: index,
            startTime: item.from,  // B站字幕的开始时间
            endTime: item.to,      // B站字幕的结束时间
            text: item.content     // B站字幕的文本内容
          }));
          
          // 保存到本地存储
          await saveBilibiliSubtitlesToStorage({ subtitles: formattedSubtitles, videoInfo });
          console.log('[Bilibili INFO] B站字幕已成功保存到本地存储');
          
        } catch (err: any) {
          console.error('[Bilibili ERROR] 获取字幕出错:', err);
          error.value = err instanceof Error ? err.message : '未知错误';
        }
        
      } catch (err: any) {
        console.error('[Bilibili ERROR] 获取字幕出错:', err);
        error.value = err instanceof Error ? err.message : '未知错误';
      }
      
      isLoading.value = false;
      console.log('[Bilibili INFO] B站自动字幕获取完成');
    } catch (err: any) {
      console.error('[Bilibili ERROR] 自动获取字幕时出错:', err);
      error.value = err instanceof Error ? err.message : '未知错误';
      isLoading.value = false;
    }
  }
  
  // Show notification helper
  function showNotification(message: string) {
    if (browser.runtime && browser.runtime.sendMessage) {
      browser.runtime.sendMessage({
        action: 'showNotification',
        message
      }).catch(err => console.error('[Bilibili ERROR] Error sending notification:', err));
    }
  }
  
  // Toggle auto collect setting
  async function toggleAutoCollect(value?: boolean): Promise<void> {
    const newValue = value !== undefined ? value : !isAutoCollectEnabled.value;
    isAutoCollectEnabled.value = newValue;
    
    await browser.storage.local.set({ bilibiliAutoCollectEnabled: newValue });
    console.log(`[Bilibili INFO] 自动收集B站字幕功能已${newValue ? '启用' : '禁用'}`);
    
    // If toggled on, try to fetch for current video
    if (newValue && isBilibiliVideoPage()) {
      autoFetchBilibiliSubtitles();
    }
  }
  
  // Manually trigger subtitle fetch
  function manualFetchBilibiliSubtitles(): Promise<void> {
    return autoFetchBilibiliSubtitles();
  }
  
  // Expose necessary functions and state
  return {
    isLoading,
    error,
    currentVideo,
    isAutoCollectEnabled,
    toggleAutoCollect,
    manualFetchBilibiliSubtitles
  };
}

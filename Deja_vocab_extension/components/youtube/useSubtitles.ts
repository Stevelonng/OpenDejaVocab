import { ref, watch, nextTick, Ref, onMounted, computed } from 'vue';
import { browser } from 'wxt/browser';

// 字幕类型定义
export interface Subtitle {
  id?: number;
  startTime: number;
  endTime: number;
  text: string;
  saved?: boolean;
}

// 视频信息类型定义
interface VideoInfo {
  videoId: string;
  title: string;
  url: string;
}

/**
 * 字幕控制与导航功能的组合式API
 * 包含字幕数据获取、格式化、导航和自动滚动等功能
 */
export function useSubtitles(currentVideoTime: Ref<number>) {
  // 字幕数据与状态
  const subtitles = ref<Subtitle[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const currentSubtitleIndex = ref(-1);
  const currentVideoInfo = ref<VideoInfo | null>(null);
  const processedVideoIds = ref<Record<string, boolean | string>>({});
  
  // 从YouTube URL获取视频ID
  const getYouTubeVideoId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|\/videos\/|youtu\.be\/|embed\/|\?v=)([^&?\n]+)/);
    return match ? match[1] : null;
  };

  // 提取当前页面的视频信息
  const extractVideoInfo = (): VideoInfo | null => {
    // 检查是否在YouTube视频页面
    if (!window.location.href.includes('youtube.com/watch')) {
      return null;
    }
    
    const videoId = getYouTubeVideoId(window.location.href);
    if (!videoId) return null;
    
    // 获取原始标题，不再添加视频ID作为后缀
    const rawTitle = document.title.replace(' - YouTube', '');
    
    // 在内部我们仍然使用视频ID进行唯一标识，但在前端显示中不显示这个ID
    return {
      videoId,
      title: rawTitle, // 直接使用原始标题，不添加视频ID
      url: window.location.href
    };
  };

  // 检查后端是否已有字幕
  const checkExistingSubtitles = async (videoId: string): Promise<boolean> => {
    try {
      // 获取API配置
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('缺少 API URL 或认证信息');
      }
      
      // 构建请求URL
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const videoResponse = await fetch(`${baseUrl}videos/?url=${encodeURIComponent(videoUrl)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!videoResponse.ok) return false;
      
      const videoData = await videoResponse.json();
      
      // 检查是否有匹配的视频
      if (videoData.results && videoData.results.length > 0) {
        // 查找完全匹配的视频，使用videoId进行匹配
        for (const video of videoData.results) {
          // 检查URL中是否包含相同的videoId
          const urlVideoId = getYouTubeVideoId(video.url);
          if (urlVideoId === videoId) {
            // 检查视频是否有字幕
            const subtitleResponse = await fetch(`${baseUrl}subtitles/?video_id=${video.id}`, {
              headers: {
                'Authorization': `Token ${authToken}`
              }
            });
            
            if (subtitleResponse.ok) {
              const subtitleData = await subtitleResponse.json();
              // 处理不同的API响应格式（分页或非分页）
              if (Array.isArray(subtitleData)) {
                return subtitleData.length > 0;
              } else {
                return subtitleData.results && subtitleData.results.length > 0;
              }
            }
          }
        }
      }
      
      return false;
    } catch (err) {
      return false;
    }
  };

  // 从后端获取字幕
  const fetchSubtitlesFromBackend = async (videoId: string): Promise<Subtitle[]> => {
    try {
      // 获取API配置
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('缺少 API URL 或认证信息');
      }
      
      // 构建请求URL
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const videoResponse = await fetch(`${baseUrl}videos/?url=${encodeURIComponent(videoUrl)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!videoResponse.ok) {
        throw new Error('获取视频信息失败');
      }
      
      const videoData = await videoResponse.json();
      
      // 检查是否有视频数据
      if (!videoData.results || videoData.results.length === 0) {
        throw new Error('未找到视频数据，请先收集字幕');
      }
      
      // 查找完全匹配的视频，使用videoId进行匹配
      let exactVideoMatch = null;
      for (const video of videoData.results) {
        // 检查URL中是否包含相同的videoId
        const urlVideoId = getYouTubeVideoId(video.url);
        if (urlVideoId === videoId) {
          exactVideoMatch = video;
          break;
        }
      }
      
      if (!exactVideoMatch) {
        throw new Error('找到视频但URL不完全匹配，请重新收集字幕');
      }
      
      // 获取视频字幕
      const response = await fetch(`${baseUrl}subtitles/?video_id=${exactVideoMatch.id}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('获取字幕失败');
      }
      
      const data = await response.json();
      
      // 处理API响应格式（分页或非分页）
      let subtitlesData;
      if (Array.isArray(data)) {
        subtitlesData = data;
      } else {
        subtitlesData = data.results;
      }
      
      // 更新视频信息并返回格式化后的字幕
      return subtitlesData.map((sub: any) => ({
        id: sub.id,
        startTime: sub.start_time,
        endTime: sub.end_time,
        text: sub.text,
        saved: sub.saved || false
      }));
    } catch (error: any) {
      throw error;
    }
  };

  // 通过后端API从YouTube收集字幕
  const collectSubtitlesUsingBackend = async (videoInfo: VideoInfo): Promise<void> => {
    try {
      // 设置状态
      loading.value = true;
      error.value = null;
      
      // 从本地存储获取字幕并发送到后端
      const result = await sendLocalSubtitlesToBackend(videoInfo);
      if (result) {
        // 如果成功发送本地字幕，直接返回
        return;
      }
      
      // 如果本地没有字幕或发送失败，使用旧方法
      // 发送消息到背景脚本，让背景脚本调用API
      browser.runtime.sendMessage({
        action: 'collectSubtitles',
        videoId: videoInfo.videoId,
        videoUrl: videoInfo.url,
        videoTitle: videoInfo.title
      });
      
      // 记录当前视频为处理中
      processedVideoIds.value[videoInfo.videoId] = 'collecting';
      
      // 轮询等待字幕收集完成
      let pollCount = 0;
      const maxPolls = 5; // 最多轮询5次，避免无限循环
      const pollInterval = 1500; // 每1.5秒检查一次
      
      const pollForSubtitles = async () => {
        if (pollCount >= maxPolls) {
          // 尝试最后一次获取
          try {
            const subs = await fetchSubtitlesFromBackend(videoInfo.videoId);
            if (subs.length > 0) {
              subtitles.value = subs;
              processedVideoIds.value[videoInfo.videoId] = true;
              return true;
            }
          } catch (e) {
            // 超时处理
            throw new Error('字幕收集超时，请稍后重试');
          }
        }
        
        pollCount++;
        
        // 检查是否有字幕
        const hasSubtitles = await checkExistingSubtitles(videoInfo.videoId);
        if (hasSubtitles) {
          const subs = await fetchSubtitlesFromBackend(videoInfo.videoId);
          subtitles.value = subs;
          processedVideoIds.value[videoInfo.videoId] = true;
          return true;
        } else {
          // 继续轮询
          return new Promise<boolean>((resolve) => {
            setTimeout(async () => {
              const result = await pollForSubtitles();
              resolve(result);
            }, pollInterval);
          });
        }
      };
      
      // 开始轮询前先等待一段时间，让后台有时间开始处理
      setTimeout(async () => {
        try {
          await pollForSubtitles();
        } catch (err: any) {
          error.value = err.message;
          // 出错时移除"collecting"状态，允许重试
          if (processedVideoIds.value[videoInfo.videoId] === 'collecting') {
            delete processedVideoIds.value[videoInfo.videoId];
          }
        } finally {
          loading.value = false;
        }
      }, 1500);
    } catch (err: any) {
      error.value = err.message;
      loading.value = false;
      // 出错时移除"collecting"状态，允许重试
      if (processedVideoIds.value[videoInfo.videoId] === 'collecting') {
        delete processedVideoIds.value[videoInfo.videoId];
      }
    }
  };

  // 主字幕获取函数
  const fetchSubtitles = async (forceRefresh: boolean = false, shouldCollect: boolean = false) => {
    // 重置状态
    loading.value = true;
    error.value = null;
    
    try {
      // 提取当前视频信息
      const videoInfo = extractVideoInfo();
      if (!videoInfo) {
        throw new Error('无法获取视频信息，请确保您在YouTube视频页面上');
      }
      
      // 检查是否是新视频，如果是则清空现有字幕
      if (!currentVideoInfo.value || currentVideoInfo.value.videoId !== videoInfo.videoId) {
        subtitles.value = []; // 立即清空字幕
        currentSubtitleIndex.value = -1; // 重置当前字幕索引
        
        // 同时从浏览器存储中清除当前字幕
        try {
          // 首先检查存储API是否可用
          if (browser?.storage?.local) {
            await browser.storage.local.remove(['currentSubtitles']);
          }
        } catch (error) {
          // 如果存储操作失败，记录错误但继续执行
          console.warn('[WARNING] 清除存储中的字幕数据失败:', error);
          // 不再抛出错误，因为这可能是由于扩展上下文无效导致的
        }
      }
      
      // 更新当前视频信息
      currentVideoInfo.value = videoInfo;
      
      // 如果强制刷新，重置处理状态
      if (forceRefresh && processedVideoIds.value[videoInfo.videoId]) {
        delete processedVideoIds.value[videoInfo.videoId];
      }
      
      // 检查是否已经处理过该视频
      if (processedVideoIds.value[videoInfo.videoId] === true) {
        if (subtitles.value.length > 0) {
          // 已有字幕，直接返回
          loading.value = false;
          return;
        } else {
          // 标记为已处理但没有字幕，尝试重新获取
          delete processedVideoIds.value[videoInfo.videoId];
        }
      }
      
      // 正在处理中，避免重复请求
      if (processedVideoIds.value[videoInfo.videoId] === 'collecting') {
        loading.value = false;
        return;
      }
      
      // 标记为正在处理
      processedVideoIds.value[videoInfo.videoId] = 'collecting';
      
      // 检查是否有现有字幕
      const hasExistingSubtitles = await checkExistingSubtitles(videoInfo.videoId);
      
      if (hasExistingSubtitles) {
        // 后端已有字幕，直接获取
        const subs = await fetchSubtitlesFromBackend(videoInfo.videoId);
        subtitles.value = subs;
        processedVideoIds.value[videoInfo.videoId] = true;
        loading.value = false;
      } else if (shouldCollect) {
        // 只有当 shouldCollect 为 true 时，才尝试收集和发送字幕
        const localSubtitleResult = await sendLocalSubtitlesToBackend(videoInfo);
        
        // 如果本地没有字幕或发送失败，则尝试收集新字幕
        if (!localSubtitleResult) {
          // 当本地字幕不可用时，尝试从视频获取字幕
          await collectSubtitlesUsingBackend(videoInfo);
        }
      } else {
        // 当 shouldCollect 为 false 时，不要尝试发送字幕，只显示提示信息
        error.value = '该视频未收集字幕，请点击全屏按钮收集字幕';
        loading.value = false;
        // 移除'collecting'状态，以便未来可以重试
        delete processedVideoIds.value[videoInfo.videoId];
      }
    } catch (err: any) {
      error.value = err.message;
      loading.value = false;
    }
  };
  
  // 在组件挂载时初始化 - 移除自动收集逻辑
  onMounted(() => {
    // 不再自动调用 fetchSubtitles()
    // 改为只在用户点击全屏按钮时才收集字幕
  });

  // 格式化时间（秒 -> MM:SS）
  const formatTime = (timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
  };

  // 更新当前字幕
  const updateCurrentSubtitle = (currentTime: number) => {
    // 限制更新频率，避免过于频繁的计算
    for (let i = 0; i < subtitles.value.length; i++) {
      const sub = subtitles.value[i];
      if (currentTime >= sub.startTime && currentTime < sub.endTime) {
        if (currentSubtitleIndex.value !== i) {
          currentSubtitleIndex.value = i;
          // 当字幕更新时，向side panel发送字幕信息
          sendSubtitleToSidePanel(sub);
        }
        return;
      }
    }
    // 如果没有匹配的字幕
    if (currentSubtitleIndex.value !== -1) {
      currentSubtitleIndex.value = -1;
      // 通知side panel当前没有字幕
      sendSubtitleToSidePanel(null);
    }
  };
  
  // 向side panel发送字幕信息
  const sendSubtitleToSidePanel = (subtitle: Subtitle | null) => {
      // 使用browser API如果可用
      if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
        browser.runtime.sendMessage({
          action: 'updateCurrentSubtitle',
          subtitle: subtitle,
          videoInfo: currentVideoInfo.value
        });
      }
      // 否则尝试使用chrome API
      else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'updateCurrentSubtitle',
          subtitle: subtitle,
          videoInfo: currentVideoInfo.value
        });
      }
  };

  // 从本地存储获取字幕并发送到后端
  const sendLocalSubtitlesToBackend = async (videoInfo: VideoInfo): Promise<boolean> => {
    try {      
      const allStorage = await browser.storage.local.get(null);
      
      // 首先检查该视频是否已被标记为无字幕
      const noSubsData = await browser.storage.local.get(['noSubtitleVideos']) as { noSubtitleVideos?: string[] };
      if (noSubsData.noSubtitleVideos && 
          Array.isArray(noSubsData.noSubtitleVideos) && 
          videoInfo.videoId && 
          noSubsData.noSubtitleVideos.includes(videoInfo.videoId)) {
        error.value = '该视频没有可用字幕';
        loading.value = false;
        return false;
      }

      // 获取本地存储的字幕
      const data = await browser.storage.local.get('currentSubtitles') as { currentSubtitles?: Subtitle[] };
      const videoInfoData = await browser.storage.local.get('currentVideoInfo') as { currentVideoInfo?: VideoInfo };
      
      // 验证字幕数据
      if (
        !data.currentSubtitles || 
        !Array.isArray(data.currentSubtitles) || 
        data.currentSubtitles.length === 0 ||
        !videoInfoData.currentVideoInfo ||
        videoInfoData.currentVideoInfo.videoId !== videoInfo.videoId
      ) {
        return false;
      }
      
      const apiData = await browser.storage.local.get(['apiUrl', 'authToken']) as { apiUrl?: string, authToken?: string };
      const apiUrl = apiData.apiUrl || 'https://dejavocab.com';
      const authToken = apiData.authToken;
      
      if (!authToken) {
        error.value = 'API授权失败，请重新登录';
        loading.value = false;
        return false;
      }
      
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const normalizedUrl = baseUrl.includes('/api') ? baseUrl : `${baseUrl}/api`;
      
      const formattedSubtitles = data.currentSubtitles.map(sub => ({
        text: sub.text,
        start_time: sub.startTime,
        end_time: sub.endTime
      }));
      
      const requestData = {
        video_id: videoInfoData.currentVideoInfo.videoId,
        video_title: videoInfoData.currentVideoInfo.title, // 添加视频标题
        subtitles: formattedSubtitles
      };
      
      const maxRetries = 3;
      let retryCount = 0;
      let lastError = null;
      
      while (retryCount < maxRetries) {
        try {
          const response = await fetch(`${normalizedUrl}/save-subtitles/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Token ${authToken}`
            },
            body: JSON.stringify(requestData)
          });
          
          if (!response.ok) {
            let errorText = '';
            try {
              const errorResponse = await response.text();
              try {
                const errorData = JSON.parse(errorResponse);
                errorText = JSON.stringify(errorData);
              } catch (parseError) {
                errorText = errorResponse;
              }
            } catch (e) {
              errorText = `HTTP错误: ${response.status} ${response.statusText}`;
            }
            
            if ((response.status === 500 || response.status === 404) && retryCount < maxRetries - 1) {
              retryCount++;
              lastError = `${response.status} ${errorText.substring(0, 100)}`;
              const delay = 1000 * Math.pow(2, retryCount);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            
            error.value = `保存字幕失败: ${response.status} ${errorText.substring(0, 100)}`;
            loading.value = false;
            return false;
          }
          
          const responseData = await response.json();
          
          const subs = await fetchSubtitlesFromBackend(videoInfoData.currentVideoInfo.videoId);
          subtitles.value = subs;
          processedVideoIds.value[videoInfoData.currentVideoInfo.videoId] = true;
          loading.value = false;
          return true;
        } catch (err: any) {
          if (retryCount < maxRetries - 1) {
            retryCount++;
            lastError = err.message || '未知错误';
            const delay = 1000 * Math.pow(2, retryCount);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          
          error.value = lastError || err.message || '发送字幕失败';
          loading.value = false;
          return false;
        }
      }
      
      error.value = lastError || '多次重试后仍然失败';
      loading.value = false;
      return false;
    } catch (err: any) {
      error.value = err.message || '发送字幕失败';
      loading.value = false;
      return false;
    }
  };

  // 保存字幕到本地存储，用于聊天功能
  const saveSubtitlesToLocalStorage = (): Promise<void> => {
    if (!subtitles.value || subtitles.value.length === 0 || !currentVideoInfo.value) {
      return Promise.resolve();
    }
    
    const simplifiedSubtitles = subtitles.value.map(sub => ({
      text: sub.text,
      startTime: sub.startTime,
      endTime: sub.endTime
    }));
    
    return browser.storage.local.set({
      currentSubtitles: simplifiedSubtitles,
      currentVideoInfo: {
        videoId: currentVideoInfo.value.videoId,
        title: currentVideoInfo.value.title,
        url: currentVideoInfo.value.url
      }
    });
  };

  // 当获取到字幕时，也保存到本地存储
  watch(subtitles, (newSubtitles) => {
    if (newSubtitles && newSubtitles.length > 0) {
      saveSubtitlesToLocalStorage();
    }
  });

  // 标记当前字幕保存到用户词典
  const markCurrentSubtitle = async (): Promise<boolean> => {
    if (!currentVideoInfo.value || currentSubtitleIndex.value < 0 || !subtitles.value[currentSubtitleIndex.value]) {
      return false;
    }

    try {
      const apiData = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = apiData.apiUrl as string;
      const authToken = apiData.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('缺少 API URL 或认证信息');
      }
      
      const currentSub = subtitles.value[currentSubtitleIndex.value];
      const response = await fetch(`${baseUrl}videos/${currentVideoInfo.value.videoId}/mark-subtitle/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        },
        body: JSON.stringify({
          subtitle_text: currentSub.text,
          start_time: currentSub.startTime,
          end_time: currentSub.endTime
        })
      });
      
      if (!response.ok) {
        throw new Error('标记字幕失败');
      }
      
      subtitles.value[currentSubtitleIndex.value] = {
        ...currentSub,
        saved: true
      };
      
      return true;
    } catch (err) {
      return false;
    }
  };

  // 监听视频时间变化，更新当前字幕
  watch(currentVideoTime, (newTime) => {
    updateCurrentSubtitle(newTime);
  });

  /**
   * 当前字幕计算属性
   * 基于当前索引获取字幕对象
   */
  const currentSubtitle = computed(() => {
    if (subtitles.value && currentSubtitleIndex.value >= 0 && currentSubtitleIndex.value < subtitles.value.length) {
      return subtitles.value[currentSubtitleIndex.value];
    }
    return null;
  });

  /**
   * 处理当前字幕文本
   * 该函数需要一个外部传入的处理函数来格式化文本
   */
  const getProcessedCurrentSubtitle = (processTextFunction: (text: string) => string) => {
    return computed(() => {
      if (currentSubtitleIndex.value >= 0 && subtitles.value[currentSubtitleIndex.value]) {
        return processTextFunction(subtitles.value[currentSubtitleIndex.value].text);
      }
      return ''; // 返回空字符串，不显示“无字幕”
    });
  };

  /**
   * 字幕显示控制
   * 控制字幕的显示和隐藏
   */
  const subtitlesEnabled = ref(true);

  /**
   * 切换字幕显示状态
   */
  const toggleSubtitles = () => {
    subtitlesEnabled.value = !subtitlesEnabled.value;
  };

  return {
    subtitles,
    loading,
    error,
    currentSubtitleIndex,
    currentVideoInfo,
    formatTime,
    updateCurrentSubtitle,
    fetchSubtitles,
    markCurrentSubtitle,
    currentSubtitle,
    getProcessedCurrentSubtitle,
    subtitlesEnabled,
    toggleSubtitles,
    saveSubtitlesToLocalStorage  // 暴露保存字幕的方法
  };
}

/**
 * 字幕导航功能的组合式API
 * 处理字幕之间的跳转和自动滚动功能
 */
export function useSubtitleNavigation(
  videoElement: Ref<HTMLVideoElement | null>,
  subtitles: Ref<{startTime: number, endTime: number, text: string}[]>,
  currentSubtitleIndex: Ref<number>,
  isPlaying?: Ref<boolean>,
  togglePlay?: () => void
) {
  const subtitlesList = ref<HTMLElement | null>(null);

  // 跳转到上一句字幕
  const prevSubtitle = () => {
    if (subtitles.value.length === 0 || currentSubtitleIndex.value <= 0) return;
    
    const prevIndex = Math.max(0, currentSubtitleIndex.value - 1);
    const prevTime = subtitles.value[prevIndex].startTime;
    seekToSubtitle(prevTime);
  };

  // 跳转到下一句字幕
  const nextSubtitle = () => {
    if (subtitles.value.length === 0 || currentSubtitleIndex.value >= subtitles.value.length - 1) return;
    
    const nextIndex = Math.min(subtitles.value.length - 1, currentSubtitleIndex.value + 1);
    const nextTime = subtitles.value[nextIndex].startTime;
    seekToSubtitle(nextTime);
  };

  // 跳转到指定时间点并播放
  const seekToSubtitle = (time: number) => {
    if (!videoElement.value) return;
    // 设置时间位置
    videoElement.value.currentTime = time;
    
    // 强制播放视频，即使当前是暂停状态
    if (isPlaying && togglePlay) {
      // 如果提供了播放状态和切换函数，使用它们来确保 UI 状态同步
      if (!isPlaying.value) {
        togglePlay(); // 切换播放状态
      }
    } else {
      // 如果没有提供播放控制，直接调用播放
      videoElement.value.play();
    }
  };


  // 监听当前字幕索引变化，实现字幕自动滚动
  let disableAutoScroll = false;
  
  // 添加方法检测并设置是否在小屏幕上
  const checkScreenSize = () => {
    disableAutoScroll = window.innerWidth <= 991.98;
  };
  
  // 初始化检查并添加监听器
  checkScreenSize();
  
  // 添加窗口大小变化监听
  window.addEventListener('resize', checkScreenSize);
  
  // 在组件卸载时处理
  onMounted(() => {
    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  });
  
  watch(currentSubtitleIndex, async (newIndex) => {
    if (!subtitlesList.value || newIndex < 0) return;
    
    // 等待DOM更新
    await nextTick();
    
    // 获取当前字幕元素
    const currentElement = subtitlesList.value.children[newIndex] as HTMLElement;
    if (!currentElement) return;
    
    // 滚动到当前字幕
    // 只在宽屏模式下执行滚动，窄屏模式下不执行
    if (!disableAutoScroll) {
      currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
  });

  return {
    subtitlesList,
    prevSubtitle,
    nextSubtitle,
    seekToSubtitle
  };
}

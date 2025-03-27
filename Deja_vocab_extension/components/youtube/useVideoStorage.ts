import browser from 'webextension-polyfill';

/**
 * 视频信息接口定义
 */
export interface VideoInfo {
  videoId: string;
  title: string;
  url: string;
  timestamp?: number;
}

/**
 * 更新浏览器存储中的视频信息
 * @param videoId 视频ID
 * @param title 视频标题
 * @returns 返回更新后的视频信息对象
 */
export const updateVideoInfoStorage = async (videoId: string, title: string): Promise<VideoInfo> => {
  // 构建完整的YouTube URL
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  // 准备视频信息
  const videoInfo: VideoInfo = {
    videoId: videoId,
    title: title,
    url: url,
    timestamp: Date.now() // 用于内部追踪
  };
  
  // 更新存储中的视频信息
  try {
    await browser.storage.local.set({ 
      currentVideoInfo: videoInfo 
    });
    console.log('[INFO] Video info updated in storage:', videoInfo.title);
    
    // 分发视频变更事件
    document.dispatchEvent(new CustomEvent('youtube-video-info-updated', {
      detail: videoInfo
    }));
  } catch (error) {
    console.error('[ERROR] Failed to update video info in storage:', error);
  }

  return videoInfo;
};

/**
 * 从浏览器存储中获取当前视频信息
 * @returns 返回存储中的视频信息，如果不存在则返回null
 */
export const getCurrentVideoInfo = async (): Promise<VideoInfo | null> => {
  try {
    const storage = await browser.storage.local.get('currentVideoInfo');
    
    // 检查返回的对象是否包含有效的 VideoInfo
    if (storage.currentVideoInfo && 
        typeof storage.currentVideoInfo === 'object' && 
        'videoId' in storage.currentVideoInfo &&
        'title' in storage.currentVideoInfo &&
        'url' in storage.currentVideoInfo) {
      return storage.currentVideoInfo as VideoInfo;
    }
    
    return null;
  } catch (error) {
    console.error('[ERROR] Failed to get video info from storage:', error);
    return null;
  }
};

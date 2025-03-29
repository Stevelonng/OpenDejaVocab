import browser from 'webextension-polyfill';
import { VideoInfo } from './InfoVideo';

/**
 * Update video information in browser storage
 * @param videoId Video ID
 * @param title Video title
 * @returns Returns the updated video information object
 */
export const updateVideoInfoStorage = async (videoId: string, title: string): Promise<VideoInfo> => {
  // Build complete YouTube URL
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Prepare video information
  const videoInfo: VideoInfo = {
    videoId: videoId,
    title: title,
    url: url,
    timestamp: Date.now() // For internal tracking
  };
  
  // Update video info in storage
  try {
    await browser.storage.local.set({ 
      currentVideoInfo: videoInfo 
    });
    console.log('[INFO] Video info updated in storage:', videoInfo.title);
    
    // Dispatch video info updated event
    document.dispatchEvent(new CustomEvent('youtube-video-info-updated', {
      detail: videoInfo
    }));
  } catch (error) {
    console.error('[ERROR] Failed to update video info in storage:', error);
  }

  return videoInfo;
};

/**
 * Get current video information from browser storage
 * @returns Returns the stored video information, or null if not found
 */
export const getCurrentVideoInfo = async (): Promise<VideoInfo | null> => {
  try {
    const storage = await browser.storage.local.get('currentVideoInfo');
    
    // Check if the returned object contains valid VideoInfo
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

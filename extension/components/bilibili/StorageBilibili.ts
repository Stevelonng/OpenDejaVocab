import browser from 'webextension-polyfill';
import { BilibiliVideoInfo } from './InfoBilibili';
import { Subtitle } from '../youtube/InfoSubtitles';

/**
 * Check if local storage has Bilibili subtitles for the given video
 * @param videoId Bilibili video ID (BV or AV number)
 * @returns Promise with boolean indicating if subtitles exist
 */
export const hasBilibiliLocalSubtitles = async (videoId: string): Promise<boolean> => {
  try {
    const localData = await browser.storage.local.get(['bilibiliSubtitles', 'bilibiliVideoInfo']);
    const currentSubtitles = localData.bilibiliSubtitles || [];
    const currentVideoInfo = localData.bilibiliVideoInfo as BilibiliVideoInfo | undefined;
    
    return Boolean(
      currentSubtitles && 
      Array.isArray(currentSubtitles) && 
      currentSubtitles.length > 0 &&
      currentVideoInfo && 
      currentVideoInfo.videoId === videoId
    );
  } catch (error) {
    console.error('[Bilibili Subtitles] Error checking local subtitles:', error);
    return false;
  }
};

/**
 * Get Bilibili subtitles from local storage
 * @returns Promise with subtitles array and video info, or null if not found
 */
export const getBilibiliLocalSubtitles = async (): Promise<{ subtitles: Subtitle[], videoInfo: BilibiliVideoInfo } | null> => {
  try {
    const localData = await browser.storage.local.get(['bilibiliSubtitles', 'bilibiliVideoInfo']);
    const subtitles = localData.bilibiliSubtitles || [];
    const videoInfo = localData.bilibiliVideoInfo as BilibiliVideoInfo | undefined;
    
    if (!Array.isArray(subtitles) || subtitles.length === 0 || !videoInfo) {
      return null;
    }
    
    return { subtitles, videoInfo };
  } catch (error) {
    console.error('[Bilibili Subtitles] Error getting local subtitles:', error);
    return null;
  }
};

/**
 * Save Bilibili subtitles to local storage
 * @param params Object containing subtitles array and video information
 * @returns Promise that resolves when storage is updated
 */
export const saveBilibiliSubtitlesToStorage = async (params: { subtitles: Subtitle[], videoInfo: BilibiliVideoInfo }): Promise<void> => {
  try {
    await browser.storage.local.set({
      bilibiliSubtitles: params.subtitles,
      bilibiliVideoInfo: params.videoInfo
    });
    console.log(`[Bilibili Subtitles] 已保存 ${params.subtitles.length} 条字幕, 视频: ${params.videoInfo.title}`);
  } catch (error) {
    console.error('[Bilibili Subtitles] Error saving subtitles to storage:', error);
    throw error;
  }
};

/**
 * Remove Bilibili subtitles from local storage
 * @returns Promise that resolves when storage is updated
 */
export const removeBilibiliSubtitlesFromStorage = async (): Promise<void> => {
  try {
    await browser.storage.local.remove(['bilibiliSubtitles']);
    console.log('[Bilibili Subtitles] Removed subtitles from storage');
  } catch (error) {
    console.error('[Bilibili Subtitles] Error removing subtitles from storage:', error);
    throw error;
  }
};

/**
 * Get current Bilibili video information from storage
 * @returns Promise that resolves with the video info or null
 */
export const getCurrentBilibiliVideoInfo = async (): Promise<BilibiliVideoInfo | null> => {
  try {
    const data = await browser.storage.local.get(['bilibiliVideoInfo']);
    return data.bilibiliVideoInfo && typeof data.bilibiliVideoInfo === 'object' && 
           'videoId' in data.bilibiliVideoInfo && 
           'title' in data.bilibiliVideoInfo && 
           'url' in data.bilibiliVideoInfo
      ? data.bilibiliVideoInfo as BilibiliVideoInfo
      : null;
  } catch (error) {
    console.error('[Bilibili Video] Error retrieving video info:', error);
    return null;
  }
};

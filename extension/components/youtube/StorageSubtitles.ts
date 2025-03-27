import browser from 'webextension-polyfill';
import { VideoInfo } from './InfoVideo';
import { Subtitle } from './InfoSubtitles';

/**
 * Check if local storage has subtitles for the given video
 * @param videoId YouTube video ID
 * @returns Promise with boolean indicating if subtitles exist
 */
export const hasLocalSubtitles = async (videoId: string): Promise<boolean> => {
  try {
    const localData = await browser.storage.local.get(['currentSubtitles', 'currentVideoInfo']);
    const currentSubtitles = localData.currentSubtitles || [];
    const currentVideoInfo = localData.currentVideoInfo as VideoInfo | undefined;
    
    return Boolean(
      currentSubtitles && 
      Array.isArray(currentSubtitles) && 
      currentSubtitles.length > 0 &&
      currentVideoInfo && 
      currentVideoInfo.videoId === videoId
    );
  } catch (error) {
    console.error('[Subtitles] Error checking local subtitles:', error);
    return false;
  }
};

/**
 * Get subtitles from local storage
 * @returns Promise with subtitles array and video info, or null if not found
 */
export const getLocalSubtitles = async (): Promise<{ subtitles: Subtitle[], videoInfo: VideoInfo } | null> => {
  try {
    const localData = await browser.storage.local.get(['currentSubtitles', 'currentVideoInfo']);
    const subtitles = localData.currentSubtitles || [];
    const videoInfo = localData.currentVideoInfo as VideoInfo | undefined;
    
    if (!Array.isArray(subtitles) || subtitles.length === 0 || !videoInfo) {
      return null;
    }
    
    return { subtitles, videoInfo };
  } catch (error) {
    console.error('[Subtitles] Error getting local subtitles:', error);
    return null;
  }
};

/**
 * Save subtitles to local storage
 * @param params Object containing subtitles array and video information
 * @returns Promise that resolves when storage is updated
 */
export const saveSubtitlesToStorage = async (params: { subtitles: Subtitle[], videoInfo: VideoInfo }): Promise<void> => {
  try {
    await browser.storage.local.set({
      currentSubtitles: params.subtitles,
      currentVideoInfo: params.videoInfo
    });
    console.log(`[Subtitles] Saved ${params.subtitles.length} subtitles for video: ${params.videoInfo.title}`);
  } catch (error) {
    console.error('[Subtitles] Error saving subtitles to storage:', error);
    throw error;
  }
};

/**
 * Remove subtitles from local storage
 * @returns Promise that resolves when storage is updated
 */
export const removeSubtitlesFromStorage = async (): Promise<void> => {
  try {
    await browser.storage.local.remove(['currentSubtitles']);
    console.log('[Subtitles] Removed subtitles from storage');
  } catch (error) {
    console.error('[Subtitles] Error removing subtitles from storage:', error);
    throw error;
  }
};

import { VideoInfo } from './InfoVideo';
import browser from 'webextension-polyfill';

/**
 * Unified subtitle interface definition
 * Combined from useSubtitles.ts and useAutoSubtitles.ts
 */
export interface Subtitle {
  id?: number;          // Optional ID from backend
  startTime: number;    // Start time in seconds
  endTime: number;      // End time in seconds
  text: string;         // Subtitle text content
  saved?: boolean;      // Whether the subtitle has been saved
}

/**
 * Interface for API subtitle format 
 * For converting between API and internal format
 */
export interface ApiSubtitle {
  id?: number;
  text: string;
  start?: number;       // Some APIs use start/end
  end?: number;
  start_time?: number;  // Some APIs use start_time/end_time
  end_time?: number;
  saved?: boolean;
}

/**
 * Storage data interface for subtitle-related storage
 */
export interface SubtitlesStorageData {
  currentSubtitles?: Subtitle[];
  currentVideoInfo?: VideoInfo;
  autoCollectEnabled?: boolean;
}

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
 * @param subtitles Array of subtitles to save
 * @param videoInfo Video information associated with the subtitles
 * @returns Promise that resolves when storage is updated
 */
export const saveSubtitlesToStorage = async (subtitles: Subtitle[], videoInfo: VideoInfo): Promise<void> => {
  try {
    await browser.storage.local.set({
      currentSubtitles: subtitles,
      currentVideoInfo: videoInfo
    });
    console.log(`[Subtitles] Saved ${subtitles.length} subtitles for video: ${videoInfo.title}`);
  } catch (error) {
    console.error('[Subtitles] Error saving subtitles to storage:', error);
    throw error;
  }
};

/**
 * Convert API subtitle format to internal Subtitle format
 * @param apiSubtitle Subtitle data from API
 * @returns Standardized internal Subtitle object
 */
export const convertApiSubtitleToInternal = (apiSubtitle: ApiSubtitle): Subtitle => {
  return {
    id: apiSubtitle.id,
    startTime: apiSubtitle.start_time ?? apiSubtitle.start ?? 0,
    endTime: apiSubtitle.end_time ?? apiSubtitle.end ?? 0,
    text: apiSubtitle.text,
    saved: apiSubtitle.saved
  };
};

/**
 * Convert internal Subtitle format to API format
 * @param subtitle Internal subtitle object
 * @returns API formatted subtitle object
 */
export const convertInternalSubtitleToApi = (subtitle: Subtitle): ApiSubtitle => {
  return {
    id: subtitle.id,
    text: subtitle.text,
    start_time: subtitle.startTime,
    end_time: subtitle.endTime,
    saved: subtitle.saved
  };
};

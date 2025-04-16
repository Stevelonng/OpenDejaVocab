/**
 * Bilibili video information interface definition and utilities
 * Similar to InfoVideo.ts but specialized for Bilibili
 */

// Import shared interfaces
import { VideoInfo as BaseVideoInfo } from '../youtube/InfoVideo';

/**
 * Bilibili-specific ID information
 */
export interface BilibiliInfo {
  bvid?: string;
  aid?: string;
}

/**
 * Extended VideoInfo to include Bilibili-specific information
 */
export interface BilibiliVideoInfo extends BaseVideoInfo {
  bilibiliInfo?: BilibiliInfo;
}

/**
 * Extract Bilibili video ID (BV or AV number) from URL
 * @param url Bilibili URL
 * @returns Object containing either bvid or aid, or null if not found
 */
export const getBilibiliVideoId = (url: string): BilibiliInfo | null => {
  // Match BV ID format - usually looks like BV1xx411c7mD
  const bvMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/);
  if (bvMatch) {
    return { bvid: bvMatch[1] };
  }
  
  // Match AV ID format - usually numeric like av170001
  const avMatch = url.match(/\/video\/(av\d+)/) || url.match(/\/video\/([aA][vV])(\d+)/);
  if (avMatch) {
    // avMatch might be in format [full_match, "av", "12345"] or [full_match, "av12345"]
    const aid = avMatch[2] ? avMatch[1].toLowerCase() + avMatch[2] : avMatch[1].toLowerCase();
    return { aid: aid.startsWith('av') ? aid.slice(2) : aid }; // Remove 'av' prefix for API
  }
  
  return null;
};

/**
 * Clean Bilibili title by removing platform suffix
 * @param title Raw Bilibili title from document.title
 * @returns Cleaned title
 */
export const cleanBilibiliTitle = (title: string): string => {
  return title
    .replace(/_哔哩哔哩_bilibili$/, '') // Remove '_哔哩哔哩_bilibili' suffix
    .replace(/\s*_\s*哔哩哔哩$/, '')   // Remove '_ 哔哩哔哩' suffix
    .replace(/\s*-\s*bilibili$/, '')   // Remove '- bilibili' suffix
    .trim();
};

/**
 * Get current video title from document if available
 * @returns Cleaned video title or empty string if document is not available
 */
export const getCurrentBilibiliTitle = (): string => {
  return typeof document !== 'undefined' 
    ? cleanBilibiliTitle(document.title)
    : '';
};

/**
 * Check if the current page is a Bilibili video page
 * @returns True if on a Bilibili video page
 */
export const isBilibiliVideoPage = (): boolean => {
  return typeof window !== 'undefined' && 
    (window.location.href.includes('bilibili.com/video') || 
     document.querySelector('.bilibili-player-video') !== null);
};

/**
 * Extract video information from current Bilibili page
 * @returns BilibiliVideoInfo object or null if not on a Bilibili video page
 */
export const extractBilibiliInfo = (): BilibiliVideoInfo | null => {
  // Check if we are on a Bilibili video page
  if (!isBilibiliVideoPage()) {
    return null;
  }
  
  const idInfo = getBilibiliVideoId(window.location.href);
  if (!idInfo) return null;
  
  // Get cleaned title
  const title = getCurrentBilibiliTitle();
  
  // For consistent interface with YouTube
  // We'll store either BV or AV as the videoId
  const videoId = idInfo.bvid || (idInfo.aid ? `av${idInfo.aid}` : '');
  
  return {
    videoId,
    title,
    url: window.location.href,
    // Add Bilibili-specific properties
    bilibiliInfo: idInfo
  };
};

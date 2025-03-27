/**
 * Video information interface definition
 */
export interface VideoInfo {
  videoId: string;
  title: string;
  url: string;
  timestamp?: number;
}

/**
 * Extract YouTube video ID from URL
 * @param url YouTube URL
 * @returns Video ID or null if not found
 */
export const getYouTubeVideoId = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|\/videos\/|youtu\.be\/|embed\/|\?v=)([^&?\n]+)/);
  return match ? match[1] : null;
};

/**
 * Clean YouTube title by removing notification count and YouTube suffix
 * @param title Raw YouTube title from document.title
 * @returns Cleaned title
 */
export const cleanYouTubeTitle = (title: string): string => {
  return title
    .replace(' - YouTube', '') // Remove YouTube suffix
    .replace(/^\(\d+\)\s+/, ''); // Remove notification count e.g. "(3) "
};

/**
 * Get current video title from document if available
 * @returns Cleaned video title or empty string if document is not available
 */
export const getCurrentVideoTitle = (): string => {
  return typeof document !== 'undefined' 
    ? cleanYouTubeTitle(document.title)
    : '';
};

/**
 * Extract video information from current YouTube page
 * @returns VideoInfo object or null if not on a YouTube video page
 */
export const extractVideoInfo = (): VideoInfo | null => {
  // Check if we are on a YouTube video page
  if (typeof window === 'undefined' || !window.location.href.includes('youtube.com/watch')) {
    return null;
  }
  
  const videoId = getYouTubeVideoId(window.location.href);
  if (!videoId) return null;
  
  // Get cleaned title
  const title = cleanYouTubeTitle(document.title);
  
  return {
    videoId,
    title,
    url: window.location.href
  };
};

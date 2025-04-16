import { createApp } from 'vue';
import { defineContentScript } from 'wxt/sandbox';
import { useAutoBilibiliSubtitles } from '../components/bilibili/useAutoBilibiliSubtitles';
import { extractBilibiliInfo, isBilibiliVideoPage } from '../components/bilibili/InfoBilibili';
import { initBilibiliFeatures } from '../components/bilibili/useAutoBilibiliSubtitles';

/**
 * Bilibili Content Script
 * Used for automatically collecting subtitles from Bilibili videos
 */
export default defineContentScript({
  // Match Bilibili video pages
  matches: ['*://*.bilibili.com/video/*'],
  main() {
    console.log('[Bilibili] Content script loaded');
    
    // Create a container element
    const container = document.createElement('div');
    container.id = 'Dejavocab-bilibili';
    document.documentElement.appendChild(container);
    
    // Initialize Bilibili features
    initBilibiliFeatures().catch((error: Error) => {
      console.error('[Bilibili] Error initializing features:', error);
    });
    
    // Add a function to update current bilibili video ID in storage
    const updateCurrentBilibiliVideo = async () => {
      if (isBilibiliVideoPage()) {
        const videoInfo = extractBilibiliInfo();
        if (videoInfo && videoInfo.videoId) {
          console.log('[Bilibili] Updating current video ID in storage:', videoInfo.videoId);
          await chrome.storage.local.set({
            bilibiliCurrentVideoId: videoInfo.videoId
          });
        }
      }
    };
    
    // Call immediately and also set up on navigation
    updateCurrentBilibiliVideo();
    
    // Set up navigation observer
    setupNavigationObserver();
    
    // Add message listener to respond to sidebar requests
    chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {      
      // Handle Bilibili-specific messages
      console.log('[Bilibili] Received message:', message);
      
      if (message.action === 'refreshBilibiliSubtitles') {
        // Force refresh subtitles
        const { manualFetchBilibiliSubtitles } = useAutoBilibiliSubtitles();
        manualFetchBilibiliSubtitles().then(() => {
          sendResponse({ success: true });
        }).catch((error: Error) => {
          console.error('[Bilibili] Error refreshing subtitles:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // Async response
      }
      
      // Check if current page is a Bilibili video page
      if (message.action === 'checkBilibiliVideo') {
        const isVideoPage = isBilibiliVideoPage();
        const videoInfo = isVideoPage ? extractBilibiliInfo() : null;
        sendResponse({ 
          isVideoPage, 
          videoInfo 
        });
        return true;
      }
      
      // Default response
      sendResponse({ success: false, message: 'Unhandled action' });
      return true;
    });
  },
});

/**
 * Set up navigation observer
 * Used to detect navigation changes in Bilibili SPA
 */
function setupNavigationObserver() {
  console.log('[Bilibili] Setting up navigation observer');
  
  // Use history API to detect navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  // Override pushState
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    handleNavigation();
  };
  
  // Override replaceState
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    handleNavigation();
  };
  
  // Listen for popstate event
  window.addEventListener('popstate', () => {
    handleNavigation();
  });
  
  // Handle navigation changes
  function handleNavigation() {
    if (location.pathname.startsWith('/video/')) {
      console.log('[Bilibili] Navigation detected, reinitializing features');
      
      // Small delay to ensure page has loaded
      setTimeout(() => {
        initBilibiliFeatures().catch((error: Error) => {
          console.error('[Bilibili] Error reinitializing after navigation:', error);
        });
        
        // Update current bilibili video ID in storage
        if (isBilibiliVideoPage()) {
          const videoInfo = extractBilibiliInfo();
          if (videoInfo && videoInfo.videoId) {
            console.log('[Bilibili] Updating current video ID after navigation:', videoInfo.videoId);
            chrome.storage.local.set({
              bilibiliCurrentVideoId: videoInfo.videoId
            });
          }
        }
      }, 1000);
    }
  }
  
  // Also monitor title changes
  const titleObserver = new MutationObserver(() => {
    if (isBilibiliVideoPage()) {
      console.log('[Bilibili] Title change detected, checking for video change');
      
      const videoInfo = extractBilibiliInfo();
      if (videoInfo) {
        console.log('[Bilibili] Video changed to:', videoInfo.title);
        
        // Reinitialize features
        initBilibiliFeatures().catch((error: Error) => {
          console.error('[Bilibili] Error reinitializing after title change:', error);
        });
        
        // Update current bilibili video ID in storage
        if (videoInfo.videoId) {
          console.log('[Bilibili] Updating current video ID after title change:', videoInfo.videoId);
          chrome.storage.local.set({
            bilibiliCurrentVideoId: videoInfo.videoId
          });
        }
      }
    }
  });
  
  // Observe title element
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, { 
      childList: true,
      characterData: true,
      subtree: true 
    });
  }
}

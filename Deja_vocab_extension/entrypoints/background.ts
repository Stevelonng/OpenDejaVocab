import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';

// YouTube video page Origin
const YOUTUBE_ORIGIN = 'https://www.youtube.com';

export default defineBackground(() => {
  // Subtitle collection request type definition
  interface SubtitleCollectionRequest {
    action: string;
    videoId: string;
    videoUrl: string;
    videoTitle: string;
  }

  // Check if request is a subtitle collection request
  function isSubtitleCollectionRequest(request: unknown): request is SubtitleCollectionRequest {
    return (
      request !== null &&
      typeof request === 'object' &&
      'action' in request &&
      (request as any).action === 'collectSubtitles' &&
      'videoId' in request &&
      typeof (request as any).videoId === 'string'
    );
  }

  // Subtitle collection functionality
  // Handle subtitle collection requests from content scripts
  // Use type assertion to resolve TypeScript errors
  // @ts-ignore - Ignore type errors, as WXT's type definitions for WebExtension API are slightly different from standard
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Don't process non-subtitle collection requests
    if (!isSubtitleCollectionRequest(request)) {
      return false;
    }
    
    // Process subtitle collection request
    sendResponse({ success: true, message: 'Request received' });
    
    // Process subtitle collection asynchronously
    (async () => {
        await handleCollectSubtitlesAsync(request);
    })();
    
    // Return true to support async sendResponse
    return true;
  });
  
  // Define side panel request interface
  interface SidePanelRequest {
    action: 'openPopup' | 'recordLoginRequest' | 'checkIfYouTube';
  }
  
  // Check if request is a side panel request
  function isSidePanelRequest(request: unknown): request is SidePanelRequest {
    return (
      request !== null &&
      typeof request === 'object' &&
      'action' in request &&
      (
        (request as any).action === 'openPopup' ||
        (request as any).action === 'recordLoginRequest' ||
        (request as any).action === 'checkIfYouTube'
      )
    );
  }
  
  // Handle requests for opening side panels and popups
  // @ts-ignore - Ignore type errors, as WXT's type definitions for WebExtension API are slightly different from standard
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Check if it's a side panel request
    if (!isSidePanelRequest(request)) {
      return false;
    }
    
    // Handle side panel requests
    (async () => {
      try {
        
        // Check if it's a request to open popup
        if (request.action === 'openPopup') {
          try {
            // If side panel fails to open, try to open the extension popup
            // Note: This method has technical limitations and may not be directly triggered from content scripts
            // But we can try using browser.action.openPopup() or displaying a notification to guide users
            
            // Display a notification reminding the user to log in
            await browser.notifications.create({
              type: 'basic',
              iconUrl: '../assets/icon-128.png',
              title: 'Dejavocab Login Reminder',
              message: 'Please log in before using the fullscreen feature. Click the extension icon to log in.'
            });
            
            sendResponse({ success: true, message: 'Login prompt notification displayed' });
          } catch (error) {
            sendResponse({ success: false, message: 'Failed to display notification' });
          }
        }
        
        // Handle recordLoginRequest requests
        if (request.action === 'recordLoginRequest') {
          try {
            // Get the current active tab
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            
            if (!currentTab || !currentTab.id) {
              sendResponse({ success: false, message: 'Unable to get current tab' });
              return;
            }
            
            // Try to guide the user to click the extension icon via notification
            await browser.notifications.create({
              type: 'basic',
              iconUrl: '../assets/icon-128.png',
              title: 'Dejavocab Login Reminder',
              message: 'Login required to use fullscreen feature. Please click the browser extension icon to log in.'
            });
            
            sendResponse({ success: true, message: 'recordLoginRequest request processed' });
          } catch (error) {
            sendResponse({ success: false, message: 'Failed to process recordLoginRequest request' });
          }
        }
        
        // Handle requests to check if current page is YouTube
        if (request.action === 'checkIfYouTube') {
          try {
            // Get the current active tab
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            
            if (!currentTab || !currentTab.url) {
              // If URL can't be retrieved, try using URL from storage
              const result = await browser.storage.local.get('lastVisitedUrl');
              const lastUrl = result.lastVisitedUrl as string;
              
              if (lastUrl) {
                const isYouTube = (lastUrl as string).includes('youtube.com') || (lastUrl as string).includes('dejavocab.com');
                console.log(`[BACKGROUND] Using stored URL: ${lastUrl}, is chat-supported site: ${isYouTube}`);
                sendResponse({ isYouTube, message: isYouTube ? 'Current page supports chat' : 'Current page does not support chat' });
                return;
              }
              
              console.log('[BACKGROUND] Unable to get current tab URL');
              sendResponse({ isYouTube: false, message: 'Unable to get current tab URL' });
              return;
            }
            
            // Check if URL is YouTube or dejavocab.com
            const isYouTube = (currentTab.url as string).includes('youtube.com') || (currentTab.url as string).includes('dejavocab.com');
            
            // Store current URL
            try {
              // First check if storage API is available
              if (browser?.storage?.local) {
                await browser.storage.local.set({ lastVisitedUrl: currentTab.url });
              }
            } catch (error) {
              // If storage operation fails, log error but continue execution
              console.warn('[BACKGROUND] Failed to store URL in local storage:', error);
              // No longer throw error as this might be caused by invalid extension context
            }
            
            console.log(`[BACKGROUND] Current page URL: ${currentTab.url}, is chat-supported site: ${isYouTube}`);
            sendResponse({ isYouTube, message: isYouTube ? 'Current page supports chat' : 'Current page does not support chat' });
          } catch (error) {
            console.error('[BACKGROUND] Error checking page type:', error);
            sendResponse({ isYouTube: false, message: 'Error checking page type' });
          }
        }
      } catch (error) {
        sendResponse({ success: false, message: 'Failed to process request' });
      }
    })();
    
    return true; // Indicates response will be sent asynchronously
  });
  
  // Async function to retrieve subtitles from backend API
  async function handleCollectSubtitlesAsync(request: SubtitleCollectionRequest) {
    try {
      // Get API configuration
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      
      if (!apiUrl || !authToken) {
        return { success: false, error: 'Missing API URL or authentication information' };
      }
      
      // Build API request URL - ensure it matches Django route definition
      const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      // Use videos path directly - Django urls.py root config already adds api/ to all paths
      const apiEndpoint = `videos/${request.videoId}/fetch-subtitles/`;
      
      // Request subtitles from backend API
      const response = await fetch(`${baseUrl}${apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        },
        body: JSON.stringify({
          title: request.videoTitle || '',
          url: request.videoUrl || ''
        })
      });
      
      // Check response status
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  // Set default side panel options
  try {
    // @ts-ignore - Ignore TypeScript errors, as these APIs exist but type definitions may be incomplete
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: any) => {});

    // @ts-ignore
    browser.sidePanel.setOptions({ path: 'side-panel.html' })
      .catch((error: any) => {});
  } catch (error) {
    // Ignore error - some browsers may not support these APIs
  }
  
  // Listen for tab updates and enable side panel on YouTube pages
  // @ts-ignore
  browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!tab.url) return;
    
    try {
      const url = new URL(tab.url);
      
      // Enable side panel on YouTube pages
      if (url.origin === YOUTUBE_ORIGIN) {
        // If it's a YouTube video page, enable side panel
        if (url.pathname.includes('/watch')) {
          // @ts-ignore
          await browser.sidePanel.setOptions({
            tabId,
            path: 'side-panel.html',
            enabled: true
          });
        }
      }
    } catch (error) {
    }
  });

  // Open side panel when user clicks Action icon on YouTube video pages
  // @ts-ignore
  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.url) return;
    
    try {
      const url = new URL(tab.url);
      
      if (url.origin === YOUTUBE_ORIGIN && url.pathname.includes('/watch')) {
        // Try to close and reopen side panel to force refresh
        try {
          // Check side panel status
          // @ts-ignore
          const panelState = await browser.sidePanel.getOptions({ tabId: tab.id });
          
          // Reset side panel options to force refresh
          // @ts-ignore
          await browser.sidePanel.setOptions({
            tabId: tab.id,
            path: 'side-panel.html',
            enabled: true
          });
        } catch (e) {
        }
        
        // Wait for a short period before opening side panel
        setTimeout(async () => {
          try {
            // Execute script using scripting API
            await browser.scripting.executeScript({
              target: { tabId: tab.id as number },
              files: ['content.js']
            });
            
            // Open side panel
            // @ts-ignore
            await browser.sidePanel.open({ tabId: tab.id });
          } catch (error) {
          }
        }, 500);
      }
    } catch (error) {
    }
  });
});

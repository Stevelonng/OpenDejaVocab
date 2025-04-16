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
    action: 'openPopup' | 'recordLoginRequest' | 'checkIfYouTube' | 'sendSubtitleToSidePanel';
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
        (request as any).action === 'checkIfYouTube' ||
        (request as any).action === 'sendSubtitleToSidePanel'
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
                const isYouTube = (lastUrl as string).includes('youtube.com') || (lastUrl as string).includes('dejavocab.com') || (lastUrl as string).includes('bilibili.com');
                console.log(`[BACKGROUND] Using stored URL: ${lastUrl}, is chat-supported site: ${isYouTube}`);
                sendResponse({ isYouTube, message: isYouTube ? 'Current page supports chat' : 'Current page does not support chat' });
                return;
              }
              
              console.log('[BACKGROUND] Unable to get current tab URL');
              sendResponse({ isYouTube: false, message: 'Unable to get current tab URL' });
              return;
            }
            
            // Check if URL is YouTube, bilibili, or dejavocab.com
            const isYouTube = true; // 允许在所有网页显示聊天UI
            const isSupportedSite = (currentTab.url as string).includes('youtube.com') || 
                                    (currentTab.url as string).includes('dejavocab.com') || 
                                    (currentTab.url as string).includes('bilibili.com');
            
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
            
            console.log(`[BACKGROUND] Current page URL: ${currentTab.url}, is originally supported site: ${isSupportedSite}, showing chat: ${isYouTube}`);
            sendResponse({ isYouTube, message: isYouTube ? 'Current page supports chat' : 'Current page does not support chat' });
          } catch (error) {
            console.error('[BACKGROUND] Error checking page type:', error);
            sendResponse({ isYouTube: false, message: 'Error checking page type' });
          }
        }
        
        // Handle requests to send subtitles to side panel
        if (request.action === 'sendSubtitleToSidePanel') {
          try {
            // Get subtitle text from request
            const subtitleText = (request as any).subtitleText;
            
            if (!subtitleText) {
              sendResponse({ success: false, message: 'No subtitle text provided' });
              return;
            }
            
            console.log('[BACKGROUND] Forwarding subtitle to side panel:', subtitleText);
            
            // Instead of broadcasting to all tabs, save to storage
            // This is more reliable as the side panel can read from storage when active
            await browser.storage.local.set({
              pendingSubtitleText: subtitleText,
              pendingSubtitleTimestamp: Date.now() // Add timestamp to ensure changes are detected
            });
            
            // Try to send direct message to side panel as well (as a backup approach)
            try {
              await browser.runtime.sendMessage({
                action: 'receiveSubtitleText',
                subtitleText: subtitleText
              });
            } catch (error) {
              // Ignore error - we're using storage as primary mechanism
              console.log('[BACKGROUND] Direct message to side panel failed, using storage mechanism instead');
            }
            
            sendResponse({ success: true, message: 'Subtitle text saved for side panel' });
          } catch (error) {
            console.error('[BACKGROUND] Error sending subtitle to side panel:', error);
            sendResponse({ success: false, message: 'Failed to send subtitle to side panel' });
          }
        }
      } catch (error) {
        sendResponse({ success: false, message: 'Failed to process request' });
      }
    })();
    
    return true; // Indicates response will be sent asynchronously
  });
  
  // Define Bilibili subtitle request interface
  interface BilibiliSubtitleRequest {
    action: 'fetchBilibiliSubtitles';
    requestUrl: string;
    authToken: string;
    videoInfo: {
      title: string;
    };
    title: string;
  }

  // Define Webpage content request interface
  interface WebpageContentRequest {
    action: 'extractWebpageContent';
    tabId: number;
  }

  // Check if request is a webpage content request
  function isWebpageContentRequest(request: unknown): request is WebpageContentRequest {
    return (
      typeof request === 'object' &&
      request !== null &&
      'action' in request &&
      (request as any).action === 'extractWebpageContent' &&
      'tabId' in request
    );
  }

  // Handle requests to fetch webpage content
  browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
    if (request && request.action === 'extractWebpageContent') {
      (async () => {
        try {
          const webpageContentRequest = request as WebpageContentRequest;
          console.log('[BACKGROUND] 收到获取网页内容请求:', webpageContentRequest.tabId);
          
          if (!webpageContentRequest.tabId) {
            console.error('[BACKGROUND] 获取网页内容请求缺少必要参数');
            sendResponse({ success: false, error: '请求缺少必要参数' });
            return;
          }
          
          // 通过消息传递机制从内容脚本获取网页内容
          try {
            console.log('[BACKGROUND] 正在向内容脚本发送提取网页内容的消息');
            const response = await browser.tabs.sendMessage(
              webpageContentRequest.tabId,
              { action: 'extractWebpageContent' }
            ) as { success: boolean; data: any };
            
            console.log('[BACKGROUND] 成功从内容脚本获取网页内容');
            
            // 将数据返回给请求者
            sendResponse({ success: true, data: response.data });
          } catch (error) {
            console.error('[BACKGROUND] 从内容脚本获取网页内容失败:', error);
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : '无法从网页提取内容'
            });
          }
        } catch (error) {
          console.error('[BACKGROUND] 获取网页内容时出错:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : '未知错误' 
          });
        }
      })();
      
      return true; // 指示响应将被异步发送
    }
    
    return true; // 确保总是返回true以支持异步响应
  });

  // Handle requests to fetch Bilibili subtitles (to avoid CORS issues)
  browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
    if (request && request.action === 'fetchBilibiliSubtitles') {
      (async () => {
        try {
          const bilibiliRequest = request as BilibiliSubtitleRequest;
          console.log('[BACKGROUND] 收到获取B站字幕请求:', bilibiliRequest.videoInfo?.title);
          
          if (!bilibiliRequest.requestUrl || !bilibiliRequest.authToken) {
            console.error('[BACKGROUND] 获取B站字幕请求缺少必要参数');
            sendResponse({ success: false, error: '请求缺少必要参数' });
            return;
          }
          
          // 从后台发送API请求，避免CORS问题
          const response = await fetch(bilibiliRequest.requestUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Token ${bilibiliRequest.authToken}`,
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            },
            credentials: 'include' // Add credentials to include cookies
          });
          
          console.log('[BACKGROUND] B站字幕API响应状态码:', response.status);
          
          if (!response.ok) {
            console.error('[BACKGROUND] B站字幕API请求失败:', response.status, response.statusText);
            sendResponse({ 
              success: false, 
              error: `API请求失败: ${response.status} ${response.statusText}` 
            });
            return;
          }
          
          // 解析响应数据
          const data = await response.json();
          console.log('[BACKGROUND] 成功获取B站字幕数据');
          
          // 将数据返回给内容脚本
          sendResponse({ success: true, data });
        } catch (error) {
          console.error('[BACKGROUND] 获取B站字幕时出错:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : '未知错误' 
          });
        }
      })();
      
      return true; // 指示响应将被异步发送
    }
    
    return true; // 确保总是返回true以支持异步响应
  });

  // Handle requests to fetch Bilibili data (general purpose handler)
  browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
    if (request && request.action === 'fetchBilibiliData') {
      (async () => {
        try {
          if (!request.url) {
            console.error('[BACKGROUND] 获取B站数据请求缺少URL参数');
            sendResponse({ success: false, error: '请求缺少URL参数' });
            return;
          }
          
          console.log('[BACKGROUND] 开始获取B站数据:', request.url);
          
          // 发送请求获取B站数据
          const response = await fetch(request.url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            },
            credentials: 'include' // Add credentials to include cookies
          });
          
          console.log('[BACKGROUND] B站API响应状态码:', response.status);
          
          if (!response.ok) {
            console.error('[BACKGROUND] B站API请求失败:', response.status, response.statusText);
            sendResponse({ 
              success: false, 
              error: `API请求失败: ${response.status} ${response.statusText}` 
            });
            return;
          }
          
          // 解析响应数据
          const data = await response.json();
          console.log('[BACKGROUND] 成功获取B站数据');
          
          // 将数据返回给内容脚本
          sendResponse({ success: true, data });
        } catch (error) {
          console.error('[BACKGROUND] 获取B站数据时出错:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : '未知错误' 
          });
        }
      })();
      
      return true; // 指示响应将被异步发送
    }
    
    return true; // 确保总是返回true以支持异步响应
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

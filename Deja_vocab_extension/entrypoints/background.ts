import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';

// YouTube视频页面的Origin
const YOUTUBE_ORIGIN = 'https://www.youtube.com';

export default defineBackground(() => {
  // 字幕收集请求类型定义
  interface SubtitleCollectionRequest {
    action: string;
    videoId: string;
    videoUrl: string;
    videoTitle: string;
  }

  // 检查请求是否为字幕收集请求
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

  // 字幕收集功能
  // 处理来自内容脚本的字幕收集请求
  // 使用类型断言来解决TypeScript错误
  // @ts-ignore - 忽略类型错误，因为WXT对WebExtension API的类型定义与标准的稍有不同
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 对非字幕收集请求不处理
    if (!isSubtitleCollectionRequest(request)) {
      return false;
    }
    
    // 处理字幕收集请求
    sendResponse({ success: true, message: '请求已收到' });
    
    // 异步处理字幕收集
    (async () => {
        await handleCollectSubtitlesAsync(request);
    })();
    
    // 返回true以支持异步sendResponse
    return true;
  });
  
  // 定义侧面板操作请求接口
  interface SidePanelRequest {
    action: 'openPopup' | 'recordLoginRequest' | 'checkIfYouTube';
  }
  
  // 检查请求是否为侧面板操作请求
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
  
  // 处理打开侧面板和弹出窗口的请求
  // @ts-ignore - 忽略类型错误，因为WXT对WebExtension API的类型定义与标准的稍有不同
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 检查是否为侧面板操作请求
    if (!isSidePanelRequest(request)) {
      return false;
    }
    
    // 处理侧面板请求
    (async () => {
      try {
        
        // 检查是否为打开弹出窗口请求
        if (request.action === 'openPopup') {
          try {
            // 如果侧面板打开失败，尝试打开扩展的弹出窗口
            // 注意：这种方法在技术上有限制，可能无法直接从内容脚本触发
            // 但我们可以尝试通过执行browser.action.openPopup()或者显示通知引导用户
            
            // 显示通知，提醒用户登录
            await browser.notifications.create({
              type: 'basic',
              iconUrl: '../assets/icon-128.png',
              title: 'Dejavocab 登录提示',
              message: '请先登录后再使用全屏功能。点击扩展图标登录。'
            });
            
            sendResponse({ success: true, message: '已显示登录提示通知' });
          } catch (error) {
            sendResponse({ success: false, message: '显示通知失败' });
          }
        }
        
        // 处理recordLoginRequest请求
        if (request.action === 'recordLoginRequest') {
          try {
            // 获取当前活动标签页
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            
            if (!currentTab || !currentTab.id) {
              sendResponse({ success: false, message: '无法获取当前标签页' });
              return;
            }
            
            // 尝试通过通知引导用户点击扩展图标
            await browser.notifications.create({
              type: 'basic',
              iconUrl: '../assets/icon-128.png',
              title: 'Dejavocab 登录提示',
              message: '需要登录才能使用全屏功能。请点击浏览器扩展图标登录。'
            });
            
            sendResponse({ success: true, message: '已处理recordLoginRequest请求' });
          } catch (error) {
            sendResponse({ success: false, message: '处理recordLoginRequest请求失败' });
          }
        }
        
        // 处理检查是否为YouTube页面的请求
        if (request.action === 'checkIfYouTube') {
          try {
            // 获取当前活动标签页
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            
            if (!currentTab || !currentTab.url) {
              // 如果无法获取URL，尝试使用storage中的URL
              const result = await browser.storage.local.get('lastVisitedUrl');
              const lastUrl = result.lastVisitedUrl as string;
              
              if (lastUrl) {
                const isYouTube = (lastUrl as string).includes('youtube.com') || (lastUrl as string).includes('dejavocab.com');
                console.log(`[BACKGROUND] 使用存储的URL: ${lastUrl}, 是否为支持聊天的网站: ${isYouTube}`);
                sendResponse({ isYouTube, message: isYouTube ? '当前页面支持聊天' : '当前页面不支持聊天' });
                return;
              }
              
              console.log('[BACKGROUND] 无法获取当前标签页URL');
              sendResponse({ isYouTube: false, message: '无法获取当前标签页URL' });
              return;
            }
            
            // 检查URL是否为YouTube或dejavocab.com
            const isYouTube = (currentTab.url as string).includes('youtube.com') || (currentTab.url as string).includes('dejavocab.com');
            
            // 存储当前URL
            try {
              // 首先检查存储API是否可用
              if (browser?.storage?.local) {
                await browser.storage.local.set({ lastVisitedUrl: currentTab.url });
              }
            } catch (error) {
              // 如果存储操作失败，记录错误但继续执行
              console.warn('[BACKGROUND] 存储URL到本地存储失败:', error);
              // 不再抛出错误，因为这可能是由于扩展上下文无效导致的
            }
            
            console.log(`[BACKGROUND] 当前页面URL: ${currentTab.url}, 是否为支持聊天的网站: ${isYouTube}`);
            sendResponse({ isYouTube, message: isYouTube ? '当前页面支持聊天' : '当前页面不支持聊天' });
          } catch (error) {
            console.error('[BACKGROUND] 检查页面类型时出错:', error);
            sendResponse({ isYouTube: false, message: '检查页面类型时出错' });
          }
        }
      } catch (error) {
        sendResponse({ success: false, message: '处理请求失败' });
      }
    })();
    
    return true; // 表示将异步发送响应
  });
  
  // 从后端API获取字幕的异步函数
  async function handleCollectSubtitlesAsync(request: SubtitleCollectionRequest) {
    try {
      // 获取API配置
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      
      if (!apiUrl || !authToken) {
        return { success: false, error: '缺少API URL或认证信息' };
      }
      
      // 构建API请求URL - 确保匹配Django路由定义
      const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      // 直接使用videos路径 - Django urls.py中的root配置已经将api/添加到所有路径
      const apiEndpoint = `videos/${request.videoId}/fetch-subtitles/`;
      
      // 请求后端API获取字幕
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
      
      // 检查响应状态
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }
  
  // 设置侧面板默认选项
  try {
    // @ts-ignore - 忽略TypeScript错误，因为这些API存在但类型定义可能不完善
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: any) => {});

    // @ts-ignore
    browser.sidePanel.setOptions({ path: 'side-panel.html' })
      .catch((error: any) => {});
  } catch (error) {
    // 忽略错误 - 部分浏览器可能不支持这些API
  }
  
  // 监听标签页更新，在YouTube网站启用侧边栏
  // @ts-ignore
  browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!tab.url) return;
    
    try {
      const url = new URL(tab.url);
      
      // 在YouTube网站启用侧边栏
      if (url.origin === YOUTUBE_ORIGIN) {
        // 如果是YouTube视频页面，启用侧边栏
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

  // 当用户在YouTube视频页面点击Action图标时，打开侧边栏
  // @ts-ignore
  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.url) return;
    
    try {
      const url = new URL(tab.url);
      
      if (url.origin === YOUTUBE_ORIGIN && url.pathname.includes('/watch')) {
        // 尝试先关闭再打开侧边栏来强制刷新
        try {
          // 检查侧边栏状态
          // @ts-ignore
          const panelState = await browser.sidePanel.getOptions({ tabId: tab.id });
          
          // 重新设置侧边栏选项，强制刷新
          // @ts-ignore
          await browser.sidePanel.setOptions({
            tabId: tab.id,
            path: 'side-panel.html',
            enabled: true
          });
        } catch (e) {
        }
        
        // 等待一小段时间再打开侧边栏
        setTimeout(async () => {
          try {
            // 使用scripting API执行脚本
            await browser.scripting.executeScript({
              target: { tabId: tab.id as number },
              files: ['content.js']
            });
            
            // 打开侧面板
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

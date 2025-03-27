import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/sandbox';
import { useAutoSubtitles } from '../components/youtube/useAutoSubtitles';

/**
 * 自动字幕收集内容脚本 - 入口点
 * 不再自动收集，而是监听消息请求后再执行
 */

// 定义明确的消息类型
interface SubtitleMessage {
  action: string;
  videoId?: string;
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    console.log('[自动字幕收集器] 内容脚本已加载');
    
    // 使用自动字幕钩子
    const autoSubtitles = useAutoSubtitles();
    
    // 使用@ts-ignore来抑制TypeScript错误
    // 这是因为虽然类型定义要求返回true，但在实际使用中返回undefined也是有效的
    // @ts-ignore: Chrome扩展API类型定义与实际行为不一致
    browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
      console.log('[自动字幕收集器] 收到消息:', message);
      
      // 检查是否为收集字幕的消息
      if (message && message.action === 'collectSubtitles') {
        console.log('[自动字幕收集器] 收到收集请求:', message.videoId);
        
        // 立即发送初始响应，表示消息已收到
        try {
          // 执行字幕收集
          autoSubtitles.autoFetchSubtitles()
            .then((result) => {
              console.log('[自动字幕收集器] 收集成功:', result);
              sendResponse({ success: true, result });
            })
            .catch((error) => {
              console.error('[自动字幕收集器] 收集失败:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
              });
            });
          
          // 返回true表示将异步发送响应
          return true;
        } catch (error) {
          console.error('[自动字幕收集器] 触发收集时出错:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
          return true;
        }
      } else {
        console.log('[自动字幕收集器] 收到未知消息，忽略');
      }
    });
  }
});

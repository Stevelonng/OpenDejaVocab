import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/sandbox';
import { useAutoSubtitles } from '../components/youtube/useAutoSubtitles';

/**
 * Auto Subtitle Collection Content Script - Entry Point
 * No longer automatically collects, but monitors for message requests before executing
 */

// Define clear message types
interface SubtitleMessage {
  action: string;
  videoId?: string;
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    console.log('[Auto Subtitle Collector] Content script loaded');
    
    // Use auto subtitle hook
    const autoSubtitles = useAutoSubtitles();
    
    // Use @ts-ignore to suppress TypeScript errors
    // This is because although type definitions require returning true, returning undefined is also valid in actual use
    // @ts-ignore: Chrome extension API type definitions are inconsistent with actual behavior
    browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
      console.log('[Auto Subtitle Collector] Received message:', message);
      
      // Check if it's a subtitle collection message
      if (message && message.action === 'collectSubtitles') {
        console.log('[Auto Subtitle Collector] Received collection request:', message.videoId);
        
        // Send initial response immediately, indicating message received
        try {
          // Execute subtitle collection
          autoSubtitles.autoFetchSubtitles()
            .then((result) => {
              console.log('[Auto Subtitle Collector] Collection successful:', result);
              sendResponse({ success: true, result });
            })
            .catch((error) => {
              console.error('[Auto Subtitle Collector] Collection failed:', error);
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
              });
            });
          
          // Return true to indicate that response will be sent asynchronously
          return true;
        } catch (error) {
          console.error('[Auto Subtitle Collector] Error triggering collection:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
          return true;
        }
      } else {
        console.log('[Auto Subtitle Collector] Received unknown message, ignoring');
      }
    });
  }
});

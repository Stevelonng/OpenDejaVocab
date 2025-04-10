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
    // Use auto subtitle hook
    const autoSubtitles = useAutoSubtitles();
    
    // Use @ts-ignore to suppress TypeScript errors
    // This is because although type definitions require returning true, returning undefined is also valid in actual use
    // @ts-ignore: Chrome extension API type definitions are inconsistent with actual behavior
    browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
      
      // Check if it's a subtitle collection message
      if (message && message.action === 'collectSubtitles') {
        
        // Send initial response immediately, indicating message received
        try {
          // Execute subtitle collection
          autoSubtitles.autoFetchSubtitles()
            .then((result) => {
              sendResponse({ success: true, result });
            })
            .catch((error) => {
              sendResponse({ 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
              });
            });
          
          // Return true to indicate that response will be sent asynchronously
          return true;
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
          return true;
        }
      } else {
        return false;
      }
    });
  }
});

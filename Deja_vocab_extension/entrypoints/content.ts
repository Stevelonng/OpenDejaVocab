import { createApp } from 'vue';
import { defineContentScript } from 'wxt/sandbox';
import YouTubeFullscreen from '../components/youtube/FullscreenView.vue';

// Toggle fullscreen mode
function toggleFullscreen() {
    // Get video element
    const video = document.querySelector('video');
    if (!video) {
      return;
    }
    
    if (document.fullscreenElement) {
      // If already in fullscreen, exit fullscreen
      document.exitFullscreen();
    } else {
      // If not in fullscreen, request fullscreen
      if (video.requestFullscreen) {
        video.requestFullscreen();
      }
    }
}

export default defineContentScript({
  // Use the most generic matching rule to ensure content script can load
  matches: ['*://*.youtube.com/*'],
  main() {
    // Create a container for our Vue app
    const container = document.createElement('div');
    container.id = 'Dejavocab-fullscreen';
    // Append to document.documentElement (HTML) instead of body
    document.documentElement.appendChild(container);
    
    // Create the Vue app with our component
    const app = createApp(YouTubeFullscreen);
    app.mount('#Dejavocab-fullscreen');
    
    // Add message listener to respond to requests from the sidebar
    // @ts-ignore - Ignore TypeScript errors as these APIs exist but type definitions may be incomplete
    chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {      
      if (message.action === 'toggleFullscreen') {
        toggleFullscreen();
        sendResponse({ success: true });
      }
      
      // Return true to indicate response will be sent asynchronously
      return true;
    });
  },
});

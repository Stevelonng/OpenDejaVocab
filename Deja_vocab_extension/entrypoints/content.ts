import { createApp } from 'vue';
import { defineContentScript } from 'wxt/sandbox';
import YouTubeFullscreen from '../components/youtube/FullscreenView.vue';

// 切换全屏模式
function toggleFullscreen() {
    // 获取视频元素
    const video = document.querySelector('video');
    if (!video) {
      return;
    }
    
    if (document.fullscreenElement) {
      // 如果已经是全屏，则退出全屏
      document.exitFullscreen();
    } else {
      // 如果不是全屏，则请求全屏
      if (video.requestFullscreen) {
        video.requestFullscreen();
      }
    }
}

export default defineContentScript({
  // 使用最通用的匹配规则，确保内容脚本能够加载
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
    
    // 添加消息监听器，响应来自侧边栏的请求
    // @ts-ignore - 忽略TypeScript错误，因为这些API存在但类型定义可能不完善
    chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {      
      if (message.action === 'toggleFullscreen') {
        toggleFullscreen();
        sendResponse({ success: true });
      }
      
      // 返回true表示会异步发送响应
      return true;
    });
  },
});

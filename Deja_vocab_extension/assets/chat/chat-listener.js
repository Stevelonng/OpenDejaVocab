/**
 * 聊天监听器 - 负责在聊天过程中触发字幕收集
 * 这个模块作为聊天UI和自动字幕收集功能之间的桥梁
 */

class ChatListener {
  constructor() {
    this.initialized = false;
    this.browser = window.browser || window.chrome;
    this.currentVideoId = null;
    
    // 初始化时检查当前标签
    this.init();
  }
  
  /**
   * 初始化聊天监听器
   */
  async init() {
    if (this.initialized) return;
    
    try {
      console.log('[聊天监听器] 初始化中...');
      
      // 监听消息发送事件
      document.addEventListener('chat-message-sent', this.handleChatMessageSent.bind(this));
      
      // 监听用户打开聊天界面事件
      document.addEventListener('chat-ui-opened', this.handleChatUiOpened.bind(this));
      
      // 创建自定义事件处理器，以适配聊天UI的新消息发送机制
      this.setupCustomEventListeners();
      
      // 检查当前是否在YouTube页面，如果是则获取视频ID
      await this.checkCurrentTab();
      
      this.initialized = true;
      console.log('[聊天监听器] 初始化完成');
    } catch (error) {
      console.error('[聊天监听器] 初始化失败:', error);
    }
  }
  
  /**
   * 设置自定义事件监听器
   * 这允许聊天监听器与更新后的聊天UI集成
   */
  setupCustomEventListeners() {
    // 创建全局函数，让聊天UI可以直接调用触发字幕收集
    window.triggerSubtitleCollection = async (videoId) => {
      if (videoId) {
        this.currentVideoId = videoId;
      }
      
      console.log('[聊天监听器] 通过全局函数触发字幕收集:', this.currentVideoId);
      await this.triggerSubtitleCollection();
    };
    
    // 创建消息事件，监听从聊天UI发送的消息
    window.addEventListener('message', async (event) => {
      // 安全检查
      if (!event.data || typeof event.data !== 'object') return;
      
      // 处理聊天消息事件
      if (event.data.type === 'CHAT_MESSAGE_SENT') {
        console.log('[聊天监听器] 从消息事件接收到聊天消息:', event.data);
        
        // 如果提供了视频ID，更新当前值
        if (event.data.videoId) {
          this.currentVideoId = event.data.videoId;
        }
        
        // 触发字幕收集
        await this.handleChatMessageSent();
      }
    });
    
    console.log('[聊天监听器] 自定义事件监听器设置完成');
  }
  
  /**
   * 检查当前标签是否为YouTube视频页面
   */
  async checkCurrentTab() {
    try {
      // 获取当前活动标签
      const tabs = await this.browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) return;
      
      const currentTab = tabs[0];
      const url = currentTab.url;
      
      if (url && url.includes('youtube.com/watch')) {
        // 提取视频ID
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        this.currentVideoId = videoIdMatch ? videoIdMatch[1] : null;
        
        if (this.currentVideoId) {
          console.log('[聊天监听器] 检测到YouTube视频:', this.currentVideoId);
        }
      } else {
        this.currentVideoId = null;
      }
    } catch (error) {
      console.error('[聊天监听器] 检查当前标签失败:', error);
    }
  }
  
  /**
   * 处理用户发送聊天消息事件
   */
  async handleChatMessageSent(event) {
    try {
      console.log('[聊天监听器] 接收到聊天消息事件');
      
      // 如果没有event参数，尝试从存储中获取当前视频信息
      if (!event) {
        // 从存储中获取当前视频ID（以防未通过事件接收）
        const storage = await this.browser.storage.local.get(['currentVideoInfo']);
        if (storage.currentVideoInfo && storage.currentVideoInfo.videoId) {
          this.currentVideoId = storage.currentVideoInfo.videoId;
        } else {
          // 如果存储中没有，再尝试检查当前标签
          await this.checkCurrentTab();
        }
      }
      
      if (!this.currentVideoId) {
        console.log('[聊天监听器] 当前不在YouTube视频页面，跳过字幕收集');
        return;
      }
      
      // 检查是否已经有字幕
      const storage = await this.browser.storage.local.get(['currentVideoInfo', 'currentSubtitles']);
      
      const hasValidSubtitles = storage.currentVideoInfo && 
                               storage.currentSubtitles && 
                               storage.currentVideoInfo.videoId === this.currentVideoId &&
                               Array.isArray(storage.currentSubtitles) && 
                               storage.currentSubtitles.length > 0;
      
      if (hasValidSubtitles) {
        console.log('[聊天监听器] 已有当前视频的字幕，完全跳过收集过程');
        return;
      }
      
      // 只有在没有有效字幕的情况下才触发收集
      console.log('[聊天监听器] 当前视频没有字幕，触发收集:', this.currentVideoId);
      await this.triggerSubtitleCollection();
    } catch (error) {
      console.error('[聊天监听器] 处理聊天消息失败:', error);
    }
  }
  
  /**
   * 处理用户打开聊天界面事件
   */
  async handleChatUiOpened() {
    try {
      console.log('[聊天监听器] 聊天界面已打开');
      
      // 更新当前标签信息
      await this.checkCurrentTab();
      
      if (!this.currentVideoId) {
        console.log('[聊天监听器] 当前不在YouTube视频页面，跳过字幕检查');
        return;
      }
      
      // 仅检查字幕状态，不主动触发收集
      const storage = await this.browser.storage.local.get(['currentVideoInfo', 'currentSubtitles']);
      
      const hasValidSubtitles = storage.currentVideoInfo && 
                               storage.currentSubtitles && 
                               storage.currentVideoInfo.videoId === this.currentVideoId &&
                               Array.isArray(storage.currentSubtitles) && 
                               storage.currentSubtitles.length > 0;
      
      if (hasValidSubtitles) {
        console.log('[聊天监听器] 已有当前视频的字幕:', storage.currentSubtitles.length, '条');
      } else {
        console.log('[聊天监听器] 当前视频没有字幕，等待用户发送消息时收集');
      }
    } catch (error) {
      console.error('[聊天监听器] 处理聊天界面打开事件失败:', error);
    }
  }
  
  /**
   * 触发字幕收集
   */
  async triggerSubtitleCollection() {
    try {
      if (!this.currentVideoId) {
        console.error('[聊天监听器] 无法触发字幕收集: 没有当前视频ID');
        return;
      }
      
      console.log('[聊天监听器] 开始触发字幕收集:', this.currentVideoId);
      
      // 查找所有YouTube标签页
      const tabs = await this.browser.tabs.query({url: "*://*.youtube.com/*"});
      
      if (tabs.length === 0) {
        console.log('[聊天监听器] 未找到YouTube标签页，无法触发字幕收集');
        return;
      }
      
      // 尝试向每个YouTube标签页发送消息
      let collectionTriggered = false;
      
      for (const tab of tabs) {
        try {
          // 向内容脚本发送消息，触发字幕收集
          const response = await this.browser.tabs.sendMessage(tab.id, {
            action: 'collectSubtitles',
            videoId: this.currentVideoId
          });
          
          console.log('[聊天监听器] 字幕收集请求响应:', response);
          
          // 如果收到成功响应
          if (response && response.success) {
            console.log('[聊天监听器] 成功触发字幕收集在标签页', tab.id);
            collectionTriggered = true;
            break; // 成功触发后不再尝试其他标签
          }
        } catch (error) {
          console.log('[聊天监听器] 无法在标签页上触发字幕收集:', tab.id, error);
          // 继续尝试其他标签
        }
      }
      
      if (!collectionTriggered) {
        console.log('[聊天监听器] 所有标签页尝试失败，无法触发字幕收集');
      }
    } catch (error) {
      console.error('[聊天监听器] 触发字幕收集失败:', error);
    }
  }
}

// 创建聊天监听器实例
const chatListener = new ChatListener();

// 暴露给全局
window.chatListener = chatListener;

export default chatListener;

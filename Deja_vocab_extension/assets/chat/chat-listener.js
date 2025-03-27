/**
 * Chat Listener - Responsible for triggering subtitle collection during chat
 * This module serves as a bridge between the chat UI and automatic subtitle collection
 */

class ChatListener {
  constructor() {
    this.initialized = false;
    this.browser = window.browser || window.chrome;
    this.currentVideoId = null;
    
    // Initialize when checking current tab
    this.init();
  }
  
  /**
   * Initialize chat listener
   */
  async init() {
    if (this.initialized) return;
    
    try {
      console.log('[ChatListener] Initializing...');
      
      // Listen for chat message sent events
      document.addEventListener('chat-message-sent', this.handleChatMessageSent.bind(this));
      
      // Listen for chat UI opened events
      document.addEventListener('chat-ui-opened', this.handleChatUiOpened.bind(this));
      
      // Set up custom event listeners to adapt to the new chat UI message sending mechanism
      this.setupCustomEventListeners();
      
      // Check if current page is YouTube, if so, get video ID
      await this.checkCurrentTab();
      
      this.initialized = true;
      console.log('[ChatListener] Initialized');
    } catch (error) {
      console.error('[ChatListener] Initialization failed:', error);
    }
  }
  
  /**
   * Set up custom event listeners
   * This allows the chat listener to integrate with the updated chat UI
   */
  setupCustomEventListeners() {
    // Create global function, allowing chat UI to directly trigger subtitle collection
    window.triggerSubtitleCollection = async (videoId) => {
      if (videoId) {
        this.currentVideoId = videoId;
      }
      
      console.log('[ChatListener] Triggering subtitle collection:', this.currentVideoId);
      await this.triggerSubtitleCollection();
    };
    
    // Create message event listener, listening for messages from chat UI
    window.addEventListener('message', async (event) => {
      // Security check
      if (!event.data || typeof event.data !== 'object') return;
      
      // Handle chat message event
      if (event.data.type === 'CHAT_MESSAGE_SENT') {
        console.log('[ChatListener] Received chat message from message event:', event.data);
        
        // If video ID is provided, update current value
        if (event.data.videoId) {
          this.currentVideoId = event.data.videoId;
        }
        
        // Trigger subtitle collection
        await this.handleChatMessageSent();
      }
    });
    
    console.log('[ChatListener] Custom event listeners set up');
  }
  
  /**
   * Check if current tab is a YouTube video page
   */
  async checkCurrentTab() {
    try {
      // Get current active tab
      const tabs = await this.browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) return;
      
      const currentTab = tabs[0];
      const url = currentTab.url;
      
      if (url && url.includes('youtube.com/watch')) {
        // Extract video ID
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        this.currentVideoId = videoIdMatch ? videoIdMatch[1] : null;
        
        if (this.currentVideoId) {
          console.log('[ChatListener] Detected YouTube video:', this.currentVideoId);
        }
      } else {
        this.currentVideoId = null;
      }
    } catch (error) {
      console.error('[ChatListener] Checking current tab failed:', error);
    }
  }
  
  /**
   * Handle user send chat message event
   */
  async handleChatMessageSent(event) {
    try {
      console.log('[ChatListener] Received chat message event');
      
      // If no event parameter, try to get current video info from storage
      if (!event) {
        // Get current video ID from storage (in case not received via event)
        const storage = await this.browser.storage.local.get(['currentVideoInfo']);
        if (storage.currentVideoInfo && storage.currentVideoInfo.videoId) {
          this.currentVideoId = storage.currentVideoInfo.videoId;
        } else {
          // If not, try checking the current label again
          await this.checkCurrentTab();
        }
      }
      
      if (!this.currentVideoId) {
        console.log('[ChatListener] Not on YouTube video page, skipping subtitle collection');
        return;
      }
      
      // Check if subtitles already exist
      const storage = await this.browser.storage.local.get(['currentVideoInfo', 'currentSubtitles']);
      
      const hasValidSubtitles = storage.currentVideoInfo && 
                               storage.currentSubtitles && 
                               storage.currentVideoInfo.videoId === this.currentVideoId &&
                               Array.isArray(storage.currentSubtitles) && 
                               storage.currentSubtitles.length > 0;
      
      if (hasValidSubtitles) {
        console.log('[ChatListener] Already has subtitles for current video, skipping collection');
        return;
      }
      
      // Only trigger collection if no valid subtitles exist
      console.log('[ChatListener] No subtitles found for current video, triggering collection:', this.currentVideoId);
      await this.triggerSubtitleCollection();
    } catch (error) {
      console.error('[ChatListener] Failed to handle chat message:', error);
    }
  }
  
  /**
   * Handle user opening chat interface event
   */
  async handleChatUiOpened() {
    try {
      console.log('[ChatListener] Chat interface opened');
      
      // Update current tab information
      await this.checkCurrentTab();
      
      if (!this.currentVideoId) {
        console.log('[ChatListener] Not on YouTube video page, skipping subtitle check');
        return;
      }
      
      // Only check subtitle status, do not trigger collection
      const storage = await this.browser.storage.local.get(['currentVideoInfo', 'currentSubtitles']);
      
      const hasValidSubtitles = storage.currentVideoInfo && 
                               storage.currentSubtitles && 
                               storage.currentVideoInfo.videoId === this.currentVideoId &&
                               Array.isArray(storage.currentSubtitles) && 
                               storage.currentSubtitles.length > 0;
      
      if (hasValidSubtitles) {
        console.log('[ChatListener] Already has subtitles for current video:', storage.currentSubtitles.length, 'items');
      } else {
        console.log('[ChatListener] No subtitles found for current video, waiting for user message to trigger collection');
      }
    } catch (error) {
      console.error('[ChatListener] Failed to handle chat interface opened event:', error);
    }
  }
  
  /**
   * Trigger subtitle collection
   */
  async triggerSubtitleCollection() {
    try {
      if (!this.currentVideoId) {
        console.error('[ChatListener] Failed to trigger subtitle collection: no current video ID');
        return;
      }
      
      console.log('[ChatListener] Triggering subtitle collection:', this.currentVideoId);
      
      // Find all YouTube tabs
      const tabs = await this.browser.tabs.query({url: "*://*.youtube.com/*"});
      
      if (tabs.length === 0) {
        console.log('[ChatListener] No YouTube tabs found, cannot trigger subtitle collection');
        return;
      }
      
      // Try to send message to each YouTube tab
      let collectionTriggered = false;
      
      for (const tab of tabs) {
        try {
          // Send message to content script to trigger subtitle collection
          const response = await this.browser.tabs.sendMessage(tab.id, {
            action: 'collectSubtitles',
            videoId: this.currentVideoId
          });
          
          console.log('[ChatListener] Response to subtitle collection request:', response);
          
          // If successful response
          if (response && response.success) {
            console.log('[ChatListener] Successfully triggered subtitle collection in tab', tab.id);
            collectionTriggered = true;
            break; // Successfully triggered, no need to try other tabs
          }
        } catch (error) {
          console.log('[ChatListener] Failed to trigger subtitle collection in tab', tab.id, error);
          // Keep trying other tabs
        }
      }
      
      if (!collectionTriggered) {
        console.log('[ChatListener] Failed to trigger subtitle collection in all tabs');
      }
    } catch (error) {
      console.error('[ChatListener] Failed to trigger subtitle collection:', error);
    }
  }
}

// Create chat listener instance
const chatListener = new ChatListener();

// Expose to global
window.chatListener = chatListener;

export default chatListener;

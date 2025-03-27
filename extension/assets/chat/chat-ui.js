import browser from 'webextension-polyfill';
import ChatModeManager from './chat-mode.js';
import './chat-listener.js';  // Import chat listener

/**
 * Modern Chat Interface - Redesigned
 * Features:
 * - Improved animation and transitions
 * - Better error handling
 * - Cleaner API integration with latest Gemini API
 * - Enhanced typing indicators
 * - Responsive design
 */
class ChatUI {
  // Singleton instance storage
  static instance = null;
  
  /**
   * Get ChatUI instance (singleton pattern)
   */
  static getInstance() {
    if (!ChatUI.instance) {
      ChatUI.instance = new ChatUI();
    }
    return ChatUI.instance;
  }

  constructor(config = {}) {
    // API configuration
    this.apiUrl = config.apiUrl || 'https://dejavocab.com/api';
    
    // UI elements
    this.messagesContainer = document.getElementById('chat-messages');
    this.inputField = document.getElementById('chat-input');
    this.sendButton = document.getElementById('send-button');
    
    // State management
    this.isProcessing = false;
    this.darkMode = true;
    this.chatHistory = [];
    this.currentRequest = null;
    
    // Chat mode - No longer set default value here, managed by ChatModeManager
    this.chatModeManager = null;
    
    // Stream processing
    this.typingAnimation = null;
    this.responseTimer = null;

    // Bind methods
    this.init = this.init.bind(this);
    this.getUserInfo = this.getUserInfo.bind(this);
    
    // Video change detection
    this.lastVideoId = '';
    this.isFirstVideoLoad = true; // Add flag to distinguish first load and subsequent switches
    
    // Video title cache
    this.videoTitleCache = new Map();
    
    // Initialization flag
    this.initialized = false;
    
    // Event handler ID
    this._eventHandlersId = null;
  }

  /**
   * Markdown renderer with enhanced formatting support
   * @param {string} text - Text to render
   * @returns {string} - Rendered HTML
   */
  renderMarkdown(text) {
    if (!text) return '';
    
    // Replace code blocks with syntax highlighting placeholders
    text = text.replace(/```(\w+)?\n([\s\S]+?)\n```/g, '<pre class="code-block"><code>$2</code></pre>');
    
    // Replace inline code
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Replace bold text
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Replace italics
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Replace links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Replace headers
    text = text.replace(/#{3} (.*)/g, '<h3>$1</h3>');
    text = text.replace(/#{2} (.*)/g, '<h2>$1</h2>');
    text = text.replace(/# (.*)/g, '<h1>$1</h1>');
    
    // Replace unordered lists
    text = text.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Replace ordered lists
    text = text.replace(/^\s*\d+\. (.*)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    
    // Replace newlines with <br> for readability
    text = text.replace(/\n/g, '<br>');
    
    return text;
  }

  /**
   * Toggle dark mode on/off
   */
  async toggleDarkMode() {
    this.darkMode = !this.darkMode;
    document.documentElement.classList.toggle('dark', this.darkMode);
    
    // Update the icon
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (darkModeToggle) {
      const icon = darkModeToggle.querySelector('i');
      if (icon) {
        if (this.darkMode) {
          icon.classList.remove('bi-sun');
          icon.classList.add('bi-moon');
        } else {
          icon.classList.remove('bi-moon');
          icon.classList.add('bi-sun');
        }
      }
    }
    
    // Save the setting
    await this.saveDarkModeSetting();
  }

  /**
   * Load dark mode setting from storage
   */
  async loadDarkModeSetting() {
    try {
      const settings = await browser.storage.local.get(['darkMode']);
      // Default to true if not set
      this.darkMode = settings.darkMode !== false;
      
      // Apply dark mode (now enabled by default)
      document.documentElement.classList.toggle('dark', this.darkMode);
      
      // Update the icon
      const darkModeToggle = document.getElementById('dark-mode-toggle');
      if (darkModeToggle) {
        const icon = darkModeToggle.querySelector('i');
        if (icon) {
          if (this.darkMode) {
            icon.classList.remove('bi-sun');
            icon.classList.add('bi-moon');
          } else {
            icon.classList.remove('bi-moon');
            icon.classList.add('bi-sun');
          }
        }
      }
    } catch (error) {
      console.error('[ERROR] Error loading dark mode setting:', error);
      // If error occurs, still apply dark mode by default
      this.darkMode = true;
      document.documentElement.classList.add('dark');
    }
  }

  /**
   * Save dark mode setting to storage
   */
  async saveDarkModeSetting() {
    try {
      await browser.storage.local.set({ darkMode: this.darkMode });
    } catch (error) {
      console.error('[ERROR] Error saving dark mode setting:', error);
    }
  }

  /**
   * Initialize chat interface
   */
  async init() {
    // Check if we've already initialized this instance
    if (this.initialized) {
      console.log('[INFO] This ChatUI instance was already initialized, skipping');
      return;
    }

    console.log('[INFO] Initializing chat interface');
    try {
      // Get API URL and environment settings
      const settings = await browser.storage.local.get(['apiUrl', 'environment']);
      const environment = settings.environment || 'production';
      
      // Set default API URL if not stored
      this.apiUrl = settings.apiUrl || 'https://dejavocab.com/api/';
      await browser.storage.local.set({ apiUrl: this.apiUrl });
      
      this.environment = environment;
      console.log('[INFO] Using API URL:', this.apiUrl, 'Environment:', this.environment);
      
      // Get user info
      await this.getUserInfo();
      
      // Get DOM elements
      this.chatContainer = document.getElementById('chat-container');
      this.messagesContainer = document.getElementById('chat-messages');
      this.chatIntro = document.getElementById('chat-intro');
      this.inputField = document.getElementById('chat-input');
      this.sendButton = document.getElementById('send-button');
      
      if (!this.authToken) {
        console.error('[ERROR] No authentication token found, user may not be logged in');
        return;
      }
      
      console.log('[INFO] User information retrieved:', this.username);
      
      // Show chat interface
      this.activateChatView();
      
      // Load settings (include ChatModeManager initialization)
      await this.loadSettings();
      
      // Set up event listeners (ensure after ChatModeManager initialization)
      this.setupEventListeners();
      
      // Load chat history
      await this.loadChatHistory();
      
      // Load dark mode setting
      await this.loadDarkModeSetting();
      
      // Set up storage change listener
      this.setupStorageChangeListener();
      
      // Mark this instance as initialized
      this.initialized = true;
      
      console.log('[INFO] Chat interface initialization complete');
    } catch (error) {
      console.error('[ERROR] Chat interface initialization failed:', error);
    }
  }
  
  /**
   * Set up storage change listener
   */
  setupStorageChangeListener() {
    const self = this; // Save this reference
    
    // Add title cache mapping, used to record the title corresponding to each video ID
    // This way, even if the storage data is delayed, we can still use the correct title
    if (!this.videoTitleCache) {
      this.videoTitleCache = new Map();
    }
    
    browser.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === 'local') {
        // Check for video info changes
        if (changes.currentVideoInfo) {
          console.log('[DEBUG] Video info changed in storage');
          
          try {
            // Get complete new and old values
            const newValue = changes.currentVideoInfo.newValue;
            const oldValue = changes.currentVideoInfo.oldValue;
            
            if (!newValue) {
              console.log('[WARN] New video info is null or undefined');
              return;
            }
            
            console.log('[INFO] New video info:', JSON.stringify(newValue));
            if (oldValue) {
              console.log('[INFO] Old video info:', JSON.stringify(oldValue));
            }
            
            // Extract video ID and title
            const newVideoId = newValue.videoId;
            
            // If no video ID, ignore this update
            if (!newVideoId) {
              console.log('[WARN] Invalid video info - missing ID');
              return;
            }
            
            // If video ID hasn't changed, do nothing
            if (newVideoId === self.lastVideoId) {
              console.log('[INFO] Ignoring update for same video ID:', newVideoId);
              return;
            }
            
            // If first load (no history lastVideoId)
            if (self.isFirstVideoLoad) {
              console.log('[INFO] First video load detected, setting initial video ID:', newVideoId);
              // Only update state, no system message
              self.lastVideoId = newVideoId;
              self.isFirstVideoLoad = false; // Mark as non-first load
              
              // If there's a title, still update cache
              if (newValue.title) {
                self.videoTitleCache.set(newVideoId, newValue.title);
              }
              
              return; // Do not continue execution to avoid showing first load notification
            }
            
            // For actual video change: get accurate video title
            console.log('[INFO] Detected video ID change, getting latest title from YouTube');
            let accurateTitle = await self.getYouTubeVideoTitle(newVideoId);
            
            // If cannot get new title, fallback to storage data
            if (!accurateTitle && newValue.title) {
              console.log('[INFO] Using storage title as fallback:', newValue.title);
              accurateTitle = newValue.title;
            }
            
            // Update title cache
            self.videoTitleCache.set(newVideoId, accurateTitle);
            
            console.log('[INFO] Confirmed video change:', 
                       'old=', self.lastVideoId, 'new=', newVideoId,
                       'title=', accurateTitle);
            
            // 添加系统消息
            self.addMessageToChat({
              role: 'system',
              content: `您已切换到新视频: ${accurateTitle || newVideoId}`
            });
            
            // Render chat history
            self.renderChatHistory();
            
            // If not accumulate mode, clear chat history but keep system messages
            if (self.chatModeManager && self.chatModeManager.getCurrentMode() !== 'accumulate') {
              console.log('[INFO] Non-accumulate mode active, clearing chat history except system messages');
              self.chatHistory = self.chatHistory.filter(msg => msg.role === 'system');
            }
            
            // Update internal video ID record
            self.lastVideoId = newVideoId;
          } catch (error) {
            console.error('[ERROR] Error processing video change:', error);
          }
        }
      }
    });
  }

  /**
   * Get video title from YouTube page
   * Used to ensure we display the correct video title, not just storage data
   * @param {string} videoId - Video ID
   * @returns {Promise<string>} - Video title
   */
  async getYouTubeVideoTitle(videoId) {
    try {
      // Query all tabs to find matching YouTube video
      const tabs = await browser.tabs.query({});
      console.log(`[DEBUG] Searching ${tabs.length} tabs for video ID: ${videoId}`);
      
      for (const tab of tabs) {
        // Check if it's a YouTube video page
        if (tab.url && tab.url.includes('youtube.com/watch') && tab.url.includes(videoId)) {
          console.log(`[INFO] Found matching YouTube tab for ${videoId}: ${tab.title}`);
          
          try {
            // Use scripting API to execute content script to get page title element
            // Use more precise way to get video title, avoid getting notification count prefix (e.g. "(56)")
            const result = await browser.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                // Try to get video title from video title element
                const videoTitleElement = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer');
                if (videoTitleElement) {
                  return videoTitleElement.textContent.trim();
                }
                
                // Alternative: get from meta tag
                const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
                if (metaTitle) {
                  return metaTitle;
                }
                
                // Last try: get from document.title and handle prefix
                let docTitle = document.querySelector('title').textContent;
                // Handle notification count prefix, e.g. "(56) Video Title - YouTube"
                const notificationPrefix = docTitle.match(/^\(\d+\)\s*/);
                if (notificationPrefix) {
                  docTitle = docTitle.replace(notificationPrefix[0], '');
                }
                
                // Need to handle YouTube suffix
                if (docTitle.includes(' - YouTube')) {
                  docTitle = docTitle.replace(' - YouTube', '');
                }
                
                return docTitle;
              }
            });
            
            if (result && result[0] && result[0].result) {
              const videoTitle = result[0].result;
              console.log(`[INFO] Got real title from page: "${videoTitle}"`);
              return videoTitle;
            }
          } catch (scriptError) {
            console.warn(`[WARN] Could not execute script in tab: ${scriptError}`);
          }
        }
      }
      
      // If no matching tab or cannot get title, try through YouTube API
      // Note: This requires cross-origin permissions, may not work in some environments
      console.log(`[INFO] Attempting to fetch title for ${videoId} from YouTube API`);
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.title) {
          console.log(`[INFO] Got title from YouTube API: "${data.title}"`);
          return data.title;
        }
      }
      
      // 都失败时返回空字符串
      console.warn(`[WARN] Could not get title for video ${videoId}`);
      return '';
    } catch (error) {
      console.error(`[ERROR] Error getting YouTube title: ${error}`);
      return '';
    }
  }

  /**
   * Activate chat view
   */
  activateChatView() {
    // Add chat-active class to body to trigger CSS rules
    document.body.classList.add('chat-active');
    
    // Show main container
    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
      mainContainer.style.display = 'block';
    }
    
    // Show chat container too
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.style.display = 'flex';
    }
    
    // Hide YouTube guide interface (if exists)
    const guideContainer = document.getElementById('youtube-guide');
    if (guideContainer) {
      guideContainer.style.display = 'none';
      console.log('[INFO] Hidden YouTube guide interface');
    }
    
    console.log('[INFO] Chat interface activated');
  }
  
  /**
   * Deactivate chat view - used to hide chat interface on non-Youtube pages
   */
  deactivateChatView() {
    // Remove chat-active class from body
    document.body.classList.remove('chat-active');
    
    // Hide containers
    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
      mainContainer.style.display = 'none';
    }
    
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.style.display = 'none';
    }
    
    // Show YouTube guide interface (if exists)
    const guideContainer = document.getElementById('youtube-guide');
    if (guideContainer) {
      guideContainer.style.display = 'flex';
      console.log('[INFO] Show YouTube guide interface');
    }
    
    console.log('[INFO] Chat interface deactivated');
  }

  /**
   * Get user information
   */
  async getUserInfo() {
    try {
      // Get authentication data from storage
      const authData = await browser.storage.local.get(['authToken', 'userId', 'username']);
      this.authToken = authData.authToken;
      this.userId = authData.userId;
      this.username = authData.username;
      
      if (!this.authToken) {
        console.error('[ERROR] Unable to get authentication token, user may not be logged in');
        return;
      }
      
      console.log('[INFO] User information retrieved:', this.username);
    } catch (error) {
      console.error('[ERROR] Error getting user information:', error);
    }
  }

  /**
   * Export current session, including ending current session and generating AI summary
   */
  // Mark current export status (prevent multiple exports)
  _isExporting = false;
  
  async exportChatSession() {
    // If export operation is already in progress, return
    if (this._isExporting) {
      console.log('[INFO] Export already in progress, ignoring duplicate request');
      return;
    }
    
    // Set flag to prevent duplicate calls
    this._isExporting = true;
    
    // No longer check for chat history in frontend, directly try to export from backend
    // Backend will check if there are messages to export

    try {
      // Show loading prompt
      const exportBtn = document.getElementById('export-notes-btn');
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
      }
      
      // Ensure API URL is in correct format
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
      
      // 1. First end current session
      const endSessionUrl = `${baseUrl}/chat/end-session/`;
      console.log('[INFO] Ending chat session at:', endSessionUrl);
      
      const endSessionResponse = await fetch(endSessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.authToken}`
        }
      });
      
      if (!endSessionResponse.ok) {
        throw new Error(`Failed to end session: ${endSessionResponse.status}`);
      }
      
      const sessionData = await endSessionResponse.json();
      console.log('[INFO] Session ended successfully:', sessionData);
      
      // 2. Export session notes
      const exportNotesUrl = `${baseUrl}/chat/export-notes/${sessionData.session_id}/`;
      console.log('[INFO] Exporting session notes from:', exportNotesUrl);
      
      const exportResponse = await fetch(exportNotesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.authToken}`
        }
      });
      
      if (!exportResponse.ok) {
        throw new Error(`Failed to export notes: ${exportResponse.status}`);
      }
      
      // Get export data but do not download file
      const exportData = await exportResponse.json();
      
      // Only print export notes information, do not create download
      console.log('[INFO] Notes content prepared but not downloaded as requested');
      
      // If need to display exported content, can show part of the content in message area
      if (exportData && exportData.content && exportData.content.length > 0) {
        console.log('[INFO] Summary content generated successfully');
      }
      
      console.log('[INFO] Successfully exported session notes');
      
      // Add system message to inform user session has ended
      this.addMessageToChat({
        role: 'system',
        content: 'Current session has ended. Will automatically start a new session.',
        timestamp: new Date().toISOString()
      });
      
      // Clear current chat history, prepare for new session
      this.chatHistory = [];
      this.saveChatHistory();
      
      // Clear session related cache state
      localStorage.removeItem('dejavu_chat_session_state');
      localStorage.removeItem('dejavu_current_video');
      
      // Reset video tracking state
      this.lastVideoId = '';
      
    } catch (error) {
      console.error('[ERROR] Failed to export session:', error);
      alert(`Failed to export session: ${error.message}`);
    } finally {
      // Restore button state
      const exportBtn = document.getElementById('export-notes-btn');
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="bi bi-file-earmark-text"></i> Export Session';
      }
      
      // Reset export state marker to prevent quick repeated clicks
      setTimeout(() => {
        this._isExporting = false;
      }, 2000);
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Add debug ID to help identify event binding
    const debugId = Math.random().toString(36).substring(2, 8);
    console.log(`[DEBUG ${debugId}] Starting event listener setup`);
    
    // First remove existing event listeners
    this.removeExistingEventListeners();
    
    // Check if elements exist
    const elements = {
      sendButton: document.getElementById('send-button'),
      inputField: document.getElementById('chat-input'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      darkModeToggle: document.getElementById('dark-mode-toggle'),
      logoutBtn: document.getElementById('logout-btn')
    };
    
    // Check if elements exist
    console.log(`[DEBUG ${debugId}] Checking UI elements:`, {
      sendButton: !!elements.sendButton,
      inputField: !!elements.inputField,
      clearChatBtn: !!elements.clearChatBtn,
      darkModeToggle: !!elements.darkModeToggle,
      logoutBtn: !!elements.logoutBtn
    });
    
    // Check for old handlers
    const hasOldHandlers = {
      sendHandler: !!this.sendHandler,
      keydownHandler: !!this.keydownHandler,
      clearChatHandler: !!this.clearChatHandler,
      darkModeHandler: !!this.darkModeHandler,
      logoutHandler: !!this.logoutHandler
    };
    console.log(`[DEBUG ${debugId}] Old event handlers:`, hasOldHandlers);
    
    // Store unique identifier for event handlers
    this._eventHandlersId = debugId;
    
    // Send button click event - use a check to ensure only one binding
    if (elements.sendButton && !elements.sendButton._hasClickListener) {
      this.sendHandler = (e) => {
        e.preventDefault();
        console.log(`[Event ${this._eventHandlersId}] Send button click`);
        this.handleSendMessage();
      };
      elements.sendButton.addEventListener('click', this.sendHandler);
      elements.sendButton._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] Added send button click event listener`);
    }
    
    // Input field keypress event (Enter to send)
    if (elements.inputField && !elements.inputField._hasKeydownListener) {
      this.keydownHandler = (e) => {
        this.adjustTextareaHeight();
        
        // Check for Enter key (without shift) to send message
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          console.log(`[Event ${this._eventHandlersId}] Enter key to send`);
          this.handleSendMessage();
        }
      };
      elements.inputField.addEventListener('keydown', this.keydownHandler);
      elements.inputField._hasKeydownListener = true;
      
      // Adjust height on input event
      this.inputHandler = () => {
        this.adjustTextareaHeight();
      };
      elements.inputField.addEventListener('input', this.inputHandler);
      console.log(`[DEBUG ${debugId}] Added input field event listener`);
    }
    
    // Clear chat button click event
    if (elements.clearChatBtn && !elements.clearChatBtn._hasClickListener) {
      this.clearChatHandler = (e) => {
        e.preventDefault();
        console.log(`[Event ${this._eventHandlersId}] Clear chat button click`);
        this.clearChat();
      };
      elements.clearChatBtn.addEventListener('click', this.clearChatHandler);
      elements.clearChatBtn._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] Added clear chat button event listener`);
    }
    
    // Dark mode toggle button click event
    if (elements.darkModeToggle && !elements.darkModeToggle._hasClickListener) {
      this.darkModeHandler = (e) => {
        e.preventDefault();
        console.log(`[Event ${this._eventHandlersId}] Dark mode toggle button click`);
        this.toggleDarkMode();
      };
      elements.darkModeToggle.addEventListener('click', this.darkModeHandler);
      elements.darkModeToggle._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] Added dark mode toggle button event listener`);
    }
    
    // Logout button click event
    if (elements.logoutBtn && !elements.logoutBtn._hasClickListener) {
      this.logoutHandler = (e) => {
        e.preventDefault();
        this.logout();
      };
      elements.logoutBtn.addEventListener('click', this.logoutHandler);
      elements.logoutBtn._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] Added logout button event listener`);
    }
    
    // Chat mode toggle button click event
    if (this.chatModeManager) {
      this.chatModeManager.bindEvents();
    } else {
      console.warn('[WARNING] Chat mode manager not initialized, skipping event setup');
    }
    
    // Resize event for responsive design - Use check to avoid duplicate addition
    if (!window._hasResizeListener) {
      this.resizeHandler = () => {
        this.adjustTextareaHeight();
      };
      window.addEventListener('resize', this.resizeHandler);
      window._hasResizeListener = true;
      console.log(`[DEBUG ${debugId}] Added window resize event listener`);
    }
    
    console.log(`[DEBUG ${debugId}] Event listeners setup completed`);
  }

  /**
   * Remove existing event listeners
   */
  removeExistingEventListeners() {
    const debugId = Math.random().toString(36).substring(2, 8);
    console.log(`[DEBUG ${debugId}] Starting to remove existing event listeners`);
    
    const elements = {
      sendButton: document.getElementById('send-button'),
      inputField: document.getElementById('chat-input'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      darkModeToggle: document.getElementById('dark-mode-toggle'),
      logoutBtn: document.getElementById('logout-btn')
    };
    
    // Remove all possible event listeners, reset _hasClickListener flag
    
    // Send button
    if (elements.sendButton) {
      if (this.sendHandler) {
        elements.sendButton.removeEventListener('click', this.sendHandler);
      }
      // Ensure removal of all other possible click handlers
      elements.sendButton.replaceWith(elements.sendButton.cloneNode(true));
      // Update reference, because cloneNode invalidates original reference
      this.sendButton = document.getElementById('send-button');
      console.log(`[DEBUG ${debugId}] Removed send button event listeners`);
    }
    
    // Input field
    if (elements.inputField) {
      if (this.keydownHandler) {
        elements.inputField.removeEventListener('keydown', this.keydownHandler);
      }
      if (this.inputHandler) {
        elements.inputField.removeEventListener('input', this.inputHandler);
      }
      // Clone and replace to ensure all event handlers are removed
      const newInput = elements.inputField.cloneNode(true);
      elements.inputField.parentNode.replaceChild(newInput, elements.inputField);
      // Update reference
      this.inputField = document.getElementById('chat-input');
      console.log(`[DEBUG ${debugId}] Removed input field event listeners`);
    }
    
    // Clear chat button
    if (elements.clearChatBtn) {
      if (this.clearChatHandler) {
        elements.clearChatBtn.removeEventListener('click', this.clearChatHandler);
      }
      elements.clearChatBtn.replaceWith(elements.clearChatBtn.cloneNode(true));
      console.log(`[DEBUG ${debugId}] Removed clear chat button event listeners`);
    }
    
    // Dark mode toggle
    if (elements.darkModeToggle) {
      if (this.darkModeHandler) {
        elements.darkModeToggle.removeEventListener('click', this.darkModeHandler);
      }
      elements.darkModeToggle.replaceWith(elements.darkModeToggle.cloneNode(true));
      console.log(`[DEBUG ${debugId}] Removed dark mode toggle event listeners`);
    }
    
    // Logout button
    if (elements.logoutBtn) {
      if (this.logoutHandler) {
        elements.logoutBtn.removeEventListener('click', this.logoutHandler);
      }
      elements.logoutBtn.replaceWith(elements.logoutBtn.cloneNode(true));
      console.log(`[DEBUG ${debugId}] Removed logout button event listeners`);
    }
    
    // Remove resize event listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      console.log(`[DEBUG ${debugId}] Removed window resize event listener`);
    }
    
    // Clear all handler references
    this.sendHandler = null;
    this.keydownHandler = null;
    this.inputHandler = null;
    this.clearChatHandler = null;
    this.darkModeHandler = null;
    this.logoutHandler = null;
    this.exportNotesHandler = null;
    this.resizeHandler = null;
    
    console.log(`[DEBUG ${debugId}] Removed all event listeners`);
  }

  /**
   * Handle send message event with improved error handling and animation
   */
  async handleSendMessage() {
    // Get message from input field
    const userMessage = this.inputField.value.trim();
    if (!userMessage) return;
    
    // Clear input field and adjust height
    this.inputField.value = '';
    this.adjustTextareaHeight();
    
    // Disable send button during processing
    this.sendButton.disabled = true;
    
    // Hide chat intro if visible - use more direct approach
    const chatIntro = document.getElementById('chat-intro');
    if (chatIntro) {
      chatIntro.style.display = 'none';
      // Also remove it from the DOM to ensure it's gone
      if (chatIntro.parentNode) {
        chatIntro.parentNode.removeChild(chatIntro);
      }
    }
    
    // Add user message to chat interface immediately
    this.addMessageToChat({
      role: 'user',
      content: userMessage
    });
    
    // 立即显示打字指示器，不等待任何处理
    const assistantTypingElement = this.showTypingIndicator();
    
    // Set processing state
    this.isProcessing = true;
    
    // Wait for the subtitle collection to be completed, but do not display a prompt message.
    try {
      // Wait for subtitle collection to complete, do not display any prompt messages
      const subtitlesCollected = await this.collectSubtitlesInBackground();
      
      // If subtitle collection fails, do not display warning messages, only log
      if (!subtitlesCollected) {
        console.log('[WARN] Could not collect subtitles, but will proceed with the request');
      }
    } catch (error) {
      console.error('[ERROR] Background subtitle collection failed:', error);
    }
    
    try {
      // Always directly fetch the latest subtitle data from browser storage - do not depend on previous results
      // This ensures we always use the latest subtitles for the current video, regardless of when the video changes
      let currentSubtitles = [];
      let currentVideoTitle = '';
      let currentVideoId = '';
      let videoChanged = false;
      
      // Fetch current video info and subtitles from browser storage
      console.log('[INFO] Fetching latest video info and subtitles from browser storage');
      const storageData = await browser.storage.local.get(['currentSubtitles', 'currentVideoInfo']);
      
      // Process subtitle data
      if (storageData.currentSubtitles && Array.isArray(storageData.currentSubtitles)) {
        currentSubtitles = storageData.currentSubtitles
          .filter(subtitle => subtitle && (typeof subtitle === 'object' || typeof subtitle === 'string'))
          .map(subtitle => {
            if (typeof subtitle === 'object' && subtitle !== null && subtitle.text) {
              return subtitle;
            }
            if (typeof subtitle === 'string') {
              return { text: subtitle };
            }
            return { text: String(subtitle) };
          });
        
        console.log('[INFO] Found subtitles in storage:', currentSubtitles.length);
        if (currentSubtitles.length > 0) {
          console.log('[DEBUG] First subtitle:', JSON.stringify(currentSubtitles[0]));
        }
      } else {
        console.log('[WARN] No subtitles found in storage or invalid format');
      }
      
      // Process video info data
      if (storageData.currentVideoInfo) {
        currentVideoId = storageData.currentVideoInfo.videoId;
        currentVideoTitle = storageData.currentVideoInfo.title || '';
        
        console.log('[INFO] Current video info:', currentVideoId, currentVideoTitle);
        
        // Check if video has changed
        if (this.lastVideoId && this.lastVideoId !== currentVideoId && currentVideoId) {
          console.log('[INFO] Video changed from', this.lastVideoId, 'to', currentVideoId);
          videoChanged = true;
          
          // When video changes, add a system message to inform user
          this.addMessageToChat({
            role: 'system',
            content: `You have switched to a new video: ${currentVideoTitle}`
          });
        } else if (!this.lastVideoId && currentVideoId) {
          // First time setting video ID
          console.log('[INFO] First video detected:', currentVideoId);
          videoChanged = true;
          
          // Also add system message when first video is detected
          this.addMessageToChat({
            role: 'system',
            content: `You have switched to a new video: ${currentVideoTitle}`
          });
        }
        
        // Update lastVideoId - ensure always updated, even if video doesn't change
        if (currentVideoId) {
          this.lastVideoId = currentVideoId;
          console.log('[INFO] Updated lastVideoId to:', currentVideoId);
        }
      }
      
      // Initialize AbortController for canceling request
      this.currentRequest = new AbortController();
      
      // Ensure URL format is correct
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
      
      // Check if API URL exists
      if (!baseUrl) {
        console.error('[ERROR] API URL not set, cannot send request');
        throw new Error('API connection not configured, please check backend settings');
      }
      
      // Log video change status
      console.log('[INFO] Video change detected:', videoChanged ? 'YES' : 'NO');
      
      // Select API endpoint based on current chat mode
      let endpoint;
      if (this.chatModeManager && this.chatModeManager.getCurrentMode() === 'accumulate') {
        endpoint = `${baseUrl}/ai/chat-completion/`;
        console.log('[INFO] Using accumulate mode endpoint:', endpoint);
      } else {
        endpoint = `${baseUrl}/ai/chat-completion-default/`;
        console.log('[INFO] Using default mode endpoint:', endpoint);
        
        // If not accumulate mode, clear chat history but keep system messages
        if (videoChanged) {
          console.log('[INFO] Video changed in default mode, clearing chat history except system messages');
          this.chatHistory = this.chatHistory.filter(msg => msg.role === 'system');
        }
      }
      
      // Log current endpoint
      const currentMode = this.chatModeManager ? this.chatModeManager.getCurrentMode() : 'default';
      console.log('[INFO] Using endpoint for mode:', currentMode, endpoint);
      
      // Check if subtitles should be sent - we always send now
      console.log('[INFO] Will send subtitles, count:', currentSubtitles.length);
      
      // Prepare request body - always include latest subtitles
      const requestBody = {
        message: userMessage,
        history: this.chatHistory.slice(-10), // Only send last 10 chat messages
        subtitles: currentSubtitles, // Always send current subtitles
        videoTitle: currentVideoTitle,
        videoId: currentVideoId,
        userId: this.userId || 'anonymous' // Ensure sending user ID
      };
      
      // Log request information
      console.log('[INFO] Sending request with:', {
        videoId: currentVideoId,
        subtitlesCount: currentSubtitles.length,
        videoChanged: videoChanged,
        historyCount: this.chatHistory.length
      });
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.authToken}`
        },
        body: JSON.stringify(requestBody),
        signal: this.currentRequest.signal // Add signal for cancelling request
      });
      
      // Log whether subtitles were included in the request
      console.log(`[INFO] Subtitles included in request: ${currentSubtitles.length > 0 ? 'Yes' : 'No'}`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // 使用之前创建的元素
      const messageElement = assistantTypingElement;
      let contentElement = messageElement.querySelector('.message-content');
      
      // 显示助手头像和三个点动画
      // Stream reading loop
      let chunkBuffer = '';
      let updateInterval = 50; // Update interval reduced to 50ms for smoother display
      let lastUpdateTime = 0;
      
      let fullContent = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        // Decode data chunk
        const chunk = decoder.decode(value, { stream: true });
        chunkBuffer += chunk;
        
        // Process any complete data chunks
        if (chunkBuffer.includes('\n\n')) {
          // Split data into events
          const parts = chunkBuffer.split('\n\n');
          
          // Save the last incomplete part, if any
          chunkBuffer = parts.pop() || '';
          
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              try {
                const data = JSON.parse(part.slice(6));
                
                // Check for errors
                if (data.error) {
                  throw new Error(data.error);
                }
                
                // If there's content, add to message
                if (data.content) {
                  // Add to full content
                  fullContent += data.content;
                  
                  // Throttle UI updates to prevent flickering
                  const now = Date.now();
                  if (now - lastUpdateTime > updateInterval) {
                    // 移除三个点动画，替换为实际内容
                    const dotsContainer = contentElement.querySelector('.typing-dots');
                    if (dotsContainer) {
                      contentElement.innerHTML = this.renderMarkdown(fullContent);
                    } else {
                      // 已经显示了内容，继续更新
                      contentElement.innerHTML = this.renderMarkdown(fullContent);
                    }
                    
                    lastUpdateTime = now;
                    
                    // Always keep a small update interval to make the streaming effect more visible
                    updateInterval = fullContent.length > 2000 ? 100 : 50;
                    
                    // Scroll to bottom if near bottom
                    const isNearBottom = this.messagesContainer.scrollHeight - this.messagesContainer.scrollTop - this.messagesContainer.clientHeight < 150;
                    if (isNearBottom) {
                      this.scrollToBottom(fullContent.length > 500);
                    }
                  }
                }
                
                // When complete, save to chat history
                if (data.done) {
                  // Final update to ensure all content is displayed
                  contentElement.innerHTML = this.renderMarkdown(fullContent);
                  
                  // Save to chat history
                  this.chatHistory.push({
                    role: 'assistant',
                    content: fullContent
                  });
                  
                  // Save chat history
                  this.saveChatHistory();
                  
                  // Trigger API request completed event, used to update video list
                  document.dispatchEvent(new CustomEvent('apiRequestCompleted'));
                  console.log('[INFO] API request completed event triggered');
                }
              } catch (error) {
                console.error('[ERROR] Error parsing server data:', error);
                contentElement.textContent = 'Sorry, an error occurred while processing the response.';
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[ERROR] Error sending message or processing response:', error);
      
      // Show error message with helpful information
      this.hideTypingIndicator();
      
      this.addMessageToChat({
        role: 'assistant',
        content: `Sorry, an error occurred: ${error.message}\n\nPlease try again later or contact support if the issue persists.`
      });
    } finally {
      // Reset processing state
      this.isProcessing = false;
      this.currentRequest = null;
      
      // Re-enable the send button
      this.sendButton.disabled = false;
      
      // Ensure typing indicator is hidden in all cases
      this.hideTypingIndicator();
    }
  }

  /**
   * Add message to chat interface with enhanced animation
   */
  addMessageToChat(message) {
    // Ensure message has a valid role
    if (!message.role) {
      message.role = 'system';
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.role}-message message-appear`;
    
    // Only add avatar for non-system messages
    if (message.role !== 'system') {
      const avatarElement = document.createElement('div');
      avatarElement.className = 'message-avatar';
      avatarElement.textContent = message.role === 'user' ? 'U' : 'D';
      messageElement.appendChild(avatarElement);
    }
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    // Use renderMarkdown function to process Markdown format
    contentElement.innerHTML = this.renderMarkdown(message.content);
    
    messageElement.appendChild(contentElement);
    
    this.messagesContainer.appendChild(messageElement);
    
    // Record message in history if not already present
    if (!this.chatHistory.some(m => m.role === message.role && m.content === message.content)) {
      this.chatHistory.push(message);
    }
    
    // Scroll to bottom
    this.scrollToBottom();
  }

  /**
   * Show typing indicator with enhanced animation
   */
  showTypingIndicator() {
    // 创建一个只有头像的助手消息元素
    const messageElement = document.createElement('div');
    messageElement.className = 'message assistant-message';
    messageElement.id = 'assistant-typing'; // 添加ID方便后续查找
    
    // 添加头像
    const avatarElement = document.createElement('div');
    avatarElement.className = 'message-avatar';
    avatarElement.textContent = 'D';
    
    // 添加消息内容容器
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content message-appear';
    
    // 创建打字指示器（三个点动画）
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'typing-dots';
    
    // 创建三个动画点
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'typing-dot';
      dotsContainer.appendChild(dot);
    }
    
    // 组装元素
    contentElement.appendChild(dotsContainer);
    messageElement.appendChild(avatarElement);
    messageElement.appendChild(contentElement);
    
    // 立即添加到DOM中
    this.messagesContainer.appendChild(messageElement);
    
    // 存储元素引用
    this.typingIndicator = messageElement;
    
    // 滚动到底部
    this.scrollToBottom(true);
    
    console.log('[INFO] Assistant typing indicator displayed');
    return messageElement;
  }

  /**
   * Hide typing indicator with smooth transition
   */
  hideTypingIndicator() {
    // 由于我们使用相同的元素来显示内容，不再需要移除元素
    // 只需要清除引用
    this.typingIndicator = null;
    
    // 移除所有孤立的指示器元素（以防万一）
    const indicators = document.querySelectorAll('#assistant-typing:empty');
    indicators.forEach(indicator => {
      if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
  }

  /**
   * Scroll to chat window bottom
   * @param {boolean} smooth - Whether to use smooth scrolling
   */
  scrollToBottom(smooth = false) {
    if (this.messagesContainer) {
      if (smooth) {
        // Smooth scroll using scrollTo API
        this.messagesContainer.scrollTo({
          top: this.messagesContainer.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        // Immediately jump to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
    }
  }

  /**
   * Clear chat history with confirmation
   */
  clearChat() {
    // Use a flag to prevent multiple confirmation dialogs
    if (this.isConfirmingClear) return;
    
    try {
      this.isConfirmingClear = true;
      
      // Check if notification system is available
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        
        // Use notification system to show confirmation dialog with multiple buttons
        notificationSystem.show({
          type: 'warning',
          title: '删除聊天会话',
          message: '确定要删除当前聊天会话吗？此操作将彻底删除服务器上的会话数据，且无法恢复。',
          icon: 'trash',
          // Use new multi-button API
          buttons: [
            {
              text: '删除',
              style: {
                background: '#e53e3e',
                color: 'white'
              },
              onClick: () => {
                this._executeClearChat(true);
              }
            },
            {
              text: '取消',
              style: {
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white'
              },
              onClick: () => {
                // Do nothing, only close notification
                this.isConfirmingClear = false;
              }
            }
          ],
          onClose: () => {
            // Reset flag
            this.isConfirmingClear = false;
          }
        });
      } else {
        // Use original way as fallback
        if (confirm('确定要删除当前聊天会话吗？此操作将彻底删除服务器上的会话数据，且无法恢复。')) {
          this._executeClearChat(true);
        } else {
          this.isConfirmingClear = false;
        }
      }
    } catch (error) {
      console.error('[ERROR] Confirm clear chat failed:', error);
      // Use original way as fallback
      if (confirm('确定要删除当前聊天会话吗？此操作将彻底删除服务器上的会话数据，且无法恢复。')) {
        this._executeClearChat(true);
      } else {
        this.isConfirmingClear = false;
      }
    }
  }
  
  /**
   * Execute clear chat operation (no confirmation required)
   * @param {boolean} deleteServerSession - Whether to delete server session
   * @private
   */
  async _executeClearChat(deleteServerSession = false) {
    try {
      // If need to delete server session
      if (deleteServerSession) {
        console.log('[INFO] Deleting server session...');
        
        // Get base URL
        const baseUrl = this.getApiBaseUrl();
        if (!baseUrl) {
          console.error('[ERROR] Unable to determine API base URL');
          throw new Error('Unable to determine API base URL');
        }
        
        // 使用delete端点，真正删除会话而不是结束会话
        const deleteSessionUrl = `${baseUrl}/chat/session/delete/`;
        console.log('[INFO] Deleting chat session at:', deleteSessionUrl);
        
        const response = await fetch(deleteSessionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${this.authToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to delete session: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[INFO] Server session completely deleted:', data);
      }
      
      // Clear chat container
      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = '';
        
        // Restore chat intro
        this.messagesContainer.innerHTML = `
          <div class="chat-intro" id="chat-intro">
            <div class="intro-icon">
              <i class="bi bi-chat-dots"></i>
            </div>
            <h3>Déjà Vocab AI</h3>
            <p>视频哪里不理解啦，随时问我</p>
          </div>
        `;
        
        // Re-assign chat intro element
        this.chatIntro = document.getElementById('chat-intro');
      }
      
      // Clear chat history array
      this.chatHistory = [];
      
      // Reset tracked subtitle status
      this.currentSubtitles = null;
      
      // Reset the flag
      this.isConfirmingClear = false;
      
      console.log('[INFO] Chat history cleared');
    } catch (error) {
      console.error('[ERROR] Execute clear chat failed:', error);
      
      // Show error notification
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: 'Operation Failed',
          message: 'Failed to clear chat history',
          icon: 'exclamation-triangle',
          autoClose: true
        });
      }
      
      // Reset the flag
      this.isConfirmingClear = false;
    }
  }

  /**
   * Load chat history with improved error handling
   */
  async loadChatHistory() {
    try {
      // Load chat history from local storage
      console.log('[INFO] Loading chat history from local storage');
      
      const browser = window.browser || window.chrome;
      const data = await browser.storage.local.get(['chatHistory']);
      
      if (data.chatHistory && Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
        this.chatHistory = data.chatHistory;
        this.renderChatHistory();
        console.log('[INFO] Loaded', this.chatHistory.length, 'messages from storage');
      } else {
        console.log('[INFO] No chat history found in storage');
      }
    } catch (error) {
      console.error('[ERROR] Error loading chat history:', error);
    }
  }

  /**
   * Save chat history with chunking for large histories
   */
  async saveChatHistory() {
    try {
      // Limit history size if it gets too large
      if (this.chatHistory.length > 100) {
        this.chatHistory = this.chatHistory.slice(-100);
      }
      
      await browser.storage.local.set({
        chatHistory: JSON.stringify(this.chatHistory)
      });
    } catch (error) {
      console.error('[ERROR] Error saving chat history:', error);
    }
  }

  /**
   * Auto-adjust input field height
   */
  adjustTextareaHeight() {
    if (!this.inputField) return;
    
    // Reset height
    this.inputField.style.height = 'auto';
    
    // Set new height based on content, but limit to 120px max
    const newHeight = Math.min(this.inputField.scrollHeight, 120);
    this.inputField.style.height = `${newHeight}px`;
  }

  /**
   * Logout with improved error handling
   */
  async logout() {
    try {
      // Clear authentication data
      await browser.storage.local.remove(['authToken', 'userId', 'username']);
      
      // Refresh page to return to login interface
      window.location.reload();
    } catch (error) {
      console.error('[ERROR] Error logging out:', error);
      alert('Error logging out. Please try again.');
    }
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    // Load dark mode setting
    await this.loadDarkModeSetting();
    
    // Initialize chat mode manager - use singleton pattern
    this.chatModeManager = ChatModeManager.getInstance({
      // Provide callback function
      onModeChange: (mode) => {
        console.log('[INFO] Chat mode changed to:', mode);
      },
      // Provide add system message method
      addSystemMessage: (content) => {
        this.addMessageToChat({
          role: 'system',
          content: content
        });
      },
      // Provide clear chat history method
      clearChatHistory: () => {
        // Keep the latest system message (if any)
        const systemMessages = this.chatHistory.filter(msg => msg.role === 'system');
        const latestSystemMessage = systemMessages.length > 0 ? systemMessages[systemMessages.length - 1] : null;
        
        // Clear history
        this.chatHistory = [];
        
        // If necessary, keep the latest system message
        if (latestSystemMessage) {
          this.chatHistory.push(latestSystemMessage);
        }
        
        // Clear chat interface
        if (this.messagesContainer) {
          // Keep any ongoing typing animation
          const typingIndicator = this.messagesContainer.querySelector('.typing-indicator');
          this.messagesContainer.innerHTML = '';
          if (typingIndicator) {
            this.messagesContainer.appendChild(typingIndicator);
          }
        }
        
        console.log('[INFO] Chat history cleared for default mode');
      },
      // Provide export session method
      exportChatSession: async () => {
        console.log('[INFO] Automatically triggered export session');
        // Use ChatUI's export method
        return this.exportChatSession();
      },
      // Provide clear server session method
      clearServerSession: async () => {
        console.log('[INFO] Automatically triggered clear server session');
        // Use ChatUI's clear server session method
        return this.clearServerSession();
      },
      // Provide end server session method
      endServerSession: async () => {
        console.log('[INFO] Automatically triggered end server session');
        // Use ChatUI's end server session method
        return this.endServerSession();
      }
    });
    
    // Set check chat history callback
    this.chatModeManager.setCheckChatHistoryCallback(async () => {
      // Check if there is valid chat history
      // Filter out system messages, only count user and AI messages
      const meaningfulMessages = this.chatHistory.filter(msg => 
        msg.role === 'user' || msg.role === 'ai'
      );
      
      // If there are meaningful messages, consider it as having chat history
      const hasChatHistory = meaningfulMessages.length > 0;
      console.log('[INFO] Checking chat history status:', 
        hasChatHistory ? 'has chat history, can export' : 'no chat history, will skip export'
      );
      
      return hasChatHistory;
    });
    
    // Initialize mode manager
    await this.chatModeManager.initialize();
  }

  /**
   * Render chat history to the interface
   */
  renderChatHistory() {
    if (!this.messagesContainer || !this.chatHistory || this.chatHistory.length === 0) {
      return;
    }
    
    // Clear message container
    this.messagesContainer.innerHTML = '';
    
    // Add all messages to interface
    this.chatHistory.forEach(msg => {
      // Create message element
      const messageEl = document.createElement('div');
      
      // Set class name, ensure system messages use the same class name as addMessageToChat
      if (msg.role === 'system') {
        messageEl.className = 'message system-message message-appear';
      } else {
        messageEl.className = `message ${msg.role}-message message-appear`;
      }
      
      // Add avatar element (same as addMessageToChat)
      if (msg.role !== 'system') {
        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-avatar';
        avatarEl.textContent = msg.role === 'user' ? 'U' : 'D';
        messageEl.appendChild(avatarEl);
      }
      
      // Create content element
      const contentEl = document.createElement('div');
      contentEl.className = 'message-content';
      
      // Render Markdown content
      contentEl.innerHTML = this.renderMarkdown(msg.content);
      
      // Add to message element
      messageEl.appendChild(contentEl);
      
      // Add to message container
      this.messagesContainer.appendChild(messageEl);
    });
    
    // Scroll to bottom
    this.scrollToBottom(false);
    
    // Hide chat intro if there is chat history
    const chatIntro = document.getElementById('chat-intro');
    if (chatIntro && this.chatHistory.length > 0) {
      chatIntro.style.display = 'none';
    }
    
    console.log('[INFO] Rendered chat history with', this.chatHistory.length, 'messages');
  }

  /**
   * Handle video info update event
   */
  async handleVideoInfoUpdated(event) {
    console.log('[INFO] Detected video info update event');
    if (!event || !event.detail) {
      console.warn('[WARN] Invalid video update event, missing detail');
      return;
    }
    
    const newVideoInfo = event.detail;
    const newVideoId = newVideoInfo.videoId;
    const oldVideoId = this.lastVideoId;
    
    if (newVideoId && oldVideoId !== newVideoId) {
      console.log('[INFO] Video changed in event handler from', oldVideoId, 'to', newVideoId);
      this.lastVideoId = newVideoId;
      
      // Add system message to notify user about video change
      if (newVideoInfo.title) {
        this.addMessageToChat({
          role: 'system',
          content: `You have switched to the new video: ${newVideoInfo.title}`
        });
      }
      
      // Wait for a short period to ensure subtitles are stored in local storage
      setTimeout(async () => {
        try {
          // Immediately retrieve latest subtitles from storage
          const subtitlesData = await browser.storage.local.get(['currentSubtitles']);
          if (subtitlesData.currentSubtitles && Array.isArray(subtitlesData.currentSubtitles)) {
            console.log('[INFO] Retrieved updated subtitles after video change, count:', subtitlesData.currentSubtitles.length);
            
            // Send an empty message to backend to update context
            if (this.authToken && this.apiUrl) {
              const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
              const endpoint = `${baseUrl}/ai/chat-completion-default/`;
              
              // Filter valid subtitles
              const validSubtitles = subtitlesData.currentSubtitles.filter(s => s && typeof s === 'object' && s.text);
              
              try {
                const response = await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${this.authToken}`
                  },
                  body: JSON.stringify({
                    message: "",  // Empty message, just to update context
                    videoId: newVideoId,
                    videoTitle: newVideoInfo.title || '',
                    subtitles: validSubtitles,
                    userId: this.userId || 'anonymous',
                    updateContextOnly: true  // Tell backend this is just a context update request
                  })
                });
                
                if (response.ok) {
                  console.log('[INFO] Successfully updated video context on backend');
                } else {
                  console.warn('[WARN] Failed to update video context:', response.status);
                }
              } catch (error) {
                console.error('[ERROR] Error updating video context:', error);
              }
            }
          } else {
            console.warn('[WARN] No updated subtitles found after video change');
          }
        } catch (error) {
          console.error('[ERROR] Error retrieving updated subtitles:', error);
        }
      }, 1000); // Wait for 1 second to ensure subtitles are stored
    }
  }

  /**
   * Initialize chat UI
   */
  async initialize() {
    // Prevent multiple initializations
    if (this.initialized) {
      console.warn('[WARN] ChatUI already initialized, skipping');
      return;
    }
    
    // Set initialization flag
    this.initialized = true;
    
    // Add video change detection listener
    document.addEventListener('youtube-video-info-updated', this.handleVideoInfoUpdated.bind(this));
    
    console.log('[INFO] ChatUI initialized with API URL:', this.apiUrl);
  }
  
  /**
   * Get API base URL
   * @returns {string} API base URL
   */
  getApiBaseUrl() {
    try {
      // Only return local development environment URL
      return 'https://dejavocab.com/api';
    } catch (error) {
      console.error('[ERROR] Failed to get API base URL:', error);
      return 'https://dejavocab.com/api'; // Even if it fails, return the local URL
    }
  }

  /**
   * End server session without deleting it (preserve history with summary)
   * Used when switching from accumulate mode to default mode
   * @returns {Promise<boolean>} True if success, false otherwise
   */
  async endServerSession() {
    try {
      console.log('[INFO] Ending server session for mode switch (preserving history)...');
      
      // Get base URL
      const baseUrl = this.getApiBaseUrl();
      if (!baseUrl) {
        console.error('[ERROR] Unable to determine API base URL');
        throw new Error('Unable to determine API base URL');
      }
      
      // 使用end-session端点，结束会话并保存历史
      const endSessionUrl = `${baseUrl}/chat/end-session/`;
      console.log('[INFO] Ending chat session at:', endSessionUrl);
      
      // Send API request to end the session
      const response = await fetch(endSessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to end session: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[INFO] Server session ended and saved with summary:', data);
      return true;
    } catch (error) {
      console.error('[ERROR] End server session request failed:', error);
      return false;
    }
  }

  /**
   * Clear server session by completely deleting it (no preservation)
   * @returns {Promise<boolean>} True if success, false otherwise
   */
  async clearServerSession() {
    try {
      console.log('[INFO] Clearing server session...');
      
      // Get base URL
      const baseUrl = this.getApiBaseUrl();
      if (!baseUrl) {
        console.error('[ERROR] Unable to determine API base URL');
        throw new Error('Unable to determine API base URL');
      }
      
      // 使用delete端点，真正删除会话而不是结束会话
      const deleteSessionUrl = `${baseUrl}/chat/session/delete/`;
      console.log('[INFO] Deleting chat session at:', deleteSessionUrl);
      
      // Send API request to end the session
      const response = await fetch(deleteSessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete session: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[INFO] Server session cleared successfully:', data);
      return true;
    } catch (error) {
      console.error('[ERROR] Clear server session request failed:', error);
      return false;
    }
  }

  /**
   * Collect subtitles in the background without blocking the message flow
   * This is done asynchronously so the user can continue interacting with the chat
   */
  async collectSubtitlesInBackground() {
    try {
      // Check current video info and subtitles status
      const storageData = await browser.storage.local.get([
        'currentVideoInfo', 
        'currentSubtitles', 
        'lastSubtitlesVideoId'
      ]);
      
      const currentVideoId = storageData.currentVideoInfo?.videoId;
      const lastSubtitlesVideoId = storageData.lastSubtitlesVideoId;
      
      // Check if there are valid subtitles
      const hasValidSubtitles = storageData.currentSubtitles && 
        Array.isArray(storageData.currentSubtitles) && 
        storageData.currentSubtitles.length > 0;
      
      // Check if the video has changed or if subtitles need to be re-collected
      const videoChanged = currentVideoId && lastSubtitlesVideoId !== currentVideoId;
      
      console.log('[INFO] Subtitle status check:', {
        currentVideoId,
        lastSubtitlesVideoId,
        hasValidSubtitles,
        videoChanged
      });
      
      // 如果已经有有效字幕且视频未改变，直接返回成功
      if (hasValidSubtitles && !videoChanged) {
        console.log('[INFO] Current video already has subtitles, and video has not changed, skipping collection');
        return true;
      }
      
      // 如果没有视频ID，无法收集字幕
      if (!currentVideoId) {
        console.log('[WARN] No current video ID, cannot collect subtitles');
        return false;
      }
      
      // Trigger subtitle collection only when needed
      if (currentVideoId && (!hasValidSubtitles || videoChanged)) {
        console.log('[INFO] Need to collect subtitles, looking for YouTube tab...');
        
        // Asynchronously query tabs containing YouTube
        const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
        
        if (tabs && tabs.length > 0) {
          console.log('[INFO] Found', tabs.length, 'YouTube tabs');
          let collectionTriggered = false;
          
          for (const tab of tabs) {
            try {
              console.log('[DEBUG] Trying to send collect request to tab:', tab.id, tab.url);
              
              // Send message to trigger subtitle collection
              const response = await browser.tabs.sendMessage(tab.id, {
                action: 'collectSubtitles',
                videoId: currentVideoId
              });
              
              console.log('[INFO] Subtitle collection trigger response:', response);
              
              // If any tab successfully triggers subtitle collection, exit loop
              if (response && response.success) {
                console.log('[INFO] Subtitle collection triggered in tab', tab.id);
                
                // Update lastSubtitlesVideoId after successful collection
                await browser.storage.local.set({ lastSubtitlesVideoId: currentVideoId });
                console.log('[INFO] Updated last subtitles video ID:', currentVideoId);
                
                collectionTriggered = true;
                break;
              }
            } catch (error) {
              console.log('[WARN] Failed to trigger subtitle collection in tab:', tab.id, error.message || 'Unknown error');
            }
          }
          
          if (!collectionTriggered) {
            console.log('[WARN] All tabs failed to trigger subtitle collection');
            return false;
          }
          
          // 添加：等待字幕收集完成
          console.log('[INFO] Waiting for subtitles to be collected and stored...');
          
          // 使用轮询检查字幕是否已收集并存储
          const maxAttempts = 20; // 最大尝试次数
          const pollInterval = 500; // 每次检查间隔（毫秒）
          
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            console.log(`[INFO] Waiting for subtitles... Attempt ${attempt + 1}/${maxAttempts}`);
            
            // 等待指定时间
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            // 检查字幕是否已存储在本地
            const updatedStorage = await browser.storage.local.get(['currentSubtitles', 'currentVideoInfo']);
            
            const nowHasSubtitles = updatedStorage.currentSubtitles && 
                                    Array.isArray(updatedStorage.currentSubtitles) && 
                                    updatedStorage.currentSubtitles.length > 0 &&
                                    updatedStorage.currentVideoInfo?.videoId === currentVideoId;
            
            if (nowHasSubtitles) {
              console.log('[INFO] Subtitles successfully collected and stored:', updatedStorage.currentSubtitles.length, 'items');
              return true; // 字幕收集成功
            }
          }
          
          console.log('[WARN] Timed out waiting for subtitles to be collected');
          return false; // 超时，字幕收集失败
        } else {
          console.log('[WARN] No YouTube tabs found, unable to trigger subtitle collection');
          return false;
        }
      } else {
        console.log('[WARN] Unable to determine if subtitle collection is needed');
        return false;
      }
    } catch (error) {
      console.error('[ERROR] Failed to collect subtitles in background:', error);
      return false;
    }
  }
}

// Flag to check if already initialized
let chatInitialized = false;

// Global flag accessible from other modules
window.CHAT_UI_INITIALIZED = window.CHAT_UI_INITIALIZED || false;

// Initialize chat UI
document.addEventListener('DOMContentLoaded', () => {
  // Check for global initialization flag first
  if (window.CHAT_UI_INITIALIZED) {
    console.log('[INFO] Chat UI already initialized globally, skipping initialization');
    return;
  }

  // Check if the chat UI element exists on the page
  const chatContainer = document.getElementById('chat-container');
  if (!chatContainer) {
    console.log('[INFO] Chat container not found, skipping chat UI initialization');
    return;
  }

  // Prevent duplicate initialization
  if (chatInitialized) {
    console.log('[INFO] Chat UI already initialized, skipping duplicate initialization');
    return;
  }
  
  // Mark as initialized both locally and globally
  chatInitialized = true;
  window.CHAT_UI_INITIALIZED = true;
  
  console.log('[INFO] Starting chat UI initialization');
  
  // Check if already logged in
  browser.storage.local.get(['authToken']).then(data => {
    if (data.authToken) {
      // Logged in, initialize chat interface
      // Use singleton pattern to get instance
      const chatUI = ChatUI.getInstance();
      chatUI.init();
    }
  }).catch(error => {
    console.error('[ERROR] Error checking login status:', error);
  });
});

// Expose singleton getter method on window object for other modules
window.getChatUI = () => {
  // Get the ChatUI instance
  const chatUI = ChatUI.getInstance();
  
  // Check if the current page is a YouTube page
  // Note: This function is unreliable in the side panel environment, because the side panel's URL is always side-panel.html
  // We need to use background.js to check the actual URL of the current tab
  const isYouTubePage = async () => {
    try {
      // If we are in a content script environment, we can directly check the URL
      if (window.location.href.includes('youtube.com')) {
        return true;
      }
      
      // If we are in a side panel environment, need to request background code to check
      if (window.location.href.includes('side-panel.html')) {
        try {
          const response = await browser.runtime.sendMessage({ action: 'checkIfYouTube' });
          return response?.isYouTube || false;
        } catch (err) {
          console.error('[ERROR] Error communicating with background script:', err);
          return false;
        }
      }
      
      return false;
    } catch (e) {
      console.error('[ERROR] Error checking page type:', e);
      return false;
    }
  };
  
  // Create a function to check with background script if we're on YouTube
  const checkYouTubeFromBackground = async () => {
    try {
      // For extensions, we may need to query the active tab from the background script
      const response = await browser.runtime.sendMessage({ action: 'checkIfYouTube' });
      return response?.isYouTube || false;
    } catch (e) {
      console.error('[ERROR] Unable to check if on YouTube page:', e);
      return false;
    }
  };
  
  // Re-implement URL monitoring functionality to ensure the chat interface only appears on supported websites (YouTube and dejavocab.com)
  // Note: Even in the side panel environment, we need to check if the current page is a supported website
  if (!window.URL_MONITOR_INITIALIZED && chatUI) {
    window.URL_MONITOR_INITIALIZED = true;
    
    // Use background.js to request the current active tab's URL
    const checkCurrentTab = async () => {
      try {
        // Request background.js to check if the current tab is a supported website
        const response = await browser.runtime.sendMessage({ action: 'checkIfYouTube' });
        console.log('[DEBUG] Checking if current tab is a supported website:', response);
        
        if (response && response.isYouTube) {
          // If it's a supported website and the user is logged in, show the chat interface
          if (chatUI.authToken) {
            console.log('[INFO] User is logged in and on a supported website, showing chat interface');
            chatUI.activateChatView();
          }
        } else {
          // If it's not a supported website, hide the chat interface
          console.log('[INFO] User is not on a supported website, hiding chat interface');
          chatUI.deactivateChatView();
        }
      } catch (error) {
        console.error('[ERROR] Error checking current tab:', error);
      }
    };
    
    // First check
    checkCurrentTab();
    
    // Periodically check the current tab (every second)
    const tabCheckInterval = setInterval(checkCurrentTab, 1000);
    
    // Store interval ID for cleanup
    window.URL_MONITOR_INTERVAL = tabCheckInterval;
    
    console.log('[INFO] Enabled enhanced URL monitoring');
  }
  
  // If not initialized and the container exists, initialize it only on YouTube pages
  if (!window.CHAT_UI_INITIALIZED && document.getElementById('chat-container')) {
    console.log('[INFO] Checking if on a supported website');
    // Check if we're on a YouTube page using various methods
    let onYouTube = isYouTubePage();
    
    if (onYouTube) {
      console.log('[INFO] Initializing chat interface on a supported website');
      try {
        window.CHAT_UI_INITIALIZED = true;
        chatUI.init();
        
        // Directly show chat interface
        setTimeout(async () => {
          try {
            // Check if user is logged in
            const result = await browser.storage.local.get(['authToken']);
            if (result.authToken) {
              console.log('[INFO] User is logged in, showing chat interface');
              chatUI.activateChatView();
            } else {
              console.log('[INFO] User is not logged in, keeping login interface');
            }
          } catch (err) {
            console.error('[ERROR] Error checking user login status:', err);
          }
        }, 500);
        
      } catch (error) {
        console.error('[ERROR] Chat interface initialization failed:', error);
      }
    } else {
      console.log('[INFO] Not on a supported website, not initializing chat interface');
      // Hide the chat container if we're not on YouTube
      const chatContainer = document.getElementById('chat-container');
      if (chatContainer) {
        chatContainer.style.display = 'none';
      }
    }
  } else if (!window.CHAT_UI_INITIALIZED) {
    console.log('[INFO] Chat container not found, but returning ChatUI instance');
  }
  
  return chatUI;
};

// Export ChatUI class
export default ChatUI;
import browser from 'webextension-polyfill';
import './chat-listener.js';  // Import chat listener
import ChatSessionManager from './chat-session-manager.js';  // Import session manager
import ChatStorageManager from './chat-storage-manager.js';  // Import storage manager
import ChatYouTubeManager from './chat-youtube-manager.js';  // Import YouTube manager
import ChatMessageManager from './chat-message-manager.js';  // Import message manager
import ChatStateManager from './chat-state-manager.js';  // Import state manager
import ChatMarkdownManager from './chat-markdown.js';  // Import markdown manager

class ChatUI {
  static instance = null;
  
  static getInstance() {
    if (!ChatUI.instance) {
      ChatUI.instance = new ChatUI();
    }
    return ChatUI.instance;
  }

  constructor() {
    // Internal state
    this.chatHistory = [];
    this.lastVideoId = null;
    this.authToken = null;
    this.userId = null;
    this.username = null;
    this.apiUrl = null;
    this.isConfirmingClear = false;
    this.currentSubtitles = null;
    this.sessionManager = null;  // Initialize session manager
    this.storageManager = null;  // Initialize storage manager
    this.youtubeManager = null;  // Initialize YouTube manager
    this.messageManager = null;  // Initialize message manager
    this.markdownManager = new ChatMarkdownManager(); // Initialize markdown manager
    this.memoryModeEnabled = false; // Initialize memory mode state
    
    // Create a basic state manager with empty config (will be updated in init)
    this.stateManager = new ChatStateManager(); 
    
    // Dom elements
    this.messagesContainer = null;
    this.inputField = null;
    this.sendButton = null;
    this.clearChatHandler = null;
    this.chatIntro = null;    
    // Event handler ID
    this._eventHandlersId = null;
    
    // Flag to prevent multiple storage listeners
    this._hasStorageListener = false;
  }

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
      return;
    }
  }

  async saveDarkModeSetting() {
    try {
      await browser.storage.local.set({ darkMode: this.darkMode });
    } catch (error) {
      return;
    }
  }

  async init() {
    if (this.initialized) {
      return;
    }

    try {
      // Get API URL and environment settings
      const settings = await browser.storage.local.get(['apiUrl', 'environment']);
      const environment = settings.environment || 'production';
      
      // Set default API URL if not stored
      this.apiUrl = settings.apiUrl || 'http://localhost:8000/api/';
      await browser.storage.local.set({ apiUrl: this.apiUrl });
      
      this.environment = environment;
      
      // Get user info
      await this.getUserInfo();
      
      // Get DOM elements
      this.chatContainer = document.getElementById('chat-container');
      this.messagesContainer = document.getElementById('chat-messages');
      this.chatIntro = document.getElementById('chat-intro');
      this.inputField = document.getElementById('chat-input');
      this.sendButton = document.getElementById('send-button');
      
      if (!this.authToken) {
        return;
      }
      
      // Setup state manager with configuration
      this.stateManager.setApiBaseUrl(this.apiUrl);
      this.stateManager.setAuthToken(this.authToken);
      
      // Set up state manager callbacks
      this.stateManager.onMemoryModeChanged = (enabled) => this.updateMemoryModeUI(enabled);
      this.stateManager.onPageTypeChanged = (isYouTube) => {
        if (isYouTube) {
          if (this.authToken) {
            this.stateManager.activateChatView();
          }
        } else {
          this.stateManager.deactivateChatView();
        }
      };
      this.stateManager.onActiveStateChanged = (isActive) => {
      };
      
      // 开始URL监控
      this.stateManager.startUrlMonitoring();
      
      // 加载记忆模式状态
      await this.loadMemoryModeStatus();
      
      // Show chat interface
      this.stateManager.activateChatView();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Setup session manager with configuration
      this.sessionManager = new ChatSessionManager({
        apiBaseUrl: this.apiUrl,
        authToken: this.authToken,
        onSessionEnded: (data) => {
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
        },
        onExportComplete: (data) => {
        }
      });
      
      // Setup storage manager with configuration
      this.storageManager = new ChatStorageManager({
        apiBaseUrl: this.apiUrl,
        authToken: this.authToken,
        onChatHistoryLoaded: (chatHistory) => {
          // Update chat history and render to UI
          this.chatHistory = chatHistory;
          this.renderChatHistory();
        },
        onChatHistoryCleared: () => {
          // Clear chat container
          if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
            
            // Reset chat history array
            this.chatHistory = [];
          }
        }
      });
      
      // Setup YouTube manager with configuration
      this.youtubeManager = new ChatYouTubeManager({
        apiBaseUrl: this.apiUrl,
        authToken: this.authToken,
        userId: this.userId,
        onVideoChanged: (videoInfo) => {
          if (videoInfo.title) {
            this.addMessageToChat({
              role: 'system',
              content: `您已切换到新视频: ${videoInfo.title}`
            });
          }
        },
        onSubtitlesCollected: (subtitles) => {
          this.currentSubtitles = subtitles;
        }
      });
      
      // Setup message manager with configuration
      this.messageManager = new ChatMessageManager({
        apiBaseUrl: this.apiUrl,
        authToken: this.authToken,
        userId: this.userId,
        onMessageAdded: (message) => {
          this.addMessageToChat(message);
        },
        onTypingStart: () => {
          // Return the typing indicator element for updates
          return this.showTypingIndicator();
        },
        onTypingEnd: () => {
          this.hideTypingIndicator();
        },
        onError: (errorMessage) => {
          this.addMessageToChat({
            role: 'assistant',
            content: this.markdownManager.renderMarkdown(errorMessage)
          });
        },
        renderMarkdown: (text) => this.markdownManager.renderMarkdown(text),
        scrollToBottom: (smooth) => this.scrollToBottom(smooth)
      });
      
      // Load settings
      await this.loadSettings();
      
      // Load chat history
      await this.loadChatHistory();
      
      // Set up storage change listener
      this.setupStorageChangeListener();
      
      // Mark this instance as initialized
      this.initialized = true;
    } catch (error) {
      return;
    }
  }
  
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    // Set up message listener for receiving subtitle text
    this.setupSubtitleMessageListener();
    
    // Add video change detection listener
    document.addEventListener('youtube-video-info-updated', this.handleVideoInfoUpdated.bind(this));
    
    this.initialized = true;
  }
  
  setupStorageChangeListener() {
    if (this._hasStorageListener) {
      return;
    }
    
    const self = this; // Save this reference
    
    // Add title cache mapping, used to record the title corresponding to each video ID
    if (!this.videoTitleCache) {
      this.videoTitleCache = new Map();
    }
    
    // Create listener function and store reference for potential cleanup
    this._storageChangeListener = async (changes, areaName) => {
      if (areaName === 'local') {
        // Check for video info changes
        if (changes.currentVideoInfo) {
          try {
            // Get complete new and old values
            const newValue = changes.currentVideoInfo.newValue;
            const oldValue = changes.currentVideoInfo.oldValue;
            
            if (!newValue) {
              return;
            }
            
            // Extract video ID and title
            const newVideoId = newValue.videoId;
            
            // If no video ID, ignore this update
            if (!newVideoId) {
              return;
            }
            
            // If video ID hasn't changed, do nothing
            if (newVideoId === self.lastVideoId) {
              return;
            }
            
            // If first load (no history lastVideoId)
            if (self.isFirstVideoLoad) {
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
            let accurateTitle = await self.getYouTubeVideoTitle(newVideoId);
            
            // If cannot get new title, fallback to storage data
            if (!accurateTitle && newValue.title) {
              accurateTitle = newValue.title;
            }
            
            // Update title cache
            self.videoTitleCache.set(newVideoId, accurateTitle);
            
            // Update internal video ID record (first update ID, then add message and render)
            self.lastVideoId = newVideoId;
            
            // Render history messages first
            self.renderChatHistory();
            
            // Then add system message (so it doesn't get overwritten by rendering history)
            self.addMessageToChat({
              role: 'system',
              content: `您已切换到新视频: ${accurateTitle || newVideoId}`
            });

            
          } catch (error) {
            return;
          }
        }
        
        // Check for pending subtitle text from background
        if (changes.pendingSubtitleText) {
          const subtitleText = changes.pendingSubtitleText.newValue;
          if (subtitleText) {
            console.log('[CHAT-UI] Received subtitle text from storage:', subtitleText);
            this.setSubtitleTextInInput(subtitleText);
            
            // Clear the pending subtitle to avoid duplicates
            try {
              await browser.storage.local.remove(['pendingSubtitleText', 'pendingSubtitleTimestamp']);
            } catch (error) {
              console.error('[CHAT-UI] Error clearing pending subtitle:', error);
            }
          }
        }
      }
    };
    
    // Add listener
    browser.storage.onChanged.addListener(this._storageChangeListener);
    
    // Mark as having a listener
    this._hasStorageListener = true;
  }

  async getYouTubeVideoTitle(videoId) {
    try {
      // Update YouTube manager settings
      this.youtubeManager.setApiBaseUrl(this.getApiBaseUrl());
      this.youtubeManager.setAuthToken(this.authToken);
      this.youtubeManager.setUserId(this.userId);
      
      // Use YouTube manager to get video title
      return await this.youtubeManager.getYouTubeVideoTitle(videoId);
    } catch (error) {
      return '';
    }
  }

  async getUserInfo() {
    try {
      // Get authentication data from storage
      const authData = await browser.storage.local.get(['authToken', 'userId', 'username']);
      this.authToken = authData.authToken;
      this.userId = authData.userId;
      this.username = authData.username;
      
      if (!this.authToken) {
        return;
      }
    } catch (error) {
      return;
    }
  }

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
    
    // Show typing indicator immediately after user message
    const typingElement = this.showTypingIndicator();
    
    // Set up message manager
    this.messageManager.setApiBaseUrl(this.getApiBaseUrl());
    this.messageManager.setAuthToken(this.authToken);
    this.messageManager.setUserId(this.userId);
    this.messageManager.setLastVideoId(this.lastVideoId);
    
    try {
      // Wait for subtitle collection to complete in background
      console.log('[INFO] Collecting subtitles in background...');
      await this.collectSubtitlesInBackground();
      
      // Get latest subtitle data from browser storage
      let currentSubtitles = [];
      let currentVideoTitle = '';
      let currentVideoId = '';
      
      // Fetch current video info and subtitles from browser storage
      const storageData = await browser.storage.local.get([
        'currentSubtitles', 
        'currentVideoInfo', 
        'lastSubtitlesVideoId'
      ]);
      
      // Process subtitle data
      if (storageData.currentSubtitles && 
          Array.isArray(storageData.currentSubtitles) && 
          storageData.currentSubtitles.length > 0) {
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
      }
      
      // Process video info data
      if (storageData.currentVideoInfo) {
        currentVideoId = storageData.currentVideoInfo.videoId;
        currentVideoTitle = storageData.currentVideoInfo.title || '';
        
        // Update lastVideoId if needed
        if (currentVideoId) {
          this.lastVideoId = currentVideoId;
        }
      }
      
      // Send message via message manager
      await this.messageManager.handleSendMessage(
        userMessage,
        this.chatHistory,
        {
          subtitles: currentSubtitles,
          videoId: currentVideoId,
          videoTitle: currentVideoTitle
        },
        typingElement // Pass the existing typing indicator
      );
      
    } catch (error) {
      return;
    } finally {
      // Re-enable the send button
      this.sendButton.disabled = false;
    }
  }

  addMessageToChat(message, messageType = 'normal') {
    if (!this.messagesContainer) return null;
    
    // Handle typing indicator
    if (messageType === 'typing') {
      // Create a message element with only avatar
      const messageElement = document.createElement('div');
      messageElement.className = 'message assistant-message';
      messageElement.id = 'assistant-typing'; // Add ID for later reference
      
      // Add avatar
      const avatarElement = document.createElement('div');
      avatarElement.className = 'message-avatar';
      avatarElement.textContent = 'D';
      
      // Add message content container
      const contentElement = document.createElement('div');
      contentElement.className = 'message-content message-appear';
      
      // Create typing indicator (three dots animation)
      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'typing-dots';
      // Create three animation dots
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        dotsContainer.appendChild(dot);
      }
      
      // Assemble elements
      contentElement.appendChild(dotsContainer);
      messageElement.appendChild(avatarElement);
      messageElement.appendChild(contentElement);
      
      // Add to DOM
      this.messagesContainer.appendChild(messageElement);
      
      // Store element reference
      this.typingIndicator = messageElement;
      
      // Scroll to bottom
      this.scrollToBottom(true);
      
      return messageElement;
    }
    
    // Handle assistant messages
    if (message.role === 'assistant') {
      // Still save to chat history
      if (!message.timestamp) {
        message.timestamp = new Date().toISOString();
        this.chatHistory.push(message);
        this.saveChatHistory();
      }
      
      return null;
    }
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.role}-message`;
    messageElement.classList.add('message-appear');
    
    // Only add avatar for non-system messages
    if (message.role !== 'system') {
      const avatarElement = document.createElement('div');
      avatarElement.className = 'message-avatar';
      avatarElement.textContent = message.role === 'user' ? 'U' : 'D';
      messageElement.appendChild(avatarElement);
    }
    
    // Add message content
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    // Use markdownManager to process Markdown format
    if (message.role === 'system') {
      contentElement.textContent = message.content;
    } else {
      contentElement.innerHTML = this.markdownManager.renderMarkdown(message.content);
    }
    
    messageElement.appendChild(contentElement);
    
    // Add to container
    this.messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    this.scrollToBottom(message.content && message.content.length > 300);
    
    // Save message to chat history
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
      this.chatHistory.push(message);
      this.saveChatHistory();
    }
    
    return messageElement;
  }
  
  showTypingIndicator() {
    return this.addMessageToChat(null, 'typing');
  }

  hideTypingIndicator() {

    this.typingIndicator = null;
    
    const indicators = document.querySelectorAll('#assistant-typing:empty');
    indicators.forEach(indicator => {
      if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
  }

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
      // Use original way as fallback
      if (confirm('确定要删除当前聊天会话吗？此操作将彻底删除服务器上的会话数据，且无法恢复。')) {
        this._executeClearChat(true);
      } else {
        this.isConfirmingClear = false;
      }
    }
  }
  
  async _executeClearChat(deleteServerSession = false) {
    try {
      // Update storage manager settings
      this.storageManager.setApiBaseUrl(this.getApiBaseUrl());
      this.storageManager.setAuthToken(this.authToken);
      
      // Use storage manager to clear chat
      await this.storageManager.clearChat(deleteServerSession);
      
      // Clear chat UI
      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = '';
      }
      
      // Reset chat history
      this.chatHistory = [];
      
      // Show confirmation message
      this.addMessageToChat({
        role: 'system',
        content: '聊天记录已清除',
        timestamp: new Date().toISOString()
      });
      
      // Restore introductory screen if exists
      const introScreen = document.getElementById('chat-intro');
      if (introScreen) {
        introScreen.style.display = 'flex';
      }
      
      // Clear other related states
      this.lastVideoId = '';
      localStorage.removeItem('dejavu_chat_session_state');
      localStorage.removeItem('dejavu_current_video');
    } catch (error) {
      // Show error message
      this.addMessageToChat({
        role: 'system',
        content: '清除聊天记录失败: ' + error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      // Reset flag
      this.isConfirmingClear = false;
    }
  }

  async loadChatHistory() {
    try {
      // Update storage manager settings
      this.storageManager.setApiBaseUrl(this.getApiBaseUrl());
      this.storageManager.setAuthToken(this.authToken);
      
      // Use storage manager to load chat history
      this.chatHistory = await this.storageManager.loadChatHistory();
    } catch (error) {
    }
  }

  async saveChatHistory() {
    try {
      // Update storage manager settings
      this.storageManager.setApiBaseUrl(this.getApiBaseUrl());
      this.storageManager.setAuthToken(this.authToken);
      
      // Use storage manager to save chat history
      await this.storageManager.saveChatHistory(this.chatHistory);
    } catch (error) {
    }
  }

  adjustTextareaHeight() {
    if (!this.inputField) return;
    
    // Reset height
    this.inputField.style.height = 'auto';
    
    // Set new height based on content, but limit to 120px max
    const newHeight = Math.min(this.inputField.scrollHeight, 120);
    this.inputField.style.height = `${newHeight}px`;
  }

  async logout() {
    try {
      // Clear authentication data
      await browser.storage.local.remove(['authToken', 'userId', 'username']);
      
      // Refresh page to return to login interface
      window.location.reload();
    } catch (error) {
      alert('Error logging out. Please try again.');
    }
  }

  async loadSettings() {
    // Load dark mode setting
    await this.loadDarkModeSetting();
    
    // Initialize memory mode status
    await this.loadMemoryModeStatus();
  }

  async loadMemoryModeStatus() {
    try {
      // Check if state manager exists
      if (this.stateManager) {
        // Use state manager to get and apply memory mode status
        const status = await this.stateManager.loadMemoryModeStatus();
        console.log('[INFO] Memory mode status loaded from server:', status);
        return status;
      }
      return false;
    } catch (error) {
      console.error('[ERROR] Failed to load memory mode status:', error);
      return false;
    }
  }

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
      
      // Render Markdown content for non-system messages
      if (msg.role === 'system') {
        contentEl.textContent = msg.content;
      } else {
        contentEl.innerHTML = this.markdownManager.renderMarkdown(msg.content);
      }
      
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
  }

  async handleVideoInfoUpdated(event) {
    try {
      // Update YouTube manager settings
      this.youtubeManager.setApiBaseUrl(this.getApiBaseUrl());
      this.youtubeManager.setAuthToken(this.authToken);
      this.youtubeManager.setUserId(this.userId);
      
      // Use YouTube manager to handle video info update
      await this.youtubeManager.handleVideoInfoUpdated(event);
      
      // Rendering is handled by the callback in the YouTube manager
    } catch (error) {
      return;
    }
  }

  getApiBaseUrl() {
    try {
      // Only return local development environment URL
      return 'http://localhost:8000/api';
    } catch (error) {
      return 'http://localhost:8000/api'; // Even if it fails, return the local URL
    }
  }

  async endServerSession() {
    try {
      // Update session manager settings
      this.sessionManager.setApiBaseUrl(this.getApiBaseUrl());
      this.sessionManager.setAuthToken(this.authToken);
      
      // Call session manager to end session
      return await this.sessionManager.endServerSession();
    } catch (error) {
      return false;
    }
  }

  async clearServerSession() {
    try {
      // Update session manager settings
      this.sessionManager.setApiBaseUrl(this.getApiBaseUrl());
      this.sessionManager.setAuthToken(this.authToken);
      
      // Call session manager to clear session
      return await this.sessionManager.clearServerSession();
    } catch (error) {
      return false;
    }
  }

  async collectSubtitlesInBackground() {
    try {
      // Update YouTube manager settings
      this.youtubeManager.setApiBaseUrl(this.getApiBaseUrl());
      this.youtubeManager.setAuthToken(this.authToken);
      this.youtubeManager.setUserId(this.userId);
      
      // Use YouTube manager to collect subtitles
      return await this.youtubeManager.collectSubtitlesInBackground();
    } catch (error) {
      return false;
    }
  }

  async updateMemoryMode(enabled) {
    try {
      // Use state manager to update memory mode
      return await this.stateManager.updateMemoryModeStatus(enabled);
    } catch (error) {
      return false;
    }
  }

  updateMemoryModeUI(enabled) {
    try {
      // Get the memory mode toggle button
      const memoryButton = document.getElementById('memory-mode-toggle');
      if (!memoryButton) {
        console.warn('[WARNING] Memory mode button not found in DOM');
        return;
      }
      
      console.log('[INFO] Updating memory mode UI to:', enabled ? 'active' : 'inactive');
      
      // Update button UI state
      if (enabled) {
        memoryButton.classList.add('active');
        memoryButton.style.backgroundColor = '#4f46e5'; // Active blue color
        memoryButton.style.color = '#ffffff'; // White text
        
        // Add aria attributes for accessibility
        memoryButton.setAttribute('aria-pressed', 'true');
        memoryButton.title = 'Memory Mode is enabled (click to disable)';
      } else {
        memoryButton.classList.remove('active');
        memoryButton.style.backgroundColor = ''; // Default color
        memoryButton.style.color = ''; // Default text color
        
        // Update aria attributes
        memoryButton.setAttribute('aria-pressed', 'false');
        memoryButton.title = 'Memory Mode is disabled (click to enable)';
      }
      
      // Ensure we store this state locally too
      this.memoryModeEnabled = enabled;
      
    } catch (error) {
      console.error('[ERROR] Failed to update memory mode UI:', error);
    }
  }

  async exportChatSession() {
    try {
      // Show loading prompt
      const exportBtn = document.getElementById('export-notes-btn');
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
      }
      
      // Update session manager settings
      this.sessionManager.setApiBaseUrl(this.getApiBaseUrl());
      this.sessionManager.setAuthToken(this.authToken);
      
      // Call session manager to export session
      await this.sessionManager.exportChatSession();
      
    } catch (error) {
      return;
    } finally {
      // Restore button state
      const exportBtn = document.getElementById('export-notes-btn');
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="bi bi-file-earmark-text"></i> Export Session';
      }
    }
  }

  setupEventListeners() {
    // First remove existing event listeners
    this.removeExistingEventListeners();
    
    // Check if elements exist
    const elements = {
      sendButton: document.getElementById('send-button'),
      inputField: document.getElementById('chat-input'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      darkModeToggle: document.getElementById('dark-mode-toggle'),
      logoutBtn: document.getElementById('logout-btn'),
      memoryModeButton: document.getElementById('memory-mode-toggle') // 添加记忆模式按钮
    };
    
    // Check for old handlers
    const hasOldHandlers = {
      sendHandler: !!this.sendHandler,
      keydownHandler: !!this.keydownHandler,
      clearChatHandler: !!this.clearChatHandler,
      darkModeHandler: !!this.darkModeHandler,
      logoutHandler: !!this.logoutHandler,
      memoryModeHandler: !!this.memoryModeHandler
    };
    
    // Store unique identifier for event handlers
    this._eventHandlersId = Math.random().toString(36).substring(2, 8);
    
    // Send button click event - use a check to ensure only one binding
    if (elements.sendButton && !elements.sendButton._hasClickListener) {
      this.sendHandler = (e) => {
        e.preventDefault();
        this.handleSendMessage();
      };
      elements.sendButton.addEventListener('click', this.sendHandler);
      elements.sendButton._hasClickListener = true;
    }
    
    // Input field keypress event (Enter to send)
    if (elements.inputField && !elements.inputField._hasKeydownListener) {
      this.keydownHandler = (e) => {
        this.adjustTextareaHeight();
        
        // Check for Enter key (without shift) to send message
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
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
    }
    
    // Clear chat button click event
    if (elements.clearChatBtn && !elements.clearChatBtn._hasClickListener) {
      this.clearChatHandler = (e) => {
        e.preventDefault();
        this.clearChat();
      };
      elements.clearChatBtn.addEventListener('click', this.clearChatHandler);
      elements.clearChatBtn._hasClickListener = true;
    }
    
    // Dark mode toggle button click event
    if (elements.darkModeToggle && !elements.darkModeToggle._hasClickListener) {
      this.darkModeHandler = (e) => {
        e.preventDefault();
        this.toggleDarkMode();
      };
      elements.darkModeToggle.addEventListener('click', this.darkModeHandler);
      elements.darkModeToggle._hasClickListener = true;
    }
    
    // Logout button click event
    if (elements.logoutBtn && !elements.logoutBtn._hasClickListener) {
      this.logoutHandler = (e) => {
        e.preventDefault();
        this.logout();
      };
      elements.logoutBtn.addEventListener('click', this.logoutHandler);
      elements.logoutBtn._hasClickListener = true;
    }
    
    // Memory mode button click event
    if (elements.memoryModeButton && !elements.memoryModeButton._hasClickListener) {
      this.memoryModeHandler = async (e) => {
        e.preventDefault();
        
        // 切换按钮的激活状态
        const isActive = elements.memoryModeButton.classList.contains('active');
        const newState = !isActive;
        
        try {
          // 更新按钮UI状态
          if (newState) {
            elements.memoryModeButton.classList.add('active');
            elements.memoryModeButton.style.backgroundColor = '#4f46e5';
            elements.memoryModeButton.style.color = '#ffffff';
          } else {
            elements.memoryModeButton.classList.remove('active');
            elements.memoryModeButton.style.backgroundColor = '';
            elements.memoryModeButton.style.color = '';
          }
          
          // 获取API基础URL
          const baseUrl = this.getApiBaseUrl();
          
          // 构建API请求
          const url = `${baseUrl}/update-memory-mode/`;
          
          // 发送API请求
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'Authorization': this.authToken ? `Token ${this.authToken}` : ''
            },
            body: JSON.stringify({ enabled: newState }),
            credentials: 'include',
          });
          
          if (!response.ok) {
            throw new Error(`更新记忆模式状态失败: ${response.status}`);
          }
          
        } catch (error) {
          // 恢复按钮状态
          if (isActive) {
            elements.memoryModeButton.classList.add('active');
            elements.memoryModeButton.style.backgroundColor = '#4f46e5';
            elements.memoryModeButton.style.color = '#ffffff';
          } else {
            elements.memoryModeButton.classList.remove('active');
            elements.memoryModeButton.style.backgroundColor = '';
            elements.memoryModeButton.style.color = '';
          }
          
          // 显示错误消息
          this.addMessageToChat({
            role: 'system',
            content: `更新记忆模式失败: ${error.message}`
          });
        }
      };
      elements.memoryModeButton.addEventListener('click', this.memoryModeHandler);
      elements.memoryModeButton._hasClickListener = true;
    }
    
    // Resize event for responsive design - Use check to avoid duplicate addition
    if (!window._hasResizeListener) {
      this.resizeHandler = () => {
        this.adjustTextareaHeight();
      };
      window.addEventListener('resize', this.resizeHandler);
      window._hasResizeListener = true;
    }
  }

  removeExistingEventListeners() {
    const elements = {
      sendButton: document.getElementById('send-button'),
      inputField: document.getElementById('chat-input'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      darkModeToggle: document.getElementById('dark-mode-toggle'),
      logoutBtn: document.getElementById('logout-btn'),
      memoryModeButton: document.getElementById('memory-mode-toggle')
    };
    
    // Send button
    if (elements.sendButton) {
      if (this.sendHandler) {
        elements.sendButton.removeEventListener('click', this.sendHandler);
      }
      elements.sendButton.replaceWith(elements.sendButton.cloneNode(true));
      this.sendButton = document.getElementById('send-button');
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
    }
    
    // Clear chat button
    if (elements.clearChatBtn) {
      if (this.clearChatHandler) {
        elements.clearChatBtn.removeEventListener('click', this.clearChatHandler);
      }
      elements.clearChatBtn.replaceWith(elements.clearChatBtn.cloneNode(true));
    }
    
    // Dark mode toggle
    if (elements.darkModeToggle) {
      if (this.darkModeHandler) {
        elements.darkModeToggle.removeEventListener('click', this.darkModeHandler);
      }
      elements.darkModeToggle.replaceWith(elements.darkModeToggle.cloneNode(true));
    }
    
    // Logout button
    if (elements.logoutBtn) {
      if (this.logoutHandler) {
        elements.logoutBtn.removeEventListener('click', this.logoutHandler);
      }
      elements.logoutBtn.replaceWith(elements.logoutBtn.cloneNode(true));
    }
    
    // Memory mode button
    if (elements.memoryModeButton) {
      if (this.memoryModeHandler) {
        elements.memoryModeButton.removeEventListener('click', this.memoryModeHandler);
      }
      elements.memoryModeButton.replaceWith(elements.memoryModeButton.cloneNode(true));
    }
    
    // Remove resize event listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    
    // Clear all handler references
    this.sendHandler = null;
    this.keydownHandler = null;
    this.inputHandler = null;
    this.clearChatHandler = null;
    this.darkModeHandler = null;
    this.logoutHandler = null;
    this.memoryModeHandler = null;
    this.resizeHandler = null;
  }

  /**
   * Set up listener for subtitle messages from background script
   */
  setupSubtitleMessageListener() {
    browser.runtime.onMessage.addListener((message) => {
      if (message && message.action === 'receiveSubtitleText') {
        console.log('[CHAT-UI] Received subtitle text from background:', message.subtitleText);
        this.setSubtitleTextInInput(message.subtitleText);
      }
      return false; // Not handled asynchronously
    });
    
    // Also check if there's a pending subtitle text in storage on initialization
    this.checkPendingSubtitleText();
  }
  
  /**
   * Check if there's a pending subtitle text in storage
   */
  async checkPendingSubtitleText() {
    try {
      const result = await browser.storage.local.get(['pendingSubtitleText']);
      if (result.pendingSubtitleText) {
        console.log('[CHAT-UI] Found pending subtitle text in storage:', result.pendingSubtitleText);
        this.setSubtitleTextInInput(result.pendingSubtitleText);
        
        // Clear the pending subtitle
        await browser.storage.local.remove(['pendingSubtitleText', 'pendingSubtitleTimestamp']);
      }
    } catch (error) {
      console.error('[CHAT-UI] Error checking pending subtitle:', error);
    }
  }
  
  /**
   * Set subtitle text in the chat input field
   * @param {string} text - The subtitle text to set
   */
  setSubtitleTextInInput(text) {
    if (!text) return;
    
    try {
      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        chatInput.value = text;
        chatInput.focus();
        
        // Trigger input event to resize textarea if needed
        const event = new Event('input', { bubbles: true });
        chatInput.dispatchEvent(event);
      }
    } catch (error) {
      console.error('[CHAT-UI] Error setting subtitle text in input:', error);
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
    return;
  }

  // Check if the chat UI element exists on the page
  const chatContainer = document.getElementById('chat-container');
  if (!chatContainer) {
    return;
  }

  // Prevent duplicate initialization
  if (chatInitialized) {
    return;
  }
  
  // Mark as initialized both locally and globally
  chatInitialized = true;
  window.CHAT_UI_INITIALIZED = true;
  
  // Check if already logged in
  browser.storage.local.get(['authToken']).then(data => {
    if (data.authToken) {
      // Logged in, initialize chat interface
      // Use singleton pattern to get instance
      const chatUI = ChatUI.getInstance();
      chatUI.init();
    }
  }).catch(error => {
    return;
  });
});

// Expose singleton getter method on window object for other modules
window.getChatUI = () => {
  // Get the ChatUI instance
  const chatUI = ChatUI.getInstance();
  
  // If state manager exists, use it to initialize
  if (chatUI.stateManager) {
    if (!window.URL_MONITOR_INITIALIZED) {
      chatUI.stateManager.startUrlMonitoring();
    }
    
    // Initialize if we're on a YouTube page
    if (!window.CHAT_UI_INITIALIZED) {
      chatUI.stateManager.initializeIfYouTube();
    }
  } 
  // Otherwise fallback to legacy initialization (for backward compatibility)
  else {
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
            return false;
          }
        }
        
        return false;
      } catch (e) {
        return false;
      }
    };
    
    if (!window.URL_MONITOR_INITIALIZED && chatUI) {
      window.URL_MONITOR_INITIALIZED = true;
      
      // Use background.js to request the current active tab's URL
      const checkCurrentTab = async () => {
        try {
          // Request background.js to check if the current tab is a supported website
          const response = await browser.runtime.sendMessage({ action: 'checkIfYouTube' });
          
          if (response && response.isYouTube) {
            // If it's a supported website and the user is logged in, show the chat interface
            if (chatUI.authToken) {
              chatUI.stateManager.activateChatView();
            }
          } else {
            // If it's not a supported website, hide the chat interface
            chatUI.stateManager.deactivateChatView();
          }
        } catch (error) {
          return;
        }
      };
      
      // First check
      checkCurrentTab();
      
      // Periodically check the current tab (every second)
      const tabCheckInterval = setInterval(checkCurrentTab, 1000);
      
      // Store interval ID for cleanup
      window.URL_MONITOR_INTERVAL = tabCheckInterval;
    }
    
    // If not initialized and the container exists, initialize it only on YouTube pages
    if (!window.CHAT_UI_INITIALIZED && document.getElementById('chat-container')) {
      // Check if we're on a YouTube page using various methods
      let onYouTube = isYouTubePage();
      
      if (onYouTube) {
        try {
          window.CHAT_UI_INITIALIZED = true;
          chatUI.init();
          
          // Directly show chat interface
          setTimeout(async () => {
            try {
              // Check if user is logged in
              const result = await browser.storage.local.get(['authToken']);
              if (result.authToken) {
                chatUI.stateManager.activateChatView();
              } else {
                chatUI.stateManager.deactivateChatView();
              }
            } catch (err) {
              return;
            }
          }, 500);
          
        } catch (error) {
          return;
        }
      } else {
        // Hide the chat container if we're not on YouTube
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
          chatContainer.style.display = 'none';
        }
      }
    } else if (!window.CHAT_UI_INITIALIZED) {
      return;
    }
  }
  
  return chatUI;
};

// Export ChatUI class
export default ChatUI;
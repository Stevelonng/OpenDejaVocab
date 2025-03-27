/**
 * Chat mode manager - Handles chat mode switching
 * Supports two modes:
 * - default: Default mode, resets chat history on video change
 * - accumulate: Accumulation mode, keeps chat history, allowing cross-video context accumulation
 */
class ChatModeManager {
  // Singleton instance
  static instance = null;
  
  /**
   * Get chat mode manager instance (Singleton pattern)
   * @param {Object} config - Configuration object
   * @returns {ChatModeManager} - Chat mode manager instance
   */
  static getInstance(config = {}) {
    if (!ChatModeManager.instance) {
      ChatModeManager.instance = new ChatModeManager(config);
      console.log('[INFO] Created new ChatModeManager instance');
    } else if (config && Object.keys(config).length > 0) {
      // If new configuration provided, update existing instance
      ChatModeManager.instance.updateConfig(config);
      console.log('[INFO] Updated existing ChatModeManager instance');
    }
    return ChatModeManager.instance;
  }
  
  /**
   * Create chat mode manager instance
   * @param {Object} config - Configuration object
   * @param {Function} config.onModeChange - Mode change callback
   * @param {Function} config.addSystemMessage - Add system message method
   * @param {Function} config.clearChatHistory - Clear chat history method
   * @param {Function} config.exportChatSession - Export chat session method
   * @param {Function} config.clearServerSession - Clear server session method
   * @param {Function} config.endServerSession - End server session method
   */
  constructor(config = {}) {
    // Global singleton check
    if (window.CHAT_MODE_MANAGER_INSTANCE) {
      console.log('[INFO] Returning existing ChatModeManager instance');
      return window.CHAT_MODE_MANAGER_INSTANCE;
    }
    
    // Set as global singleton
    window.CHAT_MODE_MANAGER_INSTANCE = this;
    
    // Configuration properties
    this.onModeChange = config.onModeChange || ((mode) => console.log('Mode changed to:', mode));
    this.addSystemMessage = config.addSystemMessage || ((msg) => console.log('System message:', msg));
    this.clearChatHistory = config.clearChatHistory || (() => console.log('Chat history cleared'));
    // Add export session callback
    this.exportChatSession = config.exportChatSession || (() => console.log('Export chat session (not implemented)'));
    // Add clear server session callback
    this.clearServerSession = config.clearServerSession || (() => console.log('Clear server session (not implemented)'));
    // Add end server session callback
    this.endServerSession = config.endServerSession || (() => console.log('End server session (not implemented)'));
    
    // State properties
    this.currentMode = 'default'; // Default to normal mode
    
    // Initialization flags
    this.initialized = false;
    this.eventsInitialized = false;
    
    // Debounce control
    this.isToggling = false;
    
    // Bind methods to instance - Ensure correct this reference in event handlers
    this.initialize = this.initialize.bind(this);
    this.onToggleButtonClick = this.onToggleButtonClick.bind(this);
    this.toggle = this.toggle.bind(this);
    this.loadSavedMode = this.loadSavedMode.bind(this);
    this.saveMode = this.saveMode.bind(this);
    this.updateButtonUI = this.updateButtonUI.bind(this);
    this.sendModeChangeMessage = this.sendModeChangeMessage.bind(this);
    this.getCurrentMode = this.getCurrentMode.bind(this);
    this.bindEvents = this.bindEvents.bind(this);
    this.updateConfig = this.updateConfig.bind(this);
    this.checkHasChatHistory = this.checkHasChatHistory.bind(this);
    this.setCheckChatHistoryCallback = this.setCheckChatHistoryCallback.bind(this);
    this.fetchSessionVideos = this.fetchSessionVideos.bind(this);
    this.updateVideoListUI = this.updateVideoListUI.bind(this);
    this.toggleVideoListVisibility = this.toggleVideoListVisibility.bind(this);
    this.handleFloatingButton = this.handleFloatingButton.bind(this);
    this.createVideoListPanel = this.createVideoListPanel.bind(this);
    this.toggleVideoListPanel = this.toggleVideoListPanel.bind(this);
    
    // Check chat history callback
    this._checkChatHistoryCallback = null;
    
    console.log('[INFO] Created ChatModeManager instance');
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration object
   */
  updateConfig(config) {
    if (config.onModeChange) this.onModeChange = config.onModeChange;
    if (config.addSystemMessage) this.addSystemMessage = config.addSystemMessage;
    if (config.clearChatHistory) this.clearChatHistory = config.clearChatHistory;
    // Update export session callback
    if (config.exportChatSession) this.exportChatSession = config.exportChatSession;
    // Update clear server session callback
    if (config.clearServerSession) this.clearServerSession = config.clearServerSession;
    // Update end server session callback
    if (config.endServerSession) this.endServerSession = config.endServerSession;
  }
  
  /**
   * Initialize chat mode manager
   * @returns {Promise<void>}
   */
  async initialize() {
    // Prevent duplicate initialization
    if (this.initialized) {
      console.log('[INFO] ChatModeManager already initialized, skipping');
      return;
    }
    
    console.log('[INFO] Initializing ChatModeManager');
    
    // Mark as initialized
    this.initialized = true;
    
    // Load saved mode settings
    await this.loadSavedMode();
    console.log('[INFO] Current chat mode:', this.currentMode);
    
    // Check for active session
    await this.checkActiveSession();
    
    // Initialize button UI
    this.updateButtonUI();
    
    // Bind button click events and event listeners
    this.bindEvents();
    
    // Initialize video list display state
    this.toggleVideoListVisibility();
    
    console.log('[INFO] ChatModeManager initialized');
  }
  
  /**
   * Handle toggle button click event
   * @param {Event} e - Click event
   */
  onToggleButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[INFO] Chat mode toggle button clicked - DEPRECATED METHOD');
    
    // Prevent duplicate clicks
    if (this.isToggling) {
      console.log('[INFO] Toggle already in progress, ignoring click');
      return;
    }
    
    // Set debounce state
    this.isToggling = true;
    
    // Use setTimeout to ensure async execution
    setTimeout(async () => {
      await this.toggle();
      
      // Add short delay to prevent rapid consecutive clicks
      setTimeout(() => {
        this.isToggling = false;
      }, 200);
    }, 0);
  }
  
  /**
   * Toggle chat mode
   * @returns {Promise<void>}
   */
  async toggle() {
    // Record previous mode
    const previousMode = this.currentMode;
    
    // Toggle mode
    this.currentMode = this.currentMode === 'default' ? 'accumulate' : 'default';
    console.log('[INFO] Chat mode toggled to:', this.currentMode);
    
    // Save settings
    await this.saveMode();
    
    // 无论切换到哪种模式，都清空前端聊天历史和后端会话
    // 这确保在进入专注模式时也会清空所有消息
    this.clearChatHistory();
    
    // 根据不同的模式切换情况，处理后端会话
    if (previousMode === 'accumulate' && this.currentMode === 'default') {
      // 从专注模式切换到普通模式时，结束会话但保留历史
      if (this.endServerSession) {
        try {
          console.log('[INFO] Ending server session when switching from accumulate to default mode');
          await this.endServerSession();
        } catch (error) {
          console.error('[ERROR] Failed to end server session:', error);
        }
      }
    } else {
      // 其他情况（进入专注模式或者在普通模式切换），清除后端会话
      if (this.clearServerSession) {
        try {
          console.log('[INFO] Clearing server session when switching chat mode');
          await this.clearServerSession();
        } catch (error) {
          console.error('[ERROR] Failed to clear server session:', error);
        }
      }
    }
    
    // 如果从专注模式切换到普通模式，还需要导出会话
    if (previousMode === 'accumulate' && this.currentMode === 'default') {
      // Check if session needs to be exported (has chat history)
      try {
        // Check if there is chat history to export
        const hasChatHistory = await this.checkHasChatHistory();
        
        if (hasChatHistory) {
          console.log('[INFO] Switching from accumulate to default, automatically exporting session');
          // Export current session
          await this.exportChatSession();
          console.log('[INFO] Session exported successfully');
          
          // No longer show session end notification, use mode switch notification instead
          // The session end notification will be shown in sendModeChangeMessage()
        } else {
          console.log('[INFO] No chat history, skipping export step');
        }
      } catch (error) {
        console.error('[ERROR] Automatically exporting session failed:', error);
      }
    }
    
    // Update button UI
    this.updateButtonUI();
    
    // Send mode change system message
    this.sendModeChangeMessage();
    
    // Trigger mode change callback
    this.onModeChange(this.currentMode);
    
    // Toggle video list visibility
    this.toggleVideoListVisibility();
    
    // No longer need to call fetchSessionVideos here, because toggleVideoListVisibility already does it
    // if (this.currentMode === 'accumulate') {
    //   this.fetchSessionVideos();
    // }
  }
  
  /**
   * Add mode change notification message to chat
   */
  sendModeChangeMessage() {
    if (!this.addSystemMessage) {
      console.warn('[WARN] addSystemMessage function not available');
      return;
    }
    
    // Prepare more生动 descriptions for different modes
    let modeTitle, modeDesc;
    
    if (this.currentMode === 'accumulate') {
      // 专注模式开启时的提示
      modeTitle = '✨ 专注模式已启用';
      modeDesc = `<div style="text-align: left; line-height: 1.5;">
        <p>• 不同视频上下文将持续保留</p>
        <p>• 再次点击 <span style="background: #4f46e5; padding: 2px 8px; border-radius: 4px; font-size: 0.9em; color: #ffffff;"><i class="bi bi-layers"></i> 专注模式</span> 退出</p>
        <p>• 退出后，对话将被保存</p>
        <p>• 并自动生成学习总结</p>
      </div>`;
    } else {
      // 专注模式关闭时的提示
      modeTitle = '📝 专注模式已退出';
      modeDesc = '对话已保存，学习总结已自动生成';
    }
    
    // Add debug message
    console.log('[DEBUG] Sending mode change message, current mode:', this.currentMode);
    
    // Only use one way to display message, avoid duplicates
    try {
      // Prefer using notification system
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.showModeChangeNotification(modeTitle, modeDesc);
        console.log('[INFO] Notification system displayed mode change message');
        // Important: No longer add system message, avoid duplicates
      } else {
        // If notification system is not available, use system message
        if (this.currentMode === 'accumulate') {
          this.addSystemMessage(`${modeTitle}\n不同视频上下文将持续保留\n再次点击专注模式按钮退出专注模式\n退出后对话将被保存，并自动生成学习总结`);
        } else {
          this.addSystemMessage(`${modeTitle}\n${modeDesc}`);
        }
        console.log('[INFO] System message displayed mode change message');
      }
    } catch (error) {
      console.error('[ERROR] Failed to display mode change notification:', error);
      // When error occurs, use system message as fallback
      if (this.currentMode === 'accumulate') {
        this.addSystemMessage(`专注模式已启用\n不同视频上下文将持续保留\n再次点击专注模式按钮退出专注模式\n退出后对话将被保存，并自动生成学习总结`);
      } else {
        this.addSystemMessage(`专注模式已关闭\n${modeDesc}`);
      }
    }
  }
  
  /**
   * Load saved mode setting from browser storage
   */
  async loadSavedMode() {
    try {
      const browser = window.browser || window.chrome;
      const settings = await browser.storage.local.get(['chatMode']);
      this.currentMode = settings.chatMode || 'default';
      console.log('[INFO] Loaded chat mode setting:', this.currentMode);
      
      // If loaded mode is accumulate, immediately toggle video list visibility and fetch videos
      if (this.currentMode === 'accumulate') {
        console.log('[INFO] Current mode is accumulate, automatically fetching session videos');
        this.toggleVideoListVisibility();
        this.fetchSessionVideos();
      }
    } catch (error) {
      console.error('[ERROR] Failed to load chat mode setting:', error);
      this.currentMode = 'default';
    }
  }
  
  /**
   * Get current chat mode
   * @returns {string} Current mode
   */
  getCurrentMode() {
    return this.currentMode;
  }
  
  /**
   * Get current session videos
   * Only used in accumulate mode
   */
  async fetchSessionVideos() {
    if (this.currentMode !== 'accumulate') {
      console.log('[INFO] Not in accumulate mode, skipping video list fetch');
      return [];
    }
    
    try {
      console.log('[INFO] Fetching current session videos...');
      // Get current YouTube video ID (if available)
      let currentVideoId = '';
      try {
        const url = new URL(window.location.href);
        const urlParams = new URLSearchParams(url.search);
        currentVideoId = urlParams.get('v') || '';
      } catch (error) {
        console.log('[WARN] Failed to get video ID from URL:', error);
      }
      
      // Get authentication token and base URL
      const chatUI = window.getChatUI ? window.getChatUI() : null;
      const apiUrl = chatUI ? chatUI.apiUrl : '/api';
      const authToken = chatUI ? chatUI.authToken : '';
      
      // Ensure URL format is correct
      const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
      
      // Request backend API to get all videos in the session
      const url = `${baseUrl}chat/session-videos/?current_video_id=${currentVideoId}`;
      console.log('[INFO] Fetching session videos:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Authorization': authToken ? `Token ${authToken}` : ''
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch session videos: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[INFO] Successfully fetched session videos:', data);
      
      // Update UI
      this.updateVideoListUI(data.videos);
      
      return data.videos;
    } catch (error) {
      console.error('[ERROR] Failed to fetch session videos:', error);
      return [];
    }
  }
  
  /**
   * Update video list UI
   * @param {Array} videos - Video list data
   */
  updateVideoListUI(videos) {
    if (!videos || videos.length === 0) {
      console.log('[INFO] No session videos, skipping UI update');
      return;
    }
    
    try {
      // Find video list container and list element
      const videoListContainer = document.getElementById('session-videos-container');
      
      // If container does not exist, create it using createVideoListPanel method
      if (!videoListContainer) {
        console.log('[INFO] Video list container does not exist, creating new container');
        this.createVideoListPanel();
        return;
      }
      
      // Get video list element
      let videoList = document.getElementById('session-videos-list');
      
      // If list element does not exist, create it
      if (!videoList) {
        console.log('[INFO] Video list element does not exist, creating new list element');
        videoList = document.createElement('ul');
        videoList.id = 'session-videos-list';
        videoList.className = 'session-videos-list';
        videoListContainer.appendChild(videoList);
      }
      
      // Clear existing content
      videoList.innerHTML = '';
      
      // Add video items
      videos.forEach(video => {
        try {
          const listItem = document.createElement('li');
          listItem.className = 'session-video-item';
          listItem.dataset.videoId = video.video_id;
          
          // Create thumbnail container
          const thumbnailContainer = document.createElement('div');
          thumbnailContainer.className = 'video-thumbnail'; // Match with CSS class
          
          // Create thumbnail image
          const thumbnailImg = document.createElement('img');
          thumbnailImg.src = `https://i.ytimg.com/vi/${video.video_id}/default.jpg`;
          thumbnailImg.alt = video.title || `Video ${video.video_id}`;
          thumbnailImg.loading = 'lazy'; // Lazy load images
          thumbnailContainer.appendChild(thumbnailImg);
          
          // Create video info container
          const videoInfo = document.createElement('div');
          videoInfo.className = 'video-info'; // Match with CSS class
          
          // Create video title element
          const videoTitle = document.createElement('div');
          videoTitle.className = 'session-video-title';
          videoTitle.textContent = video.title || `Video ${video.video_id}`;
          videoInfo.appendChild(videoTitle);
          
          // Add click event, navigate to the video
          listItem.addEventListener('click', () => {
            // Build YouTube video URL
            const videoUrl = `https://www.youtube.com/watch?v=${video.video_id}`;
            
            // Use chrome.tabs API to navigate in the main tab
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs && tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, {url: videoUrl});
              } else {
                // If no active tab is found, create a new tab
                chrome.tabs.create({url: videoUrl});
              }
            });
          });
          
          // Add thumbnail and title to list item
          listItem.appendChild(thumbnailContainer);
          listItem.appendChild(videoInfo);
          
          // Add list item to list
          videoList.appendChild(listItem);
        } catch (err) {
          console.error('[ERROR] Adding video item failed:', err, video);
        }
      });
      
      console.log('[INFO] Video list UI updated, showing', videos.length, 'videos');
    } catch (error) {
      console.error('[ERROR] Updating video list UI failed:', error);
    }
  }
  
  /**
   * Toggle visibility of video list based on current mode
   */
  toggleVideoListVisibility() {
    try {
      // Determine visibility of video list based on current mode
      const shouldBeVisible = this.currentMode === 'accumulate';
      console.log('[INFO] Video list should be visible:', shouldBeVisible, ', current mode:', this.currentMode);
      
      // Handle floating button
      this.handleFloatingButton(shouldBeVisible);
      
      // If should not be visible, directly hide the video list container (if exists)
      if (!shouldBeVisible) {
        const videoListContainer = document.getElementById('session-videos-container');
        if (videoListContainer) {
          videoListContainer.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('[ERROR] Toggling video list visibility failed:', error);
    }
  }
  
  /**
   * Handle floating button creation and display
   * @param {boolean} shouldBeVisible - Whether the button should be visible
   */
  handleFloatingButton(shouldBeVisible) {
    try {
      // Find button element
      let toggleButton = document.getElementById('video-list-toggle-button');
      
      // If button does not exist and should be visible, create button
      if (!toggleButton && shouldBeVisible) {
        // Create floating button
        toggleButton = document.createElement('button');
        toggleButton.id = 'video-list-toggle-button';
        toggleButton.className = 'video-list-toggle-button';
        toggleButton.innerHTML = '<i class="bi bi-collection-play"></i>';
        toggleButton.title = 'Show current session videos';
        
        // Add click event
        toggleButton.addEventListener('click', () => {
          this.toggleVideoListPanel();
        });
        
        // Add button to chat container
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
          chatContainer.appendChild(toggleButton);
          console.log('[INFO] Video list floating button added');
        } else {
          console.warn('[WARN] Unable to find chat container');
          return;
        }
        
        // First create button, ensure video list panel is also created
        this.createVideoListPanel();
      }
      
      // Show or hide button based on mode
      if (toggleButton) {
        toggleButton.style.display = shouldBeVisible ? 'flex' : 'none';
      }
    } catch (error) {
      console.error('[ERROR] Handling video list floating button failed:', error);
    }
  }
  
  /**
   * Create video list panel
   */
  createVideoListPanel() {
    try {
      // Find video list container
      let videoListContainer = document.getElementById('session-videos-container');
      
      // If container already exists, no need to recreate
      if (videoListContainer) {
        return;
      }
      
      // Create container
      videoListContainer = document.createElement('div');
      videoListContainer.id = 'session-videos-container';
      videoListContainer.className = 'session-videos-container';
      
      // Create title
      const titleElement = document.createElement('div');
      titleElement.className = 'session-videos-title';
      titleElement.innerHTML = '<i class="bi bi-collection-play"></i> 当前会话视频 <i class="bi bi-x-lg close-icon"></i>';
      
      // Add close button click event
      const closeIcon = titleElement.querySelector('.close-icon');
      if (closeIcon) {
        // Ensure only one event listener is added
        const handleCloseClick = (e) => {
          this.toggleVideoListPanel(false); // Close panel
          e.stopPropagation();
        };
        closeIcon.addEventListener('click', handleCloseClick, { once: true });
      }
      
      videoListContainer.appendChild(titleElement);
      
      // Create list element
      const videoList = document.createElement('ul');
      videoList.id = 'session-videos-list';
      videoList.className = 'session-videos-list';
      videoListContainer.appendChild(videoList);
      
      // Add video list to chat container
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) {
        chatContainer.appendChild(videoListContainer);
        console.log('[INFO] Video list panel created');
      } else {
        console.warn('[WARN] Unable to find chat container');
      }
      
      // Immediately fetch video list data
      this.fetchSessionVideos();
    } catch (error) {
      console.error('[ERROR] Creating video list panel failed:', error);
    }
  }
  
  /**
   * Switch the visibility of the video list panel
   * @param {boolean|undefined} forceState - If provided, force set to specified state
   */
  toggleVideoListPanel(forceState) {
    try {
      // Find video list container
      const videoListContainer = document.getElementById('session-videos-container');
      if (!videoListContainer) {
        console.warn('[WARN] Video list container not found');
        return;
      }
      
      // Current visibility state
      const isVisible = videoListContainer.classList.contains('visible');
      
      // Determine new state based on parameter or current state
      const newState = forceState !== undefined ? forceState : !isVisible;
      
      if (newState) {
        // Show panel
        videoListContainer.style.display = 'flex';
        // Use setTimeout to ensure display change is applied before adding visible class
        setTimeout(() => {
          videoListContainer.classList.add('visible');
          
          // Rebind close button event (may be lost during DOM update)
          const closeIcon = videoListContainer.querySelector('.close-icon');
          if (closeIcon) {
            // Ensure only one event listener is added
            closeIcon.addEventListener('click', (e) => {
              this.toggleVideoListPanel(false);
              e.stopPropagation();
            }, { once: true });
          }
        }, 10);
        
        // Get latest video list
        this.fetchSessionVideos();
      } else {
        // Hide panel
        videoListContainer.classList.remove('visible');
        // Wait for transition animation to complete before hiding element
        setTimeout(() => {
          if (!videoListContainer.classList.contains('visible')) {
            videoListContainer.style.display = 'none';
          }
        }, 300); // Match CSS transition time
      }
    } catch (error) {
      console.error('[ERROR] Switching video list panel visibility failed:', error);
    }
  }
  
  /**
   * Save current mode to browser storage
   */
  async saveMode() {
    try {
      const browser = window.browser || window.chrome;
      await browser.storage.local.set({ chatMode: this.currentMode });
      console.log('[INFO] Saved chat mode setting:', this.currentMode);
    } catch (error) {
      console.error('[ERROR] Failed to save chat mode setting:', error);
    }
  }
  
  /**
   * Check if there is chat history
   * @returns {Promise<boolean>} Whether there is chat history
   */
  async checkHasChatHistory() {
    // Here implement the logic to check chat history
    // Since there is no direct access to the chat history array of ChatUI, we need to get it through callback
    // If callback does not exist, we assume there is no chat history
    if (typeof this._checkChatHistoryCallback === 'function') {
      return await this._checkChatHistoryCallback();
    }
    
    // Default assume no chat history, safety first
    return false;
  }
  
  /**
   * Set the callback function to check chat history
   * @param {Function} callback - Callback function to check chat history
   */
  setCheckChatHistoryCallback(callback) {
    if (typeof callback === 'function') {
      this._checkChatHistoryCallback = callback;
    }
  }
  
  /**
   * Check if there is an active session
   * If there is an active session but the current mode is not focused mode, automatically activate focused mode
   * @returns {Promise<void>}
   */
  async checkActiveSession() {
    try {
      console.log('[INFO] Checking for active session...');
      
      // Get authentication token and base URL
      const chatUI = window.getChatUI ? window.getChatUI() : null;
      const apiUrl = chatUI ? chatUI.apiUrl : '/api';
      const authToken = chatUI ? chatUI.authToken : '';
      
      // Ensure URL format is correct
      const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
      
      // Request backend API to get session status
      const url = `${baseUrl}chat/session-status/`;
      console.log('[INFO] Requesting session status:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Authorization': authToken ? `Token ${authToken}` : ''
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.warn(`[WARN] Failed to get session status: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      console.log('[INFO] Session status data:', data);
      
      // If there is an active session but the current mode is not focused mode, automatically activate focused mode
      if (data.has_active_session && this.currentMode !== 'accumulate') {
        console.log('[INFO] Detected active session, automatically activating focused mode');
        this.currentMode = 'accumulate';
        await this.saveMode();
        
        // Notify user that focused mode has been automatically activated
        const notificationSystem = window.NotificationSystem;
        if (notificationSystem) {
          notificationSystem.showNotification('Focused mode activated automatically', 'Detected active chat session', 'info', 5000);
        }
        
        // Update UI
        this.updateButtonUI();
        this.toggleVideoListVisibility();
        this.fetchSessionVideos();
      }
    } catch (error) {
      console.error('[ERROR] Failed to check active session status:', error);
    }
  }
  
  /**
   * Update toggle button UI
   */
  updateButtonUI() {
    if (!this.toggleButton) {
      // Try again to get the button (it may become available after DOM update)
      this.toggleButton = document.getElementById('chat-mode-toggle');
      if (!this.toggleButton) {
        console.warn('[WARN] Toggle button not found in updateButtonUI');
        return;
      }
    }
    
    try {
      console.log('[INFO] Updating button UI for mode:', this.currentMode);
      
      // Update button appearance - only modify active class, not content
      if (this.currentMode === 'accumulate') {
        // Focused mode active state
        this.toggleButton.classList.add('active');
        // Update style to show active state
        this.toggleButton.style.backgroundColor = '#4f46e5';
        this.toggleButton.style.color = '#ffffff';
      } else {
        // Focused mode inactive state
        this.toggleButton.classList.remove('active');
        // Restore default style
        this.toggleButton.style.backgroundColor = '';
        this.toggleButton.style.color = '';
      }
      
      console.log('[INFO] Button UI updated successfully');
    } catch (error) {
      console.error('[ERROR] Error updating button UI:', error);
    }
  }
  
  /**
   * Bind events
   */
  bindEvents() {
    // Prevent duplicate event binding
    if (this.eventsInitialized) {
      console.log('[INFO] Events already bound, skipping');
      return;
    }
    
    // Get toggle button
    this.toggleButton = document.getElementById('chat-mode-toggle');
    
    if (!this.toggleButton) {
      console.log('[WARN] Toggle button not found');
      return;
    }
    
    console.log('[INFO] Binding toggle button events');
    
    // Remove any existing event listeners
    if (this.boundClickHandler) {
      console.log('[INFO] Removing existing event listeners');
      this.toggleButton.removeEventListener('click', this.boundClickHandler);
    }
    
    // Create new click handler
    this.boundClickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[INFO] Toggle button clicked');
      
      // Prevent repeated clicks
      if (this.isToggling) {
        console.log('[INFO] Switching in progress, ignoring click');
        return;
      }
      
      // Set debounce state
      this.isToggling = true;
      
      // Switch mode
      this.toggle().then(() => {
        // Reset debounce state after completion
        setTimeout(() => {
          this.isToggling = false;
        }, 300); // Increase time to 300ms
      });
    };
    
    // Bind click event
    this.toggleButton.addEventListener('click', this.boundClickHandler);
    
    // Listen for video change messages
    window.addEventListener('message', (event) => {
      // Check if it's a video change event
      if (event.data && event.data.type === 'videoChanged') {
        console.log('[INFO] Detected video change, refreshing video list');
        // If current mode is focused, refresh video list
        if (this.currentMode === 'accumulate') {
          // Delay refresh to ensure backend data is updated
          setTimeout(() => {
            this.fetchSessionVideos();
          }, 1000);
        }
      }
    });
    
    // Listen for API request completion events
    document.addEventListener('apiRequestCompleted', (event) => {
      console.log('[INFO] Detected API request completion, checking if video list needs refresh');
      // If current mode is focused, refresh video list
      if (this.currentMode === 'accumulate') {
        this.fetchSessionVideos();
      }
    });
    
    // Mark as events initialized
    this.eventsInitialized = true;
    
    console.log('[INFO] Chat mode toggle button event listener setup completed');
  }
  
}

// Export mode manager
export default ChatModeManager;

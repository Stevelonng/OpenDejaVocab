import browser from 'webextension-polyfill';
import ChatModeManager from './chat-mode.js';
import './chat-listener.js';  // 引入聊天监听器

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
    this.apiUrl = config.apiUrl || 'http://localhost:8000/api';
    
    // UI elements
    this.messagesContainer = document.getElementById('chat-messages');
    this.inputField = document.getElementById('chat-input');
    this.sendButton = document.getElementById('send-button');
    
    // State management
    this.isProcessing = false;
    this.darkMode = true;
    this.chatHistory = [];
    this.currentRequest = null;
    
    // 聊天模式 - 不再在这里设置默认值，由ChatModeManager管理
    this.chatModeManager = null;
    
    // Stream processing
    this.typingAnimation = null;
    this.responseTimer = null;

    // Bind methods
    this.init = this.init.bind(this);
    this.getUserInfo = this.getUserInfo.bind(this);
    
    // Video change detection
    this.lastVideoId = '';
    this.isFirstVideoLoad = true; // 添加标记，区分首次加载和后续切换
    
    // 视频标题缓存
    this.videoTitleCache = new Map();
    
    // 初始化标记
    this.initialized = false;
    
    // 事件处理函数ID
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
      
      // Set default API URL based on environment if not stored
      if (!settings.apiUrl) {
        this.apiUrl = environment === 'localhost' 
          ? 'http://localhost:8000/api/' 
          : 'https://dejavocab.com/api/';
        
        // Save to storage for consistency
        await browser.storage.local.set({ apiUrl: this.apiUrl });
      } else {
        this.apiUrl = settings.apiUrl;
      }
      
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
      
      // Load settings (包含初始化ChatModeManager)
      await this.loadSettings();
      
      // Set up event listeners (确保在ChatModeManager初始化后设置事件)
      this.setupEventListeners();
      
      // Load chat history
      await this.loadChatHistory();
      
      // Load dark mode setting
      await this.loadDarkModeSetting();
      
      // 设置storage变化监听器，用于检测视频信息更新
      this.setupStorageChangeListener();
      
      // Mark this instance as initialized
      this.initialized = true;
      
      console.log('[INFO] Chat interface initialization complete');
    } catch (error) {
      console.error('[ERROR] Chat interface initialization failed:', error);
    }
  }
  
  /**
   * 设置storage变化监听器
   */
  setupStorageChangeListener() {
    const self = this; // 保存this引用
    
    // 添加标题缓存映射，用于记录每个视频ID对应的标题
    // 这样即使存储数据延迟更新，我们仍然可以使用正确的标题
    if (!this.videoTitleCache) {
      this.videoTitleCache = new Map();
    }
    
    browser.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === 'local') {
        // 检查视频信息变化
        if (changes.currentVideoInfo) {
          console.log('[DEBUG] Video info changed in storage');
          
          try {
            // 获取完整的新旧值
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
            
            // 提取视频ID和标题
            const newVideoId = newValue.videoId;
            
            // 如果没有视频ID，忽略这次更新
            if (!newVideoId) {
              console.log('[WARN] Invalid video info - missing ID');
              return;
            }
            
            // 如果视频ID没变，不做处理
            if (newVideoId === self.lastVideoId) {
              console.log('[INFO] Ignoring update for same video ID:', newVideoId);
              return;
            }
            
            // ===== 修复：区分首次加载和真正的视频切换 =====
            // 如果是首次加载（没有历史记录的lastVideoId）
            if (self.isFirstVideoLoad) {
              console.log('[INFO] First video load detected, setting initial video ID:', newVideoId);
              // 只更新状态，不添加系统消息
              self.lastVideoId = newVideoId;
              self.isFirstVideoLoad = false; // 标记为非首次加载
              
              // 如果有标题，我们仍然更新缓存
              if (newValue.title) {
                self.videoTitleCache.set(newVideoId, newValue.title);
              }
              
              return; // 不继续执行以避免显示首次加载的通知
            }
            
            // ===== 对于真正的视频变更：获取准确的视频标题 =====
            console.log('[INFO] Detected video ID change, getting latest title from YouTube');
            let accurateTitle = await self.getYouTubeVideoTitle(newVideoId);
            
            // 如果无法获取新标题，退回到存储数据
            if (!accurateTitle && newValue.title) {
              console.log('[INFO] Using storage title as fallback:', newValue.title);
              accurateTitle = newValue.title;
            }
            
            // 更新标题缓存
            self.videoTitleCache.set(newVideoId, accurateTitle);
            
            console.log('[INFO] Confirmed video change:', 
                       'old=', self.lastVideoId, 'new=', newVideoId,
                       'title=', accurateTitle);
            
            // 添加系统消息
            self.addMessageToChat({
              role: 'system',
              content: `您已切换到新视频: ${accurateTitle || newVideoId}`
            });
            
            // 渲染聊天历史
            self.renderChatHistory();
            
            // 如果不是累积模式，清除聊天历史但保留系统消息
            if (self.chatModeManager && self.chatModeManager.getCurrentMode() !== 'accumulate') {
              console.log('[INFO] Non-accumulate mode active, clearing chat history except system messages');
              self.chatHistory = self.chatHistory.filter(msg => msg.role === 'system');
            }
            
            // 更新内部视频ID记录
            self.lastVideoId = newVideoId;
          } catch (error) {
            console.error('[ERROR] Error processing video change:', error);
          }
        }
      }
    });
  }

  /**
   * 从YouTube页面直接获取视频标题
   * 用于确保我们显示的是正确的视频标题，而不仅仅依赖存储数据
   * @param {string} videoId - 视频ID
   * @returns {Promise<string>} - 视频标题
   */
  async getYouTubeVideoTitle(videoId) {
    try {
      // 查询所有标签页找到匹配的YouTube视频
      const tabs = await browser.tabs.query({});
      console.log(`[DEBUG] Searching ${tabs.length} tabs for video ID: ${videoId}`);
      
      for (const tab of tabs) {
        // 检查是否为YouTube视频页面
        if (tab.url && tab.url.includes('youtube.com/watch') && tab.url.includes(videoId)) {
          console.log(`[INFO] Found matching YouTube tab for ${videoId}: ${tab.title}`);
          
          try {
            // 使用scripting API执行内容脚本获取页面标题元素
            // 使用更精确的方式获取视频标题，避免获取到通知计数前缀 (如 "(56)")
            const result = await browser.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                // 尝试从视频标题元素直接获取
                const videoTitleElement = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer');
                if (videoTitleElement) {
                  return videoTitleElement.textContent.trim();
                }
                
                // 备选方案：从meta标签获取
                const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
                if (metaTitle) {
                  return metaTitle;
                }
                
                // 最后尝试：从document.title获取，并处理前缀
                let docTitle = document.querySelector('title').textContent;
                // 处理通知计数前缀，如 "(56) 视频标题 - YouTube"
                const notificationPrefix = docTitle.match(/^\(\d+\)\s*/);
                if (notificationPrefix) {
                  docTitle = docTitle.replace(notificationPrefix[0], '');
                }
                
                // 还需要处理YouTube后缀
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
      
      // 如果找不到匹配的标签页或无法获取标题，尝试通过YouTube API获取
      // 注意：这需要跨域权限，可能在某些环境下不工作
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
    
    // 隐藏YouTube引导界面（如果存在）
    const guideContainer = document.getElementById('youtube-guide');
    if (guideContainer) {
      guideContainer.style.display = 'none';
      console.log('[INFO] 已隐藏YouTube引导界面');
    }
    
    console.log('[INFO] 聊天界面已激活');
  }
  
  /**
   * Deactivate chat view - 用于在非YouTube页面上隐藏聊天界面
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
    
    // 显示YouTube引导界面（如果存在）
    const guideContainer = document.getElementById('youtube-guide');
    if (guideContainer) {
      guideContainer.style.display = 'flex'; // 修改这里，从'none'改为'block'
      console.log('[INFO] 已显示YouTube引导界面');
    }
    
    console.log('[INFO] 聊天界面已停用');
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
   * 导出当前会话，包括结束当前会话并生成AI总结
   */
  // 标记当前是否正在导出（防止同时进行多次导出）
  _isExporting = false;
  
  async exportChatSession() {
    // 如果导出操作正在进行，则直接返回
    if (this._isExporting) {
      console.log('[INFO] Export already in progress, ignoring duplicate request');
      return;
    }
    
    // 设置标记以防止重复调用
    this._isExporting = true;
    
    // 不再检查前端的聊天历史，直接尝试从后端导出
    // 后端会检查是否有消息可导出

    try {
      // 显示加载中提示
      const exportBtn = document.getElementById('export-notes-btn');
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> 生成中...';
      }
      
      // 确保API URL正确格式
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
      
      // 1. 首先结束当前会话
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
      
      // 2. 导出会话笔记
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
      
      // 获取导出数据但不下载文件
      const exportData = await exportResponse.json();
      
      // 只打印导出的笔记信息，不创建下载
      console.log('[INFO] Notes content prepared but not downloaded as requested');
      
      // 如果需要展示导出内容，可以在消息区域显示部分内容
      if (exportData && exportData.content && exportData.content.length > 0) {
        console.log('[INFO] Summary content generated successfully');
      }
      
      console.log('[INFO] Successfully exported session notes');
      
      // 添加系统消息告知用户会话已结束
      this.addMessageToChat({
        role: 'system',
        content: '当前会话已结束。将自动开始新的会话。',
        timestamp: new Date().toISOString()
      });
      
      // 清除当前聊天历史，为新会话做准备
      this.chatHistory = [];
      this.saveChatHistory();
      
      // 清除会话相关的缓存状态
      localStorage.removeItem('dejavu_chat_session_state');
      localStorage.removeItem('dejavu_current_video');
      
      // 重置视频跟踪状态
      this.lastVideoId = '';
      
    } catch (error) {
      console.error('[ERROR] Failed to export session:', error);
      alert(`导出会话失败: ${error.message}`);
    } finally {
      // 恢复按钮状态
      const exportBtn = document.getElementById('export-notes-btn');
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="bi bi-file-earmark-text"></i> 导出会话';
      }
      
      // 延时重置导出状态标记，防止快速重复点击
      setTimeout(() => {
        this._isExporting = false;
      }, 2000);
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // 添加调试ID，帮助识别事件绑定情况
    const debugId = Math.random().toString(36).substring(2, 8);
    console.log(`[DEBUG ${debugId}] 开始设置事件监听器`);
    
    // 先移除已有的事件监听器
    this.removeExistingEventListeners();
    
    // 先检查元素是否都存在
    const elements = {
      sendButton: document.getElementById('send-button'),
      inputField: document.getElementById('chat-input'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      darkModeToggle: document.getElementById('dark-mode-toggle'),
      logoutBtn: document.getElementById('logout-btn')
    };
    
    // 检查元素是否都存在
    console.log(`[DEBUG ${debugId}] 检查UI元素:`, {
      sendButton: !!elements.sendButton,
      inputField: !!elements.inputField,
      clearChatBtn: !!elements.clearChatBtn,
      darkModeToggle: !!elements.darkModeToggle,
      logoutBtn: !!elements.logoutBtn
    });
    
    // 检查是否有旧的处理函数
    const hasOldHandlers = {
      sendHandler: !!this.sendHandler,
      keydownHandler: !!this.keydownHandler,
      clearChatHandler: !!this.clearChatHandler,
      darkModeHandler: !!this.darkModeHandler,
      logoutHandler: !!this.logoutHandler
    };
    console.log(`[DEBUG ${debugId}] 旧的事件处理函数:`, hasOldHandlers);
    
    // 为事件处理函数存储唯一标识符
    this._eventHandlersId = debugId;
    
    // Send button click event - 使用一个检查确保只绑定一次
    if (elements.sendButton && !elements.sendButton._hasClickListener) {
      this.sendHandler = (e) => {
        e.preventDefault();
        console.log(`[事件 ${this._eventHandlersId}] 发送按钮点击`);
        this.handleSendMessage();
      };
      elements.sendButton.addEventListener('click', this.sendHandler);
      elements.sendButton._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] 已添加发送按钮点击事件监听器`);
    }
    
    // Input field keypress event (Enter to send)
    if (elements.inputField && !elements.inputField._hasKeydownListener) {
      this.keydownHandler = (e) => {
        this.adjustTextareaHeight();
        
        // Check for Enter key (without shift) to send message
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          console.log(`[事件 ${this._eventHandlersId}] 回车键发送`);
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
      console.log(`[DEBUG ${debugId}] 已添加输入框事件监听器`);
    }
    
    // Clear chat button click event
    if (elements.clearChatBtn && !elements.clearChatBtn._hasClickListener) {
      this.clearChatHandler = (e) => {
        e.preventDefault();
        console.log(`[事件 ${this._eventHandlersId}] 清除聊天按钮点击`);
        this.clearChat();
      };
      elements.clearChatBtn.addEventListener('click', this.clearChatHandler);
      elements.clearChatBtn._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] 已添加清除聊天按钮事件监听器`);
    }
    
    // Dark mode toggle button click event
    if (elements.darkModeToggle && !elements.darkModeToggle._hasClickListener) {
      this.darkModeHandler = (e) => {
        e.preventDefault();
        console.log(`[事件 ${this._eventHandlersId}] 暗黑模式切换按钮点击`);
        this.toggleDarkMode();
      };
      elements.darkModeToggle.addEventListener('click', this.darkModeHandler);
      elements.darkModeToggle._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] 已添加暗黑模式按钮事件监听器`);
    }
    
    // Logout button click event
    if (elements.logoutBtn && !elements.logoutBtn._hasClickListener) {
      this.logoutHandler = (e) => {
        e.preventDefault();
        console.log(`[事件 ${this._eventHandlersId}] 登出按钮点击`);
        this.logout();
      };
      elements.logoutBtn.addEventListener('click', this.logoutHandler);
      elements.logoutBtn._hasClickListener = true;
      console.log(`[DEBUG ${debugId}] 已添加登出按钮事件监听器`);
    }
    
    // 初始化聊天模式切换按钮（由ChatModeManager处理）
    if (this.chatModeManager) {
      this.chatModeManager.bindEvents();
    } else {
      console.warn('[WARNING] Chat mode manager not initialized, skipping event setup');
    }
    
    // Resize event for responsive design - 同样使用检查避免重复添加
    if (!window._hasResizeListener) {
      this.resizeHandler = () => {
        this.adjustTextareaHeight();
      };
      window.addEventListener('resize', this.resizeHandler);
      window._hasResizeListener = true;
      console.log(`[DEBUG ${debugId}] 已添加窗口大小调整事件监听器`);
    }
    
    console.log(`[DEBUG ${debugId}] 事件监听器设置完成`);
  }

  /**
   * Remove existing event listeners
   */
  removeExistingEventListeners() {
    const debugId = Math.random().toString(36).substring(2, 8);
    console.log(`[DEBUG ${debugId}] 开始移除现有事件监听器`);
    
    // 获取所有按钮元素
    const elements = {
      sendButton: document.getElementById('send-button'),
      inputField: document.getElementById('chat-input'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      darkModeToggle: document.getElementById('dark-mode-toggle'),
      logoutBtn: document.getElementById('logout-btn')
    };
    
    // 移除所有可能的事件监听器，同时重置_hasClickListener标记
    
    // Send button
    if (elements.sendButton) {
      if (this.sendHandler) {
        elements.sendButton.removeEventListener('click', this.sendHandler);
      }
      // 确保移除所有其他可能存在的点击处理函数
      elements.sendButton.replaceWith(elements.sendButton.cloneNode(true));
      // 更新引用，因为cloneNode后原引用无效
      this.sendButton = document.getElementById('send-button');
      console.log(`[DEBUG ${debugId}] 已清除发送按钮事件监听器`);
    }
    
    // Input field
    if (elements.inputField) {
      if (this.keydownHandler) {
        elements.inputField.removeEventListener('keydown', this.keydownHandler);
      }
      if (this.inputHandler) {
        elements.inputField.removeEventListener('input', this.inputHandler);
      }
      // 克隆并替换确保所有事件处理器被移除
      const newInput = elements.inputField.cloneNode(true);
      elements.inputField.parentNode.replaceChild(newInput, elements.inputField);
      // 更新引用
      this.inputField = document.getElementById('chat-input');
      console.log(`[DEBUG ${debugId}] 已清除输入框事件监听器`);
    }
    
    // Clear chat button
    if (elements.clearChatBtn) {
      if (this.clearChatHandler) {
        elements.clearChatBtn.removeEventListener('click', this.clearChatHandler);
      }
      elements.clearChatBtn.replaceWith(elements.clearChatBtn.cloneNode(true));
      console.log(`[DEBUG ${debugId}] 已清除清除聊天按钮事件监听器`);
    }
    
    // Dark mode toggle
    if (elements.darkModeToggle) {
      if (this.darkModeHandler) {
        elements.darkModeToggle.removeEventListener('click', this.darkModeHandler);
      }
      elements.darkModeToggle.replaceWith(elements.darkModeToggle.cloneNode(true));
      console.log(`[DEBUG ${debugId}] 已清除暗黑模式按钮事件监听器`);
    }
    
    // Logout button
    if (elements.logoutBtn) {
      if (this.logoutHandler) {
        elements.logoutBtn.removeEventListener('click', this.logoutHandler);
      }
      elements.logoutBtn.replaceWith(elements.logoutBtn.cloneNode(true));
      console.log(`[DEBUG ${debugId}] 已清除登出按钮事件监听器`);
    }
    
    // Remove resize event listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      console.log(`[DEBUG ${debugId}] 已清除窗口大小调整事件监听器`);
    }
    
    // 清除所有处理函数引用
    this.sendHandler = null;
    this.keydownHandler = null;
    this.inputHandler = null;
    this.clearChatHandler = null;
    this.darkModeHandler = null;
    this.logoutHandler = null;
    this.exportNotesHandler = null;
    this.resizeHandler = null;
    
    console.log(`[DEBUG ${debugId}] 已完成移除所有事件监听器`);
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
    
    // Set processing state
    this.isProcessing = true;
    
    // Show typing indicator (with clean animation)
    this.showTypingIndicator();
    
    // Start subtitle collection in the background - don't await it
    this.collectSubtitlesInBackground().catch(error => {
      console.error('[ERROR] Background subtitle collection failed:', error);
    });
    
    try {
      // 始终直接从浏览器存储获取最新的字幕数据 - 不依赖于上次获取的结果
      // 这确保我们总是使用当前视频的最新字幕，无论视频何时更改
      let currentSubtitles = [];
      let currentVideoTitle = '';
      let currentVideoId = '';
      let videoChanged = false;
      
      // 从浏览器存储中获取当前视频信息和字幕
      console.log('[INFO] Fetching latest video info and subtitles from browser storage');
      const storageData = await browser.storage.local.get(['currentSubtitles', 'currentVideoInfo']);
      
      // 处理字幕数据
      if (storageData.currentSubtitles && Array.isArray(storageData.currentSubtitles)) {
        // 筛选和格式化字幕
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
      
      // 处理视频信息
      if (storageData.currentVideoInfo) {
        currentVideoTitle = storageData.currentVideoInfo.title || '';
        currentVideoId = storageData.currentVideoInfo.videoId || '';
        console.log('[INFO] Current video info:', currentVideoId, currentVideoTitle);
        
        // 检测视频是否变化
        if (this.lastVideoId && this.lastVideoId !== currentVideoId && currentVideoId) {
          console.log('[INFO] Video changed from', this.lastVideoId, 'to', currentVideoId);
          videoChanged = true;
          
          // 当视频变化时，添加一条系统消息告知用户
          this.addMessageToChat({
            role: 'system',
            content: `您已切换到新视频: ${currentVideoTitle}`
          });
        } else if (!this.lastVideoId && currentVideoId) {
          // 首次设置视频ID
          console.log('[INFO] First video detected:', currentVideoId);
          videoChanged = true;
          
          // 首次检测到视频时也添加系统消息
          this.addMessageToChat({
            role: 'system',
            content: `您已切换到新视频: ${currentVideoTitle}`
          });
        }
        
        // 更新上次视频ID - 确保始终更新，即使视频没有变化
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
      
      // 记录视频切换状态
      console.log('[INFO] Video change detected:', videoChanged ? 'YES' : 'NO');
      
      // 根据当前聊天模式选择API端点
      let endpoint;
      if (this.chatModeManager && this.chatModeManager.getCurrentMode() === 'accumulate') {
        endpoint = `${baseUrl}/ai/chat-completion/`;
        console.log('[INFO] Using accumulate mode endpoint:', endpoint);
      } else {
        endpoint = `${baseUrl}/ai/chat-completion-default/`;
        console.log('[INFO] Using default mode endpoint:', endpoint);
        
        // 如果不是累积模式，清除聊天历史但保留系统消息
        if (videoChanged) {
          console.log('[INFO] Video changed in default mode, clearing chat history except system messages');
          this.chatHistory = this.chatHistory.filter(msg => msg.role === 'system');
        }
      }
      
      // 记录当前使用的端点
      const currentMode = this.chatModeManager ? this.chatModeManager.getCurrentMode() : 'default';
      console.log('[INFO] Using endpoint for mode:', currentMode, endpoint);
      
      // 检查是否应该发送字幕数据 - 现在我们总是发送
      console.log('[INFO] Will send subtitles, count:', currentSubtitles.length);
      
      // 准备请求体 - 确保始终包含最新的字幕数据
      const requestBody = {
        message: userMessage,
        history: this.chatHistory.slice(-10), // Only send last 10 chat messages
        subtitles: currentSubtitles, // 始终发送当前字幕，无论是否有变化
        videoTitle: currentVideoTitle,
        videoId: currentVideoId,
        userId: this.userId || 'anonymous' // 确保发送用户ID
      };
      
      // 记录请求信息
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
      
      // Create message element for assistant response
      const messageElement = document.createElement('div');
      messageElement.className = 'message assistant-message';
      
      const avatarElement = document.createElement('div');
      avatarElement.className = 'message-avatar';
      avatarElement.textContent = 'D';
      
      const contentElement = document.createElement('div');
      contentElement.className = 'message-content message-appear';
      
      // 创建加载动画
      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'message-dots';
      
      // 创建三个动画点
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'message-dot';
        dotsContainer.appendChild(dot);
      }
      
      contentElement.appendChild(dotsContainer);
      
      messageElement.appendChild(avatarElement);
      messageElement.appendChild(contentElement);
      
      // Hide typing indicator before showing response
      this.hideTypingIndicator();
      
      // Don't add the message element to the DOM until we have actual content
      // This prevents the brief flash of an empty message with just the avatar
      let messageAddedToDOM = false;

      // Stream reading loop
      let chunkBuffer = '';
      let updateInterval = 50; // 更新间隔减少到50ms，使显示更平滑
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
          const parts = chunkBuffer.split('\n\n');
          chunkBuffer = parts.pop() || ''; // Keep any incomplete parts
          
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
                    // 移除加载动画
                    const dotsContainer = contentElement.querySelector('.message-dots');
                    if (dotsContainer) {
                      dotsContainer.remove();
                    }
                    
                    // 替换为真实内容
                    contentElement.innerHTML = this.renderMarkdown(fullContent);
                    lastUpdateTime = now;
                    
                    // 始终保持较小的更新间隔，使得流式效果更明显
                    updateInterval = fullContent.length > 2000 ? 100 : 50;
                    
                    // Only add message to DOM once we have actual content
                    if (!messageAddedToDOM && fullContent.trim().length > 0) {
                      // Now that we have content, add the message element to the messages container
                      this.messagesContainer.appendChild(messageElement);
                      messageAddedToDOM = true;
                    }
                    
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
                  
                  // 触发API请求完成事件，用于更新视频列表
                  document.dispatchEvent(new CustomEvent('apiRequestCompleted'));
                  console.log('[INFO] API请求完成事件已触发');
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
    
    // 只有在不是系统消息时添加头像
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
    // Remove existing indicator if present
    this.hideTypingIndicator();
    
    // Create but don't immediately add the indicator to prevent brief flashing
    const indicatorElement = document.createElement('div');
    indicatorElement.className = 'typing-indicator';  // Remove message-appear to avoid animation until we're ready
    indicatorElement.id = 'typing-indicator';
    
    const avatarElement = document.createElement('div');
    avatarElement.className = 'message-avatar';
    avatarElement.textContent = 'D';
    
    // 创建聊天气泡元素
    const bubbleElement = document.createElement('div');
    bubbleElement.className = 'message-content typing-bubble';
    
    // 创建动画容器
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'bubble-dots';
    
    // 创建三个动画点
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'bubble-dot';
      dotsContainer.appendChild(dot);
    }
    
    bubbleElement.appendChild(dotsContainer);
    
    indicatorElement.appendChild(avatarElement);
    indicatorElement.appendChild(bubbleElement);
    
    // Store indicator as property but don't add to DOM yet
    this.typingIndicator = indicatorElement;
    
    // Add after a short delay to prevent flickering
    setTimeout(() => {
      // Check if the indicator is still needed (user might have cancelled)
      if (this.typingIndicator === indicatorElement && this.isProcessing) {
        this.messagesContainer.appendChild(indicatorElement);
        // Add animation class after it's in the DOM to trigger animation
        setTimeout(() => indicatorElement.classList.add('message-appear'), 10);
        this.scrollToBottom(true);
      }
    }, 300); // Small delay to prevent brief flash
  }

  /**
   * Hide typing indicator with smooth transition
   */
  hideTypingIndicator() {
    // Clear any pending indicator
    this.typingIndicator = null;
    
    // Force remove all previous indicators to prevent duplicates
    const indicators = document.querySelectorAll('.typing-indicator');
    indicators.forEach(indicator => {
      if (indicator && indicator.parentNode) {
        indicator.remove();
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
      
      // 检查是否可以使用通知系统
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        
        // 使用通知系统显示确认对话框，使用多按钮支持
        notificationSystem.show({
          type: 'warning',
          title: '删除聊天会话',
          message: '确定要删除当前聊天会话吗？此操作将彻底删除服务器上的会话数据。',
          icon: 'trash',
          // 使用新的多按钮API
          buttons: [
            {
              text: '删除',
              style: {
                background: '#e53e3e',
                color: 'white'
              },
              onClick: () => {
                // 执行彻底删除操作
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
                // 什么都不做，只关闭通知
                this.isConfirmingClear = false;
              }
            }
          ],
          onClose: () => {
            // 重置标记
            this.isConfirmingClear = false;
          }
        });
      } else {
        // 使用原始方式作为后备
        if (confirm('确定要删除当前聊天会话吗？此操作将彻底删除服务器上的会话数据。')) {
          this._executeClearChat(true);
        } else {
          this.isConfirmingClear = false;
        }
      }
    } catch (error) {
      console.error('[ERROR] 确认清空聊天失败:', error);
      // 使用原始方式作为后备
      if (confirm('确定要删除当前聊天会话吗？此操作将彻底删除服务器上的会话数据。')) {
        this._executeClearChat(true);
      } else {
        this.isConfirmingClear = false;
      }
    }
  }
  
  /**
   * 执行清空聊天操作（不需要确认）
   * @param {boolean} deleteServerSession - 是否同时删除服务器端会话
   * @private
   */
  async _executeClearChat(deleteServerSession = false) {
    try {
      // 如果需要删除服务器端会话
      if (deleteServerSession) {
        console.log('[INFO] 正在删除服务器端会话...');
        
        // 获取基础URL
        const baseUrl = this.getApiBaseUrl();
        if (!baseUrl) {
          console.error('[ERROR] 无法确定API基础URL');
          throw new Error('无法确定API基础URL');
        }
        
        // 发送API请求删除会话
        try {
          // 使用完整的基础URL
          const response = await fetch(`${baseUrl}/chat/session/delete/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Token ${this.authToken}`
            }
          });
          
          const data = await response.json();
          
          if (response.ok) {
            console.log('[INFO] 服务器端会话已删除:', data);
            
            // 显示成功通知
            if (window.NotificationSystem) {
              const notificationSystem = window.NotificationSystem.getInstance();
              notificationSystem.show({
                type: 'success',
                title: '删除成功',
                message: '服务器端会话已彻底删除',
                icon: 'check-circle',
                autoClose: true
              });
            }
          } else {
            console.error('[ERROR] 删除服务器端会话失败:', data);
            
            // 显示错误通知
            if (window.NotificationSystem) {
              const notificationSystem = window.NotificationSystem.getInstance();
              notificationSystem.show({
                type: 'error',
                title: '删除失败',
                message: data.error || '删除服务器端会话时发生错误',
                icon: 'exclamation-triangle',
                autoClose: true
              });
            }
          }
        } catch (error) {
          console.error('[ERROR] 删除服务器端会话请求失败:', error);
          
          // 显示错误通知
          if (window.NotificationSystem) {
            const notificationSystem = window.NotificationSystem.getInstance();
            notificationSystem.show({
              type: 'error',
              title: '连接错误',
              message: '无法连接到服务器，请检查网络连接',
              icon: 'wifi-off',
              autoClose: true
            });
          }
        }
      }
      
      // 无论服务器请求成功与否，都清除本地聊天记录
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
      console.error('[ERROR] 执行清空聊天失败:', error);
      
      // 显示错误通知
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: '操作失败',
          message: '清空聊天记录时发生错误',
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
      // 所有模式都从本地存储加载聊天历史
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
    // 加载深色模式设置
    await this.loadDarkModeSetting();
    
    // 初始化聊天模式管理器 - 使用单例模式
    this.chatModeManager = ChatModeManager.getInstance({
      // 提供回调函数
      onModeChange: (mode) => {
        console.log('[INFO] Chat mode changed to:', mode);
      },
      // 提供添加系统消息的方法
      addSystemMessage: (content) => {
        this.addMessageToChat({
          role: 'system',
          content: content
        });
      },
      // 提供清空聊天历史的方法
      clearChatHistory: () => {
        // 保留最新一条系统消息（如果有）
        const systemMessages = this.chatHistory.filter(msg => msg.role === 'system');
        const latestSystemMessage = systemMessages.length > 0 ? systemMessages[systemMessages.length - 1] : null;
        
        // 清空历史
        this.chatHistory = [];
        
        // 如有必要，保留最新的系统消息
        if (latestSystemMessage) {
          this.chatHistory.push(latestSystemMessage);
        }
        
        // 清空聊天界面
        if (this.messagesContainer) {
          // 保留任何正在进行的打字动画
          const typingIndicator = this.messagesContainer.querySelector('.typing-indicator');
          this.messagesContainer.innerHTML = '';
          if (typingIndicator) {
            this.messagesContainer.appendChild(typingIndicator);
          }
        }
        
        console.log('[INFO] Chat history cleared for default mode');
      },
      // 提供导出会话的方法
      exportChatSession: async () => {
        console.log('[INFO] 自动触发导出会话');
        // 使用ChatUI的导出方法
        return this.exportChatSession();
      }
    });
    
    // 设置检查聊天记录的回调函数
    this.chatModeManager.setCheckChatHistoryCallback(async () => {
      // 检查是否有有效的聊天记录
      // 过滤掉系统消息，只计算用户和AI的对话消息
      const meaningfulMessages = this.chatHistory.filter(msg => 
        msg.role === 'user' || msg.role === 'ai'
      );
      
      // 如果有意义的消息数量大于0，则认为有聊天记录
      const hasChatHistory = meaningfulMessages.length > 0;
      console.log('[INFO] 检查聊天记录状态:', 
        hasChatHistory ? '有聊天记录，可以导出' : '没有聊天记录，将跳过导出'
      );
      
      return hasChatHistory;
    });
    
    // 初始化模式管理器
    await this.chatModeManager.initialize();
  }

  /**
   * 渲染聊天历史到界面上
   */
  renderChatHistory() {
    if (!this.messagesContainer || !this.chatHistory || this.chatHistory.length === 0) {
      return;
    }
    
    // 清空消息容器
    this.messagesContainer.innerHTML = '';
    
    // 添加所有消息到界面
    this.chatHistory.forEach(msg => {
      // 创建消息元素
      const messageEl = document.createElement('div');
      
      // 设置类名，确保系统消息使用与addMessageToChat相同的类名
      if (msg.role === 'system') {
        messageEl.className = 'message system-message message-appear';
      } else {
        messageEl.className = `message ${msg.role}-message message-appear`;
      }
      
      // 添加头像元素（与addMessageToChat相同）
      if (msg.role !== 'system') {
        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-avatar';
        avatarEl.textContent = msg.role === 'user' ? 'U' : 'D';
        messageEl.appendChild(avatarEl);
      }
      
      // 创建内容元素
      const contentEl = document.createElement('div');
      contentEl.className = 'message-content';
      
      // 渲染Markdown内容
      contentEl.innerHTML = this.renderMarkdown(msg.content);
      
      // 添加到消息元素
      messageEl.appendChild(contentEl);
      
      // 添加到消息容器
      this.messagesContainer.appendChild(messageEl);
    });
    
    // 滚动到底部
    this.scrollToBottom(false);
    
    // 隐藏引导提示（如果有）
    const chatIntro = document.getElementById('chat-intro');
    if (chatIntro && this.chatHistory.length > 0) {
      chatIntro.style.display = 'none';
    }
    
    console.log('[INFO] Rendered chat history with', this.chatHistory.length, 'messages');
  }

  /**
   * 处理视频信息更新事件
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
      
      // 添加系统消息通知用户视频已更改
      if (newVideoInfo.title) {
        this.addMessageToChat({
          role: 'system',
          content: `您已切换到新视频: ${newVideoInfo.title}`
        });
      }
      
      // 等待一小段时间，确保字幕已经存储到 local storage
      setTimeout(async () => {
        try {
          // 立即从存储中获取最新字幕
          const subtitlesData = await browser.storage.local.get(['currentSubtitles']);
          if (subtitlesData.currentSubtitles && Array.isArray(subtitlesData.currentSubtitles)) {
            console.log('[INFO] Retrieved updated subtitles after video change, count:', subtitlesData.currentSubtitles.length);
            
            // 发送一个空消息到后端更新上下文
            if (this.authToken && this.apiUrl) {
              const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
              const endpoint = `${baseUrl}/ai/chat-completion-default/`;
              
              // 过滤有效的字幕
              const validSubtitles = subtitlesData.currentSubtitles.filter(s => s && typeof s === 'object' && s.text);
              
              try {
                const response = await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${this.authToken}`
                  },
                  body: JSON.stringify({
                    message: "",  // 空消息，只是为了更新上下文
                    videoId: newVideoId,
                    videoTitle: newVideoInfo.title || '',
                    subtitles: validSubtitles,
                    userId: this.userId || 'anonymous',
                    updateContextOnly: true  // 告诉后端这只是一个上下文更新请求
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
      }, 1000); // 等待1秒确保字幕已经存储
    }
  }

  /**
   * Initialize chat UI
   */
  async initialize() {
    // 防止多次初始化
    if (this.initialized) {
      console.warn('[WARN] ChatUI already initialized, skipping');
      return;
    }
    
    // 设置初始化标志
    this.initialized = true;
    
    // 增加视频变化检测监听
    document.addEventListener('youtube-video-info-updated', this.handleVideoInfoUpdated.bind(this));
    
    console.log('[INFO] ChatUI initialized with API URL:', this.apiUrl);
  }
  
  /**
   * 获取API基础URL
   * @returns {string|null} API基础URL
   */
  getApiBaseUrl() {
    try {
      // 尝试从存储中获取API基础URL
      const environment = localStorage.getItem('environment') || 'production';
      
      // 根据环境返回相应的基础URL
      if (environment === 'localhost') {
        return 'http://localhost:8000/api';
      } else if (environment === 'production') {
        return 'https://dejavocab.com/api';
      }
      
      // 默认返回生产环境URL
      return 'https://dejavocab.com/api';
    } catch (error) {
      console.error('[ERROR] 获取API基础URL失败:', error);
      return null;
    }
  }

  /**
   * Collect subtitles in the background without blocking the message flow
   * This is done asynchronously so the user can continue interacting with the chat
   */
  async collectSubtitlesInBackground() {
    try {
      // 检查当前视频信息和字幕状态
      const storageData = await browser.storage.local.get([
        'currentVideoInfo', 
        'currentSubtitles', 
        'lastSubtitlesVideoId'
      ]);
      
      const currentVideoId = storageData.currentVideoInfo?.videoId;
      const lastSubtitlesVideoId = storageData.lastSubtitlesVideoId;
      
      // 检查是否有有效的字幕
      const hasValidSubtitles = storageData.currentSubtitles && 
        Array.isArray(storageData.currentSubtitles) && 
        storageData.currentSubtitles.length > 0;
      
      // 检查视频是否变化或是否需要重新收集字幕
      const videoChanged = currentVideoId && lastSubtitlesVideoId !== currentVideoId;
      
      console.log('[INFO] 字幕状态检查:', {
        currentVideoId,
        lastSubtitlesVideoId,
        hasValidSubtitles,
        videoChanged
      });
      
      // 仅在需要收集字幕时触发收集操作
      if (currentVideoId && (!hasValidSubtitles || videoChanged)) {
        console.log('[INFO] 需要收集字幕，正在查找YouTube标签页...');
        
        // 异步查询包含YouTube的标签页
        const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
        
        if (tabs && tabs.length > 0) {
          console.log('[INFO] 找到', tabs.length, '个YouTube标签页');
          let collectionTriggered = false;
          
          for (const tab of tabs) {
            try {
              console.log('[DEBUG] 尝试向标签页发送收集请求:', tab.id, tab.url);
              
              // 发送消息触发字幕收集
              const response = await browser.tabs.sendMessage(tab.id, {
                action: 'collectSubtitles',
                videoId: currentVideoId
              });
              
              console.log('[INFO] 字幕收集触发响应:', response);
              
              // 如果任何一个标签页成功触发了字幕收集，就跳出循环
              if (response && response.success) {
                console.log('[INFO] 字幕收集已在标签页', tab.id, '触发');
                
                // 收集成功后，更新lastSubtitlesVideoId
                await browser.storage.local.set({ lastSubtitlesVideoId: currentVideoId });
                console.log('[INFO] 已更新最后字幕视频ID:', currentVideoId);
                
                collectionTriggered = true;
                break;
              }
            } catch (error) {
              console.log('[WARN] 无法在标签页上触发字幕收集:', tab.id, error.message || '未知错误');
            }
          }
          
          if (!collectionTriggered) {
            console.log('[WARN] 所有标签页尝试失败，未能触发字幕收集');
          }
        } else {
          console.log('[WARN] 未找到YouTube标签页，无法触发字幕收集');
        }
      } else if (hasValidSubtitles && !videoChanged) {
        console.log('[INFO] 当前视频已有字幕，且视频未变化，跳过收集');
      } else {
        console.log('[WARN] 无法确定是否需要收集字幕:', {
          currentVideoId,
          hasValidSubtitles,
          videoChanged
        });
      }
    } catch (error) {
      console.error('[ERROR] 检查字幕状态失败:', error);
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
  // 注意：这个函数在侧边面板环境中不可靠，因为侧边面板的URL始终是side-panel.html
  // 我们需要使用background.js检查当前标签页的实际URL
  const isYouTubePage = async () => {
    try {
      // 如果我们在内容脚本环境中，可以直接检查URL
      if (window.location.href.includes('youtube.com')) {
        return true;
      }
      
      // 如果我们在侧边面板环境中，需要请求background代码检查
      if (window.location.href.includes('side-panel.html')) {
        try {
          const response = await browser.runtime.sendMessage({ action: 'checkIfYouTube' });
          return response?.isYouTube || false;
        } catch (err) {
          console.error('[ERROR] 与背景脚本通信时出错:', err);
          return false;
        }
      }
      
      return false;
    } catch (e) {
      console.error('[ERROR] 检查页面类型出错:', e);
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
  
  // 重新实现URL监测功能，确保聊天界面只在支持的网站上显示（YouTube和dejavocab.com）
  // 注意：即使在侧边面板环境中，我们也需要检测当前浏览的页面是否为支持的网站
  if (!window.URL_MONITOR_INITIALIZED && chatUI) {
    window.URL_MONITOR_INITIALIZED = true;
    
    // 使用background.js请求浏览器当前活跃标签页的URL
    const checkCurrentTab = async () => {
      try {
        // 请求background.js检查当前标签页是否为支持的网站
        const response = await browser.runtime.sendMessage({ action: 'checkIfYouTube' });
        console.log('[DEBUG] 检查当前标签页是否为支持的网站:', response);
        
        if (response && response.isYouTube) {
          // 如果是支持的网站且用户已登录，显示聊天界面
          if (chatUI.authToken) {
            console.log('[INFO] 在支持的网站上且用户已登录，显示聊天界面');
            chatUI.activateChatView();
          }
        } else {
          // 如果不是支持的网站，隐藏聊天界面
          console.log('[INFO] 不在支持的网站上，隐藏聊天界面');
          chatUI.deactivateChatView();
        }
      } catch (error) {
        console.error('[ERROR] 检查当前标签页时出错:', error);
      }
    };
    
    // 首次检查
    checkCurrentTab();
    
    // 定期检查浏览器当前标签页（每秒检查一次）
    const tabCheckInterval = setInterval(checkCurrentTab, 1000);
    
    // 存储interval ID以便清除
    window.URL_MONITOR_INTERVAL = tabCheckInterval;
    
    console.log('[INFO] 已启用增强版URL监测功能');
  }
  
  // If not initialized and the container exists, initialize it only on YouTube pages
  if (!window.CHAT_UI_INITIALIZED && document.getElementById('chat-container')) {
    console.log('[INFO] 检查是否在支持的网站上');
    // Check if we're on a YouTube page using various methods
    let onYouTube = isYouTubePage();
    
    if (onYouTube) {
      console.log('[INFO] 在支持的网站上初始化聊天界面');
      try {
        window.CHAT_UI_INITIALIZED = true;
        chatUI.init();
        
        // 直接显示聊天界面
        setTimeout(async () => {
          try {
            // 检查用户是否已登录
            const result = await browser.storage.local.get(['authToken']);
            if (result.authToken) {
              console.log('[INFO] 用户已登录，显示聊天界面');
              chatUI.activateChatView();
            } else {
              console.log('[INFO] 用户未登录，保持登录界面');
            }
          } catch (err) {
            console.error('[ERROR] 检查用户登录状态时出错:', err);
          }
        }, 500);
        
      } catch (error) {
        console.error('[ERROR] 聊天界面初始化失败:', error);
      }
    } else {
      console.log('[INFO] 不在支持的网站上，不初始化聊天界面');
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
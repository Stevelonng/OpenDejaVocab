/**
 * 聊天模式管理器 - 用于处理聊天模式切换
 * 支持两种模式：
 * - default: 默认模式，每次视频变更时重置聊天历史
 * - accumulate: 累积模式，保持聊天历史不变，允许跨视频累积上下文
 */
class ChatModeManager {
  // 单例实例
  static instance = null;
  
  /**
   * 获取聊天模式管理器实例（单例模式）
   * @param {Object} config - 配置对象
   * @returns {ChatModeManager} - 聊天模式管理器实例
   */
  static getInstance(config = {}) {
    if (!ChatModeManager.instance) {
      ChatModeManager.instance = new ChatModeManager(config);
      console.log('[INFO] Created new ChatModeManager instance');
    } else if (config && Object.keys(config).length > 0) {
      // 如果提供了新的配置，更新现有实例
      ChatModeManager.instance.updateConfig(config);
      console.log('[INFO] Updated existing ChatModeManager instance');
    }
    return ChatModeManager.instance;
  }
  
  /**
   * 创建聊天模式管理器实例
   * @param {Object} config - 配置对象
   * @param {Function} config.onModeChange - 模式变更回调
   * @param {Function} config.addSystemMessage - 添加系统消息的方法
   * @param {Function} config.clearChatHistory - 清空聊天历史的方法
   * @param {Function} config.exportChatSession - 导出聊天会话的方法
   */
  constructor(config = {}) {
    // 全局单例检查
    if (window.CHAT_MODE_MANAGER_INSTANCE) {
      console.log('[INFO] 返回已有的ChatModeManager实例');
      return window.CHAT_MODE_MANAGER_INSTANCE;
    }
    
    // 设置为全局单例
    window.CHAT_MODE_MANAGER_INSTANCE = this;
    
    // 配置属性
    this.onModeChange = config.onModeChange || ((mode) => console.log('Mode changed to:', mode));
    this.addSystemMessage = config.addSystemMessage || ((msg) => console.log('System message:', msg));
    this.clearChatHistory = config.clearChatHistory || (() => console.log('Chat history cleared'));
    // 添加导出会话功能的回调
    this.exportChatSession = config.exportChatSession || (() => console.log('Export chat session (not implemented)'));
    
    // 状态属性
    this.currentMode = 'default'; // 默认为普通模式
    
    // 初始化标记
    this.initialized = false;
    this.eventsInitialized = false;
    
    // 防抖控制
    this.isToggling = false;
    
    // 绑定方法到实例 - 确保在事件处理时保持正确的this引用
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
    
    // 检查聊天记录的回调函数
    this._checkChatHistoryCallback = null;
    
    console.log('[INFO] 创建ChatModeManager实例完成');
  }
  
  /**
   * 更新配置
   * @param {Object} config - 新的配置对象
   */
  updateConfig(config) {
    if (config.onModeChange) this.onModeChange = config.onModeChange;
    if (config.addSystemMessage) this.addSystemMessage = config.addSystemMessage;
    if (config.clearChatHistory) this.clearChatHistory = config.clearChatHistory;
    // 更新导出会话方法的引用
    if (config.exportChatSession) this.exportChatSession = config.exportChatSession;
  }
  
  /**
   * 初始化聊天模式管理器
   * @returns {Promise<void>}
   */
  async initialize() {
    // 防止重复初始化
    if (this.initialized) {
      console.log('[INFO] ChatModeManager已经初始化，跳过');
      return;
    }
    
    console.log('[INFO] 初始化ChatModeManager');
    
    // 标记为已初始化
    this.initialized = true;
    
    // 加载保存的模式设置
    await this.loadSavedMode();
    console.log('[INFO] 当前聊天模式:', this.currentMode);
    
    // 主动检查是否存在活跃会话，如果有则自动激活专注模式
    await this.checkActiveSession();
    
    // 初始化按钮UI
    this.updateButtonUI();
    
    // 绑定按钮点击事件和事件监听器
    this.bindEvents();
    
    // 初始化视频列表显示状态
    this.toggleVideoListVisibility();
    
    console.log('[INFO] ChatModeManager初始化完成');
  }
  
  /**
   * 切换按钮点击事件处理
   * @param {Event} e - 点击事件
   */
  onToggleButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[INFO] Chat mode toggle button clicked - DEPRECATED METHOD');
    
    // 防止重复点击
    if (this.isToggling) {
      console.log('[INFO] Toggle already in progress, ignoring click');
      return;
    }
    
    // 设置防抖状态
    this.isToggling = true;
    
    // 使用setTimeout确保异步执行
    setTimeout(async () => {
      await this.toggle();
      
      // 添加短暂延迟防止快速连续点击
      setTimeout(() => {
        this.isToggling = false;
      }, 200);
    }, 0);
  }
  
  /**
   * 切换聊天模式
   * @returns {Promise<void>}
   */
  async toggle() {
    // 记录之前的模式，用于判断切换方向
    const previousMode = this.currentMode;
    
    // 计算目标模式
    const targetMode = this.currentMode === 'accumulate' ? 'default' : 'accumulate';
    
    console.log('[INFO] Switching chat mode from', this.currentMode, 'to', targetMode);
    
    // 切换模式
    this.currentMode = targetMode;
    
    // 保存设置
    await this.saveMode();
    
    // 如果从累积模式切换到默认模式，首先导出会话记录再清空历史
    if (previousMode === 'accumulate' && this.currentMode === 'default') {
      // 检查是否需要导出会话（是否有聊天记录）
      try {
        // 先检查是否有聊天记录可以导出
        const hasChatHistory = await this.checkHasChatHistory();
        
        if (hasChatHistory) {
          console.log('[INFO] 从累积模式切换到默认模式，自动导出会话');
          // 导出当前会话
          await this.exportChatSession();
          console.log('[INFO] 会话导出成功');
          
          // 不再显示会话结束通知，使用模式切换通知代替
          // 在sendModeChangeMessage()中会显示专注模式已关闭的通知
        } else {
          console.log('[INFO] 没有聊天记录，跳过导出步骤');
        }
      } catch (error) {
        console.error('[ERROR] 自动导出会话失败:', error);
      }
      
      // 然后清空会话历史
      this.clearChatHistory();
    } else if (this.currentMode === 'default') {
      // 如果本来就是默认模式，只清空历史
      this.clearChatHistory();
    }
    
    // 更新按钮UI
    this.updateButtonUI();
    
    // 发送模式变更的系统消息
    this.sendModeChangeMessage();
    
    // 触发模式变更回调
    this.onModeChange(this.currentMode);
    
    // 切换视频列表的显示状态
    this.toggleVideoListVisibility();
    
    // 不再需要这里调用fetchSessionVideos，因为toggleVideoListVisibility已经会调用它
    // if (this.currentMode === 'accumulate') {
    //   this.fetchSessionVideos();
    // }
  }
  
  /**
   * 向聊天添加模式切换提示消息
   */
  sendModeChangeMessage() {
    if (!this.addSystemMessage) {
      console.warn('[WARN] addSystemMessage function not available');
      return;
    }
    
    // 针对不同模式准备更生动的描述
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
    
    // 添加调试标记
    console.log('[DEBUG] 发送模式切换消息, 当前模式:', this.currentMode);
    
    // 只使用一种方式显示消息，避免重复
    try {
      // 优先使用通知系统
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.showModeChangeNotification(modeTitle, modeDesc);
        console.log('[INFO] 通过通知系统显示了模式切换消息');
        // 重要: 不再添加系统消息，避免重复
      } else {
        // 如果通知系统不可用，使用系统消息
        if (this.currentMode === 'accumulate') {
          this.addSystemMessage(`${modeTitle}\n不同视频上下文将持续保留\n再次点击专注模式按钮退出专注模式\n退出后对话将被保存，并自动生成学习总结`);
        } else {
          this.addSystemMessage(`${modeTitle}\n${modeDesc}`);
        }
        console.log('[INFO] 通过系统消息显示了模式切换消息');
      }
    } catch (error) {
      console.error('[ERROR] 显示模式切换通知失败:', error);
      // 出错时使用系统消息作为后备方案
      if (this.currentMode === 'accumulate') {
        this.addSystemMessage(`专注模式已启用\n不同视频上下文将持续保留\n再次点击专注模式按钮退出专注模式\n退出后对话将被保存，并自动生成学习总结`);
      } else {
        this.addSystemMessage(`专注模式已关闭\n${modeDesc}`);
      }
    }
  }
  
  /**
   * 从浏览器存储加载保存的模式设置
   */
  async loadSavedMode() {
    try {
      const browser = window.browser || window.chrome;
      const settings = await browser.storage.local.get(['chatMode']);
      this.currentMode = settings.chatMode || 'default';
      console.log('[INFO] Loaded chat mode setting:', this.currentMode);
      
      // 如果加载后是专注模式，立即切换视频列表可见性并获取视频列表
      if (this.currentMode === 'accumulate') {
        console.log('[INFO] 当前为专注模式，自动获取会话视频列表');
        this.toggleVideoListVisibility();
        this.fetchSessionVideos();
      }
    } catch (error) {
      console.error('[ERROR] Failed to load chat mode setting:', error);
      this.currentMode = 'default';
    }
  }
  
  /**
   * 获取当前聊天模式
   * @returns {string} 当前模式
   */
  getCurrentMode() {
    return this.currentMode;
  }
  
  /**
   * 获取当前会话的视频列表
   * 仅在专注模式下使用
   */
  async fetchSessionVideos() {
    if (this.currentMode !== 'accumulate') {
      console.log('[INFO] 非专注模式，跳过获取视频列表');
      return [];
    }
    
    try {
      console.log('[INFO] 正在获取当前会话视频列表...');
      // 获取当前YouTube视频ID（如果有）
      let currentVideoId = '';
      try {
        const url = new URL(window.location.href);
        const urlParams = new URLSearchParams(url.search);
        currentVideoId = urlParams.get('v') || '';
      } catch (error) {
        console.log('[WARN] 无法从URL获取视频ID:', error);
      }
      
      // 获取认证令牌和基础URL
      const chatUI = window.getChatUI ? window.getChatUI() : null;
      const apiUrl = chatUI ? chatUI.apiUrl : '/api';
      const authToken = chatUI ? chatUI.authToken : '';
      
      // 确保URL格式正确
      const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
      
      // 请求后端API获取会话中所有视频
      const url = `${baseUrl}chat/session-videos/?current_video_id=${currentVideoId}`;
      console.log('[INFO] 请求会话视频列表:', url);
      
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
        throw new Error(`获取视频列表失败: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[INFO] 成功获取会话视频列表:', data);
      
      // 更新UI
      this.updateVideoListUI(data.videos);
      
      return data.videos;
    } catch (error) {
      console.error('[ERROR] 获取会话视频列表失败:', error);
      return [];
    }
  }
  
  /**
   * 更新视频列表UI
   * @param {Array} videos - 视频列表数据
   */
  updateVideoListUI(videos) {
    if (!videos || videos.length === 0) {
      console.log('[INFO] 没有会话视频，跳过更新UI');
      return;
    }
    
    try {
      // 查找视频列表容器和列表元素
      const videoListContainer = document.getElementById('session-videos-container');
      
      // 如果容器不存在，通过createVideoListPanel方法创建
      if (!videoListContainer) {
        console.log('[INFO] 视频列表容器不存在，创建新容器');
        this.createVideoListPanel();
        return;
      }
      
      // 获取视频列表元素
      let videoList = document.getElementById('session-videos-list');
      
      // 如果列表元素不存在，创建它
      if (!videoList) {
        console.log('[INFO] 视频列表元素不存在，创建新的列表元素');
        videoList = document.createElement('ul');
        videoList.id = 'session-videos-list';
        videoList.className = 'session-videos-list';
        videoListContainer.appendChild(videoList);
      }
      
      // 清空现有内容
      videoList.innerHTML = '';
      
      // 添加视频项
      videos.forEach(video => {
        try {
          const listItem = document.createElement('li');
          listItem.className = 'session-video-item';
          listItem.dataset.videoId = video.video_id;
          
          // 创建缩略图元素
          const thumbnailContainer = document.createElement('div');
          thumbnailContainer.className = 'video-thumbnail'; // 修改为与CSS匹配的类名
          
          // 创建缩略图图片
          const thumbnailImg = document.createElement('img');
          thumbnailImg.src = `https://i.ytimg.com/vi/${video.video_id}/default.jpg`;
          thumbnailImg.alt = video.title || `视频 ${video.video_id}`;
          thumbnailImg.loading = 'lazy'; // 延迟加载图片
          thumbnailContainer.appendChild(thumbnailImg);
          
          // 创建视频信息容器
          const videoInfo = document.createElement('div');
          videoInfo.className = 'video-info'; // 修改为与CSS匹配的类名
          
          // 创建视频标题元素
          const videoTitle = document.createElement('div');
          videoTitle.className = 'session-video-title';
          videoTitle.textContent = video.title || `视频 ${video.video_id}`;
          videoInfo.appendChild(videoTitle);
          
          // 添加点击事件，点击后导航到该视频
          listItem.addEventListener('click', () => {
            // 构建YouTube视频URL
            const videoUrl = `https://www.youtube.com/watch?v=${video.video_id}`;
            
            // 使用chrome.tabs API在主标签页中导航
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs && tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, {url: videoUrl});
              } else {
                // 如果找不到活动标签页，则创建一个新标签页
                chrome.tabs.create({url: videoUrl});
              }
            });
          });
          
          // 将缩略图和标题添加到列表项
          listItem.appendChild(thumbnailContainer);
          listItem.appendChild(videoInfo);
          
          // 将列表项添加到列表
          videoList.appendChild(listItem);
        } catch (err) {
          console.error('[ERROR] 添加视频项时出错:', err, video);
        }
      });
      
      console.log('[INFO] 视频列表UI更新完成，显示了', videos.length, '个视频');
    } catch (error) {
      console.error('[ERROR] 更新视频列表UI失败:', error);
    }
  }
  
  /**
   * 根据当前模式切换视频列表的可见性
   */
  toggleVideoListVisibility() {
    try {
      // 根据当前模式决定视频列表是否可见
      const shouldBeVisible = this.currentMode === 'accumulate';
      console.log('[INFO] 视频列表应该显示:', shouldBeVisible, ', 当前模式:', this.currentMode);
      
      // 处理悬浮按钮
      this.handleFloatingButton(shouldBeVisible);
      
      // 如果不应该显示，直接隐藏视频列表容器（如果存在）
      if (!shouldBeVisible) {
        const videoListContainer = document.getElementById('session-videos-container');
        if (videoListContainer) {
          videoListContainer.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('[ERROR] 切换视频列表可见性时出错:', error);
    }
  }
  
  /**
   * 处理悬浮按钮的创建和显示
   * @param {boolean} shouldBeVisible - 按钮是否应该显示
   */
  handleFloatingButton(shouldBeVisible) {
    try {
      // 查找按钮元素
      let toggleButton = document.getElementById('video-list-toggle-button');
      
      // 如果按钮不存在且应该显示，则创建按钮
      if (!toggleButton && shouldBeVisible) {
        // 创建悬浮按钮
        toggleButton = document.createElement('button');
        toggleButton.id = 'video-list-toggle-button';
        toggleButton.className = 'video-list-toggle-button';
        toggleButton.innerHTML = '<i class="bi bi-collection-play"></i>';
        toggleButton.title = '显示当前会话视频';
        
        // 添加点击事件
        toggleButton.addEventListener('click', () => {
          this.toggleVideoListPanel();
        });
        
        // 将按钮添加到聊天容器
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
          chatContainer.appendChild(toggleButton);
          console.log('[INFO] 视频列表悬浮按钮已添加');
        } else {
          console.warn('[WARN] 无法找到聊天容器');
          return;
        }
        
        // 初次创建按钮时，确保视频列表面板也被创建
        this.createVideoListPanel();
      }
      
      // 根据模式显示或隐藏按钮
      if (toggleButton) {
        toggleButton.style.display = shouldBeVisible ? 'flex' : 'none';
      }
    } catch (error) {
      console.error('[ERROR] 处理视频列表悬浮按钮时出错:', error);
    }
  }
  
  /**
   * 创建视频列表面板
   */
  createVideoListPanel() {
    try {
      // 查找视频列表容器
      let videoListContainer = document.getElementById('session-videos-container');
      
      // 如果容器已存在，不需要重新创建
      if (videoListContainer) {
        return;
      }
      
      // 创建容器
      videoListContainer = document.createElement('div');
      videoListContainer.id = 'session-videos-container';
      videoListContainer.className = 'session-videos-container';
      
      // 创建标题
      const titleElement = document.createElement('div');
      titleElement.className = 'session-videos-title';
      titleElement.innerHTML = '<i class="bi bi-collection-play"></i> 当前会话视频 <i class="bi bi-x-lg close-icon"></i>';
      
      // 添加关闭按钮点击事件
      const closeIcon = titleElement.querySelector('.close-icon');
      if (closeIcon) {
        // 确保只添加一次事件监听器
        const handleCloseClick = (e) => {
          this.toggleVideoListPanel(false); // 关闭面板
          e.stopPropagation();
        };
        closeIcon.addEventListener('click', handleCloseClick, { once: true });
      }
      
      videoListContainer.appendChild(titleElement);
      
      // 创建列表元素
      const videoList = document.createElement('ul');
      videoList.id = 'session-videos-list';
      videoList.className = 'session-videos-list';
      videoListContainer.appendChild(videoList);
      
      // 将视频列表添加到聊天容器
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) {
        chatContainer.appendChild(videoListContainer);
        console.log('[INFO] 视频列表面板已创建');
      } else {
        console.warn('[WARN] 无法找到聊天容器');
      }
      
      // 立即获取视频列表数据
      this.fetchSessionVideos();
    } catch (error) {
      console.error('[ERROR] 创建视频列表面板时出错:', error);
    }
  }
  
  /**
   * 切换视频列表面板的显示状态
   * @param {boolean|undefined} forceState - 如果提供，强制设置为指定状态
   */
  toggleVideoListPanel(forceState) {
    try {
      // 查找视频列表容器
      const videoListContainer = document.getElementById('session-videos-container');
      if (!videoListContainer) {
        console.warn('[WARN] 视频列表容器不存在');
        return;
      }
      
      // 当前是否可见
      const isVisible = videoListContainer.classList.contains('visible');
      
      // 根据参数或当前状态决定新状态
      const newState = forceState !== undefined ? forceState : !isVisible;
      
      if (newState) {
        // 显示面板
        videoListContainer.style.display = 'flex';
        // 使用setTimeout确保display更改已应用后再添加visible类
        setTimeout(() => {
          videoListContainer.classList.add('visible');
          
          // 重新绑定关闭按钮事件（可能在DOM更新中丢失）
          const closeIcon = videoListContainer.querySelector('.close-icon');
          if (closeIcon) {
            // 确保只添加一次事件监听器
            closeIcon.addEventListener('click', (e) => {
              this.toggleVideoListPanel(false);
              e.stopPropagation();
            }, { once: true });
          }
        }, 10);
        
        // 获取最新视频列表
        this.fetchSessionVideos();
      } else {
        // 隐藏面板
        videoListContainer.classList.remove('visible');
        // 等待过渡动画完成后隐藏元素
        setTimeout(() => {
          if (!videoListContainer.classList.contains('visible')) {
            videoListContainer.style.display = 'none';
          }
        }, 300); // 与CSS过渡时间相匹配
      }
    } catch (error) {
      console.error('[ERROR] 切换视频列表面板显示状态时出错:', error);
    }
  }
  
  /**
   * 将当前模式保存到浏览器存储
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
   * 检查是否有聊天记录
   * @returns {Promise<boolean>} 是否有聊天记录
   */
  async checkHasChatHistory() {
    // 这里实现检查聊天记录的逻辑
    // 由于没有直接访问ChatUI的聊天历史数组，我们需要通过回调来获取
    // 如果回调不存在，我们假定没有聊天记录
    if (typeof this._checkChatHistoryCallback === 'function') {
      return await this._checkChatHistoryCallback();
    }
    
    // 默认假设没有聊天记录，以安全为主
    return false;
  }
  
  /**
   * 设置检查聊天记录的回调函数
   * @param {Function} callback - 检查聊天记录的回调函数
   */
  setCheckChatHistoryCallback(callback) {
    if (typeof callback === 'function') {
      this._checkChatHistoryCallback = callback;
    }
  }
  
  /**
   * 检查是否存在活跃会话
   * 如果存在活跃会话但当前不是专注模式，则自动激活专注模式
   * @returns {Promise<void>}
   */
  async checkActiveSession() {
    try {
      console.log('[INFO] 正在检查是否存在活跃会话...');
      
      // 获取认证令牌和基础URL
      const chatUI = window.getChatUI ? window.getChatUI() : null;
      const apiUrl = chatUI ? chatUI.apiUrl : '/api';
      const authToken = chatUI ? chatUI.authToken : '';
      
      // 确保URL格式正确
      const baseUrl = apiUrl.endsWith('/') ? apiUrl : apiUrl + '/';
      
      // 请求后端API获取会话状态
      const url = `${baseUrl}chat/session-status/`;
      console.log('[INFO] 请求会话状态:', url);
      
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
        console.warn(`[WARN] 获取会话状态失败: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      console.log('[INFO] 会话状态数据:', data);
      
      // 如果有活跃会话但当前不是专注模式，则自动激活专注模式
      if (data.has_active_session && this.currentMode !== 'accumulate') {
        console.log('[INFO] 检测到活跃会话，自动激活专注模式');
        this.currentMode = 'accumulate';
        await this.saveMode();
        
        // 通知用户专注模式已自动激活
        const notificationSystem = window.NotificationSystem;
        if (notificationSystem) {
          notificationSystem.showNotification('专注模式已自动激活', '检测到活跃的聊天会话', 'info', 5000);
        }
        
        // 更新UI
        this.updateButtonUI();
        this.toggleVideoListVisibility();
        this.fetchSessionVideos();
      }
    } catch (error) {
      console.error('[ERROR] 检查活跃会话状态失败:', error);
    }
  }
  
  /**
   * 更新切换按钮UI
   */
  updateButtonUI() {
    if (!this.toggleButton) {
      // 尝试再次获取按钮（可能在DOM更新后变得可用）
      this.toggleButton = document.getElementById('chat-mode-toggle');
      if (!this.toggleButton) {
        console.warn('[WARN] Toggle button not found in updateButtonUI');
        return;
      }
    }
    
    try {
      console.log('[INFO] Updating button UI for mode:', this.currentMode);
      
      // 更新按钮外观 - 只修改激活类，不改变内容
      if (this.currentMode === 'accumulate') {
        // 专注模式激活状态
        this.toggleButton.classList.add('active');
        // 更新样式以显示激活状态
        this.toggleButton.style.backgroundColor = '#4f46e5';
        this.toggleButton.style.color = '#ffffff';
      } else {
        // 专注模式未激活状态
        this.toggleButton.classList.remove('active');
        // 恢复默认样式
        this.toggleButton.style.backgroundColor = '';
        this.toggleButton.style.color = '';
      }
      
      console.log('[INFO] Button UI updated successfully');
    } catch (error) {
      console.error('[ERROR] Error updating button UI:', error);
    }
  }
  
  /**
   * 绑定事件
   */
  bindEvents() {
    // 防止重复绑定事件
    if (this.eventsInitialized) {
      console.log('[INFO] 事件已经绑定，跳过');
      return;
    }
    
    // 获取切换按钮
    this.toggleButton = document.getElementById('chat-mode-toggle');
    
    if (!this.toggleButton) {
      console.log('[WARN] 找不到聊天模式切换按钮');
      return;
    }
    
    console.log('[INFO] 绑定聊天模式切换按钮事件');
    
    // 移除可能存在的旧事件监听器
    if (this.boundClickHandler) {
      console.log('[INFO] 移除已有的事件监听器');
      this.toggleButton.removeEventListener('click', this.boundClickHandler);
    }
    
    // 创建新的点击处理函数
    this.boundClickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[INFO] 聊天模式切换按钮点击');
      
      // 防止重复点击
      if (this.isToggling) {
        console.log('[INFO] 切换正在进行中，忽略点击');
        return;
      }
      
      // 设置防抖状态
      this.isToggling = true;
      
      // 切换模式
      this.toggle().then(() => {
        // 完成后重置防抖状态
        setTimeout(() => {
          this.isToggling = false;
        }, 300); // 增加时间为300ms
      });
    };
    
    // 绑定点击事件
    this.toggleButton.addEventListener('click', this.boundClickHandler);
    
    // 监听视频变化消息
    window.addEventListener('message', (event) => {
      // 检查是否是视频变化事件
      if (event.data && event.data.type === 'videoChanged') {
        console.log('[INFO] 检测到视频变化，刷新视频列表');
        // 如果当前是专注模式，刷新视频列表
        if (this.currentMode === 'accumulate') {
          // 延迟刷新以确保后端数据已更新
          setTimeout(() => {
            this.fetchSessionVideos();
          }, 1000);
        }
      }
    });
    
    // 监听API请求完成事件
    document.addEventListener('apiRequestCompleted', (event) => {
      console.log('[INFO] 检测到API请求完成，检查是否需要刷新视频列表');
      // 如果当前是专注模式，刷新视频列表
      if (this.currentMode === 'accumulate') {
        this.fetchSessionVideos();
      }
    });
    
    // 标记为已绑定事件
    this.eventsInitialized = true;
    
    console.log('[INFO] 聊天模式切换按钮事件监听器设置完成');
  }
  
}

// 导出模式管理器
export default ChatModeManager;

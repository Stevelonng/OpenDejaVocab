

// 通知系统类
class NotificationSystem {
  /**
   * 单例模式获取实例
   */
  static getInstance() {
    if (!NotificationSystem._instance) {
      NotificationSystem._instance = new NotificationSystem();
    }
    return NotificationSystem._instance;
  }
  
  /**
   * 构造函数
   */
  constructor() {
    // 防止重复初始化
    if (NotificationSystem._instance) {
      console.warn('[WARNING] NotificationSystem 已经初始化，请使用 getInstance() 方法获取实例');
      return NotificationSystem._instance;
    }
    
    // 初始化属性
    this.container = null;
    this.queue = [];
    this.currentNotification = null;
    this.isShowing = false;
    this.initialized = false;
    
    // 绑定方法
    this.initialize = this.initialize.bind(this);
    this.show = this.show.bind(this);
    this.dismiss = this.dismiss.bind(this);
    this.createNotificationElement = this.createNotificationElement.bind(this);
    this.processQueue = this.processQueue.bind(this);
    
    // 记录实例
    NotificationSystem._instance = this;
  }
  
  /**
   * Initializes the notification system
   */
  initialize() {
    // Prevent re-initialization
    if (this.initialized) {
      console.log('[INFO] Notification system already initialized');
      return;
    }
    
    console.log('[INFO] Initializing notification system');
    
    // Create notification container
    this.container = document.getElementById('notification-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'notification-container';
      this.container.className = 'notification-container';
      document.body.appendChild(this.container);
    }
    
    this.initialized = true;
  }
  
  /**
   * Creates a notification card element
   * @private
   * @param {Object} options - Notification options
   * @returns {HTMLElement} - Notification element
   */
  createNotificationElement(options) {
    const {
      type = 'info',
      title,
      message,
      icon = null,
      onClose = null,
      buttonText = '确定',  
      onButtonClick = null,
      buttons = null, 
      autoClose = false,
      autoCloseDelay = 5000,
      allowHTML = false
    } = options;
    
    // Create notification card
    const card = document.createElement('div');
    card.className = `notification-card ${type}`;
    card.setAttribute('role', 'alert');
    
    // Create icon
    const iconContainer = document.createElement('div');
    iconContainer.className = 'notification-icon';
    
    // Correctly handle icon content
    const iconElement = document.createElement('i');
    
    // Ensure icon class name contains bi prefix
    if (icon) {
      let iconClass = icon;
      // Add bi prefix if not present
      if (!iconClass.startsWith('bi-') && !iconClass.startsWith('bi ')) {
        iconClass = `bi-${iconClass}`;
      }
      // Ensure base bi class
      if (!iconClass.includes('bi ')) {
        iconClass = `bi ${iconClass}`;
      }
      iconElement.className = iconClass;
    } else {
      // Default icon
      iconElement.className = 'bi bi-info-circle';
    }
    
    iconContainer.appendChild(iconElement);
    
    // Create title
    const titleElement = document.createElement('div');
    titleElement.className = 'notification-title';
    titleElement.textContent = title;
    
    // Create content
    const contentElement = document.createElement('div');
    contentElement.className = 'notification-content';
    if (allowHTML) {
      contentElement.innerHTML = message;
    } else {
      contentElement.textContent = message;
    }
    
    // Assemble the basic structure of the notification card
    card.appendChild(iconContainer);
    card.appendChild(titleElement);
    card.appendChild(contentElement);
    
    // Handle button area
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      // Multi-button mode
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'notification-button-container';
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '10px';
      buttonContainer.style.marginTop = '10px';
      
      // Add each button
      buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = 'notification-button';
        if (btn.className) {
          button.className += ` ${btn.className}`;
        }
        button.textContent = btn.text || 'Button';
        
        // Set button style
        if (btn.style) {
          Object.keys(btn.style).forEach(key => {
            button.style[key] = btn.style[key];
          });
        }
        
        // Add click event
        button.addEventListener('click', () => {
          // Execute callback
          if (typeof btn.onClick === 'function') {
            btn.onClick();
          }
          
          // If the button configures the close notification flag, close the notification
          if (btn.closeNotification !== false) {
            this.dismiss(card);
          }
        });
        
        buttonContainer.appendChild(button);
      });
      
      card.appendChild(buttonContainer);
    } else {
      // Single button mode (for backward compatibility)
      const button = document.createElement('button');
      button.className = 'notification-button';
      button.textContent = buttonText;
      button.addEventListener('click', () => {
        // Execute callback
        if (typeof onButtonClick === 'function') {
          onButtonClick();
        }
        
        // Close notification
        this.dismiss(card);
      });
      
      card.appendChild(button);
    }
    
    // Auto-close
    if (autoClose) {
      setTimeout(() => {
        if (card.parentNode) {
          this.dismiss(card);
        }
      }, autoCloseDelay);
    }
    
    return card;
  }
  
  /**
   * Show notification
   * @param {Object} options - Notification options
   */
  show(options) {
    // Ensure initialization
    if (!this.initialized) {
      this.initialize();
    }
    
    // Create notification element
    const notification = {
      element: this.createNotificationElement(options),
      options
    };
    
    // If a notification is already showing, add to queue
    if (this.isShowing) {
      this.queue.push(notification);
      return;
    }
    
    // Show notification
    this.isShowing = true;
    this.currentNotification = notification;
    
    // Add to container
    this.container.appendChild(notification.element);
    
    // Trigger reflow
    notification.element.offsetHeight;
    
    // Animate
    setTimeout(() => {
      notification.element.classList.add('active');
    }, 10);
  }
  
  /**
   * Close notification
   * @param {HTMLElement} element - Notification element
   */
  dismiss(element) {
    // Remove active class
    element.classList.remove('active');
    
    // Wait for animation to complete and remove element
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      
      this.isShowing = false;
      this.currentNotification = null;
      
      // Process the next notification in the queue
      this.processQueue();
    }, 300);
  }
  
  /**
   * Process queue of notifications
   */
  processQueue() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.show(next.options);
    }
  }
  
  /**
   * Shortcut method: show info notification
   * @param {string} message - Notification content
   * @param {Object} options - Other options
   */
  info(message, options = {}) {
    this.show({
      type: 'info',
      title: '信息',
      message,
      icon: 'info-circle',
      ...options
    });
  }
  
  /**
   * Shortcut method: show success notification
   * @param {string} message - Notification content
   * @param {Object} options - Other options
   */
  success(message, options = {}) {
    this.show({
      type: 'success',
      title: '成功',
      message,
      icon: 'check-circle',
      ...options
    });
  }
  
  /**
   * Shortcut method: show warning notification
   * @param {string} message - Notification content
   * @param {Object} options - Other options
   */
  warning(message, options = {}) {
    this.show({
      type: 'warning',
      title: '警告',
      message,
      icon: 'exclamation-triangle',
      ...options
    });
  }
  
  /**
   * Shortcut method: show error notification
   * @param {string} message - Notification content
   * @param {Object} options - Other options
   */
  error(message, options = {}) {
    this.show({
      type: 'error',
      title: '错误',
      message,
      icon: 'x-circle',
      ...options
    });
  }
  
  /**
   * Show mode change notification
   * @param {string} mode - The mode being changed
   * @param {string} description - Mode description
   */
  showModeChangeNotification(mode, description) {
    const title = `${mode}`;
    // Determine mode type and use more appropriate icon
    let icon = 'lightning';
    
    if (mode.includes('专注模式已启用') || mode.includes('已启用')) {
      icon = 'lightbulb'; // Enable focus mode with bulb icon
    } else if (mode.includes('专注模式已退出') || mode.includes('已关闭') || mode.includes('已退出')) {
      icon = 'journal-text'; // Exit focus mode with notes/summary icon
    }
    
    this.show({
      type: 'mode-change',
      title,
      message: description,
      icon,
      buttonText: '我知道了',
      allowHTML: true // Allow HTML content
    });
  }
  
  /**
   * Show session end notification
   */
  showSessionEndNotification() {
    this.show({
      type: 'success',
      title: '会话已结束',
      message: '新会话已准备就绪！',
      icon: 'check2-circle',
      buttonText: '开始新会话'
    });
  }
}

window.NotificationSystem = NotificationSystem;

export default NotificationSystem;

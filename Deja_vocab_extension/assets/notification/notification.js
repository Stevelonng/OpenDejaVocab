/**
 * Déjà Vocab - 高级通知系统
 * 单例模式实现，防止多次初始化
 */

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
   * 初始化通知系统
   */
  initialize() {
    // 防止重复初始化
    if (this.initialized) {
      console.log('[INFO] 通知系统已经初始化');
      return;
    }
    
    console.log('[INFO] 初始化通知系统');
    
    // 创建通知容器
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
   * 创建通知卡片元素
   * @private
   * @param {Object} options - 通知选项
   * @returns {HTMLElement} - 通知元素
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
    
    // 创建通知卡片
    const card = document.createElement('div');
    card.className = `notification-card ${type}`;
    card.setAttribute('role', 'alert');
    
    // 创建图标
    const iconContainer = document.createElement('div');
    iconContainer.className = 'notification-icon';
    
    // 正确处理图标内容
    const iconElement = document.createElement('i');
    
    // 确保图标类名正确包含bi前缀
    if (icon) {
      let iconClass = icon;
      // 如果没有bi前缀，添加它
      if (!iconClass.startsWith('bi-') && !iconClass.startsWith('bi ')) {
        iconClass = `bi-${iconClass}`;
      }
      // 确保有基础bi类
      if (!iconClass.includes('bi ')) {
        iconClass = `bi ${iconClass}`;
      }
      iconElement.className = iconClass;
    } else {
      // 默认图标
      iconElement.className = 'bi bi-info-circle';
    }
    
    iconContainer.appendChild(iconElement);
    
    // 创建标题
    const titleElement = document.createElement('div');
    titleElement.className = 'notification-title';
    titleElement.textContent = title;
    
    // 创建内容
    const contentElement = document.createElement('div');
    contentElement.className = 'notification-content';
    if (allowHTML) {
      contentElement.innerHTML = message;
    } else {
      contentElement.textContent = message;
    }
    
    // 组装通知卡片的基础结构
    card.appendChild(iconContainer);
    card.appendChild(titleElement);
    card.appendChild(contentElement);
    
    // 处理按钮区域
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      // 多按钮模式
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'notification-button-container';
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '10px';
      buttonContainer.style.marginTop = '10px';
      
      // 添加每个按钮
      buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = 'notification-button';
        if (btn.className) {
          button.className += ` ${btn.className}`;
        }
        button.textContent = btn.text || '按钮';
        
        // 设置按钮样式
        if (btn.style) {
          Object.keys(btn.style).forEach(key => {
            button.style[key] = btn.style[key];
          });
        }
        
        // 添加点击事件
        button.addEventListener('click', () => {
          // 执行回调
          if (typeof btn.onClick === 'function') {
            btn.onClick();
          }
          
          // 如果按钮配置了关闭通知的标志，则关闭通知
          if (btn.closeNotification !== false) {
            this.dismiss(card);
          }
        });
        
        buttonContainer.appendChild(button);
      });
      
      card.appendChild(buttonContainer);
    } else {
      // 单按钮模式（兼容旧版本）
      const button = document.createElement('button');
      button.className = 'notification-button';
      button.textContent = buttonText;
      button.addEventListener('click', () => {
        // 执行回调
        if (typeof onButtonClick === 'function') {
          onButtonClick();
        }
        
        // 关闭通知
        this.dismiss(card);
      });
      
      card.appendChild(button);
    }
    
    // 自动关闭
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
   * 显示通知
   * @param {Object} options - 通知选项
   */
  show(options) {
    // 确保初始化
    if (!this.initialized) {
      this.initialize();
    }
    
    // 创建通知元素
    const notification = {
      element: this.createNotificationElement(options),
      options
    };
    
    // 如果正在显示通知，则加入队列
    if (this.isShowing) {
      this.queue.push(notification);
      return;
    }
    
    // 显示通知
    this.isShowing = true;
    this.currentNotification = notification;
    
    // 添加到容器
    this.container.appendChild(notification.element);
    
    // 触发重绘
    notification.element.offsetHeight;
    
    // 濬动物画
    setTimeout(() => {
      notification.element.classList.add('active');
    }, 10);
  }
  
  /**
   * 关闭通知
   * @param {HTMLElement} element - 通知元素
   */
  dismiss(element) {
    // 移除激活类
    element.classList.remove('active');
    
    // 等待动画完成后移除元素
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      
      this.isShowing = false;
      this.currentNotification = null;
      
      // 处理队列中的下一个通知
      this.processQueue();
    }, 300);
  }
  
  /**
   * 处理队列中的通知
   */
  processQueue() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.show(next.options);
    }
  }
  
  /**
   * 快捷方法：显示信息通知
   * @param {string} message - 通知内容
   * @param {Object} options - 其他选项
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
   * 快捷方法：显示成功通知
   * @param {string} message - 通知内容
   * @param {Object} options - 其他选项
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
   * 快捷方法：显示警告通知
   * @param {string} message - 通知内容
   * @param {Object} options - 其他选项
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
   * 快捷方法：显示错误通知
   * @param {string} message - 通知内容
   * @param {Object} options - 其他选项
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
   * 显示模式切换通知
   * @param {string} mode - 切换的模式
   * @param {string} description - 模式描述
   */
  showModeChangeNotification(mode, description) {
    const title = `${mode}`;
    // 根据标题判断模式类型，使用更合适的图标
    let icon = 'lightning';
    
    if (mode.includes('专注模式已启用') || mode.includes('已启用')) {
      icon = 'lightbulb'; // 启用专注模式用灯泡图标
    } else if (mode.includes('专注模式已退出') || mode.includes('已关闭') || mode.includes('已退出')) {
      icon = 'journal-text'; // 退出专注模式用笔记/总结图标
    }
    
    this.show({
      type: 'mode-change',
      title,
      message: description,
      icon,
      buttonText: '我知道了',
      allowHTML: true // 允许HTML内容
    });
  }
  
  /**
   * 显示会话结束通知
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

// 确保全局访问
window.NotificationSystem = NotificationSystem;

// 导出
export default NotificationSystem;

// 使用ES模块导入browser API
import browser from 'webextension-polyfill';
import ChatUI from '../chat/chat-ui.js';

/**
 * Déjà Vocab - Enhanced Login UI
 * Modern authentication interface with improved UX and animations
 */
class LoginUI {
  // Singleton 实例
  static instance = null;
  
  /**
   * 获取LoginUI实例（单例模式）
   */
  static getInstance() {
    if (!LoginUI.instance) {
      LoginUI.instance = new LoginUI();
    }
    return LoginUI.instance;
  }

  constructor() {
    // API URL 设置
    this.apiUrl = 'https://www.dejavocab.com/api/';
    this.environment = 'production';
    this.darkMode = true; // 深色模式状态 - 默认启用
    
    // 页面元素引用
    this.elements = {
      // 选项卡元素
      loginTab: null,
      registerTab: null,
      tabIndicator: null,
      
      // 表单容器
      loginContent: null,
      registerContent: null,
      
      // 登录表单元素
      loginButton: null,
      loginEmail: null,
      loginPassword: null,
      loginStatus: null,
      
      // 注册表单元素
      registerButton: null,
      registerName: null,
      registerEmail: null,
      registerPassword: null,
      registerConfirmPassword: null,
      
      // 环境选择器
      environmentSelect: null,
      
      // 密码显示切换按钮
      passwordToggles: []
    };
    
    // 绑定方法
    this.init = this.init.bind(this);
    this.initElements = this.initElements.bind(this);
    this.setupEventListeners = this.setupEventListeners.bind(this);
    this.checkLoginStatus = this.checkLoginStatus.bind(this);
    this.handleLogin = this.handleLogin.bind(this);
    this.handleRegister = this.handleRegister.bind(this);
    this.showLoggedInState = this.showLoggedInState.bind(this);
    this.updateApiUrl = this.updateApiUrl.bind(this);
    this.showStatus = this.showStatus.bind(this);
    this.toggleDarkMode = this.toggleDarkMode.bind(this);
    this.loadDarkModeSetting = this.loadDarkModeSetting.bind(this);
    this.saveDarkModeSetting = this.saveDarkModeSetting.bind(this);
  }

  /**
   * 初始化登录UI
   */
  /**
   * 切换深色模式开关
   */
  async toggleDarkMode() {
    this.darkMode = !this.darkMode;
    document.documentElement.classList.toggle('dark', this.darkMode);
    
    // 更新图标
    const darkModeToggle = document.getElementById('login-dark-mode-toggle');
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
    
    // 保存设置
    await this.saveDarkModeSetting();
  }

  /**
   * 从存储中加载深色模式设置
   */
  async loadDarkModeSetting() {
    try {
      const settings = await browser.storage.local.get(['darkMode']);
      // 默认为启用（如果未设置）
      this.darkMode = settings.darkMode !== false;
      
      // 应用深色模式（现在默认启用）
      document.documentElement.classList.toggle('dark', this.darkMode);
      
      // 更新图标
      const darkModeToggle = document.getElementById('login-dark-mode-toggle');
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
      console.error('[ERROR] 加载深色模式设置时出错:', error);
      // 如果发生错误，仍然默认应用深色模式
      this.darkMode = true;
      document.documentElement.classList.add('dark');
    }
  }

  /**
   * 保存深色模式设置到存储
   */
  async saveDarkModeSetting() {
    try {
      await browser.storage.local.set({ darkMode: this.darkMode });
    } catch (error) {
      console.error('[ERROR] 保存深色模式设置时出错:', error);
    }
  }

  async init() {
    console.log('[INFO] 初始化 Déjà Vocab 登录界面');
    
    try {
      // 初始化页面元素引用
      this.initElements();
      
      // 隐藏YouTube引导界面（如果存在）
      this.hideYouTubeGuide();
      
      // 检查用户是否已登录
      await this.checkLoginStatus();
      
      // 设置事件监听器
      this.setupEventListeners();
      
      // 从存储中获取API URL和环境设置
      const settings = await browser.storage.local.get(['apiUrl', 'environment']);
      if (settings.apiUrl) {
        this.apiUrl = settings.apiUrl;
      }
      
      if (settings.environment && this.elements.environmentSelect) {
        this.elements.environmentSelect.value = settings.environment;
        this.environment = settings.environment;
      }
      
      // 加载深色模式设置
      await this.loadDarkModeSetting();
      
      console.log('[INFO] 登录界面初始化完成');
    } catch (error) {
      console.error('[ERROR] 初始化登录界面时出错:', error);
    }
  }

  /**
   * 隐藏YouTube引导界面
   */
  hideYouTubeGuide() {
    const guideContainer = document.getElementById('youtube-guide');
    if (guideContainer) {
      guideContainer.style.display = 'none';
      console.log('[INFO] 登录界面显示，已隐藏YouTube引导界面');
    }
  }
  
  /**
   * 初始化页面元素引用
   */
  initElements() {
    console.log('[INFO] 初始化页面元素引用');
    
    // 选项卡元素
    this.elements.loginTab = document.getElementById('login-tab');
    this.elements.registerTab = document.getElementById('register-tab');
    this.elements.tabIndicator = document.querySelector('.tab-indicator');
    
    // 表单容器
    this.elements.loginContent = document.getElementById('login-content');
    this.elements.registerContent = document.getElementById('register-content');
    
    // 登录表单元素
    this.elements.loginButton = document.getElementById('login-button');
    this.elements.loginEmail = document.getElementById('login-email');
    this.elements.loginPassword = document.getElementById('login-password');
    this.elements.loginStatus = document.getElementById('login-status');
    
    // 注册表单元素
    this.elements.registerButton = document.getElementById('register-button');
    this.elements.registerName = document.getElementById('register-name');
    this.elements.registerEmail = document.getElementById('register-email');
    this.elements.registerPassword = document.getElementById('register-password');
    this.elements.registerConfirmPassword = document.getElementById('register-confirm-password');
    
    // 环境选择器
    this.elements.environmentSelect = document.getElementById('environment-select');
    
    // 密码显示切换按钮
    this.elements.passwordToggles = document.querySelectorAll('.toggle-password');
    
    // 验证重要元素是否存在
    if (!this.elements.loginTab || !this.elements.registerTab) {
      console.error('[ERROR] 登录/注册选项卡未找到!');
    }
    
    if (!this.elements.loginButton || !this.elements.registerButton) {
      console.error('[ERROR] 登录/注册按钮未找到!');
    }
  }

  /**
   * 设置所有事件监听器
   */
  setupEventListeners() {
    console.log('[INFO] 设置事件监听器');
    
    // 选项卡切换
    this.setupTabSwitching();
    
    // 环境切换
    this.setupEnvironmentSwitching();
    
    // 登录和注册表单提交
    this.setupFormSubmission();
    
    // 密码显示切换
    this.setupPasswordToggle();
    
    // 深色模式切换
    this.setupDarkModeToggle();
  }

  /**
   * 设置选项卡切换事件
   */
  setupTabSwitching() {
    const { loginTab, registerTab, loginContent, registerContent, tabIndicator } = this.elements;
    
    if (!loginTab || !registerTab) return;
    
    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      loginContent.classList.add('active');
      registerContent.classList.remove('active');
      // 重置tab指示器位置
      tabIndicator.style.transform = 'translateX(0)';
    });
    
    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerContent.classList.add('active');
      loginContent.classList.remove('active');
      // 移动tab指示器位置
      tabIndicator.style.transform = 'translateX(100%)';
    });
  }

  /**
   * 设置环境切换事件
   */
  setupEnvironmentSwitching() {
    const { environmentSelect } = this.elements;
    
    if (!environmentSelect) return;
    
    environmentSelect.addEventListener('change', () => {
      const selectedEnvironment = environmentSelect.value;
      this.environment = selectedEnvironment;
      
      // 保存环境设置
      browser.storage.local.set({ environment: selectedEnvironment });
      
      // 更新API URL
      this.updateApiUrl(selectedEnvironment);
    });
  }

  /**
   * 设置表单提交事件
   */
  setupFormSubmission() {
    const { loginButton, registerButton, loginEmail, loginPassword } = this.elements;
    
    if (loginButton) {
      // 登录表单提交
      loginButton.addEventListener('click', this.handleLogin);
      
      // 按回车键提交登录表单
      loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleLogin();
        }
      });
    }
    
    if (registerButton) {
      // 注册表单提交
      registerButton.addEventListener('click', this.handleRegister);
    }
  }

  /**
   * 设置深色模式切换事件
   */
  setupDarkModeToggle() {
    const darkModeToggle = document.getElementById('login-dark-mode-toggle');
    if (!darkModeToggle) return;
    
    darkModeToggle.addEventListener('click', this.toggleDarkMode);
  }

  /**
   * 设置密码显示切换
   */
  setupPasswordToggle() {
    const { passwordToggles } = this.elements;
    
    passwordToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const passwordInput = toggle.parentElement.querySelector('input');
        const icon = toggle.querySelector('i');
        
        // 切换密码可见性
        if (passwordInput.type === 'password') {
          passwordInput.type = 'text';
          icon.classList.remove('bi-eye-slash');
          icon.classList.add('bi-eye');
        } else {
          passwordInput.type = 'password';
          icon.classList.remove('bi-eye');
          icon.classList.add('bi-eye-slash');
        }
      });
    });
  }

  /**
   * 检查用户登录状态
   */
  async checkLoginStatus() {
    console.log('[INFO] 检查用户登录状态');
    
    try {
      const result = await browser.storage.local.get(['authToken', 'userId', 'username']);
      
      if (result.authToken) {
        console.log('[INFO] 用户已登录，显示聊天界面');
        // 用户已登录，显示聊天界面
        this.showLoggedInState(result.authToken, result.userId, result.username);
      }
    } catch (error) {
      console.error('[ERROR] 获取登录状态时出错:', error);
    }
  }

  /**
   * 处理登录请求
   */
  async handleLogin() {
    const { loginButton, loginEmail, loginPassword, loginStatus } = this.elements;
    
    // 显示加载状态
    this.setButtonLoading(loginButton, true);
    this.showStatus('正在登录...', 'info');
    
    const username = loginEmail.value.trim();
    const password = loginPassword.value.trim();
    
    // 验证输入
    if (!username || !password) {
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: '登录失败',
          message: '请输入用户名和密码',
          icon: 'exclamation-triangle',
          buttonText: '我明白了',
          allowHTML: true
        });
      } else {
        alert('请输入用户名和密码');
      }
      this.setButtonLoading(loginButton, false);
      return;
    }
    
    try {
      // 确保API URL正确格式
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl : `${this.apiUrl}/`;
      const tokenEndpoint = `${baseUrl}token/`; // 与后端的'token/'endpoint匹配
      
      console.log('[INFO] 发送登录请求到:', tokenEndpoint);
      
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          'username': username,
          'password': password
        })
      });
      
      if (!response.ok) {
        // 处理错误响应
        if (response.status === 401 || response.status === 400) {
          // 使用通知系统显示错误
          if (window.NotificationSystem) {
            const notificationSystem = window.NotificationSystem.getInstance();
            notificationSystem.show({
              type: 'error',
              title: '登录失败',
              message: '用户名或密码错误',
              icon: 'exclamation-triangle',
              buttonText: '重试'
            });
          } else {
            this.showStatus('用户名或密码错误', 'error');
          }
        } else {
          // 使用通知系统显示服务器错误
          if (window.NotificationSystem) {
            const notificationSystem = window.NotificationSystem.getInstance();
            notificationSystem.show({
              type: 'error',
              title: '登录失败',
              message: `服务器错误 (${response.status})`,
              icon: 'exclamation-triangle',
              buttonText: '关闭'
            });
          } else {
            this.showStatus(`登录失败: 服务器错误 (${response.status})`, 'error');
          }
        }
        this.setButtonLoading(loginButton, false);
        return;
      }
      
      // 解析响应数据
      const data = await response.json();
      
      if (data && data.token) {
        // 获取用户ID和用户名
        const userId = data.user_id || data.userId || '';
        const username = data.username || '';
        
        // 使用通知系统显示登录成功
        if (window.NotificationSystem) {
          const notificationSystem = window.NotificationSystem.getInstance();
          notificationSystem.show({
            type: 'success',
            title: '登录成功',
            message: `<div style="text-align: center;">
              <p><strong>欢迎回来, ${username}!</strong></p>
              <p>正在准备您的个人化学习环境...</p>
            </div>`,
            icon: 'check-circle',
            buttonText: '开始学习',
            allowHTML: true,
            autoClose: true,
            autoCloseDelay: 2000
          });
        } else {
          this.showStatus('登录成功!', 'success');
        }
        
        // 延迟显示聊天界面，以便用户看到成功消息
        setTimeout(() => {
          this.showLoggedInState(data.token, userId, username);
        }, 1000);
      } else {
        // 使用通知系统显示错误
        if (window.NotificationSystem) {
          const notificationSystem = window.NotificationSystem.getInstance();
          notificationSystem.show({
            type: 'error',
            title: '登录失败',
            message: '无效的响应数据',
            icon: 'exclamation-triangle',
            buttonText: '关闭'
          });
        } else {
          this.showStatus('登录失败: 无效的响应数据', 'error');
        }
        
        this.setButtonLoading(loginButton, false);
      }
    } catch (error) {
      console.error('[ERROR] 登录请求出错:', error);
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: '登录失败',
          message: '无法连接到服务器，请检查您的网络连接',
          icon: 'exclamation-triangle',
          buttonText: '关闭'
        });
      } else {
        this.showStatus('无法连接到服务器，请检查您的网络连接', 'error');
      }
      this.setButtonLoading(loginButton, false);
    }
  }

  /**
   * 处理注册请求
   */
  async handleRegister() {
    const { 
      registerButton, registerName, registerEmail, 
      registerPassword, registerConfirmPassword, loginTab 
    } = this.elements;
    
    // 显示加载状态
    this.setButtonLoading(registerButton, true);
    
    const username = registerName.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value.trim();
    const confirmPassword = registerConfirmPassword.value.trim();
    
    // 验证输入
    if (!username || !password) {
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: '注册失败',
          message: '请填写必填字段（用户名和密码）',
          icon: 'exclamation-triangle',
          buttonText: '我明白了',
          allowHTML: true
        });
      } else {
        alert('请填写必填字段（用户名和密码）');
      }
      this.setButtonLoading(registerButton, false);
      return;
    }
    
    if (password !== confirmPassword) {
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: '注册失败',
          message: '两次输入的密码不一致',
          icon: 'exclamation-triangle',
          buttonText: '我明白了',
          allowHTML: true
        });
      } else {
        alert('两次输入的密码不一致');
      }
      this.setButtonLoading(registerButton, false);
      return;
    }
    
    try {
      // 确保API URL正确格式
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl : `${this.apiUrl}/`;
      const registerEndpoint = `${baseUrl}register-api/`; // 与后端的'register-api/'endpoint匹配
      
      console.log('[INFO] 发送注册请求到:', registerEndpoint);
      
      const response = await fetch(registerEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          'username': username,
          'password': password,
          'email': email
        })
      });
      
      // 处理响应
      if (!response.ok) {
        const errorData = await response.json();
        let errorMsg = '注册失败\n';
        
        if (errorData.username) errorMsg += `用户名: ${errorData.username.join(', ')}\n`;
        if (errorData.password) errorMsg += `密码: ${errorData.password.join(', ')}\n`;
        if (errorData.email) errorMsg += `邮箱: ${errorData.email.join(', ')}`;
        
        // 使用通知系统显示错误
        if (window.NotificationSystem) {
          const notificationSystem = window.NotificationSystem.getInstance();
          notificationSystem.show({
            type: 'error',
            title: '注册失败',
            message: `<div style="text-align: left; line-height: 1.4;">
              ${errorData.username ? `<p>• 用户名: ${errorData.username.join(', ')}</p>` : ''}
              ${errorData.password ? `<p>• 密码: ${errorData.password.join(', ')}</p>` : ''}
              ${errorData.email ? `<p>• 邮箱: ${errorData.email.join(', ')}</p>` : ''}
            </div>`,
            icon: 'exclamation-triangle',
            buttonText: '我明白了',
            allowHTML: true
          });
        } else {
          alert(errorMsg);
        }
        this.setButtonLoading(registerButton, false);
        return;
      }
      
      // 注册成功
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'success',
          title: '注册成功',
          message: `<div style="text-align: center;">
            <p><strong>欢迎加入 Déjà Vocab!</strong></p>
            <p>用户名: ${username}</p>
          </div>`,
          icon: 'person-check',
          buttonText: '开始使用',
          allowHTML: true,
          autoClose: true,
          autoCloseDelay: 5000
        });
      } else {
        // 后备方案，如果通知系统不可用
        alert('注册成功\n用户名: ' + username);
      }
      
      // 重置注册表单
      registerName.value = '';
      registerEmail.value = '';
      registerPassword.value = '';
      registerConfirmPassword.value = '';
      
      // 切换到登录选项卡
      loginTab.click();
      
      // 预填充登录表单
      this.elements.loginEmail.value = username;
      this.elements.loginPassword.focus();
      
      this.setButtonLoading(registerButton, false);
    } catch (error) {
      console.error('[ERROR] 注册请求出错:', error);
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: '注册失败',
          message: '无法连接到服务器，请检查您的网络连接',
          icon: 'exclamation-triangle',
          buttonText: '关闭'
        });
      } else {
        alert('无法连接到服务器，请检查您的网络连接');
      }
      this.setButtonLoading(registerButton, false);
    }
  }

  /**
   * 设置按钮加载状态
   */
  setButtonLoading(button, isLoading) {
    if (!button) return;
    
    const buttonText = button.querySelector('.btn-text');
    const buttonLoader = button.querySelector('.btn-loader');
    
    if (isLoading) {
      button.disabled = true;
      if (buttonText) buttonText.classList.add('hidden');
      if (buttonLoader) buttonLoader.classList.remove('hidden');
    } else {
      button.disabled = false;
      if (buttonText) buttonText.classList.remove('hidden');
      if (buttonLoader) buttonLoader.classList.add('hidden');
    }
  }

  /**
   * 显示状态消息
   */
  showStatus(message, type = 'info') {
    const { loginStatus } = this.elements;
    if (!loginStatus) return;
    
    // 移除所有类型类
    loginStatus.classList.remove('error', 'success', 'info', 'hidden');
    
    // 添加新类型类
    loginStatus.classList.add(type);
    loginStatus.textContent = message;
    
    // 显示状态消息
    loginStatus.classList.remove('hidden');
  }

  /**
   * 更新API URL
   */
  updateApiUrl(environment) {
    // 根据环境设置API URL
    this.apiUrl = environment === 'localhost' ? 'http://localhost:8000/api/' : 'https://dejavocab.com/api/';
    
    console.log('[INFO] 更新API URL为', this.apiUrl, '基于环境:', environment);
    
    // 保存到存储中
    browser.storage.local.set({ apiUrl: this.apiUrl })
      .then(() => console.log('[INFO] API URL已更新'));
  }

  /**
   * 显示已登录状态（切换到聊天界面）
   */
  showLoggedInState(token, userId, username) {
    console.log('[INFO] 显示已登录状态');
    
    // 存储用户信息到本地存储
    browser.storage.local.set({
      authToken: token,
      userId: userId,
      username: username
    }).then(() => {
      console.log('[INFO] 用户信息已保存');
    }).catch(error => {
      console.error('[ERROR] 保存用户信息出错:', error);
    });
    
    // 获取登录界面和聊天界面元素
    const authContainer = document.getElementById('auth-main-content');
    const chatContainer = document.getElementById('main-container');
    
    // 隐藏登录界面
    if (authContainer) {
      authContainer.classList.add('hidden');
    }
    
    // 显示聊天界面
    if (chatContainer) {
      chatContainer.classList.remove('hidden');
      
      // 初始化聊天界面
      try {
        console.log('[INFO] 从登录成功后初始化聊天界面');
        
        // 重置全局初始化标志以解决不响应问题，但不创建新的实例
        if (window.CHAT_UI_INITIALIZED) {
          console.log('[INFO] 发现已初始化的ChatUI，将重置全局标志');
          window.CHAT_UI_INITIALIZED = false;
        }
        
        // 使用短延迟确保DOM完全就绪和浏览器存储更新
        setTimeout(() => {
          // 使用合适的全局获取方法而不是直接创建新实例
          // 这将利用现有的单例模式和初始化检查
          const chatUI = window.getChatUI();
          
          // 确保未来调用getChatUI()返回这个有效实例
          window.CHAT_UI_INITIALIZED = true;
          
          // 尝试聚焦输入框
          const inputBox = document.getElementById('chat-input');
          if (inputBox) {
            inputBox.focus();
          }
        }, 300); // 300ms延迟，确保DOM和存储更新
      } catch (error) {
        console.error('[ERROR] 初始化聊天界面出错:', error);
        
        // 显示错误消息
        chatContainer.innerHTML = `
          <div class="chat-error-container">
            <h3>加载聊天界面失败</h3>
            <p>错误: ${error.message}</p>
            <button id="retry-chat-btn" class="btn btn-primary">重试</button>
            <button id="emergency-logout-btn" class="btn btn-secondary">退出登录</button>
          </div>
        `;
        
        // 添加重试和紧急退出登录按钮事件
        document.getElementById('retry-chat-btn')?.addEventListener('click', () => {
          window.location.reload();
        });
        
        document.getElementById('emergency-logout-btn')?.addEventListener('click', () => {
          browser.storage.local.remove(['authToken', 'userId', 'username']).then(() => {
            window.location.reload();
          });
        });
      }
    }
    
    // 添加登录状态类到body
    document.body.classList.add('chat-active');
  }
}

// 当DOM内容加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  // 使用单例模式获取实例
  const loginUI = LoginUI.getInstance();
  loginUI.init();
});

// 导出LoginUI类和一些有用的函数
export default LoginUI;
export const checkLoginStatus = LoginUI.getInstance().checkLoginStatus;
export const showLoggedInState = LoginUI.getInstance().showLoggedInState;
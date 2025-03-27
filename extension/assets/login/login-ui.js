// Use ES module to import browser API
import browser from 'webextension-polyfill';
import ChatUI from '../chat/chat-ui.js';

/**
 * Déjà Vocab - Enhanced Login UI
 * Modern authentication interface with improved UX and animations
 */
class LoginUI {
  // Singleton instance
  static instance = null;
  
  /**
   * Get LoginUI instance (singleton pattern)
   */
  static getInstance() {
    if (!LoginUI.instance) {
      LoginUI.instance = new LoginUI();
    }
    return LoginUI.instance;
  }

  constructor() {
    // API URL setting
    this.apiUrl = 'https://dejavocab.com/api/';
    this.environment = 'production';
    this.darkMode = true; // Dark mode state - default enabled
    
    // Page element references
    this.elements = {
      // Tab elements
      loginTab: null,
      registerTab: null,
      tabIndicator: null,
      
      // Form containers
      loginContent: null,
      registerContent: null,
      
      // Login form elements
      loginButton: null,
      loginEmail: null,
      loginPassword: null,
      loginStatus: null,
      
      // Register form elements
      registerButton: null,
      registerName: null,
      registerEmail: null,
      registerPassword: null,
      registerConfirmPassword: null,
      
      // Password toggle buttons
      passwordToggles: []
    };
    
    // Bind methods
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
   * Initialize login UI
   */
  /**
   * Toggle dark mode
   */
  async toggleDarkMode() {
    this.darkMode = !this.darkMode;
    document.documentElement.classList.toggle('dark', this.darkMode);
    
    // Update icon
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
    
    // Save setting
    await this.saveDarkModeSetting();
  }

  /**
   * Load dark mode setting from storage
   */
  async loadDarkModeSetting() {
    try {
      const settings = await browser.storage.local.get(['darkMode']);
      // Default to enabled (if not set)
      this.darkMode = settings.darkMode !== false;
      
      // Apply dark mode (now default enabled)
      document.documentElement.classList.toggle('dark', this.darkMode);
      
      // Update icon
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
      console.error('[ERROR] Error loading dark mode setting:', error);
      // If error occurs, still default to dark mode
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

  async init() {
    console.log('[INFO] Initializing Déjà Vocab login interface');
    
    try {
      // Initialize page element references
      this.initElements();
      
      // Hide YouTube guide interface (if exists)
      this.hideYouTubeGuide();
      
      // Check if user is already logged in
      await this.checkLoginStatus();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Get API URL and environment settings from storage
      const settings = await browser.storage.local.get(['apiUrl']);
      if (settings.apiUrl) {
        this.apiUrl = settings.apiUrl;
      }
      
      // Load dark mode settings
      await this.loadDarkModeSetting();
      
      console.log('[INFO] Login interface initialization complete');
    } catch (error) {
      console.error('[ERROR] Error initializing login interface:', error);
    }
  }

  /**
   * Hide YouTube guide interface
   */
  hideYouTubeGuide() {
    const guideContainer = document.getElementById('youtube-guide');
    if (guideContainer) {
      guideContainer.style.display = 'none';
      console.log('[INFO] Login interface displayed, YouTube guide hidden');
    }
  }
  
  /**
   * Initialize page element references
   */
  initElements() {
    console.log('[INFO] Initializing page element references');
    
    // Tab elements
    this.elements.loginTab = document.getElementById('login-tab');
    this.elements.registerTab = document.getElementById('register-tab');
    this.elements.tabIndicator = document.querySelector('.tab-indicator');
    
    // Form containers
    this.elements.loginContent = document.getElementById('login-content');
    this.elements.registerContent = document.getElementById('register-content');
    
    // Login form elements
    this.elements.loginButton = document.getElementById('login-button');
    this.elements.loginEmail = document.getElementById('login-email');
    this.elements.loginPassword = document.getElementById('login-password');
    this.elements.loginStatus = document.getElementById('login-status');
    
    // Registration form elements
    this.elements.registerButton = document.getElementById('register-button');
    this.elements.registerName = document.getElementById('register-name');
    this.elements.registerEmail = document.getElementById('register-email');
    this.elements.registerPassword = document.getElementById('register-password');
    this.elements.registerConfirmPassword = document.getElementById('register-confirm-password');
    
    // Password toggle buttons
    this.elements.passwordToggles = document.querySelectorAll('.toggle-password');
    
    // Verify important elements exist
    if (!this.elements.loginTab || !this.elements.registerTab) {
      console.error('[ERROR] Login/Register tabs not found!');
    }
    
    if (!this.elements.loginButton || !this.elements.registerButton) {
      console.error('[ERROR] Login/Register buttons not found!');
    }
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    console.log('[INFO] Setting up event listeners');
    
    // Tab switching
    this.setupTabSwitching();
    
    // Login and registration form submission
    this.setupFormSubmission();
    
    // Password visibility toggle
    this.setupPasswordToggle();
    
    // Dark mode toggle
    this.setupDarkModeToggle();
  }

  /**
   * Set up tab switching event
   */
  setupTabSwitching() {
    const { loginTab, registerTab, loginContent, registerContent, tabIndicator } = this.elements;
    
    if (!loginTab || !registerTab) return;
    
    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      loginContent.classList.add('active');
      registerContent.classList.remove('active');
      // Reset tab indicator position
      tabIndicator.style.transform = 'translateX(0)';
    });
    
    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerContent.classList.add('active');
      loginContent.classList.remove('active');
      // Move tab indicator position
      tabIndicator.style.transform = 'translateX(100%)';
    });
  }

  /**
   * Set up form submission event
   */
  setupFormSubmission() {
    const { loginButton, registerButton, loginEmail, loginPassword } = this.elements;
    
    if (loginButton) {
      // Login form submission
      loginButton.addEventListener('click', this.handleLogin);
      
      // Submit login form on Enter key press
      loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleLogin();
        }
      });
    }
    
    if (registerButton) {
      // Registration form submission
      registerButton.addEventListener('click', this.handleRegister);
    }
  }

  /**
   * Set up dark mode toggle event
   */
  setupDarkModeToggle() {
    const darkModeToggle = document.getElementById('login-dark-mode-toggle');
    if (!darkModeToggle) return;
    
    darkModeToggle.addEventListener('click', this.toggleDarkMode);
  }

  /**
   * Set up password visibility toggle
   */
  setupPasswordToggle() {
    const { passwordToggles } = this.elements;
    
    passwordToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const passwordInput = toggle.parentElement.querySelector('input');
        const icon = toggle.querySelector('i');
        
        // Toggle password visibility
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
   * Check if user is already logged in
   */
  async checkLoginStatus() {
    console.log('[INFO] Checking user login status');
    
    try {
      const result = await browser.storage.local.get(['authToken', 'userId', 'username']);
      
      if (result.authToken) {
        console.log('[INFO] User is already logged in, displaying chat interface');
        // User is already logged in, display chat interface
        this.showLoggedInState(result.authToken, result.userId, result.username);
      }
    } catch (error) {
      console.error('[ERROR] Error checking login status:', error);
    }
  }

  /**
   * Handle login request
   */
  async handleLogin() {
    const { loginButton, loginEmail, loginPassword, loginStatus } = this.elements;
    
    // Display loading state
    this.setButtonLoading(loginButton, true);
    this.showStatus('Logging in...', 'info');
    
    const username = loginEmail.value.trim();
    const password = loginPassword.value.trim();
    
    // Validate input
    if (!username || !password) {
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: 'Login failed',
          message: 'Please enter username and password',
          icon: 'exclamation-triangle',
          buttonText: 'I understand',
          allowHTML: true
        });
      } else {
        alert('Please enter username and password');
      }
      this.setButtonLoading(loginButton, false);
      return;
    }
    
    try {
      // Ensure API URL is in correct format
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl : `${this.apiUrl}/`;
      const tokenEndpoint = `${baseUrl}token/`; // Matches backend 'token/' endpoint
      
      console.log('[INFO] Sending login request to:', tokenEndpoint);
      
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
        // Handle error response
        if (response.status === 401 || response.status === 400) {
          // Use notification system to display error
          if (window.NotificationSystem) {
            const notificationSystem = window.NotificationSystem.getInstance();
            notificationSystem.show({
              type: 'error',
              title: 'Login failed',
              message: 'Invalid username or password',
              icon: 'exclamation-triangle',
              buttonText: 'Retry'
            });
          } else {
            this.showStatus('Invalid username or password', 'error');
          }
        } else {
          // Use notification system to display server error
          if (window.NotificationSystem) {
            const notificationSystem = window.NotificationSystem.getInstance();
            notificationSystem.show({
              type: 'error',
              title: 'Login failed',
              message: `Server error (${response.status})`,
              icon: 'exclamation-triangle',
              buttonText: 'Close'
            });
          } else {
            this.showStatus(`Login failed: Server error (${response.status})`, 'error');
          }
        }
        this.setButtonLoading(loginButton, false);
        return;
      }
      
      // Parse response data
      const data = await response.json();
      
      if (data && data.token) {
        // Get user ID and username
        const userId = data.user_id || data.userId || '';
        const username = data.username || '';
        
        // Use notification system to display login success
        if (window.NotificationSystem) {
          const notificationSystem = window.NotificationSystem.getInstance();
          notificationSystem.show({
            type: 'success',
            title: 'Login successful',
            message: `<div style="text-align: center;">
              <p><strong>Welcome back, ${username}!</strong></p>
              <p>Preparing your personalized learning environment...</p>
            </div>`,
            icon: 'check-circle',
            buttonText: 'Start learning',
            allowHTML: true,
            autoClose: true,
            autoCloseDelay: 2000
          });
        } else {
          this.showStatus('Login successful!', 'success');
        }
        
        // Delay displaying chat interface to allow user to see success message
        setTimeout(() => {
          this.showLoggedInState(data.token, userId, username);
        }, 1000);
      } else {
        // Use notification system to display error
        if (window.NotificationSystem) {
          const notificationSystem = window.NotificationSystem.getInstance();
          notificationSystem.show({
            type: 'error',
            title: 'Login failed',
            message: 'Invalid response data',
            icon: 'exclamation-triangle',
            buttonText: 'Close'
          });
        } else {
          this.showStatus('Login failed: Invalid response data', 'error');
        }
        
        this.setButtonLoading(loginButton, false);
      }
    } catch (error) {
      console.error('[ERROR] Error handling login request:', error);
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: 'Login failed',
          message: 'Unable to connect to server, please check your network connection',
          icon: 'exclamation-triangle',
          buttonText: 'Close'
        });
      } else {
        this.showStatus('Unable to connect to server, please check your network connection', 'error');
      }
      this.setButtonLoading(loginButton, false);
    }
  }

  /**
   * Handle registration request
   */
  async handleRegister() {
    const { 
      registerButton, registerName, registerEmail, 
      registerPassword, registerConfirmPassword, loginTab 
    } = this.elements;
    
    // Display loading state
    this.setButtonLoading(registerButton, true);
    
    const username = registerName.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value.trim();
    const confirmPassword = registerConfirmPassword.value.trim();
    
    // Validate input
    if (!username || !password) {
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: 'Registration failed',
          message: 'Please fill in required fields (username and password)',
          icon: 'exclamation-triangle',
          buttonText: 'I understand',
          allowHTML: true
        });
      } else {
        alert('Please fill in required fields (username and password)');
      }
      this.setButtonLoading(registerButton, false);
      return;
    }
    
    if (password !== confirmPassword) {
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: 'Registration failed',
          message: 'Passwords do not match',
          icon: 'exclamation-triangle',
          buttonText: 'I understand',
          allowHTML: true
        });
      } else {
        alert('Passwords do not match');
      }
      this.setButtonLoading(registerButton, false);
      return;
    }
    
    try {
      // Ensure API URL is in correct format
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl : `${this.apiUrl}/`;
      const registerEndpoint = `${baseUrl}register-api/`; // Matches backend 'register-api/' endpoint
      
      console.log('[INFO] Sending registration request to:', registerEndpoint);
      
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
      
      // Handle response
      if (!response.ok) {
        const errorData = await response.json();
        let errorMsg = 'Registration failed\n';
        
        if (errorData.username) errorMsg += `Username: ${errorData.username.join(', ')}\n`;
        if (errorData.password) errorMsg += `Password: ${errorData.password.join(', ')}\n`;
        if (errorData.email) errorMsg += `Email: ${errorData.email.join(', ')}`;
        
        // Use notification system to display error
        if (window.NotificationSystem) {
          const notificationSystem = window.NotificationSystem.getInstance();
          notificationSystem.show({
            type: 'error',
            title: 'Registration failed',
            message: `<div style="text-align: left; line-height: 1.4;">
              ${errorData.username ? `<p>• Username: ${errorData.username.join(', ')}</p>` : ''}
              ${errorData.password ? `<p>• Password: ${errorData.password.join(', ')}</p>` : ''}
              ${errorData.email ? `<p>• Email: ${errorData.email.join(', ')}</p>` : ''}
            </div>`,
            icon: 'exclamation-triangle',
            buttonText: 'I understand',
            allowHTML: true
          });
        } else {
          alert(errorMsg);
        }
        this.setButtonLoading(registerButton, false);
        return;
      }
      
      // Registration successful
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'success',
          title: 'Registration successful',
          message: `<div style="text-align: center;">
            <p><strong>Welcome to Déjà Vocab!</strong></p>
            <p>Username: ${username}</p>
          </div>`,
          icon: 'person-check',
          buttonText: 'Start using',
          allowHTML: true,
          autoClose: true,
          autoCloseDelay: 5000
        });
      } else {
        // Fallback if notification system is not available
        alert('Registration successful\nUsername: ' + username);
      }
      
      // Reset registration form
      registerName.value = '';
      registerEmail.value = '';
      registerPassword.value = '';
      registerConfirmPassword.value = '';
      
      // Switch to login tab
      loginTab.click();
      
      // Pre-fill login form
      this.elements.loginEmail.value = username;
      this.elements.loginPassword.focus();
      
      this.setButtonLoading(registerButton, false);
    } catch (error) {
      console.error('[ERROR] Error handling registration request:', error);
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: 'Registration failed',
          message: 'Unable to connect to server, please check your network connection',
          icon: 'exclamation-triangle',
          buttonText: 'Close'
        });
      } else {
        alert('Unable to connect to server, please check your network connection');
      }
      this.setButtonLoading(registerButton, false);
    }
  }

  /**
   * Set button loading state
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
   * Display status message
   */
  showStatus(message, type = 'info') {
    const { loginStatus } = this.elements;
    if (!loginStatus) return;
    
    // Remove all type classes
    loginStatus.classList.remove('error', 'success', 'info', 'hidden');
    
    // Add new type class
    loginStatus.classList.add(type);
    loginStatus.textContent = message;
    
    // Display status message
    loginStatus.classList.remove('hidden');
  }

  /**
   * Update API URL
   */
  updateApiUrl() {
    // Always use localhost environment
    this.apiUrl = 'https://dejavocab.com/api/';
    
    console.log('[INFO] Updated API URL to', this.apiUrl);
    
    // Save to storage
    browser.storage.local.set({ apiUrl: this.apiUrl })
      .then(() => console.log('[INFO] API URL updated'));
  }

  /**
   * Display logged in state (switch to chat interface)
   */
  showLoggedInState(token, userId, username) {
    console.log('[INFO] Displaying logged in state');
    
    // Store user information in local storage
    browser.storage.local.set({
      authToken: token,
      userId: userId,
      username: username
    }).then(() => {
      console.log('[INFO] User information saved');
    }).catch(error => {
      console.error('[ERROR] Error saving user information:', error);
    });
    
    // Get login interface and chat interface elements
    const authContainer = document.getElementById('auth-main-content');
    const chatContainer = document.getElementById('main-container');
    
    // Hide login interface
    if (authContainer) {
      authContainer.classList.add('hidden');
    }
    
    // Display chat interface
    if (chatContainer) {
      chatContainer.classList.remove('hidden');
      
      // Initialize chat interface
      try {
        console.log('[INFO] Initializing chat interface after login');
        
        // Reset global initialization flag to fix non-responsive issue, but do not create a new instance
        if (window.CHAT_UI_INITIALIZED) {
          console.log('[INFO] Found initialized ChatUI, resetting global flag');
          window.CHAT_UI_INITIALIZED = false;
        }
        
        // Use a short delay to ensure DOM is fully ready and browser storage is updated
        setTimeout(() => {
          // Use the proper global getter method instead of creating a new instance
          // This will utilize the existing singleton pattern and initialization check
          const chatUI = window.getChatUI();
          
          // Ensure future calls to getChatUI() return this valid instance
          window.CHAT_UI_INITIALIZED = true;
          
          // Attempt to focus input box
          const inputBox = document.getElementById('chat-input');
          if (inputBox) {
            inputBox.focus();
          }
        }, 300); // 300ms delay to ensure DOM and storage updates
      } catch (error) {
        console.error('[ERROR] Error initializing chat interface:', error);
        
        // Display error message
        chatContainer.innerHTML = `
          <div class="chat-error-container">
            <h3>Failed to load chat interface</h3>
            <p>Error: ${error.message}</p>
            <button id="retry-chat-btn" class="btn btn-primary">Retry</button>
            <button id="emergency-logout-btn" class="btn btn-secondary">Logout</button>
          </div>
        `;
        
        // Add retry and emergency logout button events
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
    
    // Add logged in state class to body
    document.body.classList.add('chat-active');
  }
}

// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Use singleton pattern to get instance
  const loginUI = LoginUI.getInstance();
  loginUI.init();
});

// Export LoginUI class and some useful functions
export default LoginUI;
export const checkLoginStatus = LoginUI.getInstance().checkLoginStatus;
export const showLoggedInState = LoginUI.getInstance().showLoggedInState;
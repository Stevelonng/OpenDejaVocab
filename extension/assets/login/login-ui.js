// Use ES module to import browser API
import browser from 'webextension-polyfill';
import ChatUI from '../chat/chat-ui.js';


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
    this.apiUrl = 'http://localhost:8000/api/';
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
      registerPrivacyLink: null,
      privacyCheckbox: null,
      
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
    this.updateRegisterButtonState = this.updateRegisterButtonState.bind(this);
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

  hideYouTubeGuide() {
    const guideContainer = document.getElementById('youtube-guide');
    if (guideContainer) {
      guideContainer.style.display = 'none';
      console.log('[INFO] Login interface displayed, YouTube guide hidden');
    }
  }
  
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
    this.elements.registerPrivacyLink = document.getElementById('register-privacy-link');
    this.elements.privacyCheckbox = document.getElementById('privacy-checkbox');
    
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
    
    // Add privacy policy link click handler
    this.elements.registerPrivacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Open privacy policy in new tab
      window.open(this.apiUrl + 'privacy-policy/', '_blank');
    });

    // Add privacy checkbox change handler
    this.elements.privacyCheckbox.addEventListener('change', () => {
      this.updateRegisterButtonState();
    });
  }

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

  setupDarkModeToggle() {
    const darkModeToggle = document.getElementById('login-dark-mode-toggle');
    if (!darkModeToggle) return;
    
    darkModeToggle.addEventListener('click', this.toggleDarkMode);
  }

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
        
        // Immediately show the chat interface without notifications
        this.showLoggedInState(data.token, userId, username);
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
    
    if (!this.elements.privacyCheckbox.checked) {
      if (window.NotificationSystem) {
        const notificationSystem = window.NotificationSystem.getInstance();
        notificationSystem.show({
          type: 'error',
          title: 'Registration failed',
          message: 'Please agree to the privacy policy',
          icon: 'exclamation-triangle',
          buttonText: 'I understand',
          allowHTML: true
        });
      } else {
        alert('Please agree to the privacy policy');
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

  updateApiUrl() {
    // Always use 47.245.57.52 environment
    this.apiUrl = 'http://localhost:8000/api/';
    
    console.log('[INFO] Updated API URL to', this.apiUrl);
    
    // Save to storage
    browser.storage.local.set({ apiUrl: this.apiUrl })
      .then(() => console.log('[INFO] API URL updated'));
  }

  updateRegisterButtonState() {
    const isCheckboxChecked = this.elements.privacyCheckbox.checked;
    this.elements.registerButton.disabled = !isCheckboxChecked;
    
    // Update button appearance
    if (isCheckboxChecked) {
      this.elements.registerButton.classList.remove('opacity-50');
      this.elements.registerButton.classList.add('opacity-100');
    } else {
      this.elements.registerButton.classList.remove('opacity-100');
      this.elements.registerButton.classList.add('opacity-50');
    }
  }

  showLoggedInState(token, userId, username) {
    console.log('[INFO] Displaying logged in state');
    
    // Store user information in local storage
    browser.storage.local.set({
      authToken: token,
      userId: userId,
      username: username
    }).then(() => {
      console.log('[INFO] User information saved');
      
      // Get login interface and chat interface elements
      const authContainer = document.getElementById('auth-main-content');
      const chatContainer = document.getElementById('main-container');
      
      // Hide login interface
      if (authContainer) {
        authContainer.classList.add('hidden');
      }
      
      // Initialize chat interface
      try {
        console.log('[INFO] Initializing chat interface after login');
        
        // Reset global initialization flags
        window.CHAT_UI_INITIALIZED = false;
        window.URL_MONITOR_INITIALIZED = false;
        if (window.URL_MONITOR_INTERVAL) {
          clearInterval(window.URL_MONITOR_INTERVAL);
          window.URL_MONITOR_INTERVAL = null;
        }
        
        // Reset instance if it exists
        if (window.CHAT_UI_INSTANCE) {
          window.CHAT_UI_INSTANCE = null;
        }
        
        console.log('[INFO] Performing full initialization after login');
        // Use getInstance directly and call init() - similar to refresh flow
        const chatUI = ChatUI.getInstance();
        
        // Force a complete initialization - identical to refresh path
        chatUI.init().then(() => {
          console.log('[INFO] Chat UI initialization complete after login');
          
          // Now check if we're on YouTube before showing the interface
          if (chatUI.stateManager) {
            // Check if we're on YouTube
            chatUI.stateManager.checkIfYouTube().then(isYouTube => {
              if (isYouTube) {
                // On YouTube - show chat interface
                if (chatContainer) {
                  chatContainer.classList.remove('hidden');
                  document.body.classList.add('chat-active');
                }
                chatUI.stateManager.activateChatView();
              } else {
                // Not on YouTube - keep chat interface hidden
                if (chatContainer) {
                  chatContainer.classList.add('hidden');
                }
                chatUI.stateManager.deactivateChatView();
              }
            });
          }
          
          // Attempt to focus input box if on YouTube
          setTimeout(() => {
            const inputBox = document.getElementById('chat-input');
            if (inputBox && chatContainer && !chatContainer.classList.contains('hidden')) {
              inputBox.focus();
            }
          }, 500);
        });
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
    });
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
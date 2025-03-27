import { onMounted, onUnmounted, Ref } from 'vue';
import { browser } from 'wxt/browser';

/**
 * 检查用户是否已登录
 * @returns Promise<boolean> 用户是否已登录
 */
async function isUserLoggedIn(): Promise<boolean> {
  try {
    // 使用browser API而不是chrome API，确保兼容性
    const result = await browser.storage.local.get(['authToken']);
    const authToken = result.authToken;
    return !!authToken; // 如果有令牌，则认为用户已登录
  } catch (error) {
    return false; // 出错时默认为未登录
  }
}


function openSidePanel() {
  showLoginPrompt();
}

/**
 * 显示登录提示（当无法打开侧面板时的备用方法）
 */
function showLoginPrompt() {
  try {
    // 移除可能已存在的对话框
    const existingModal = document.getElementById('dejavocab-login-modal');
    if (existingModal) {
      document.body.removeChild(existingModal);
    }
    
    // 创建一个模态对话框
    const loginModal = document.createElement('div');
    loginModal.id = 'dejavocab-login-modal';
    loginModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      backdrop-filter: blur(10px);
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      padding: 30px;
      max-width: 400px;
      text-align: center;
    `;
    
    modalContent.innerHTML = `
      <h2 style="margin-top: 0; color: #ffffff; font-weight: 300; font-size: 24px;">需要登录</h2>
      <p style="margin: 20px 0; font-size: 16px; line-height: 1.5; opacity: 0.85;">您需要登录后才能使用全屏功能。</p>
      
      <!-- 简洁图示式操作指引 -->
      <div style="display: flex; flex-direction: column; margin: 20px 0; gap: 15px;">
        <!-- 第一步 -->
        <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="min-width: 30px; text-align: center;">
            <div style="background: #36eee0; color: #000; font-weight: bold; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">1</div>
          </div>
          <div style="flex-grow: 1;">
            <p style="margin: 0; font-size: 15px;">点击浏览器右上角的扩展图标（拼图块）</p>
          </div>
          <div style="min-width: 40px; text-align: center;">
            <div style="width: 32px; height: 32px; background: #3c4043; border-radius: 4px; position: relative; margin: 0 auto;">
              <!-- Chrome扩展图标（拼图块） -->
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" fill="white"/>
              </svg>
            </div>
          </div>
        </div>
        
        <!-- 箭头指示 -->
        <div style="text-align: center; color: #36eee0; font-size: 18px;">↓</div>
        
        <!-- 第二步 -->
        <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="min-width: 30px; text-align: center;">
            <div style="background: #36eee0; color: #000; font-weight: bold; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">2</div>
          </div>
          <div style="flex-grow: 1;">
            <p style="margin: 0; font-size: 15px;">从菜单中选择 Dejavocab 扩展</p>
          </div>
          <div style="min-width: 40px; text-align: center;">
            <!-- 直接使用内联SVG代码，确保图标始终可见 -->
            <div style="display: flex; justify-content: center; align-items: center; width: 36px; height: 36px;">
              <svg height="36" version="1.1" viewBox="0 0 36 36" width="36" style="filter: drop-shadow(0 0 5px rgba(54, 238, 224, 0.6));">
                <!-- 渐变和滤镜定义 -->
                <defs>
                  <linearGradient id="dejavocab-btn-gradient-popup" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0a84ff" /> <!-- primary(深色模式) -->
                    <stop offset="100%" stop-color="#36eee0" /> <!-- accent(浅色模式) -->
                  </linearGradient>
                  <linearGradient id="dejavocab-inner-gradient-popup" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#3c8ce7" />
                    <stop offset="100%" stop-color="#00eaff" />
                  </linearGradient>
                  
                  <!-- 发光滤镜 -->
                  <filter id="glow-popup" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  
                  <!-- 粒子发光滤镜 -->
                  <filter id="particle-glow-popup" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="0.5" result="particle-blur" />
                    <feComposite in="SourceGraphic" in2="particle-blur" operator="over" />
                  </filter>
                </defs>
                
                <!-- 主背景圆圈带吸气效果 -->
                <circle cx="18" cy="18" r="16" fill="url(#dejavocab-btn-gradient-popup)">
                  <animate attributeName="r" values="16;16.3;16;16.2;16" dur="3s" repeatCount="indefinite" />
                </circle>
                
                <!-- 刺激的内外光晕 -->
                <circle cx="18" cy="18" r="17" fill="none" stroke="#FFFFFF" stroke-width="0.3" opacity="0.4" filter="url(#glow-popup)">
                  <animate attributeName="stroke-opacity" values="0.4;0.1;0.4;0.2;0.4" dur="3.5s" repeatCount="indefinite" />
                </circle>
                
                <!-- 装饰粒子 -->
                <g filter="url(#particle-glow-popup)">
                  <circle class="particle" cx="10" cy="14" r="0.4" fill="#FFFFFF" opacity="0.8">
                    <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" begin="0.1s" repeatCount="indefinite" />
                  </circle>
                  <circle class="particle" cx="26" cy="22" r="0.3" fill="#FFFFFF" opacity="0.7">
                    <animate attributeName="opacity" values="0.7;0.2;0.7" dur="2.5s" begin="0.7s" repeatCount="indefinite" />
                  </circle>
                  <circle class="particle" cx="22" cy="9" r="0.5" fill="#FFFFFF" opacity="0.6">
                    <animate attributeName="opacity" values="0.6;0.1;0.6" dur="3.1s" begin="0.3s" repeatCount="indefinite" />
                  </circle>
                </g>
                
                <!-- D 字母图标 -->
                <path d="M14,12 L18,12 C21.5,12 23,14 23,18 C23,22 21.5,24 18,24 L14,24 Z" fill="white" filter="url(#glow-popup)" />
                <path d="M16,15 L18,15 C19.5,15 20,16 20,18 C20,20 19.5,21 18,21 L16,21 Z" fill="url(#dejavocab-inner-gradient-popup)">
                  <animate attributeName="fill-opacity" values="1;0.85;1" dur="4s" repeatCount="indefinite" />
                </path>
                
                <!-- 字幕标记带微光效果 -->
                <rect x="11" y="22" width="14" height="1.5" rx="0.75" fill="#FFFFFF" opacity="0.9">
                  <animate attributeName="opacity" values="0.9;0.7;0.9" dur="2.5s" repeatCount="indefinite" />
                </rect>
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      <p style="margin: 15px 0; font-size: 15px; line-height: 1.5; text-align: center;">登录后即可使用全屏功能</p>
      
      <!-- CSS动画不再需要，因为完全使用SVG动画 -->
      <style>
        /* 空样式表 - SVG 内部已经包含了所有动画 */
      </style>
      
      <div style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
        <button id="dejavocab-login-close" style="
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 10px 25px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: 0.5px;
          transition: all 0.3s ease;
        ">关闭</button>
      </div>
    `;
    
    loginModal.appendChild(modalContent);
    document.body.appendChild(loginModal);
    
    // 添加关闭按钮事件
    const closeButton = document.getElementById('dejavocab-login-close');
    if (closeButton) {
      // 添加悬停效果
      closeButton.addEventListener('mouseover', () => {
        closeButton.style.background = 'rgba(255, 255, 255, 0.3)';
      });
      closeButton.addEventListener('mouseout', () => {
        closeButton.style.background = 'rgba(255, 255, 255, 0.2)';
      });
      // 点击关闭事件
      closeButton.addEventListener('click', () => {
        if (document.body.contains(loginModal)) {
          document.body.removeChild(loginModal);
        }
      });
    }
    
    // 点击背景关闭
    loginModal.addEventListener('click', (event) => {
      if (event.target === loginModal) {
        document.body.removeChild(loginModal);
      }
    });
    
    // 15秒后自动关闭
    setTimeout(() => {
      if (document.body.contains(loginModal)) {
        document.body.removeChild(loginModal);
      }
    }, 15000);
    
  } catch (error) {
      setTimeout(() => {
        alert('需要登录才能使用全屏功能。请点击右上角扩展菜单，选择 Dejavocab 扩展登录。');
      }, 500);
  }
}

/**
 * 在YouTube播放器控制栏添加全屏图标按钮
 * @param hasVideoOnPage 视频是否在页面上的响应式引用
 * @param toggleFullscreen 切换全屏的函数
 */
export function useFullscreenIcon(
  hasVideoOnPage: Ref<boolean>,
  toggleFullscreen: () => void
) {
  // 在YouTube播放器控制栏右侧添加全屏按钮
  const addFullscreenButtonToYouTubeControls = () => {
    // 定期检查右侧控制栏是否存在
    const intervalId = setInterval(() => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (rightControls) {
        clearInterval(intervalId);
        
        // 检查是否已经添加了按钮
        if (document.querySelector('.dejavocab-fullscreen-btn')) {
          return; // 已存在，不重复添加
        }
        
        // 创建全屏按钮
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'ytp-button dejavocab-fullscreen-btn';
        fullscreenBtn.title = 'Deja Vocab';
        
        // 添加简约大气的品牌图标设计，带发光粒子和动画
        // 直接使用内联SVG代码，确保图标始终可见
        fullscreenBtn.innerHTML = `<div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
          <svg height="90%" version="1.1" viewBox="0 0 36 36" width="90%" style="filter: drop-shadow(0 0 5px rgba(54, 238, 224, 0.6));">
            <!-- 渐变和滤镜定义 -->
            <defs>
              <linearGradient id="dejavocab-btn-gradient-yt" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0a84ff" /> <!-- primary(深色模式) -->
                <stop offset="100%" stop-color="#36eee0" /> <!-- accent(浅色模式) -->
              </linearGradient>
              <linearGradient id="dejavocab-inner-gradient-yt" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3c8ce7" />
                <stop offset="100%" stop-color="#00eaff" />
              </linearGradient>
              
              <!-- 发光滤镜 -->
              <filter id="glow-yt" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              
              <!-- 粒子发光滤镜 -->
              <filter id="particle-glow-yt" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.5" result="particle-blur" />
                <feComposite in="SourceGraphic" in2="particle-blur" operator="over" />
              </filter>
            </defs>
            
            <!-- 主背景圆圈带吸气效果 -->
            <circle cx="18" cy="18" r="16" fill="url(#dejavocab-btn-gradient-yt)">
              <animate attributeName="r" values="16;16.3;16;16.2;16" dur="3s" repeatCount="indefinite" />
            </circle>
            
            <!-- 刺激的内外光晕 -->
            <circle cx="18" cy="18" r="17" fill="none" stroke="#FFFFFF" stroke-width="0.3" opacity="0.4" filter="url(#glow-yt)">
              <animate attributeName="stroke-opacity" values="0.4;0.1;0.4;0.2;0.4" dur="3.5s" repeatCount="indefinite" />
            </circle>
            
            <!-- 装饰粒子 -->
            <g filter="url(#particle-glow-yt)">
              <circle class="particle" cx="10" cy="14" r="0.4" fill="#FFFFFF" opacity="0.8">
                <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" begin="0.1s" repeatCount="indefinite" />
              </circle>
              <circle class="particle" cx="26" cy="22" r="0.3" fill="#FFFFFF" opacity="0.7">
                <animate attributeName="opacity" values="0.7;0.2;0.7" dur="2.5s" begin="0.7s" repeatCount="indefinite" />
              </circle>
              <circle class="particle" cx="22" cy="9" r="0.5" fill="#FFFFFF" opacity="0.6">
                <animate attributeName="opacity" values="0.6;0.1;0.6" dur="3.1s" begin="0.3s" repeatCount="indefinite" />
              </circle>
            </g>
            
            <!-- D 字母图标 -->
            <path d="M14,12 L18,12 C21.5,12 23,14 23,18 C23,22 21.5,24 18,24 L14,24 Z" fill="white" filter="url(#glow-yt)" />
            <path d="M16,15 L18,15 C19.5,15 20,16 20,18 C20,20 19.5,21 18,21 L16,21 Z" fill="url(#dejavocab-inner-gradient-yt)">
              <animate attributeName="fill-opacity" values="1;0.85;1" dur="4s" repeatCount="indefinite" />
            </path>
            
            <!-- 字幕标记带微光效果 -->
            <rect x="11" y="22" width="14" height="1.5" rx="0.75" fill="#FFFFFF" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.7;0.9" dur="2.5s" repeatCount="indefinite" />
            </rect>
          </svg>
        </div>`;
        
        // 添加点击事件
        fullscreenBtn.addEventListener('click', async () => {          
          // 检查用户是否已登录
          const loggedIn = await isUserLoggedIn();
          
          if (loggedIn) {
            // 已登录，打开全屏视图
            toggleFullscreen();
          } else {
            // 未登录，打开侧面板登录页面
            openSidePanel();
          }
        });
        
        // 添加到右侧控制栏
        rightControls.appendChild(fullscreenBtn);
      }
    }, 1000); // 每秒检查一次
    
    // 5分钟后清除定时器，避免内存泄漏
    setTimeout(() => {
      clearInterval(intervalId);
    }, 300000);
  };

  // 初始化监听器和按钮
  const initializeFullscreenIcon = () => {
    // 监听页面变化，每当页面变化时尝试添加按钮
    // YouTube是SPA，页面跳转不会触发完整刷新
    const observer = new MutationObserver(() => {
      if (hasVideoOnPage.value) {
        addFullscreenButtonToYouTubeControls();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 初始检查
    if (hasVideoOnPage.value) {
      addFullscreenButtonToYouTubeControls();
    }
    
    // 返回清理函数
    return () => {
      observer.disconnect();
    };
  };

  onMounted(() => {
    const cleanup = initializeFullscreenIcon();
    
    // 组件卸载时清理
    onUnmounted(cleanup);
  });
}

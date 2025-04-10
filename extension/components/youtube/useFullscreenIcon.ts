import { onMounted, onUnmounted, Ref } from 'vue';
import { browser } from 'wxt/browser';

/**
 * Check if the user is logged in
 * @returns Promise<boolean> Whether the user is logged in
 */
async function isUserLoggedIn(): Promise<boolean> {
  try {
    // Use browser API instead of chrome API for compatibility
    const result = await browser.storage.local.get(['authToken']);
    const authToken = result.authToken;
    return !!authToken; // If there's a token, the user is considered logged in
  } catch (error) {
    return false; // Default to not logged in if an error occurs
  }
}


function openSidePanel() {
  showLoginPrompt();
}

/**
 * Show login prompt (fallback method when side panel cannot be opened)
 */
function showLoginPrompt() {
  try {
    // Remove any existing dialog
    const existingModal = document.getElementById('dejavocab-login-modal');
    if (existingModal) {
      document.body.removeChild(existingModal);
    }
    
    // Create a modal dialog
    const loginModal = document.createElement('div');
    loginModal.id = 'dejavocab-login-modal';
    loginModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: rgba(30, 30, 30, 0.85);
      border-radius: 16px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 35px;
      max-width: 380px;
      text-align: center;
      transition: all 0.3s ease;
      animation: fadeIn 0.4s ease-out;
    `;
    
    modalContent.innerHTML = `
      <div style="position: relative;">
        <!-- Logo at the top -->
        <div style="margin-bottom: 20px;">
          <svg height="60" width="60" viewBox="0 0 36 36" style="margin: 0 auto; filter: drop-shadow(0 0 8px rgba(54, 238, 224, 0.5));">
            <defs>
              <linearGradient id="dejavocab-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0a84ff" />
                <stop offset="100%" stop-color="#36eee0" />
              </linearGradient>
              <filter id="glow-effect" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            
            <circle cx="18" cy="18" r="16" fill="url(#dejavocab-logo-gradient)">
              <animate attributeName="r" values="16;16.3;16;16.2;16" dur="3s" repeatCount="indefinite" />
            </circle>
            
            <path d="M14,12 L18,12 C21.5,12 23,14 23,18 C23,22 21.5,24 18,24 L14,24 Z" fill="white" filter="url(#glow-effect)" />
            <path d="M16,15 L18,15 C19.5,15 20,16 20,18 C20,20 19.5,21 18,21 L16,21 Z" fill="#e0f7fa">
              <animate attributeName="fill-opacity" values="1;0.85;1" dur="4s" repeatCount="indefinite" />
            </path>
            
            <rect x="11" y="22" width="14" height="1.5" rx="0.75" fill="#FFFFFF" opacity="0.9" />
          </svg>
        </div>
        
        <h2 style="margin-top: 0; color: #ffffff; font-weight: 500; font-size: 24px; letter-spacing: 0.5px;">Login Required</h2>
        <p style="margin: 12px 0 25px; font-size: 15px; line-height: 1.5; opacity: 0.9; color: #e0f7fa;">You need to be logged in to use the fullscreen feature</p>
        
        <!-- Steps with improved design -->
        <div style="display: flex; flex-direction: column; margin: 20px 0; gap: 20px;">
          <!-- Step 1 -->
          <div style="display: flex; align-items: center; text-align: left; background: rgba(54, 238, 224, 0.1); border-radius: 12px; padding: 16px; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: linear-gradient(to bottom, #36eee0, #0a84ff);"></div>
            <div style="min-width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
              <div style="background: linear-gradient(135deg, #0a84ff, #36eee0); color: #000; font-weight: bold; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(54, 238, 224, 0.4);">1</div>
            </div>
            <div style="flex-grow: 1;">
              <p style="margin: 0; font-size: 15px; font-weight: 500; color: #ffffff;">Click the extension icon in the browser toolbar</p>
              <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.8; color: #e0f7fa;">(puzzle piece icon in the top-right corner)</p>
            </div>
            <!-- Extension icon -->
            <div style="min-width: 40px; text-align: center;">
              <div style="width: 32px; height: 32px; background: #3c4043; border-radius: 4px; position: relative; margin: 0 auto; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                  <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" fill="white"/>
                </svg>
              </div>
            </div>
          </div>
          
          <!-- Animated arrow -->
          <div style="position: relative; height: 20px; display: flex; justify-content: center; align-items: center;">
            <div style="position: relative; width: 2px; height: 20px; background: linear-gradient(to bottom, #36eee0, transparent);">
              <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 0; height: 0; 
                  border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #36eee0;">
                <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
              </div>
            </div>
          </div>
          
          <!-- Step 2 -->
          <div style="display: flex; align-items: center; text-align: left; background: rgba(54, 238, 224, 0.1); border-radius: 12px; padding: 16px; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: linear-gradient(to bottom, #36eee0, #0a84ff);"></div>
            <div style="min-width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
              <div style="background: linear-gradient(135deg, #0a84ff, #36eee0); color: #000; font-weight: bold; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(54, 238, 224, 0.4);">2</div>
            </div>
            <div style="flex-grow: 1;">
              <p style="margin: 0; font-size: 15px; font-weight: 500; color: #ffffff;">Select the Déjà Vocab extension</p>
              <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.8; color: #e0f7fa;">Login to access all features</p>
            </div>
            <!-- DejaVocab icon -->
            <div style="min-width: 40px; text-align: center;">
              <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #0a84ff, #36eee0); border-radius: 6px; position: relative; margin: 0 auto; box-shadow: 0 2px 8px rgba(54, 238, 224, 0.5);">
                <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-weight: bold; color: white; font-size: 18px;">D</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Success message with subtle animation -->
        <div style="margin: 25px 0 15px; padding: 10px; background: rgba(54, 238, 224, 0.1); border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; color: #e0f7fa; display: flex; align-items: center; justify-content: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="margin-right: 8px;">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#36eee0"/>
            </svg>
            <span style="display: inline-block;">Once logged in, you can use the fullscreen feature</span>
          </p>
        </div>
        
        <!-- Close button with improved styling -->
        <button id="dejavocab-login-close" style="
          background: linear-gradient(135deg, #0a84ff, #36eee0);
          color: #000;
          border: none;
          padding: 12px 30px;
          border-radius: 30px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.5px;
          transition: all 0.3s ease;
          margin-top: 10px;
        ">Got it</button>

        <!-- Close icon in the top right -->
        <div id="dejavocab-login-close-x" style="
          position: absolute;
          top: -15px;
          right: -15px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.15);
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="white"/>
          </svg>
        </div>
      </div>
      
      <style>
        @keyframes fadeIn {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        #dejavocab-login-close:hover {
          transform: translateY(-2px);
          background: linear-gradient(135deg, #1a94ff, #46fee0);
        }
        #dejavocab-login-close-x:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: rotate(90deg);
        }
      </style>
    `;
    
    loginModal.appendChild(modalContent);
    document.body.appendChild(loginModal);
    
    // Add close button event
    const closeButton = document.getElementById('dejavocab-login-close');
    const closeX = document.getElementById('dejavocab-login-close-x');
    
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        if (document.body.contains(loginModal)) {
          loginModal.style.opacity = '0';
          loginModal.style.transform = 'scale(0.95)';
          setTimeout(() => {
            if (document.body.contains(loginModal)) {
              document.body.removeChild(loginModal);
            }
          }, 300);
        }
      });
    }
    
    if (closeX) {
      closeX.addEventListener('click', () => {
        if (document.body.contains(loginModal)) {
          loginModal.style.opacity = '0';
          loginModal.style.transform = 'scale(0.95)';
          setTimeout(() => {
            if (document.body.contains(loginModal)) {
              document.body.removeChild(loginModal);
            }
          }, 300);
        }
      });
    }
    
    // Close on background click
    loginModal.addEventListener('click', (event) => {
      if (event.target === loginModal) {
        loginModal.style.opacity = '0';
        loginModal.style.transform = 'scale(0.95)';
        setTimeout(() => {
          if (document.body.contains(loginModal)) {
            document.body.removeChild(loginModal);
          }
        }, 300);
      }
    });
    
    // Automatically close after 15 seconds
    setTimeout(() => {
      if (document.body.contains(loginModal)) {
        loginModal.style.opacity = '0';
        loginModal.style.transform = 'scale(0.95)';
        setTimeout(() => {
          if (document.body.contains(loginModal)) {
            document.body.removeChild(loginModal);
          }
        }, 300);
      }
    }, 15000);
    
  } catch (error) {
      setTimeout(() => {
        alert('You need to be logged in to use the fullscreen feature. Please click the extension menu in the top right corner and select the Dejavocab extension to log in.');
      }, 500);
  }
}

/**
 * Add a fullscreen icon button to the YouTube player controls
 * @param hasVideoOnPage Reactive reference indicating whether a video is on the page
 * @param toggleFullscreen Function to toggle fullscreen
 */
export function useFullscreenIcon(
  hasVideoOnPage: Ref<boolean>,
  toggleFullscreen: () => void
) {
  // Add fullscreen button to the YouTube player's right controls
  const addFullscreenButtonToYouTubeControls = () => {
    // Periodically check if the right controls exist
    const intervalId = setInterval(() => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (rightControls) {
        clearInterval(intervalId);
        
        // Check if button has already been added
        if (document.querySelector('.dejavocab-fullscreen-btn')) {
          return; // Already exists, don't add again
        }
        
        // Create fullscreen button
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'ytp-button dejavocab-fullscreen-btn';
        fullscreenBtn.title = 'Deja Vocab';
        
        // Add sleek, modern brand icon design with glowing particles and animations
        // Use inline SVG code to ensure the icon is always visible
        fullscreenBtn.innerHTML = `<div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
          <svg height="90%" version="1.1" viewBox="0 0 36 36" width="90%" style="filter: drop-shadow(0 0 5px rgba(54, 238, 224, 0.6));">
            <!-- Gradients and filter definitions -->
            <defs>
              <linearGradient id="dejavocab-btn-gradient-yt" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0a84ff" /> <!-- primary(dark mode) -->
                <stop offset="100%" stop-color="#36eee0" /> <!-- accent(light mode) -->
              </linearGradient>
              <linearGradient id="dejavocab-inner-gradient-yt" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3c8ce7" />
                <stop offset="100%" stop-color="#00eaff" />
              </linearGradient>
              
              <!-- Glow filter -->
              <filter id="glow-yt" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              
              <!-- Particle glow filter -->
              <filter id="particle-glow-yt" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.5" result="particle-blur" />
                <feComposite in="SourceGraphic" in2="particle-blur" operator="over" />
              </filter>
            </defs>
            
            <!-- Main background circle with breathing effect -->
            <circle cx="18" cy="18" r="16" fill="url(#dejavocab-btn-gradient-yt)">
              <animate attributeName="r" values="16;16.3;16;16.2;16" dur="3s" repeatCount="indefinite" />
            </circle>
            
            <!-- Exciting inner and outer halos -->
            <circle cx="18" cy="18" r="17" fill="none" stroke="#FFFFFF" stroke-width="0.3" opacity="0.4" filter="url(#glow-yt)">
              <animate attributeName="stroke-opacity" values="0.4;0.1;0.4;0.2;0.4" dur="3.5s" repeatCount="indefinite" />
            </circle>
            
            <!-- Decorative particles -->
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
            
            <!-- D letter icon -->
            <path d="M14,12 L18,12 C21.5,12 23,14 23,18 C23,22 21.5,24 18,24 L14,24 Z" fill="white" filter="url(#glow-yt)" />
            <path d="M16,15 L18,15 C19.5,15 20,16 20,18 C20,20 19.5,21 18,21 L16,21 Z" fill="url(#dejavocab-inner-gradient-yt)">
              <animate attributeName="fill-opacity" values="1;0.85;1" dur="4s" repeatCount="indefinite" />
            </path>
            
            <!-- Subtitle marker with subtle glow effect -->
            <rect x="11" y="22" width="14" height="1.5" rx="0.75" fill="#FFFFFF" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.7;0.9" dur="2.5s" repeatCount="indefinite" />
            </rect>
          </svg>
        </div>`;
        
        // Add click event
        fullscreenBtn.addEventListener('click', async () => {          
          // Check if user is logged in
          const loggedIn = await isUserLoggedIn();
          
          if (loggedIn) {
            // Logged in, open fullscreen view
            toggleFullscreen();
          } else {
            // Not logged in, open side panel login page
            openSidePanel();
          }
        });
        
        // Add to right controls
        rightControls.appendChild(fullscreenBtn);
      }
    }, 1000); // Check once a second
    
    // Clear timer after 5 minutes to avoid memory leaks
    setTimeout(() => {
      clearInterval(intervalId);
    }, 300000);
  };

  // Initialize listeners and buttons
  const initializeFullscreenIcon = () => {
    // Listen for page changes and try to add the button when the page changes
    // YouTube is an SPA, page navigation doesn't trigger a complete refresh
    const observer = new MutationObserver(() => {
      if (hasVideoOnPage.value) {
        addFullscreenButtonToYouTubeControls();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Initial check
    if (hasVideoOnPage.value) {
      addFullscreenButtonToYouTubeControls();
    }
    
    // Return cleanup function
    return () => {
      observer.disconnect();
    };
  };

  onMounted(() => {
    const cleanup = initializeFullscreenIcon();
    
    // Clean up when component unmounts
    onUnmounted(cleanup);
  });
}

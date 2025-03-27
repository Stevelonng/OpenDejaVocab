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
      <h2 style="margin-top: 0; color: #ffffff; font-weight: 300; font-size: 24px;">Login Required</h2>
      <p style="margin: 20px 0; font-size: 16px; line-height: 1.5; opacity: 0.85;">You need to be logged in to use fullscreen functionality.</p>
      
      <!-- Simple visual operation guide -->
      <div style="display: flex; flex-direction: column; margin: 20px 0; gap: 15px;">
        <!-- Step 1 -->
        <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="min-width: 30px; text-align: center;">
            <div style="background: #36eee0; color: #000; font-weight: bold; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">1</div>
          </div>
          <div style="flex-grow: 1;">
            <p style="margin: 0; font-size: 15px;">Click the extension icon in the top right of the browser (puzzle piece)</p>
          </div>
          <div style="min-width: 40px; text-align: center;">
            <div style="width: 32px; height: 32px; background: #3c4043; border-radius: 4px; position: relative; margin: 0 auto;">
              <!-- Chrome extension icon (puzzle piece) -->
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" fill="white"/>
              </svg>
            </div>
          </div>
        </div>
        
        <!-- Arrow indicator -->
        <div style="text-align: center; color: #36eee0; font-size: 18px;">↓</div>
        
        <!-- Step 2 -->
        <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="min-width: 30px; text-align: center;">
            <div style="background: #36eee0; color: #000; font-weight: bold; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">2</div>
          </div>
          <div style="flex-grow: 1;">
            <p style="margin: 0; font-size: 15px;">Select the Dejavocab extension from the menu</p>
          </div>
          <div style="min-width: 40px; text-align: center;">
            <!-- Use inline SVG code to ensure the icon is always visible -->
            <div style="display: flex; justify-content: center; align-items: center; width: 36px; height: 36px;">
              <svg height="36" version="1.1" viewBox="0 0 36 36" width="36" style="filter: drop-shadow(0 0 5px rgba(54, 238, 224, 0.6));">
                <!-- Gradients and filter definitions -->
                <defs>
                  <linearGradient id="dejavocab-btn-gradient-popup" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0a84ff" /> <!-- primary(dark mode) -->
                    <stop offset="100%" stop-color="#36eee0" /> <!-- accent(light mode) -->
                  </linearGradient>
                  <linearGradient id="dejavocab-inner-gradient-popup" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#3c8ce7" />
                    <stop offset="100%" stop-color="#00eaff" />
                  </linearGradient>
                  
                  <!-- Glow filter -->
                  <filter id="glow-popup" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  
                  <!-- Particle glow filter -->
                  <filter id="particle-glow-popup" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="0.5" result="particle-blur" />
                    <feComposite in="SourceGraphic" in2="particle-blur" operator="over" />
                  </filter>
                </defs>
                
                <!-- Main background circle with breathing effect -->
                <circle cx="18" cy="18" r="16" fill="url(#dejavocab-btn-gradient-popup)">
                  <animate attributeName="r" values="16;16.3;16;16.2;16" dur="3s" repeatCount="indefinite" />
                </circle>
                
                <!-- Exciting inner and outer halos -->
                <circle cx="18" cy="18" r="17" fill="none" stroke="#FFFFFF" stroke-width="0.3" opacity="0.4" filter="url(#glow-popup)">
                  <animate attributeName="stroke-opacity" values="0.4;0.1;0.4;0.2;0.4" dur="3.5s" repeatCount="indefinite" />
                </circle>
                
                <!-- Decorative particles -->
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
                
                <!-- D letter icon -->
                <path d="M14,12 L18,12 C21.5,12 23,14 23,18 C23,22 21.5,24 18,24 L14,24 Z" fill="white" filter="url(#glow-popup)" />
                <path d="M16,15 L18,15 C19.5,15 20,16 20,18 C20,20 19.5,21 18,21 L16,21 Z" fill="url(#dejavocab-inner-gradient-popup)">
                  <animate attributeName="fill-opacity" values="1;0.85;1" dur="4s" repeatCount="indefinite" />
                </path>
                
                <!-- Subtitle marker with subtle glow effect -->
                <rect x="11" y="22" width="14" height="1.5" rx="0.75" fill="#FFFFFF" opacity="0.9">
                  <animate attributeName="opacity" values="0.9;0.7;0.9" dur="2.5s" repeatCount="indefinite" />
                </rect>
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      <p style="margin: 15px 0; font-size: 15px; line-height: 1.5; text-align: center;">Once logged in, you can use the fullscreen feature</p>
      
      <!-- CSS animations are no longer needed as all animations are within SVG -->
      <style>
        /* Empty style sheet - All animations are contained in SVG */
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
        ">Close</button>
      </div>
    `;
    
    loginModal.appendChild(modalContent);
    document.body.appendChild(loginModal);
    
    // Add close button event
    const closeButton = document.getElementById('dejavocab-login-close');
    if (closeButton) {
      // Add hover effect
      closeButton.addEventListener('mouseover', () => {
        closeButton.style.background = 'rgba(255, 255, 255, 0.3)';
      });
      closeButton.addEventListener('mouseout', () => {
        closeButton.style.background = 'rgba(255, 255, 255, 0.2)';
      });
      // Click close event
      closeButton.addEventListener('click', () => {
        if (document.body.contains(loginModal)) {
          document.body.removeChild(loginModal);
        }
      });
    }
    
    // Close on background click
    loginModal.addEventListener('click', (event) => {
      if (event.target === loginModal) {
        document.body.removeChild(loginModal);
      }
    });
    
    // Automatically close after 15 seconds
    setTimeout(() => {
      if (document.body.contains(loginModal)) {
        document.body.removeChild(loginModal);
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

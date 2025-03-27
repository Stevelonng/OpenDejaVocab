import { ref, onUnmounted } from 'vue';
import browser from 'webextension-polyfill';

export function useYouTubePlayer() {
  // 检测页面上是否有YouTube视频
  const hasVideoOnPage = ref(false);
  // 状态变量
  const videoElement = ref<HTMLVideoElement | null>(null);
  const originalVideoContainer = ref<HTMLElement | null>(null);
  const currentVideoTime = ref(0);
  const youtubePlayer = ref<HTMLElement | null>(null);
  const videoPlaceholder = ref<HTMLElement | null>(null);
  const playerContainer = ref<HTMLElement | null>(null);
  const wasPlaying = ref(false);
  const lastVideoSrc = ref<string>('');
  const lastVideoDuration = ref<number>(0);
  const lastDetectedVideoId = ref<string | null>(null);
  
  // 视频切换事件
  const videoSwitchEvent = new CustomEvent('youtube-video-switched', {
    detail: { timestamp: Date.now() }
  });

  // 查找YouTube播放器完整容器
  const findYouTubePlayerContainer = (element: HTMLElement): HTMLElement | null => {
    // 先尝试查找直接的播放器容器
    let container = element.closest('.html5-video-player') as HTMLElement;
    if (container) return container;
    
    // 如果没找到，尝试寻找更大的容器
    container = document.querySelector('#player-container') as HTMLElement;
    if (container) return container;
    
    // 继续尝试其他可能的容器
    container = document.querySelector('#player') as HTMLElement;
    if (container) return container;
    
    // 如果实在找不到，返回原始元素
    return element;
  };
  
  // 创建画中画效果（备选方案）
  const createPictureInPicture = (originalVideo: HTMLVideoElement, container: HTMLElement) => {
    
    // 创建一个新的视频元素
    const pipVideo = document.createElement('video');
    pipVideo.style.width = '100%';
    pipVideo.style.maxHeight = '80vh';
    pipVideo.style.borderRadius = '8px';
    pipVideo.controls = false; // 关闭原生控制栏
    pipVideo.autoplay = true;
    
    // 尝试通过canvas截取原始视频每一帧
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 设置canvas大小与视频相同
    canvas.width = originalVideo.videoWidth;
    canvas.height = originalVideo.videoHeight;
    
    // 方法1：尝试使用captureStream（不是所有浏览器都支持）
    if ('captureStream' in originalVideo) {
      // @ts-ignore: captureStream可能不在所有TypeScript类型定义中
      const stream = originalVideo.captureStream();
      pipVideo.srcObject = stream;
      container.appendChild(pipVideo);
      return;
    }

    
    // 备选方案：创建模拟视频
    const mockVideoContainer = document.createElement('div');
    mockVideoContainer.className = 'mock-video';
    mockVideoContainer.style.width = '100%';
    mockVideoContainer.style.maxHeight = '80vh';
    mockVideoContainer.style.borderRadius = '8px';
    mockVideoContainer.style.backgroundColor = '#000';
    mockVideoContainer.style.position = 'relative';
    mockVideoContainer.style.display = 'flex';
    mockVideoContainer.style.alignItems = 'center';
    mockVideoContainer.style.justifyContent = 'center';
    
    const mockMessage = document.createElement('div');
    mockMessage.textContent = '由于浏览器安全限制，无法直接显示视频。请使用YouTube原始播放器观看视频。';
    mockMessage.style.color = 'white';
    mockMessage.style.padding = '20px';
    mockMessage.style.textAlign = 'center';
    
    mockVideoContainer.appendChild(mockMessage);
    container.appendChild(mockVideoContainer);
  };

  // 捕获原始YouTube视频
  const captureYouTubeVideo = (updateSubtitleCallback: (time: number) => void) => {
    // 查找YouTube视频播放器
    const ytPlayer = document.querySelector('#movie_player') as HTMLElement;

    // 尝试多种选择器来找到视频元素
    let video = document.querySelector('video.video-stream.html5-main-video') as HTMLVideoElement;
    
    // 如果第一种选择器没找到，尝试其他可能的选择器
    if (!video) {
      video = document.querySelector('#movie_player video') as HTMLVideoElement;
    }
    
    // 最后尝试更通用的选择器
    if (!video) {
      video = document.querySelector('video') as HTMLVideoElement;
    }
    
    if (ytPlayer && video) {
      youtubePlayer.value = ytPlayer;
      videoElement.value = video;
      originalVideoContainer.value = video.parentElement;
      
      // 判断当前视频是否正在播放
      wasPlaying.value = !video.paused;
      
      // 立即更新视频时间
      if (video.currentTime) {
        currentVideoTime.value = video.currentTime;
      }
      
      // 视频处理逻辑
      setTimeout(() => {
        // 获取视频容器元素
        const videoContainer = document.getElementById('yt-fullscreen-dejavocab-video-container');
        if (videoContainer) {
          // 只移动视频元素而不是整个播放器
          try {
            
            // 创建占位元素以便稍后可以恢复
            const placeholder = document.createElement('div');
            placeholder.id = 'yt-video-placeholder';
            placeholder.style.width = video.offsetWidth + 'px';
            placeholder.style.height = video.offsetHeight + 'px';
            placeholder.style.display = 'none';
            videoPlaceholder.value = placeholder;
            
            // 只处理视频元素
            if (video.parentElement) {
              // 在原始位置放置占位元素
              video.parentElement.insertBefore(placeholder, video);
              
              // 显式移除YouTube设置的宽度和高度内联样式
              video.style.removeProperty('width'); // 移除宽度限制
              video.style.removeProperty('height'); // 移除高度限制
              
              // 添加通过JavaScript重设属性的MutationObserver，以防YouTube重新应用这些样式
              const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                  if (mutation.attributeName === 'style') {
                    // 当样式变化时再次强制移除宽度和高度
                    video.style.removeProperty('width');
                    video.style.removeProperty('height');
                  }
                });
              });
              
              // 开始监测样式变化
              observer.observe(video, { attributes: true, attributeFilter: ['style'] });
              
              // 保留控制属性
              video.controls = false;
              
              // 直接将视频添加到容器中
              videoContainer.appendChild(video);
            }
            
            // 确保视频保持原来的播放状态
            if (wasPlaying.value) {
              video.play();
            }            
          } catch (e) {
            createPictureInPicture(video, videoContainer);
          }
        }
      }, 100); // 缩短延迟以提高响应速度
      
      // 开始监听视频时间更新
      video.addEventListener('timeupdate', () => {
        currentVideoTime.value = video.currentTime;
        updateSubtitleCallback(video.currentTime);
      });
      
      return true;
    }
    return false;
  };
  
  // 恢复视频到原始位置
  const restoreYouTubeVideo = () => {
    try {      
      // 检查是否正在播放
      if (videoElement.value) {
        wasPlaying.value = !videoElement.value.paused;
      } else {
        return;
      }
      
      const currentContainer = document.getElementById('yt-fullscreen-dejavocab-video-container');
      
      // 检查视频是否在全屏容器中
      if (currentContainer && currentContainer.contains(videoElement.value)) {
        currentContainer.removeChild(videoElement.value);
      }
      
      // 重置诸多视频参数，以确保其可见
      if (videoElement.value) {
        // 重置任何可能导致不可见的样式
        videoElement.value.style.display = 'block';
        videoElement.value.style.visibility = 'visible';
        videoElement.value.style.opacity = '1';
        videoElement.value.style.width = 'auto';
        videoElement.value.style.height = 'auto';
        videoElement.value.style.maxWidth = '100%';
        videoElement.value.style.maxHeight = '100%';
        videoElement.value.style.position = 'static';
        videoElement.value.style.zIndex = 'auto';
        videoElement.value.style.transform = 'none';
      }
      
      // 使用多种方法尝试恢复视频
      
      // 方法 1: 使用占位符
      if (videoPlaceholder.value && videoPlaceholder.value.parentElement) {
        // 查找应该恢复的元素 - 可能是播放器容器或视频元素
        const elementToRestore = videoElement.value;
        
        if (elementToRestore) {
          videoPlaceholder.value.parentElement.replaceChild(elementToRestore, videoPlaceholder.value);
        }
      }
      // 方法 2: 返回原始容器
      else if (originalVideoContainer.value) {
        originalVideoContainer.value.appendChild(videoElement.value);
      }
      // 方法 3: 尝试找到YouTube的视频容器
      else {
        const ytVideoContainer = document.querySelector('.html5-video-container');
        if (ytVideoContainer) {
          ytVideoContainer.appendChild(videoElement.value);
        } else {
          // 最后的尝试，将其添加到任何可见的容器
          const anyContainer = document.querySelector('#movie_player') || document.querySelector('#player') || document.body;
          if (anyContainer) {
            anyContainer.appendChild(videoElement.value);
          }
        }
      }
      
      // 确保视频保持原来的播放状态
      if (videoElement.value) {        
        // 尝试触发视频重绘
        setTimeout(() => {
          if (videoElement.value) {
            // 触发元素尺寸计算以促使元素可见
            const currWidth = videoElement.value.offsetWidth;
            videoElement.value.style.width = (currWidth + 1) + 'px';
            setTimeout(() => {
              if (videoElement.value) {
                videoElement.value.style.width = 'auto';
              }
            }, 50);
            
            // 还原播放状态
            if (wasPlaying.value) {
              videoElement.value.play().catch(() => {});
            }
          }
        }, 100);
      }
      
      // 清除引用
      videoPlaceholder.value = null;
    } catch (e) {
      
      // 如果出错，仍然尝试继续播放
      if (videoElement.value && wasPlaying.value) {
        videoElement.value.style.display = 'block';
        videoElement.value.style.visibility = 'visible';
        videoElement.value.play().catch(() => {});
      }
    }
  };

  /**
   * 检查页面上是否有YouTube视频
   * @returns 检测结果 (true/false)
   */
  const checkForYouTubeVideo = () => {
    // 检查是否是视频页面 - 使用URL路径判断
    const isVideoPage = window.location.href.includes('/watch?v=');
    
    // 检查是否有视频元素
    const videoElement = document.querySelector('video.html5-main-video');
    
    // 只有在视频页面且有视频元素时才返回true
    hasVideoOnPage.value = isVideoPage && !!videoElement;
    
    return hasVideoOnPage.value;
  };
  
  /**
   * 从URL中提取YouTube视频ID
   * @returns 视频ID或null
   */
  const extractYouTubeVideoId = () => {
    const match = window.location.href.match(/(?:youtube\.com\/watch\?v=|\/videos\/|youtu\.be\/|embed\/|\?v=)([^&?\n]+)/);
    return match ? match[1] : null;
  };
  
  /**
   * 获取当前视频标题
   * @returns 视频标题
   */
  const getVideoTitle = () => {
    return typeof document !== 'undefined' ? document.title.replace(' - YouTube', '') : '';
  };

  /**
   * 设置视频检测定时器
   * 定期检测页面上的YouTube视频并更新状态
   */
  const setupVideoDetectionInterval = (intervalTime = 1000) => {
    // 初始执行检测
    checkForYouTubeVideo();
    
    // 定时检测，以应对YouTube动态加载视频
    const checkVideoInterval = setInterval(() => {
      checkForYouTubeVideo();
    }, intervalTime);
    
    // 返回清理函数
    return () => {
      clearInterval(checkVideoInterval);
    };
  };

  return {
    videoElement,
    originalVideoContainer,
    currentVideoTime,
    youtubePlayer,
    videoPlaceholder,
    playerContainer,
    wasPlaying,
    hasVideoOnPage,
    findYouTubePlayerContainer,
    createPictureInPicture,
    captureYouTubeVideo,
    restoreYouTubeVideo,
    checkForYouTubeVideo,
    extractYouTubeVideoId,
    getVideoTitle,
    setupVideoDetectionInterval
  };
}

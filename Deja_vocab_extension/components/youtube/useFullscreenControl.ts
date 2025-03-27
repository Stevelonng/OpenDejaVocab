import { ref, onUnmounted, Ref, watch } from 'vue';

export function useFullscreenControl(
  videoElement: Ref<HTMLVideoElement | null>, 
  restoreVideo: () => void, 
) {
  const isFullscreen = ref(false);
  const immersiveMode = ref(false);

  // 防止滑动穿透的函数
  const preventScroll = (e: Event) => {
    // 只有在全屏模式下才防止滑动
    if (isFullscreen.value) {
      // 获取事件目标元素
      const target = e.target as HTMLElement;
      
      // 如果目标元素在字幕容器内部，则允许滑动
      const subtitlesContainer = document.querySelector('.subtitles-container');
      if (subtitlesContainer && (subtitlesContainer.contains(target) || subtitlesContainer === target)) {
        // 允许滑动，不阻止默认行为
        return;
      }
      
      // 其他区域阻止滑动
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // 切换全屏模式
  const toggleFullscreen = (captureVideo: () => boolean) => {
    isFullscreen.value = !isFullscreen.value;
    
    if (isFullscreen.value) {
      // 防止背后的YouTube界面滑动并隐藏所有滚动条
      document.documentElement.style.overflow = 'hidden'; // 应用到 <html> 元素
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      
      // 隐藏所有滚动条（适用于各种浏览器）
      const hideScrollbarsStyle = document.createElement('style');
      hideScrollbarsStyle.id = 'hide-scrollbars-style';
      hideScrollbarsStyle.textContent = `
        body::-webkit-scrollbar, html::-webkit-scrollbar { display: none !important; }
        body, html { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      `;
      document.head.appendChild(hideScrollbarsStyle);
      
      // 添加滑动防拦事件
      document.addEventListener('wheel', preventScroll, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });
      
      // 确保我们有视频元素
      if (!videoElement.value) {
        if (!captureVideo()) {
          isFullscreen.value = false;
          return;
        }
      } else {
        // 如果已经有视频元素但不在全屏容器中，需要重新捕获
        captureVideo();
      }
    } else {
      // 恢复滚动
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      
      // 删除隐藏滚动条的样式
      const hideScrollbarsStyle = document.getElementById('hide-scrollbars-style');
      if (hideScrollbarsStyle) {
        hideScrollbarsStyle.remove();
      }
      
      // 移除滑动防拦事件
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      
      // 使用新的恢复函数来确保视频继续播放
      restoreVideo();
    }
  };

  // 字幕拖动功能已移除
  
  // 切换沉浸模式
  const toggleImmersive = () => {
    immersiveMode.value = !immersiveMode.value;
  };


  /**
   * 增强版切换全屏函数
   * 可以接收额外参数：字幕获取函数和捕捉视频函数
   */
  const createEnhancedToggleFullscreen = (
    fetchSubtitles: (forceRefresh: boolean, collect: boolean) => Promise<void>,
    captureVideo: (updateFn: (time: number) => void) => boolean
  ) => {
    return async () => {
      // 在进入全屏模式之前先获取字幕
      if (!isFullscreen.value) {
        // 只有在进入全屏模式时才获取字幕，并且允许收集
        await fetchSubtitles(false, true); // 调用字幕获取函数，第二个参数指示应该收集字幕
      }
      
      // 调用基础全屏切换函数
      toggleFullscreen(() => captureVideo((time) => {}));
    };
  };
  
  return {
    isFullscreen,
    immersiveMode,
    preventScroll,
    toggleFullscreen,
    toggleImmersive,
    createEnhancedToggleFullscreen
  };
}
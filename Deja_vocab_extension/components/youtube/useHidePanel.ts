import { ref, onMounted, onUnmounted } from 'vue';

export function useHidePanel() {
  const isPanelHidden = ref(false);
  const isMouseNearBottom = ref(false);

  // 切换面板隐藏状态
  const toggleHidePanel = () => {
    isPanelHidden.value = !isPanelHidden.value;
  };

  // 检测鼠标是否在屏幕底部附近
  const handleMouseMove = (event: MouseEvent) => {
    if (!isPanelHidden.value) return;
    
    const windowHeight = window.innerHeight;
    const mouseY = event.clientY;
    
    // 当鼠标在屏幕底部50像素范围内时，视为接近底部
    isMouseNearBottom.value = mouseY > windowHeight - 50;
  };

  onMounted(() => {
    window.addEventListener('mousemove', handleMouseMove);
  });

  onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove);
  });

  return {
    isPanelHidden,
    isMouseNearBottom,
    toggleHidePanel
  };
}

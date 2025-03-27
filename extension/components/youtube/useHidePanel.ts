import { ref, onMounted, onUnmounted } from 'vue';

export function useHidePanel() {
  const isPanelHidden = ref(false);
  const isMouseNearBottom = ref(false);

  // Toggle panel hidden state
  const toggleHidePanel = () => {
    isPanelHidden.value = !isPanelHidden.value;
  };

  // Detect if mouse is near the bottom of the screen
  const handleMouseMove = (event: MouseEvent) => {
    if (!isPanelHidden.value) return;
    
    const windowHeight = window.innerHeight;
    const mouseY = event.clientY;
    
    // When mouse is within 50 pixels of the bottom of the screen, consider it near the bottom
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

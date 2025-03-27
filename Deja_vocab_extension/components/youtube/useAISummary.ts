import { ref } from 'vue'

/**
 * AI 摘要功能的可组合函数
 * 提供 AI 摘要的状态管理和方法
 */
export function useAISummary() {
  // 模态框显示状态
  const showSummaryModal = ref(false)
  // 加载状态
  const summaryLoading = ref(false)
  // 摘要内容
  const summaryContent = ref('')

  /**
   * 生成内容摘要
   * 未来将连接到实际的 AI API
   */
  const summarizeContent = () => {
    // 显示模态框并设置加载状态
    showSummaryModal.value = true
    summaryLoading.value = true
    
    // 模拟加载过程，真实实现中将调用实际的AI API
    setTimeout(() => {
      summaryContent.value = '这是关于浏览器扩展开发的视频。快速概括：\n\n1. 介绍了浏览器扩展的基本概念\n2. 演示了如何使用Vue.js构建扩展界面\n3. 讲解了扩展如何与页面内容交互\n4. 分享了一些开发浏览器扩展的最佳实践'
      summaryLoading.value = false
    }, 1500)
  }

  /**
   * 关闭摘要模态框
   */
  const closeSummaryModal = () => {
    showSummaryModal.value = false
  }

  return {
    showSummaryModal,
    summaryLoading,
    summaryContent,
    summarizeContent,
    closeSummaryModal
  }
}

import { ref } from 'vue'

/**
 * AI summary functionality
 * Provides AI summary state management and methods
 */
export function useAISummary() {
  // Modal display state
  const showSummaryModal = ref(false)
  // Loading state
  const summaryLoading = ref(false)
  // Summary content
  const summaryContent = ref('')

  /**
   * Generate content summary
   * Future implementation will connect to actual AI API
   */
  const summarizeContent = () => {
    // Show modal and set loading state
    showSummaryModal.value = true
    summaryLoading.value = true
    
    // Mock loading process, will connect to actual AI API in real implementation
    setTimeout(() => {
      summaryContent.value = 'This is a video about browser extension development. Quick summary:\n\n1. Introduces the basic concepts of browser extensions\n2. Demonstrates how to build extension interfaces with Vue.js\n3. Explains how extensions interact with page content\n4. Shares some best practices for browser extension development'
      summaryLoading.value = false
    }, 1500)
  }

  /**
   * Close summary modal
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

import { ref } from 'vue';

/**
 * 用于播放单词发音的组合式函数
 * 提供单词发音功能，与后端API交互获取发音音频
 */
export function usePronunciation() {
  // 音频播放器实例
  const audioPlayer = ref<HTMLAudioElement | null>(null);
  // 发音加载状态
  const isLoading = ref(false);
  // 发音错误信息
  const error = ref<string | null>(null);
  // 是否正在播放发音
  const isPlaying = ref(false);
  // 是否启用自动发音（默认启用）
  const autoPlayEnabled = ref(true);

  /**
   * 播放单词发音
   * @param word 要播放发音的单词
   * @returns 是否成功播放发音
   */
  const playPronunciation = async (word: string): Promise<boolean> => {
    if (!word) return false;
    
    // 清除之前的错误
    error.value = null;
    
    try {
      isLoading.value = true;
      
      // 获取API配置
      const result = await chrome.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('缺少 API URL 或认证信息');
      }
      
      // 构建发音API URL
      const pronunciationUrl = `${baseUrl}web/word-pronunciation/${encodeURIComponent(word.toLowerCase())}/`;
      
      // 创建或获取音频播放器
      if (!audioPlayer.value) {
        audioPlayer.value = new Audio();
        
        // 添加事件监听器
        audioPlayer.value.addEventListener('ended', () => {
          isPlaying.value = false;
        });
        
        audioPlayer.value.addEventListener('error', (e) => {
          isPlaying.value = false;
          error.value = '无法播放发音';
        });
      }
      
      // 停止当前正在播放的音频
      if (isPlaying.value && audioPlayer.value) {
        audioPlayer.value.pause();
        audioPlayer.value.currentTime = 0;
      }
      
      // 设置音频源为发音API URL，并添加认证令牌
      const audioSrc = pronunciationUrl;
      
      // 设置请求头（通过URL参数传递token，因为Audio元素不支持设置headers）
      const audioUrlWithToken = `${audioSrc}?token=${encodeURIComponent(authToken)}`;
      
      // 设置音频源
      audioPlayer.value.src = audioUrlWithToken;
      
      // 播放音频
      isPlaying.value = true;
      try {
        await audioPlayer.value.play();
      } catch (err) {
        throw err;
      }
      
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '播放发音失败';
      isPlaying.value = false;
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 停止当前播放的发音
   */
  const stopPronunciation = (): void => {
    if (audioPlayer.value && isPlaying.value) {
      audioPlayer.value.pause();
      audioPlayer.value.currentTime = 0;
      isPlaying.value = false;
    }
  };

  /**
   * 切换自动发音功能
   * @returns 切换后的状态
   */
  const toggleAutoPlay = (): boolean => {
    autoPlayEnabled.value = !autoPlayEnabled.value;
    
    // 保存到本地存储
    chrome.storage.local.set({ 'pronunciationAutoPlay': autoPlayEnabled.value });
    
    return autoPlayEnabled.value;
  };

  /**
   * 从本地存储加载自动发音设置
   */
  const loadSettings = async (): Promise<void> => {
    try {
      const result = await chrome.storage.local.get(['pronunciationAutoPlay']);
      // 如果设置存在，则使用它；否则默认为启用
      autoPlayEnabled.value = result.pronunciationAutoPlay !== false;
    } catch (error) {
      // 出错时默认启用
      autoPlayEnabled.value = true;
    }
  };

  // 初始化时加载设置
  loadSettings();

  return {
    isLoading,
    isPlaying,
    error,
    autoPlayEnabled,
    playPronunciation,
    stopPronunciation,
    toggleAutoPlay
  };
}

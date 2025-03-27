import { ref, Ref, computed, watch } from 'vue';
import { browser } from 'wxt/browser';

// 单词在视频中的引用信息
export interface WordReferenceInVideo {
  word: string;
  subtitle: {
    id: number;
    text: string;
    startTime: number;
    endTime: number;
  };
  contextStart: number;
  contextEnd: number;
  isFavorite: boolean;
}

/**
 * 视频收藏单词功能
 * 提取当前视频中收藏过的单词
 */
export function useVideoFavoriteWords(
  currentVideoTime: Ref<number>,
  currentVideoInfo: Ref<any>,
  subtitles: Ref<any[]>,
  favoriteWords: Ref<Set<string>>
) {
  // 状态
  const loading = ref(false);
  const error = ref<string | null>(null);
  const videoWordReferences = ref<WordReferenceInVideo[]>([]);
  
  // 计算属性：当前视频中收藏的单词
  const favoriteWordsInVideo = computed(() => {
    return videoWordReferences.value.filter(ref => 
      favoriteWords.value.has(ref.word.toLowerCase())
    );
  });
  
  // 计算属性：从收藏单词列表中提取唯一的单词，用于简化显示
  const uniqueFavoriteWords = computed(() => {
    // 提取所有单词
    const words = favoriteWordsInVideo.value.map(ref => ref.word);
    // 去重
    return [...new Set(words)];
  });
  
  /**
   * 当后端API不存在时，从字幕中提取单词并创建引用
   */
  const createReferencesFromSubtitles = () => {
    
    if (!subtitles.value || subtitles.value.length === 0) {
      return;
    }
    
    if (!favoriteWords.value || favoriteWords.value.size === 0) {
      return;
    }
    
    // 存储所有找到的单词引用
    const references: WordReferenceInVideo[] = [];
    
    // 从所有收藏单词中过滤出出现在字幕中的单词
    const favWords = Array.from(favoriteWords.value);
    
    // 遍历所有字幕
    for (const subtitle of subtitles.value) {
      const text = subtitle.text;
      
      // 查找每个收藏单词是否出现在当前字幕中
      for (const word of favWords) {
        try {
          // 使用正则表达式匹配整个单词，避免部分匹配
          // 使用单词边界\b确保匹配完整单词，忽略大小写
          const regex = new RegExp(`\\b${word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
          const match = text.match(regex);
          
          // 如果找到匹配
          if (match) {
            const matchedWord = match[0]; // 实际匹配到的单词（保留原始大小写）
            const index = text.indexOf(matchedWord);
            
            references.push({
              word: word, // 保存原始收藏的单词
              subtitle: {
                id: subtitle.id || 0,
                text: subtitle.text,
                startTime: subtitle.startTime,
                endTime: subtitle.endTime
              },
              contextStart: index,
              contextEnd: index + matchedWord.length,
              isFavorite: true
            });
          }
        } catch (e) {
        }
      }
    }
    
    videoWordReferences.value = references;
    
    // 如果没有找到引用，清除错误状态
    if (references.length === 0) {
    } else {
      // 已成功提取，清除错误
      error.value = null;
    }
  };
  
  /**
   * 从后端获取视频中的单词引用
   */
  const fetchVideoWordReferences = async (): Promise<void> => {
    if (!currentVideoInfo.value) {
      error.value = '当前没有视频信息';
      // 如果有字幕信息，尝试从字幕中提取
      if (subtitles.value && subtitles.value.length > 0 && favoriteWords.value.size > 0) {
        createReferencesFromSubtitles();
      }
      return;
    }
    
    try {
      loading.value = true;
      error.value = null;
      
      // 如果已经有字幕且有收藏单词，先从字幕中提取以快速显示
      if (subtitles.value && subtitles.value.length > 0 && favoriteWords.value.size > 0) {
        createReferencesFromSubtitles();
      }
      
      // 从存储中获取API设置和认证令牌
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      
      if (!authToken) {
        throw new Error('未找到认证令牌，无法从后端获取数据');
      }
      
      // 构建API URL
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      // 获取视频详情以获取视频ID
      const videoUrl = `https://www.youtube.com/watch?v=${currentVideoInfo.value.videoId}`;
      const videoResponse = await fetch(`${baseUrl}videos/?url=${encodeURIComponent(videoUrl)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!videoResponse.ok) {
        throw new Error('获取视频信息失败');
      }
      
      const videoData = await videoResponse.json();
      
      // 检查是否有视频数据
      if (!videoData.results || videoData.results.length === 0) {
        throw new Error('未找到视频数据');
      }
      
      // 查找匹配的视频
      let videoId = null;
      for (const video of videoData.results) {
        const urlVideoId = video.url.match(/(?:youtube\.com\/watch\?v=|\/videos\/|youtu\.be\/|embed\/|\?v=)([^&?\n]+)/)?.[1];
        if (urlVideoId === currentVideoInfo.value.videoId) {
          videoId = video.id;
          break;
        }
      }
      
      if (!videoId) {
        throw new Error('无法找到匹配的视频ID');
      }      
      
      // 获取视频中的所有单词引用
      const wordReferencesResponse = await fetch(`${baseUrl}video/${videoId}/word-references/`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!wordReferencesResponse.ok) {
        // 如果API端点不存在，尝试从现有字幕中提取出现的单词
        createReferencesFromSubtitles();
        return;
      }
      
      const wordReferencesData = await wordReferencesResponse.json();
      
      // 格式化数据
      videoWordReferences.value = wordReferencesData.map((ref: any) => ({
        word: ref.user_word.word_definition.text,
        subtitle: {
          id: ref.subtitle.id,
          text: ref.subtitle.text,
          startTime: ref.subtitle.start_time,
          endTime: ref.subtitle.end_time
        },
        contextStart: ref.context_start,
        contextEnd: ref.context_end,
        isFavorite: ref.user_word.is_favorite
      }));      
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || '未知错误';
      
      // 设置错误状态
      error.value = `获取失败: ${errorMessage}`;
      
      // 如果有字幕信息且有收藏单词，尝试从字幕中提取
      if (subtitles.value && subtitles.value.length > 0 && favoriteWords.value.size > 0) {
        createReferencesFromSubtitles();
      }
    } finally {
      loading.value = false;
    }
  };
  
  /**
   * 跳转到视频中单词出现的时间点
   * @param wordReference 单词引用信息
   */
  const seekToWordInVideo = (wordReference: WordReferenceInVideo): void => {
    // 获取视频元素并设置当前时间
    const videoElement = document.querySelector('video');
    if (videoElement) {
      videoElement.currentTime = wordReference.subtitle.startTime;
      videoElement.play().catch(err => console.error('播放失败:', err));
    }
  };
  
  // 监听视频变化，自动获取新视频的单词引用
  watch(() => currentVideoInfo.value?.videoId, (newVideoId, oldVideoId) => {
    if (newVideoId) {
      // 重置状态
      videoWordReferences.value = [];
      error.value = null;
      // 获取新视频的单词引用
      fetchVideoWordReferences();
    }
  }, { immediate: true }); // 添加 immediate: true 以确保初始加载时触发
  
  // 监听收藏单词变化，更新词表
  watch(favoriteWords, () => {
    // 始终重新从字幕中提取收藏单词，确保数据最新
    if (subtitles.value && subtitles.value.length > 0) {
      createReferencesFromSubtitles();
    }
  }, { deep: true, immediate: true }); // 添加 immediate: true 以确保初始加载时触发
  
  // 监听字幕变化
  watch(subtitles, (newSubtitles) => {
    // 当字幕加载完成后，尝试从字幕提取收藏单词
    if (newSubtitles && newSubtitles.length > 0 && favoriteWords.value.size > 0) {
      // 如果后端加载失败或者还没有词汇引用，使用字幕提取
      if (error.value || videoWordReferences.value.length === 0) {
        createReferencesFromSubtitles();
      }
    }
  }, { deep: true, immediate: true }); // 添加 immediate: true 以确保初始加载时触发
  
  // 初始加载 - 取消这里的调用，因为我们已经在 watch 中使用 immediate: true 来触发
  
  return {
    loading,
    error,
    videoWordReferences,
    favoriteWordsInVideo,
    uniqueFavoriteWords,
    fetchVideoWordReferences,
    seekToWordInVideo
  };
}

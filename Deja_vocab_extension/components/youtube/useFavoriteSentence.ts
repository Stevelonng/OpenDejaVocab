import { ref, Ref, computed, watch, onMounted } from 'vue';
import { browser } from 'wxt/browser';

/**
 * 字幕收藏功能的组合式API
 * 提供添加收藏、取消收藏、检查收藏状态的功能
 * 与后端API集成实现永久保存
 */
export const useFavoriteSentence = (subtitles: Ref<any[]>) => {
  // 收藏的字幕索引数组和ID映射
  const favoritedIndices = ref<number[]>([]);
  const subtitleIdMapping = ref<Record<number, number>>({});
  const sentenceIdMapping = ref<Record<number, number>>({}); // 新增句子ID映射
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);


  // 保存字幕到后端
  const saveSentenceToBackend = async (text: string, subtitle: any) => {
    const { apiUrl: storedApiUrl, authToken } = await browser.storage.local.get(['apiUrl', 'authToken']);
    const apiUrl = storedApiUrl || 'https://www.dejavocab.com/';
    
    if (!apiUrl || !authToken) return;

    // 确保API URL以/结尾
    const baseApiUrl = typeof apiUrl === 'string' && apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    
    const subtitleId = subtitle.id || subtitleIdMapping.value[subtitle.index];
    const videoId = subtitle.videoId;
    const videoTitle = subtitle.videoTitle || 'YouTube Video';
    const videoUrl = subtitle.videoUrl || window.location.href;
    
    if (!videoId) return;
    
    // 先检查视频是否存在，如果不存在则创建
    try {
      const videoResponse = await fetch(`${baseApiUrl}videos/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        },
        body: JSON.stringify({
          url: videoUrl,
          title: videoTitle,
          platform: 'YouTube'
        })
      });
      
      if (!videoResponse.ok) return;
    } catch (error) {
      // 继续执行，因为视频可能已经存在
    }
    
    let finalSubtitleId = subtitleId;
    if (!finalSubtitleId) {
      // 查找字幕ID
      try {
        const findResponse = await fetch(`${baseApiUrl}subtitles/?video_id=${videoId}&text=${encodeURIComponent(text)}`, {
          headers: {
            'Authorization': `Token ${authToken}`
          }
        });
        
        if (findResponse.ok) {
          const subtitles = await findResponse.json();
          
          if (subtitles.results && subtitles.results.length > 0) {
            finalSubtitleId = subtitles.results[0].id;
            subtitleIdMapping.value[subtitle.index] = finalSubtitleId;
          }
        }
      } catch (error) {
        // 查找字幕ID错误时继续执行
      }
    }
    
    // 构建请求数据
    const requestData: any = {
      text,
      subtitle_id: finalSubtitleId,
      translation: '', // 可以添加翻译API
      notes: `From video: ${subtitle.videoTitle || 'YouTube Video'}`
    };
    
    // 准备发送请求
    
    // 向后端API发送保存句子的请求
    const sentenceResponse = await fetch(`${baseApiUrl}add-sentence/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${authToken}`
      },
      body: JSON.stringify(requestData)
    });
    
    if (!sentenceResponse.ok) {
      const errorText = await sentenceResponse.text();
      throw new Error(`Failed to save sentence: ${sentenceResponse.status} ${errorText}`);
    }
    
    const savedSentence = await sentenceResponse.json();
    
    // 更新句子ID映射，用于后续取消收藏
    if (savedSentence && savedSentence.sentence_id) {
      sentenceIdMapping.value[subtitle.index] = savedSentence.sentence_id;
    } else if (savedSentence && savedSentence.id) {
      sentenceIdMapping.value[subtitle.index] = savedSentence.id;
    }
    
    return savedSentence;
  };

  // 从后端删除句子
  const removeSentenceFromBackend = async (sentenceId: number) => {
    const { apiUrl: storedApiUrl, authToken } = await browser.storage.local.get(['apiUrl', 'authToken']);
    const apiUrl = storedApiUrl || 'https://www.dejavocab.com/';
    
    if (!apiUrl || !authToken) {
      throw new Error('Missing API URL or authentication token');
    }
    
    // 确保API URL以/结尾
    const baseApiUrl = typeof apiUrl === 'string' && apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    // 使用REST API的DELETE方法删除句子
    const response = await fetch(`${baseApiUrl}sentences/${sentenceId}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${authToken}`
      }
    });
    
    if (!response.ok) {
      // 删除失败，获取错误信息
      const errorText = await response.text();
      throw new Error(`Failed to delete sentence ${sentenceId}: ${response.status} ${errorText}`);
    }
    
    // 删除成功，返回true
    return true;
  };



  /**
   * 检查字幕是否已收藏
   * @param index 字幕索引
   * @returns 是否已收藏
   */
  const isFavorited = (index: number): boolean => {
    return favoritedIndices.value.includes(index);
  };

  /**
   * 切换收藏状态
   * @param index 字幕索引
   * @param subtitle 字幕对象
   */
  const toggleFavorite = async (index: number, subtitle: any) => {
    try {
      if (isFavorited(index)) {
        // 如果已收藏，则取消收藏
        loading.value = true;
        error.value = null;
        
        // 获取句子ID
        const sentenceId = sentenceIdMapping.value[index];
        
        if (!sentenceId) {
          error.value = '无法找到句子ID';
          return;
        }
        
        // 调用后端API删除句子
        await removeSentenceFromBackend(sentenceId);
        
        // 从收藏列表中移除
        const indexInFavorites = favoritedIndices.value.indexOf(index);
        if (indexInFavorites !== -1) {
          favoritedIndices.value.splice(indexInFavorites, 1);
        }
        
        // 从ID映射中删除
        delete sentenceIdMapping.value[index];
        
      } else {
        // 如果未收藏，则添加收藏
        loading.value = true;
        error.value = null;
        
        // 检查字幕是否有文本
        if (!subtitle || !subtitle.text) {
          error.value = '无效的字幕';
          return;
        }
        
        // 确保字幕对象有视频ID和视频标题
        if (!subtitle.videoId) {
          error.value = '缺少视频ID';
          return;
        }
        
        // 保存句子到后端
        const result = await saveSentenceToBackend(subtitle.text, subtitle);
        
        // 如果保存成功，添加到收藏列表
        if (result) {
          favoritedIndices.value.push(index);
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '未知错误';
    } finally {
      loading.value = false;
    }
  };

  /**
   * 从后端加载收藏的句子
   * @param videoId 视频ID
   * @param retryCount 重试次数，默认为0
   */
  const loadFavoritesFromBackend = async (videoId: string, retryCount = 0) => {
    try {
      loading.value = true;
      error.value = null;
      
      // 重置收藏状态
      favoritedIndices.value = [];
      sentenceIdMapping.value = {};
      
      // 检查字幕数组是否为空
      if (subtitles.value.length === 0) {
        if (retryCount < 5) {
          // 重试机制
          setTimeout(() => {
            loadFavoritesFromBackend(videoId, retryCount + 1);
          }, 1000);
        }
        loading.value = false;
        return;
      }
      
      const { apiUrl: storedApiUrl, authToken } = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = storedApiUrl || 'https://www.dejavocab.com/';
      
      if (!apiUrl || !authToken) return;
      
      // 确保API URL以/结尾
      const baseApiUrl = typeof apiUrl === 'string' && apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      // 请求API获取此视频的收藏句子
      const response = await fetch(`${baseApiUrl}sentences/?video_id=${videoId}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      // 处理收藏的句子数据
      const favorites = data.results || [];
      
      // 匹配当前字幕与收藏句子
      for (const favorite of favorites) {
        // 检查是否有时间戳信息
        if (favorite.start_time !== null && favorite.end_time !== null) {
          // 查找匹配的字幕索引 - 使用时间戳定位
          const matchingSubtitleIndex = subtitles.value.findIndex(subtitle => {
            // 允许小误差的时间戳匹配（0.5秒内的误差）
            const startTimeMatch = Math.abs(subtitle.startTime - favorite.start_time) < 0.5;
            const endTimeMatch = Math.abs(subtitle.endTime - favorite.end_time) < 0.5;
            return startTimeMatch && endTimeMatch;
          });
          
          if (matchingSubtitleIndex !== -1) {
            // 找到匹配的字幕
            favoritedIndices.value.push(matchingSubtitleIndex);
            sentenceIdMapping.value[matchingSubtitleIndex] = favorite.id;
            continue; // 已找到匹配，继续下一个
          }
        }
        
        // 时间戳匹配失败，尝试文本匹配
        const matchingSubtitleByTextIndex = subtitles.value.findIndex(subtitle => {
          return subtitle.text === favorite.text;
        });
        
        if (matchingSubtitleByTextIndex !== -1) {
          // 找到匹配的字幕
          favoritedIndices.value.push(matchingSubtitleByTextIndex);
          sentenceIdMapping.value[matchingSubtitleByTextIndex] = favorite.id;
        }
      }
      
      // 加载完成
    } catch (err) {
      // 错误处理
    } finally {
      loading.value = false;
    }
  };

  return {
    favoritedIndices,
    loading,
    error,
    isFavorited,
    toggleFavorite,
    loadFavoritesFromBackend,
    saveSentenceToBackend,
    removeSentenceFromBackend,
  };
}

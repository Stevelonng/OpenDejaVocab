import { ref, computed, nextTick, Ref, onMounted, onUnmounted } from 'vue';
import { WordReferenceInVideo } from './useVideoFavoriteWords';

/**
 * 字幕数据结构定义
 */
export interface Subtitle {
  id?: number;
  startTime: number;
  endTime: number;
  text: string;
  saved?: boolean;
}

/**
 * 收藏单词在视频中的出现位置
 */
export interface FavoriteWordInVideo {
  word: string;
  subtitle: Subtitle;
  contextStart: number;
  contextEnd: number;
  isFavorite: boolean;
}

/**
 * 提供收藏单词面板功能的工具函数
 * 包括字幕筛选、突出显示单词等功能
 * 
 * @param subtitles 字幕数据
 * @param favoriteWordsInVideo 视频中的收藏单词数据
 * @param processTextToHighlightWords 处理文本以突出显示单词的函数
 * @returns 收藏单词面板相关功能
 */
export function useFavoriteWordPanel(
  subtitles: Ref<Subtitle[]>,
  favoriteWordsInVideo: Ref<FavoriteWordInVideo[]>,
  processTextToHighlightWords: (text: string) => string,
  seekToWordInVideo?: (wordReference: WordReferenceInVideo) => void
) {
  // 当前激活（过滤）的单词
  const activeWord = ref<string | null>(null);
  
  // 获取单词的所有出现位置
  const getWordOccurrences = (word: string) => {
    if (!favoriteWordsInVideo.value) return [];
    return favoriteWordsInVideo.value.filter(item => item.word === word);
  };

  // 过滤的字幕列表
  const filteredSubtitles = computed(() => {
    if (!activeWord.value) return subtitles.value;
    
    // 获取单词的出现位置信息
    const occurrences = getWordOccurrences(activeWord.value);
    if (!occurrences.length) return subtitles.value;
    
    // 使用出现位置的字幕来过滤
    return occurrences.map(occurrence => occurrence.subtitle);
  });

  /**
   * 基于单词过滤字幕
   * @param word 要过滤的单词
   */
  const filterSubtitlesByWord = (word: string) => {
    // 如果已经选中了这个单词，则清除过滤
    if (activeWord.value === word) {
      activeWord.value = null;
      return;
    }
    
    // 设置激活单词
    activeWord.value = word;
    
    // 获取单词的出现信息
    const occurrences = getWordOccurrences(word);
    if (occurrences.length === 0) return;
    
    // 在下一个渲染周期后滚动到第一个匹配项
    nextTick(() => {
      setTimeout(() => {
        const firstMatch = document.querySelector('.filter-match');
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // 原本的高亮效果已移除
      }, 150);
    });
  };

  // addVisualMarkerToFirstMatch 函数已被移除

  // clearSubtitleFilter 函数已被移除，直接在需要的地方设置 activeWord.value = null

  /**
   * 处理字幕文本，使单词可悬停和可点击
   * @param text 原始字幕文本
   * @returns 处理后的HTML字符串
   */
  const getProcessedSubtitleText = (text: string) => {
    return processTextToHighlightWords(text);
  };



  /**
   * 创建一个全局点击处理函数
   * 如果点击的不是菜单内部或单词项，则关闭菜单
   */
  const handleGlobalClick = (event: MouseEvent) => {
    if (activeWord.value !== null) {
      const target = event.target as HTMLElement;
      const isMenuClick = target.closest('.word-occurrences-menu') !== null;
      const isWordClick = target.closest('.favorite-word-item') !== null;
      const isSubtitleClick = target.closest('.subtitle-item') !== null;
      
      if (!isMenuClick && !isWordClick && !isSubtitleClick) {
        activeWord.value = null;
      }
    }
  };

  // 添加和清理全局点击事件
  onMounted(() => {
    document.addEventListener('click', handleGlobalClick);
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleGlobalClick);
  });

  return {
    activeWord,
    filteredSubtitles,
    getWordOccurrences,
    filterSubtitlesByWord,
    getProcessedSubtitleText,
    handleGlobalClick
  };
}

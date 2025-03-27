import { ref, computed, onMounted, onUnmounted, Ref } from 'vue';
import { useFavoriteWord } from './useFavoriteWord';
import { usePronunciation } from './usePronunciation';

/**
 * 处理单词查询的接口
 */
interface WordLookupResult {
  text?: string;
  word?: string;
  translation: string;
  
  phonetic: string;
  uk_phonetic?: string;
  us_phonetic?: string;
  web_translation?: string;
  has_audio?: boolean;
  error?: string;
}

/**
 * 将句子中的单词转换为可悬停和可点击的单元
 * 实现真实的查词功能
 */
export function useWordProcessing() {
  // 记录当前选中的单词
  const selectedWord = ref<string | null>(null);
  // 记录是否有单词正在悬停
  const isWordHovered = ref(false);
  // 记录查词功能是否启用
  const isWordLookupEnabled = ref(true); // 默认启用
  // 收藏单词功能
  const { isFavoriteWord, toggleFavoriteWord } = useFavoriteWord();
  // 发音功能
  const { playPronunciation, autoPlayEnabled } = usePronunciation();
  // 查询结果缓存
  const wordLookupCache = ref<Record<string, WordLookupResult>>({});
  // 当前查询的结果
  const currentLookupResult = ref<WordLookupResult | null>(null);
  // 查询状态
  const isLoading = ref(false);
  // 查询错误
  const lookupError = ref<string | null>(null);

  // 存储当前的hover定时器ID
  let hoverTimerId: ReturnType<typeof setTimeout> | null = null;
  
  // 双击检测相关变量
  let lastClickedWord = '';
  let lastClickTime = 0;
  const doubleClickDelay = 300; // 双击间隔时间（毫秒）
  
  // 记录当前处理中的单词，避免重复处理
  let isProcessingClick = false; // 添加状态锁
  
  // 延迟点击定时器ID
  let clickTimerId: ReturnType<typeof setTimeout> | null = null;

  /**
   * 从后端API查询单词释义
   * @param word 需要查询的单词
   * @returns Promise<WordLookupResult>
   */
  const lookupWord = async (word: string): Promise<WordLookupResult> => {
    const lowerWord = word.toLowerCase();
    
    // 检查缓存
    if (wordLookupCache.value[lowerWord]) {
      return wordLookupCache.value[lowerWord];
    }
    
    isLoading.value = true;
    lookupError.value = null;
    
    try {
      // 从chrome.storage获取API URL和认证信息
      const { apiUrl, authToken } = await chrome.storage.local.get(['apiUrl', 'authToken']);
      if (!apiUrl) {
        throw new Error('未配置 API URL，请在扩展设置中配置');
      }
      const finalUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      const lookupUrl = `${finalUrl}lookup-word/?word=${encodeURIComponent(lowerWord)}`;
      
      // 发送请求到后端API
      const response = await fetch(lookupUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Token ${authToken}` : ''
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 缓存结果
      wordLookupCache.value[lowerWord] = data;
      
      return data;
    } catch (error) {
      lookupError.value = error instanceof Error ? error.message : '未知错误';
      return { 
        text: word,
        translation: '', 
        phonetic: '',
        error: lookupError.value 
      };
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 格式化单词释义显示
   * @param result 单词查询结果
   * @returns 格式化后的HTML
   */
  const formatWordDefinition = (result: WordLookupResult): string => {
    if (!result) return '';
    
    if (result.error) {
      return `<div class="word-tooltip-error">${result.error}</div>`;
    }
    
    const wordText = result.text || result.word || '';
    const translation = result.translation || '';
    const phonetic = result.phonetic ? `<div class="word-phonetic">${result.phonetic}</div>` : '';
    
    // 格式化单词释义，将换行符转换为HTML标签
    const formattedTranslation = translation ? 
      translation.replace(/\n/g, '<br>').replace(/; /g, ';<br>') : '';
    
    return `
      <div class="word-tooltip-content">
        ${formattedTranslation ? `
          <div class="word-tooltip-translation">
            ${formattedTranslation}
          </div>
        ` : ''}
      </div>
    `;
  };

  /**
   * 处理文本，将单词转换为可悬停和可点击的HTML元素
   * @param text 要处理的文本
   * @returns 处理后的HTML
   */
  const processTextToHighlightWords = (text: string): string => {
    if (!text) return '';
    
    // 简单的单词拆分
    const words = text.split(/\s+/);
    
    // 处理每个单词
    const processedWords = words.map(word => {
      // 提取纯单词文本（移除标点符号，但保留连字符）
      let cleanWord = word.replace(/^[^a-zA-Z0-9-]+|[^a-zA-Z0-9-]+$/g, '');
      
      // 检查是否为有效单词（至少包含一个字母）
      if (cleanWord && /[a-zA-Z]/.test(cleanWord) && cleanWord.length >= 2) {
        // 保留原始单词的任何标点符号
        const prefix = word.substring(0, word.indexOf(cleanWord));
        const suffix = word.substring(word.indexOf(cleanWord) + cleanWord.length);
        
        // 检查是否是收藏的单词
        const isFavorite = isFavoriteWord(cleanWord);
        const favoriteClass = isFavorite ? 'favorite-word' : '';
        // 根据查词功能是否启用，决定是否添加查词相关的类
        const wordLookupClass = isWordLookupEnabled.value ? 'lookup-enabled' : '';
        
        // 对于复合词处理 - 确保使用完整的复合词进行查询
        let lookupWord = cleanWord;
        
        // 返回带有特殊标记的单词 (保持在一行以确保正确间距)
        return `${prefix}<span class="hoverable-word ${favoriteClass} ${wordLookupClass}" data-word="${lookupWord.toLowerCase()}">${cleanWord}<span class="word-tooltip"></span></span>${suffix}`;
      }
      
      // 返回未处理的单词
      return word;
    });
    
    // 重新组合文本
    return processedWords.join(' ');
  };

  /**
   * 处理单词点击事件 - 单击只播放发音，双击只收藏
   * 使用延迟执行方式防止双击时触发播放
   * @param word 点击的单词
   */
  const handleWordClick = async (word: string): Promise<void> => {
    if (!word) return;
    
    // 当前时间戳
    const now = Date.now();
    
    // 检查是否是双击操作（同一个单词且时间间隔小于阈值）
    const isDoubleClick = (word === lastClickedWord) && (now - lastClickTime < doubleClickDelay);
    
    // 找到所有当前word的元素
    const elements = document.querySelectorAll(`.hoverable-word[data-word="${word.toLowerCase()}"]`);
    
    // 记录每个元素的激活状态，确保点击后状态不变
    const elementsState = Array.from(elements).map(el => ({
      element: el,
      isActive: el.classList.contains('active')
    }));
    
    // 更新选中的单词，但不影响tooltip显示
    selectedWord.value = word;
    
    // 清除定时器（如果有）
    if (clickTimerId) {
      clearTimeout(clickTimerId);
      clickTimerId = null;
    }
    
    if (isDoubleClick) {
        // 双击操作：只收藏单词，不播放发音
        const isFavorite = await toggleFavoriteWord(word);
        
        // 更新所有匹配单词的收藏样式
        elements.forEach((el, index) => {
          // 更新收藏状态
          if (isFavorite) {
            el.classList.add('favorite-word');
          } else {
            el.classList.remove('favorite-word');
          }
          
          // 恢复原来的激活状态
          const state = elementsState[index];
          if (state && state.isActive) {
            el.classList.add('active');
          }
        });
        
        // 重置点击记录，避免连续双击处理
        lastClickedWord = '';
        lastClickTime = 0;

    } else {
      // 超过双击的时间了，记录这个单词的点击
      lastClickedWord = word;
      lastClickTime = now;
      
      // 延迟执行单击操作，等待可能的第二次点击
      clickTimerId = setTimeout(async () => { 
          // 使用await确保发音开始了
          const playResult = await playPronunciation(word);
          
          // 恢复激活状态
          elements.forEach((el, index) => {
            const state = elementsState[index];
            if (state && state.isActive) {
              el.classList.add('active');
            }
          });
      }, doubleClickDelay); // 等待双击间隔时间再播放
    }

  };

  /**
   * 处理单词悬停事件
   * @param hovering 是否正在悬停
   * @param word 悬停的单词
   * @param element 悬停的DOM元素
   */
  const handleWordHover = async (hovering: boolean, word: string, element: HTMLElement | null): Promise<void> => {
    if (!word || !isWordLookupEnabled.value) return;
    
    isWordHovered.value = hovering;
    
    // 移除所有其他单词的active类，确保同一时间只有一个tooltip可见
    const allActiveWords = document.querySelectorAll('.hoverable-word.active');
    allActiveWords.forEach(el => {
      const htmlEl = el as HTMLElement;
      // 如果不是当前悬停的元素，则移除active类
      if (element && htmlEl !== element) {
        htmlEl.classList.remove('active');
      }
    });
    
    if (hovering && element) {
      // 清除之前的定时器（如果存在）
      if (hoverTimerId !== null) {
        clearTimeout(hoverTimerId);
      }
      
      // 设置新的定时器，延迟0.3秒后显示tooltip
      hoverTimerId = setTimeout(async () => {
          // 查询单词定义
          const result = await lookupWord(word);
          currentLookupResult.value = result;
          
          // 只有在成功获取到结果后才更新工具提示内容并显示
          if (result && element) {
            // 获取全局tooltip容器
            const globalTooltip = document.getElementById('global-word-tooltip');
            if (globalTooltip) {
              // 更新全局tooltip的内容
              globalTooltip.innerHTML = formatWordDefinition(result);
              
              // 获取单词元素的位置信息
              const wordRect = element.getBoundingClientRect();
              
              // 判断单词是否在当前字幕区域（current-subtitle-text）
              const isInCurrentSubtitle = element.closest('.current-subtitle-text') !== null;
              
              // 检测是否为垂直布局模式
              const isVerticalLayout = window.innerWidth < window.innerHeight || 
                                       document.querySelector('.fullscreen-container')?.classList.contains('vertical-layout');
              
              // 移除所有tooltip方向类
              globalTooltip.classList.remove('tooltip-left', 'tooltip-bottom', 'tooltip-top');
              
              if (isInCurrentSubtitle) {
                // 如果是当前字幕区域的单词，将tooltip放在上方
                globalTooltip.style.top = `${wordRect.top - 15}px`; // 位于单词上方并留出空间
                globalTooltip.style.left = `${wordRect.left + wordRect.width / 2}px`;
                globalTooltip.style.transform = 'translate(-50%, -100%)';
                // 将指示三角形指向下方
                globalTooltip.classList.add('tooltip-bottom');
              } else if (isVerticalLayout) {
                // 垂直布局模式的特殊处理
                // 将tooltip放在单词上方
                globalTooltip.style.top = `${wordRect.top - 15}px`; // 位于单词上方并留出空间
                globalTooltip.style.left = `${wordRect.left + wordRect.width / 2}px`;
                globalTooltip.style.transform = 'translate(-50%, -100%)';
                // 将指示三角形指向下方
                globalTooltip.classList.add('tooltip-bottom');
              } else {
                // 获取字幕容器位置
                const subtitlesContainer = document.querySelector('.subtitles-container');
                
                if (subtitlesContainer) {
                  // 如果是右侧字幕容器的单词，将tooltip放在左侧
                  const containerRect = subtitlesContainer.getBoundingClientRect();
                  globalTooltip.style.top = `${wordRect.top + wordRect.height/2}px`;
                  globalTooltip.style.left = `${containerRect.left - 10}px`; // 容器左边距减10px
                  globalTooltip.style.transform = 'translate(-100%, -50%)';
                  // 将指示三角形指向右侧
                  globalTooltip.classList.add('tooltip-left');
                }
              }
              
              // 显示全局tooltip
              globalTooltip.classList.add('active');
              
              // 添加active类到单词元素，仅作为样式标记
              element.classList.add('active');
            }
          }
      }, 300);
    } else if (!hovering && element) {
      // 清除定时器，防止延迟显示
      if (hoverTimerId !== null) {
        clearTimeout(hoverTimerId);
        hoverTimerId = null;
      }
      
      // 立即移除active类以隐藏工具提示
      element.classList.remove('active');
      
      // 隐藏全局tooltip
      const globalTooltip = document.getElementById('global-word-tooltip');
      if (globalTooltip) {
        globalTooltip.classList.remove('active');
      }
    }
  };

  /**
   * 切换查词功能状态
   */
  const toggleWordLookup = (): boolean => {
    isWordLookupEnabled.value = !isWordLookupEnabled.value;
    return isWordLookupEnabled.value;
  };

  /**
   * 设置处理单词悬停对视频播放状态的影响
   * @param isPlaying 当前视频是否正在播放
   * @param videoElement 视频元素引用
   * @param togglePlay 切换播放/暂停的函数
   * @returns 用于处理悬停暂停的函数和事件处理器
   */
  const setupWordHoverVideoControl = (isPlaying: Ref<boolean>, videoElement: Ref<HTMLVideoElement | null>, togglePlay: () => void) => {
    // 视频播放状态
    const pausedByHover = ref(false);
    // 存储暂停定时器ID
    let pauseTimerId: ReturnType<typeof setTimeout> | null = null;
    
    /**
     * 处理单词悬停时视频的暂停/播放
     * @param isHovering 是否正在悬停
     */
    const handleVideoPlayback = (isHovering: boolean) => {
      // 只在查词功能开启时才执行暂停/恢复播放操作
      if (isWordLookupEnabled.value) {
        if (isHovering && isPlaying.value) {
          // 清除之前可能存在的定时器
          if (pauseTimerId !== null) {
            clearTimeout(pauseTimerId);
          }
          
          // 设置新的定时器，延迟0.3秒后暂停
          pauseTimerId = setTimeout(() => {
            // 标记为hover导致的暂停，并暂停视频
            pausedByHover.value = true;
            if (videoElement.value && isPlaying.value) {
              togglePlay();
            }
          }, 300);
        } else if (!isHovering) {
          // 鼠标移开时，清除定时器
          if (pauseTimerId !== null) {
            clearTimeout(pauseTimerId);
            pauseTimerId = null;
          }
          
          // 如果视频是因为悬停而暂停的，则恢复播放
          if (!isPlaying.value && pausedByHover.value) {
            pausedByHover.value = false;
            if (videoElement.value) {
              togglePlay();
            }
          }
        }
      }
    };

    /**
     * 处理单词点击事件
     * @param event 鼠标事件
     */
    const onWordClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const wordElement = target.closest('.hoverable-word') as HTMLElement;
      
      if (wordElement) {
        // 阻止事件冒泡，防止触发字幕的点击事件
        event.stopPropagation();
        event.preventDefault();
        
        const word = wordElement.dataset.word;
        if (word) {
          // 调用处理函数，传递单词，不影响tooltip状态
          handleWordClick(word);
        }
      }
    };

    /**
     * 设置单词悬停事件监听器
     */
    const setupWordHoverListeners = () => {
      // 跟踪当前活动的单词元素
      let activeWordElement: HTMLElement | null = null;
      
      // 使用事件委托监听悬停事件
      const mouseover = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const wordElement = target.closest('.hoverable-word') as HTMLElement;
        
        if (wordElement) {
          // 如果已经有活动元素且不是当前元素，先隐藏之前的tooltip
          if (activeWordElement && activeWordElement !== wordElement) {
            const prevWord = activeWordElement.dataset.word;
            if (prevWord) {
              handleWordHover(false, prevWord, activeWordElement);
            }
          }
          
          // 更新活动元素
          activeWordElement = wordElement;
          
          // 获取单词并传递给handleWordHover
          const word = wordElement.dataset.word;
          if (word) {
            handleWordHover(true, word, wordElement);
            // 处理视频暂停
            handleVideoPlayback(true);
          }
        }
      };
      
      const mouseout = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const wordElement = target.closest('.hoverable-word') as HTMLElement;
        
        if (wordElement) {
          // 检查鼠标是否真的离开了单词元素
          // relatedTarget是鼠标移动到的新元素
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (!wordElement.contains(relatedTarget)) {
            const word = wordElement.dataset.word;
            if (word) {
              handleWordHover(false, word, wordElement);
              // 处理视频恢复播放
              handleVideoPlayback(false);
            }
            
            if (activeWordElement === wordElement) {
              activeWordElement = null;
            }
          }
        }
      };

      // 添加事件监听器
      document.addEventListener('click', onWordClick);
      document.addEventListener('mouseover', mouseover);
      document.addEventListener('mouseout', mouseout);

      // 返回清理函数
      return () => {
        document.removeEventListener('click', onWordClick);
        document.removeEventListener('mouseover', mouseover);
        document.removeEventListener('mouseout', mouseout);
        
        // 清除悬停暂停定时器
        if (pauseTimerId !== null) {
          clearTimeout(pauseTimerId);
          pauseTimerId = null;
        }
      };
    };

    // handlePlayPauseClick 函数已移动到 useVideoControl.ts
    // 为保持向后兼容性，仍保留对该函数的引用
    const handlePlayPauseClick = (userPaused: Ref<boolean>) => {
      // 重置悬停暂停状态
      pausedByHover.value = false;
      
      // 处理播放状态
      if (isPlaying.value) {
        userPaused.value = true;
      } else {
        userPaused.value = false;
      }
      
      // 调用原有的togglePlay函数
      togglePlay();
    };

    return {
      pausedByHover,
      handleVideoPlayback,
      onWordClick,
      setupWordHoverListeners,
      handlePlayPauseClick
    };
  };

  return {
    isWordHovered,
    isWordLookupEnabled,
    selectedWord,
    currentLookupResult,
    isLoading,
    lookupError,
    processTextToHighlightWords,
    handleWordClick,
    handleWordHover,
    toggleWordLookup,
    lookupWord,
    setupWordHoverVideoControl
  };
}

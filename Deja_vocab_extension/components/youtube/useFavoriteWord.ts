import { ref, computed, onMounted, onUnmounted } from 'vue';

// 存储键名常量
const STORAGE_KEY = 'favoritedWords';
const FAVORITE_SECTION_VISIBLE_KEY = 'favoriteSectionVisible';
// 自定义事件名，用于跨标签页通信
const FAVORITE_WORD_UPDATED_EVENT = 'dejavocab-favorite-word-updated';
const FAVORITE_SECTION_TOGGLE_EVENT = 'dejavocab-favorite-section-toggle';

/**
 * 收藏单词功能
 * 处理单词的收藏和取消收藏，永远以后端服务器为数据源，本地存储仅作为离线缓存
 */
export function useFavoriteWord() {
  // 收藏的单词集合
  const favoriteWords = ref<Set<string>>(new Set());
  // 加载状态
  const isLoading = ref(false);
  // API基础URL - 在运行时动态获取
  const apiBaseUrl = ref<string>('');
  // 是否已经从后端加载
  const loadedFromBackend = ref(false);
  // 是否启用收藏UI (始终为true，保留变量以兼容现有代码)
  const favoriteUIEnabled = ref(true);
  // 是否显示收藏单词区域
  const favoriteSectionVisible = ref(true);

  /**
   * 从后端加载收藏的单词
   */
  const loadFavoriteWords = async (): Promise<void> => {
    isLoading.value = true;

    try {
      // 获取API设置和认证令牌
      const { apiUrl, authToken } = await chrome.storage.local.get(['apiUrl', 'authToken']);

      // 设置API URL
      if (!apiUrl) {
        throw new Error('未配置 API URL，请在扩展设置中配置');
      }
      apiBaseUrl.value = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;

      // 如果没有认证令牌，尝试从本地缓存加载
      if (!authToken) {
        await loadFromLocalCache();
        return;
      }

      // 从后端API获取所有收藏单词
      const response = await fetch(`${apiBaseUrl.value}favorite-words/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.words)) {
          // 清空现有集合
          favoriteWords.value.clear();

          // 添加从后端获取的单词
          data.words.forEach((wordObj: { text: string }) => {
            favoriteWords.value.add(wordObj.text.toLowerCase());
          });

          // 更新加载状态
          loadedFromBackend.value = true;

          // 将加载的单词保存到本地缓存
          await updateLocalCache();
        }
      } else {
        // 处理未认证或其他错误        
        if (response.status === 401) {
          // 标记为已尝试加载 - 避免重复请求
          loadedFromBackend.value = true;
        }
        
        // 从本地缓存加载
        await loadFromLocalCache();
      }
    } catch (error) {
      // 如果发生错误，尝试从本地缓存加载
      await loadFromLocalCache();
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 从本地缓存加载收藏单词（仅用于离线或加载失败时）
   */
  const loadFromLocalCache = async (): Promise<void> => {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      const storedWords = result[STORAGE_KEY] || [];

      // 清空现有集合并添加存储的单词
      favoriteWords.value.clear();
      storedWords.forEach((word: string) => {
        favoriteWords.value.add(word.toLowerCase());
      });
  };

  /**
   * 更新本地缓存，与当前收藏单词集合保持一致
   */
  const updateLocalCache = async (): Promise<void> => {
      const wordsArray = Array.from(favoriteWords.value);
      await chrome.storage.local.set({ [STORAGE_KEY]: wordsArray });
  };

  /**
   * 从本地存储加载UI显示设置
   */
  const loadUISettings = async (): Promise<void> => {
    try {
      const result = await chrome.storage.local.get([
        FAVORITE_SECTION_VISIBLE_KEY
      ]);
      
      // 如果设置存在，则使用它；否则默认为启用（true）
      favoriteSectionVisible.value = result[FAVORITE_SECTION_VISIBLE_KEY] !== false;  
      // 根据设置更新所有单词元素的样式
      updateAllWordElementsStyle();
    } catch (error) {
      // 出错时默认启用
      favoriteSectionVisible.value = true;
    }
  };

  /**
   * 保存UI显示设置到本地存储
   */
  const saveUISettings = async (): Promise<void> => {
      await chrome.storage.local.set({ 
        [FAVORITE_SECTION_VISIBLE_KEY]: favoriteSectionVisible.value
      });
  };

  /**
   * 切换收藏单词区域的显示状态
   */
  const toggleFavoriteSection = async (): Promise<boolean> => {
    // 切换状态
    favoriteSectionVisible.value = !favoriteSectionVisible.value;
    
    // 保存设置
    await saveUISettings();
    
    // 广播状态变更
    broadcastFavoriteSectionToggle(favoriteSectionVisible.value);
    
    return favoriteSectionVisible.value;
  };

  /**
   * 广播收藏单词区域状态变更
   * @param visible 是否可见
   */
  const broadcastFavoriteSectionToggle = (visible: boolean): void => {
      // 创建自定义事件
      const event = new CustomEvent(FAVORITE_SECTION_TOGGLE_EVENT, {
        detail: { visible }
      });
      
      // 分发事件
      document.dispatchEvent(event);    
  };

  /**
   * 处理收藏单词区域状态变更事件
   * @param event 自定义事件对象
   */
  const handleFavoriteSectionToggle = (event: CustomEvent): void => {
    const { visible } = event.detail;
    
    // 更新状态
    favoriteSectionVisible.value = visible;
  };

  /**
   * 更新页面上所有单词的样式
   */
  const updateAllWordElementsStyle = (): void => {
      // 查找页面上所有单词元素
      const wordElements = document.querySelectorAll('.hoverable-word');
      
      // 遍历并更新样式
      wordElements.forEach(element => {
        // 获取单词内容
        const word = element.textContent?.trim().toLowerCase();
        
        if (!word) return;
        
        // 无条件应用收藏样式，不再使用favoriteUIEnabled
        if (favoriteWords.value.has(word)) {
          element.classList.add('favorite-word');
          element.classList.remove('favorite-ui-hidden');
        } else {
          // 不是收藏单词，移除相关样式
          element.classList.remove('favorite-word', 'favorite-ui-hidden');
        }
      });
  };

  /**
   * 广播收藏单词状态变更
   * 通过自定义事件通知所有页面和标签页更新收藏状态
   * @param word 变更的单词
   * @param isFavorite 是否收藏
   */
  const broadcastFavoriteWordChange = (word: string, isFavorite: boolean): void => {
      // 创建自定义事件以通知其他内容脚本
      const event = new CustomEvent(FAVORITE_WORD_UPDATED_EVENT, {
        detail: { word: word.toLowerCase(), isFavorite }
      });

      // 分发事件到当前文档
      document.dispatchEvent(event);
  };

  /**
   * 处理收藏单词状态变更事件
   * @param event 自定义事件对象
   */
  const handleFavoriteWordChange = (event: CustomEvent): void => {
    const { word, isFavorite } = event.detail;

    if (!word) return;

    // 根据事件更新本地状态
    if (isFavorite) {
      favoriteWords.value.add(word.toLowerCase());

      // 更新页面上所有匹配的单词元素
      updateWordElementsStyle(word, true);
    } else {
      favoriteWords.value.delete(word.toLowerCase());

      // 更新页面上所有匹配的单词元素
      updateWordElementsStyle(word, false);
    }
  };

  /**
   * 更新页面上所有匹配单词的样式
   * @param word 单词
   * @param isFavorite 是否收藏
   */
  const updateWordElementsStyle = (word: string, isFavorite: boolean): void => {
      // 查找页面上所有匹配的单词元素
      const elements = document.querySelectorAll(`.hoverable-word[data-word="${word.toLowerCase()}"]`);

      // 更新样式
      elements.forEach(el => {
        if (isFavorite) {
          el.classList.add('favorite-word');
        } else {
          el.classList.remove('favorite-word');
        }
      });
  };

  /**
   * 向后端API同步单词收藏状态
   * @param word 要同步的单词
   * @param isFavorite 是否收藏
   */
  const syncFavoriteWordWithBackend = async (word: string, isFavorite: boolean): Promise<boolean> => {
    try {
      // 从存储中获取API URL和认证令牌
      const { apiUrl, authToken } = await chrome.storage.local.get(['apiUrl', 'authToken']);

      // 如果没有认证令牌，不能同步到后端
      if (!authToken) {
        return false;  // 没有认证令牌时，默认操作失败
      }

      // 构建API URL
      if (!apiUrl) {
        throw new Error('未配置 API URL，请在扩展设置中配置');
      }
      const finalUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      const toggleUrl = `${finalUrl}api/web/toggle-favorite/`;

      // 构建请求主体
      const formData = new FormData();
      formData.append('word', word);
      formData.append('action', isFavorite ? 'add-favorite' : 'remove-favorite');

      // 发送请求
      const response = await fetch(toggleUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${authToken}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          // 立即广播变更，确保所有页面实时更新
          broadcastFavoriteWordChange(word, data.is_favorite);

          return data.is_favorite;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  /**
   * 检查单词是否已收藏
   * @param word 要检查的单词
   * @returns 是否已收藏
   */
  const isFavoriteWord = (word: string): boolean => {
    return favoriteWords.value.has(word.toLowerCase());
  };

  /**
   * 切换单词的收藏状态
   * @param word 要切换的单词
   * @returns 切换后的收藏状态
   */
  const toggleFavoriteWord = async (word: string): Promise<boolean> => {
    const lowerWord = word.toLowerCase();
    const isCurrentlyFavorited = favoriteWords.value.has(lowerWord);

    try {
      // 立即更新UI，提供即时反馈（乐观更新）
      if (isCurrentlyFavorited) {
        favoriteWords.value.delete(lowerWord);
        updateWordElementsStyle(lowerWord, false);
      } else {
        favoriteWords.value.add(lowerWord);
        updateWordElementsStyle(lowerWord, true);
      }

      // 尝试在后端切换收藏状态
      const backendResult = await syncFavoriteWordWithBackend(word, !isCurrentlyFavorited);

      // 如果后端结果与本地预期不一致，恢复为后端状态
      if (backendResult !== !isCurrentlyFavorited) {
        if (backendResult) {
          favoriteWords.value.add(lowerWord);
          updateWordElementsStyle(lowerWord, true);
        } else {
          favoriteWords.value.delete(lowerWord);
          updateWordElementsStyle(lowerWord, false);
        }
      }

      // 更新本地缓存
      await updateLocalCache();

      return backendResult;
    } catch (error) {
      // 恢复为原始状态
      if (isCurrentlyFavorited) {
        favoriteWords.value.add(lowerWord);
        updateWordElementsStyle(lowerWord, true);
      } else {
        favoriteWords.value.delete(lowerWord);
        updateWordElementsStyle(lowerWord, false);
      }
      await updateLocalCache();
      return isCurrentlyFavorited;
    }
  };

  /**
   * 获取所有收藏的单词列表
   */
  const allFavoriteWords = computed(() => {
    return Array.from(favoriteWords.value);
  });

  /**
   * 添加单词到收藏
   * @param word 要收藏的单词
   */
  const addFavoriteWord = async (word: string): Promise<boolean> => {
    const lowerWord = word.toLowerCase();

    if (favoriteWords.value.has(lowerWord)) {
      return true; // 已经收藏了，不需要再操作
    }

    // 乐观更新UI
    favoriteWords.value.add(lowerWord);
    updateWordElementsStyle(lowerWord, true);

    // 尝试在后端添加收藏
    const backendResult = await syncFavoriteWordWithBackend(word, true);

    // 如果后端操作失败，恢复UI状态
    if (!backendResult) {
      favoriteWords.value.delete(lowerWord);
      updateWordElementsStyle(lowerWord, false);
    }

    // 更新本地缓存
    await updateLocalCache();

    return backendResult;
  };

  /**
   * 从收藏中移除单词
   * @param word 要移除的单词
   */
  const removeFavoriteWord = async (word: string): Promise<boolean> => {
    const lowerWord = word.toLowerCase();

    if (!favoriteWords.value.has(lowerWord)) {
      return true; // 已经不在收藏中，不需要再操作
    }

    // 乐观更新UI
    favoriteWords.value.delete(lowerWord);
    updateWordElementsStyle(lowerWord, false);

    // 尝试在后端移除收藏
    const backendResult = await syncFavoriteWordWithBackend(word, false);

    // 如果后端操作失败（返回true表示仍在收藏中），恢复UI状态
    if (backendResult) {
      favoriteWords.value.add(lowerWord);
      updateWordElementsStyle(lowerWord, true);
      await updateLocalCache();
      return false;
    }

    // 更新本地缓存
    await updateLocalCache();
    return true;
  };

  /**
   * 清空所有收藏的单词
   */
  const clearFavoriteWords = async (): Promise<void> => {
    // 保存当前收藏单词的副本，以便逐个从后端移除
    const wordsToRemove = Array.from(favoriteWords.value);

    // 清空本地集合
    favoriteWords.value.clear();

    // 更新本地缓存
    await updateLocalCache();

    // 逐个从后端移除
    for (const word of wordsToRemove) {
      await syncFavoriteWordWithBackend(word, false);
    }

    // 重新从后端加载，确保状态一致
    await loadFavoriteWords();
  };

  /**
   * 批量导入收藏单词
   * @param words 单词数组
   */
  const importFavoriteWords = async (words: string[]): Promise<void> => {
    let successCount = 0;

    // 逐个在后端添加单词
    for (const word of words) {
      if (word) {
        const result = await syncFavoriteWordWithBackend(word, true);
        if (result) {
          successCount++;
        }
      }
    }
    // 重新从后端加载，确保状态一致
    await loadFavoriteWords();
  };

  /**
   * 导出收藏单词为数组
   */
  const exportFavoriteWords = (): string[] => {
    return Array.from(favoriteWords.value);
  };

  // 组件挂载时自动加载收藏单词并设置事件监听
  onMounted(() => {
    // 加载UI设置
    loadUISettings();
    
    // 加载收藏单词
    loadFavoriteWords();
    
    // 监听认证令牌变化
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['authToken']) {
        // 认证令牌变化时，重新加载收藏单词
        loadFavoriteWords();
      }
      // 监听收藏单词区域设置变化
      if (area === 'local' && changes[FAVORITE_SECTION_VISIBLE_KEY]) {
        favoriteSectionVisible.value = changes[FAVORITE_SECTION_VISIBLE_KEY].newValue;
      }
    });
    
    // 添加自定义事件监听，用于跨页面实时更新
    document.addEventListener(
      FAVORITE_WORD_UPDATED_EVENT,
      ((e: CustomEvent) => handleFavoriteWordChange(e)) as EventListener
    );
    
    // 添加收藏单词区域设置变更监听
    document.addEventListener(
      FAVORITE_SECTION_TOGGLE_EVENT,
      ((e: CustomEvent) => handleFavoriteSectionToggle(e)) as EventListener
    );
  });
  
  // 组件卸载时移除事件监听
  onUnmounted(() => {
    document.removeEventListener(
      FAVORITE_WORD_UPDATED_EVENT,
      ((e: CustomEvent) => handleFavoriteWordChange(e)) as EventListener
    );
    
    document.removeEventListener(
      FAVORITE_SECTION_TOGGLE_EVENT,
      ((e: CustomEvent) => handleFavoriteSectionToggle(e)) as EventListener
    );
  });
  
  // 返回工具函数
  return {
    favoriteWords,
    isLoading,
    isFavoriteWord,
    toggleFavoriteWord,
    allFavoriteWords,
    addFavoriteWord,
    removeFavoriteWord,
    clearFavoriteWords,
    loadFavoriteWords,
    exportFavoriteWords,
    importFavoriteWords,
    favoriteUIEnabled,
    favoriteSectionVisible,
    toggleFavoriteSection
  };
}
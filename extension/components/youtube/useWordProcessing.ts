import { ref, computed, onMounted, onUnmounted, Ref } from 'vue';
import { useFavoriteWord } from './useFavoriteWord';
import { usePronunciation } from './usePronunciation';

/**
 * Word lookup result interface
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
 * Convert words in a sentence into hoverable and clickable units
 * Implement real word lookup functionality
 */
export function useWordProcessing() {
  // Record the currently selected word
  const selectedWord = ref<string | null>(null);
  // Record whether a word is currently being hovered
  const isWordHovered = ref(false);
  // Record whether word lookup feature is enabled
  const isWordLookupEnabled = ref(true); // Enabled by default
  // Favorite word functionality
  const { isFavoriteWord, toggleFavoriteWord } = useFavoriteWord();
  // Pronunciation functionality
  const { playPronunciation, autoPlayEnabled } = usePronunciation();
  // Query result cache
  const wordLookupCache = ref<Record<string, WordLookupResult>>({});
  // Current query result
  const currentLookupResult = ref<WordLookupResult | null>(null);
  // Query status
  const isLoading = ref(false);
  // Query error
  const lookupError = ref<string | null>(null);

  // Store current hover timer ID
  let hoverTimerId: ReturnType<typeof setTimeout> | null = null;
  
  // Double-click detection variables
  let lastClickedWord = '';
  let lastClickTime = 0;
  const doubleClickDelay = 300; // Double click interval time (milliseconds)
  
  // Record the word currently being processed to avoid duplicate processing
  let isProcessingClick = false; // Add state lock
  
  // Delayed click timer ID
  let clickTimerId: ReturnType<typeof setTimeout> | null = null;

  // Store a reference to the active tooltip element
  let activeTooltipElement: HTMLElement | null = null;

  /**
   * Query word definition from backend API
   * @param word Word to query
   * @returns Promise<WordLookupResult>
   */
  const lookupWord = async (word: string): Promise<WordLookupResult> => {
    const lowerWord = word.toLowerCase();
    
    // Check cache
    if (wordLookupCache.value[lowerWord]) {
      return wordLookupCache.value[lowerWord];
    }
    
    isLoading.value = true;
    lookupError.value = null;
    
    try {
      // Get API URL and authentication information from chrome.storage
      const { apiUrl, authToken } = await chrome.storage.local.get(['apiUrl', 'authToken']);
      if (!apiUrl) {
        throw new Error('API URL not configured, please configure in extension settings');
      }
      const finalUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
      const lookupUrl = `${finalUrl}lookup-word/?word=${encodeURIComponent(lowerWord)}`;
      
      // Send request to backend API
      const response = await fetch(lookupUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Token ${authToken}` : ''
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache result
      wordLookupCache.value[lowerWord] = data;
      
      return data;
    } catch (error) {
      lookupError.value = error instanceof Error ? error.message : 'Unknown error';
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
   * Format word definition display
   * @param result Word lookup result
   * @returns Formatted HTML
   */
  const formatWordDefinition = (result: WordLookupResult): string => {
    if (!result) return '';
    
    if (result.error) {
      return `<div class="word-tooltip-error">${result.error}</div>`;
    }
    
    const wordText = result.text || result.word || '';
    const translation = result.translation || '';
    const phonetic = result.phonetic ? `<div class="word-phonetic">${result.phonetic}</div>` : '';
    
    // Format word definition, convert line breaks to HTML tags
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
   * Process text, convert words into hoverable and clickable HTML elements
   * @param text Text to process
   * @returns Processed HTML
   */
  const processTextToHighlightWords = (text: string): string => {
    if (!text) return '';
    
    // Simple word splitting
    const words = text.split(/\s+/);
    
    // Process each word
    const processedWords = words.map(word => {
      // Extract pure word text (remove punctuation, but retain hyphens)
      let cleanWord = word.replace(/^[^a-zA-Z0-9-]+|[^a-zA-Z0-9-]+$/g, '');
      
      // Check if it's a valid word (contains at least one letter)
      if (cleanWord && /[a-zA-Z]/.test(cleanWord) && cleanWord.length >= 2) {
        // Preserve any punctuation from the original word
        const prefix = word.substring(0, word.indexOf(cleanWord));
        const suffix = word.substring(word.indexOf(cleanWord) + cleanWord.length);
        
        // Check if it's a favorite word
        const isFavorite = isFavoriteWord(cleanWord);
        const favoriteClass = isFavorite ? 'favorite-word' : '';
        // Determine whether to add word lookup related classes based on whether the feature is enabled
        const wordLookupClass = isWordLookupEnabled.value ? 'lookup-enabled' : '';
        
        // Handling for compound words - ensure using the complete compound word for lookup
        let lookupWord = cleanWord;
        
        // Return word with special markup (keep in one line to ensure correct spacing)
        return `${prefix}<span class="hoverable-word ${favoriteClass} ${wordLookupClass}" data-word="${lookupWord.toLowerCase()}">${cleanWord}<span class="word-tooltip"></span></span>${suffix}`;
      }
      
      // Return unprocessed word
      return word;
    });
    
    // Recombine text
    return processedWords.join(' ');
  };

  /**
   * Handle word click event - single click only plays pronunciation, double click only favorites
   * Use delayed execution to prevent playing on double click
   * @param word The clicked word
   */
  const handleWordClick = async (word: string): Promise<void> => {
    if (!word) return;
    
    // Current timestamp
    const now = Date.now();
    
    // Check if it's a double-click operation (same word and time interval less than threshold)
    const isDoubleClick = (word === lastClickedWord) && (now - lastClickTime < doubleClickDelay);
    
    // Find all elements of the current word
    const elements = document.querySelectorAll(`.hoverable-word[data-word="${word.toLowerCase()}"]`);
    
    // Record the active state of each element to ensure state doesn't change after click
    const elementsState = Array.from(elements).map(el => ({
      element: el,
      isActive: el.classList.contains('active')
    }));
    
    // Update the selected word, but don't affect tooltip display
    selectedWord.value = word;
    
    // Clear timer (if exists)
    if (clickTimerId) {
      clearTimeout(clickTimerId);
      clickTimerId = null;
    }
    
    if (isDoubleClick) {
        // Double-click operation: only favorite the word, don't play pronunciation
        const isFavorite = await toggleFavoriteWord(word);
        
        // Update favorite styles for all matching words
        elements.forEach((el, index) => {
          // Update favorite status
          if (isFavorite) {
            el.classList.add('favorite-word');
          } else {
            el.classList.remove('favorite-word');
          }
          
          // Restore original active state
          const state = elementsState[index];
          if (state && state.isActive) {
            el.classList.add('active');
          }
        });
        
        // Reset click record to avoid consecutive double-click processing
        lastClickedWord = '';
        lastClickTime = 0;

    } else {
      // Past the double-click time, record this word's click
      lastClickedWord = word;
      lastClickTime = now;
      
      // Delay executing single-click operation, waiting for possible second click
      clickTimerId = setTimeout(async () => { 
          // Use await to ensure pronunciation has started
          const playResult = await playPronunciation(word);
          
          // Restore active state
          elements.forEach((el, index) => {
            const state = elementsState[index];
            if (state && state.isActive) {
              el.classList.add('active');
            }
          });
      }, doubleClickDelay); // Wait double click interval time before playing
    }

  };

  /**
   * Handle word hover event
   * @param hovering Whether currently hovering over the word
   * @param word Word being hovered over
   * @param element HTML element being hovered over
   */
  const handleWordHover = (hovering: boolean, word: string, element: HTMLElement) => {
    // Set current word hover state for external reference
    isWordHovered.value = hovering;
    
    if (hovering && isWordLookupEnabled.value) {
      // Store hover timer ID to avoid race conditions with multiple hover events
      hoverTimerId = setTimeout(async () => {
        // Load word definition if not already loaded
        if (!wordLookupCache.value[word]) {
          // Set loading state
          isLoading.value = true;
          // Call API to get word definition
          try {
            const result = await lookupWord(word);
            // Store in cache
            wordLookupCache.value[word] = result;
            // Update current result for external reference
            currentLookupResult.value = result;
            // Clear loading state
            isLoading.value = false;
            // Clear error state
            lookupError.value = '';
          } catch (error) {
            console.error('Failed to lookup word:', error);
            isLoading.value = false;
            lookupError.value = 'Failed to lookup word';
            return;
          }
        } else {
          // Use cached result
          currentLookupResult.value = wordLookupCache.value[word];
        }
        
        // Get result from cache
        const result = wordLookupCache.value[word];
          
          // Only update tooltip content and display after successfully retrieving result
          if (result && element) {
            // First hide any existing active tooltip
            if (activeTooltipElement) {
              activeTooltipElement.classList.remove('active');
            }

            // Find fullscreen container first - it's the most reliable approach
            const fullscreenContainer = document.querySelector('.fullscreen-container.dark-mode') || 
                                       document.querySelector('.fullscreen-container');

            // Get global tooltip container
            let globalTooltip = document.getElementById('global-word-tooltip');

            // If tooltip doesn't exist or isn't in the right container, create/move it
            if (!globalTooltip || (fullscreenContainer && !fullscreenContainer.contains(globalTooltip))) {
              // If tooltip exists but is in the wrong place, remove it first
              if (globalTooltip) {
                globalTooltip.parentNode?.removeChild(globalTooltip);
              }
              
              // Create new tooltip
              globalTooltip = document.createElement('div');
              globalTooltip.id = 'global-word-tooltip';
              globalTooltip.className = 'global-word-tooltip';
              
              // Append to fullscreen container if it exists
              if (fullscreenContainer) {
                fullscreenContainer.appendChild(globalTooltip);
              } else {
                document.body.appendChild(globalTooltip);
              }
            }
            
            if (globalTooltip) {
              // Store reference to the active tooltip
              activeTooltipElement = globalTooltip;
              
              // Update global tooltip content
              globalTooltip.innerHTML = formatWordDefinition(result);
              
              // Get word element position information
              const wordRect = element.getBoundingClientRect();
              
              // Determine if the word is in the current subtitle area (current-subtitle-text)
              const isInCurrentSubtitle = element.closest('.current-subtitle-text') !== null;
              
              // Detect if in vertical layout mode
              const isVerticalLayout = window.innerWidth < window.innerHeight || 
                                       document.querySelector('.fullscreen-container')?.classList.contains('vertical-layout');
              
              // Remove all tooltip direction classes
              globalTooltip.classList.remove('tooltip-left', 'tooltip-bottom', 'tooltip-top');
              
              if (isInCurrentSubtitle) {
                // If word is in current subtitle area, place tooltip above
                globalTooltip.style.top = `${wordRect.top - 15}px`; // Position above word with space
                globalTooltip.style.left = `${wordRect.left + wordRect.width / 2}px`;
                globalTooltip.style.transform = 'translate(-50%, -100%)';
                // Point the indicator triangle downward
                globalTooltip.classList.add('tooltip-bottom');
              } else if (isVerticalLayout) {
                // Special handling for vertical layout mode
                // Place tooltip above the word
                globalTooltip.style.top = `${wordRect.top - 15}px`; // Position above word with space
                globalTooltip.style.left = `${wordRect.left + wordRect.width / 2}px`;
                globalTooltip.style.transform = 'translate(-50%, -100%)';
                // Point the indicator triangle downward
                globalTooltip.classList.add('tooltip-bottom');
              } else {
                // Get subtitle container position
                const subtitlesContainer = document.querySelector('.subtitles-container');
                
                if (subtitlesContainer) {
                  // If word is in right subtitle container, place tooltip on the left
                  const containerRect = subtitlesContainer.getBoundingClientRect();
                  globalTooltip.style.top = `${wordRect.top + wordRect.height/2}px`;
                  globalTooltip.style.left = `${containerRect.left - 10}px`; // Container left margin minus 10px
                  globalTooltip.style.transform = 'translate(-100%, -50%)';
                  // Point the indicator triangle to the right
                  globalTooltip.classList.add('tooltip-left');
                }
              }
              
              // Show global tooltip
              globalTooltip.classList.add('active');
              
              // Add active class to word element, only as style marker
              element.classList.add('active');
            }
          }
      }, 300);
    } else if (!hovering && element) {
      // Clear timer to prevent delayed display
      if (hoverTimerId !== null) {
        clearTimeout(hoverTimerId);
        hoverTimerId = null;
      }
      
      // Immediately remove active class to hide tooltip
      element.classList.remove('active');
      
      // Hide the active tooltip using our stored reference
      if (activeTooltipElement) {
        activeTooltipElement.classList.remove('active');
      }
      
      // As a fallback, also try to find and hide by ID
      const globalTooltip = document.getElementById('global-word-tooltip');
      if (globalTooltip) {
        globalTooltip.classList.remove('active');
      }
    }
  };

  /**
   * Toggle word lookup feature state
   */
  const toggleWordLookup = (): boolean => {
    isWordLookupEnabled.value = !isWordLookupEnabled.value;
    return isWordLookupEnabled.value;
  };

  /**
   * Set up how word hovering affects video playback state
   * @param isPlaying Whether the video is currently playing
   * @param videoElement Video element reference
   * @param togglePlay Function to toggle play/pause
   * @returns Functions for handling hover pause and event handlers
   */
  const setupWordHoverVideoControl = (isPlaying: Ref<boolean>, videoElement: Ref<HTMLVideoElement | null>, togglePlay: () => void) => {
    // Video playback state
    const pausedByHover = ref(false);
    // Store pause timer ID
    let pauseTimerId: ReturnType<typeof setTimeout> | null = null;
    
    /**
     * Handle video pause/play when word is hovered
     * @param isHovering Whether currently hovering
     */
    const handleVideoPlayback = (isHovering: boolean) => {
      // Only perform pause/resume operations when word lookup feature is enabled
      if (isWordLookupEnabled.value) {
        if (isHovering && isPlaying.value) {
          // Clear any previously existing timer
          if (pauseTimerId !== null) {
            clearTimeout(pauseTimerId);
          }
          
          // Set new timer, delay 0.3 seconds before pausing
          pauseTimerId = setTimeout(() => {
            // Mark as paused by hover and pause the video
            pausedByHover.value = true;
            if (videoElement.value && isPlaying.value) {
              togglePlay();
            }
          }, 300);
        } else if (!isHovering) {
          // When mouse moves away, clear timer
          if (pauseTimerId !== null) {
            clearTimeout(pauseTimerId);
            pauseTimerId = null;
          }
          
          // If video was paused due to hovering, resume playback
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
     * Handle word click event
     * @param event Mouse event
     */
    const onWordClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const wordElement = target.closest('.hoverable-word') as HTMLElement;
      
      if (wordElement) {
        // Stop event propagation to prevent triggering subtitle click event
        event.stopPropagation();
        event.preventDefault();
        
        const word = wordElement.dataset.word;
        if (word) {
          // Call handler function, pass the word, don't affect tooltip state
          handleWordClick(word);
        }
      }
    };

    /**
     * Set up word hover event listeners
     */
    const setupWordHoverListeners = () => {
      // Track current active word element
      let activeWordElement: HTMLElement | null = null;
      
      // Use event delegation to listen for hover events
      const mouseover = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const wordElement = target.closest('.hoverable-word') as HTMLElement;
        
        if (wordElement) {
          // If there's already an active element and it's not the current one, hide previous tooltip first
          if (activeWordElement && activeWordElement !== wordElement) {
            const prevWord = activeWordElement.dataset.word;
            if (prevWord) {
              handleWordHover(false, prevWord, activeWordElement);
            }
          }
          
          // Update active element
          activeWordElement = wordElement;
          
          // Get word and pass to handleWordHover
          const word = wordElement.dataset.word;
          if (word) {
            handleWordHover(true, word, wordElement);
            // Handle video pause
            handleVideoPlayback(true);
          }
        }
      };
      
      const mouseout = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const wordElement = target.closest('.hoverable-word') as HTMLElement;
        
        if (wordElement) {
          // Check if mouse has actually left the word element
          // relatedTarget is the new element mouse moved to
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (!wordElement.contains(relatedTarget)) {
            const word = wordElement.dataset.word;
            if (word) {
              handleWordHover(false, word, wordElement);
              // Handle video resume playback
              handleVideoPlayback(false);
            }
            
            if (activeWordElement === wordElement) {
              activeWordElement = null;
            }
          }
        }
      };

      // Add event listeners
      document.addEventListener('click', onWordClick);
      document.addEventListener('mouseover', mouseover);
      document.addEventListener('mouseout', mouseout);

      // Return cleanup function
      return () => {
        document.removeEventListener('click', onWordClick);
        document.removeEventListener('mouseover', mouseover);
        document.removeEventListener('mouseout', mouseout);
        
        // Clear hover pause timer
        if (pauseTimerId !== null) {
          clearTimeout(pauseTimerId);
          pauseTimerId = null;
        }
      };
    };

    // handlePlayPauseClick function has been moved to useVideoControl.ts
    // For backward compatibility, still maintain a reference to the function
    const handlePlayPauseClick = (userPaused: Ref<boolean>) => {
      // Reset hover pause state
      pausedByHover.value = false;
      
      // Handle play state
      if (isPlaying.value) {
        userPaused.value = true;
      } else {
        userPaused.value = false;
      }
      
      // Call the original togglePlay function
      togglePlay();
    };

    // Create and initialize global tooltip element
    onMounted(() => {
      // Check if global tooltip already exists
      let globalTooltip = document.getElementById('global-word-tooltip');
      
      // If not, create one
      if (!globalTooltip) {
        globalTooltip = document.createElement('div');
        globalTooltip.id = 'global-word-tooltip';
        globalTooltip.className = 'global-word-tooltip';
        document.body.appendChild(globalTooltip);
      }
    });
    
    // Return functions for external use
    return {
      pausedByHover,
      handleVideoPlayback,
      setupWordHoverListeners,
      handlePlayPauseClick
    };
  };
  
  // Return functions and state for external use
  return {
    selectedWord,
    isWordHovered,
    isWordLookupEnabled,
    currentLookupResult,
    processTextToHighlightWords,
    handleWordClick,
    handleWordHover,
    toggleWordLookup,
    setupWordHoverVideoControl,
    isLoading,
    lookupError
  };
}

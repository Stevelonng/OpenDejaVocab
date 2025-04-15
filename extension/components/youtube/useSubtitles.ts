import { ref, watch, nextTick, Ref, onMounted, computed } from 'vue';
import browser from 'webextension-polyfill';
import { VideoInfo, extractVideoInfo, getYouTubeVideoId } from './InfoVideo';
import { Subtitle, ApiSubtitle, convertApiSubtitleToInternal } from './InfoSubtitles';
import { hasLocalSubtitles, getLocalSubtitles, saveSubtitlesToStorage, removeSubtitlesFromStorage } from './StorageSubtitles';

/**
 * Subtitle control and navigation functionality
 * Includes subtitle data retrieval, formatting, navigation, and automatic scrolling
 */
export function useSubtitles(currentVideoTime: Ref<number>) {
  // Subtitle data and state
  const subtitles = ref<Subtitle[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const currentSubtitleIndex = ref(-1);
  const currentVideoInfo = ref<VideoInfo | null>(null);
  const processedVideoIds = ref<Record<string, boolean | string>>({});
  
  // Check if backend has existing subtitles
  const checkExistingSubtitles = async (videoId: string): Promise<boolean> => {
    try {
      // Get API configuration
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('Missing API URL or authentication information');
      }
      
      // Build request URL
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const videoResponse = await fetch(`${baseUrl}videos/?url=${encodeURIComponent(videoUrl)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!videoResponse.ok) return false;
      
      const videoData = await videoResponse.json();
      
      // Check if there is a matching video
      if (videoData.results && videoData.results.length > 0) {
        // Find completely matching video, using videoId for matching
        for (const video of videoData.results) {
          // Check if URL contains the same videoId
          const urlVideoId = getYouTubeVideoId(video.url);
          if (urlVideoId === videoId) {
            // Check if video has subtitles
            const subtitleResponse = await fetch(`${baseUrl}subtitles/?video_id=${video.id}`, {
              headers: {
                'Authorization': `Token ${authToken}`
              }
            });
            
            if (subtitleResponse.ok) {
              const subtitleData = await subtitleResponse.json();
              // Handle different API response formats (pagination or non-pagination)
              if (Array.isArray(subtitleData)) {
                return subtitleData.length > 0;
              } else {
                return subtitleData.results && subtitleData.results.length > 0;
              }
            }
          }
        }
      }
      
      return false;
    } catch (err) {
      return false;
    }
  };

  // Fetch subtitles from backend
  const fetchSubtitlesFromBackend = async (videoId: string): Promise<Subtitle[]> => {
    try {
      // Get API configuration
      const result = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = result.apiUrl as string;
      const authToken = result.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('Missing API URL or authentication information');
      }
      
      // Build request URL
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const videoResponse = await fetch(`${baseUrl}videos/?url=${encodeURIComponent(videoUrl)}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!videoResponse.ok) {
        throw new Error('Failed to get video information');
      }
      
      const videoData = await videoResponse.json();
      
      // Check if there is video data
      if (!videoData.results || videoData.results.length === 0) {
        throw new Error('Failed to find video data, please collect subtitles first');
      }
      
      // Find the exact matching video, using videoId for matching
      let exactVideoMatch = null;
      for (const video of videoData.results) {
        // Check if the URL contains the same videoId
        const urlVideoId = getYouTubeVideoId(video.url);
        if (urlVideoId === videoId) {
          exactVideoMatch = video;
          break;
        }
      }
      
      if (!exactVideoMatch) {
        throw new Error('Failed to find video but URL is not completely matched, please collect subtitles again');
      }
      
      // Get subtitles
      const response = await fetch(`${baseUrl}subtitles/?video_id=${exactVideoMatch.id}`, {
        headers: {
          'Authorization': `Token ${authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get subtitles');
      }
      
      const data = await response.json();
      
      // Handle API response format (pagination or non-pagination)
      let subtitlesData;
      if (Array.isArray(data)) {
        subtitlesData = data;
      } else {
        subtitlesData = data.results;
      }
      
      // Return formatted subtitles
      return subtitlesData.map((sub: ApiSubtitle) => convertApiSubtitleToInternal(sub));
    } catch (error: any) {
      throw error;
    }
  };

  const collectSubtitlesUsingBackend = async (videoInfo: VideoInfo): Promise<void> => {
    try {
      // Set status
      loading.value = true;
      error.value = null;
      
      // Get subtitles from local storage and send to backend
      const result = await sendLocalSubtitlesToBackend(videoInfo);
      if (result) {
        // If successful, return
        return;
      }
      
      // If local subtitles not found or send failed, use old method
      // Send message to background script to call API
      browser.runtime.sendMessage({
        action: 'collectSubtitles',
        videoId: videoInfo.videoId,
        videoUrl: videoInfo.url,
        videoTitle: videoInfo.title
      });
      
      // Record current video as processing
      processedVideoIds.value[videoInfo.videoId] = 'collecting';
      
      // Poll for subtitles collection completion
      let pollCount = 0;
      const maxPolls = 5; 
      const pollInterval = 1500; 
      
      const pollForSubtitles = async () => {
        if (pollCount >= maxPolls) {
          // Try last attempt
          try {
            const subs = await fetchSubtitlesFromBackend(videoInfo.videoId);
            if (subs.length > 0) {
              subtitles.value = subs;
              processedVideoIds.value[videoInfo.videoId] = true;
              return true;
            }
          } catch (e) {
            // Timeout handling
            throw new Error('Subtitle collection timeout, please try again later');
          }
        }
        
        pollCount++;
        
        // Check if subtitles exist
        const hasSubtitles = await checkExistingSubtitles(videoInfo.videoId);
        if (hasSubtitles) {
          const subs = await fetchSubtitlesFromBackend(videoInfo.videoId);
          subtitles.value = subs;
          processedVideoIds.value[videoInfo.videoId] = true;
          return true;
        } else {
          // Continue polling
          return new Promise<boolean>((resolve) => {
            setTimeout(async () => {
              const result = await pollForSubtitles();
              resolve(result);
            }, pollInterval);
          });
        }
      };
      
      // Wait for a moment before starting polling, allowing background script to process
      setTimeout(async () => {
        try {
          await pollForSubtitles();
        } catch (err: any) {
          error.value = err.message;
          // Remove "collecting" state on error, allowing retry
          if (processedVideoIds.value[videoInfo.videoId] === 'collecting') {
            delete processedVideoIds.value[videoInfo.videoId];
          }
        } finally {
          loading.value = false;
        }
      }, 1500);
    } catch (err: any) {
      error.value = err.message;
      loading.value = false;
      // Remove "collecting" state on error, allowing retry
      if (processedVideoIds.value[videoInfo.videoId] === 'collecting') {
        delete processedVideoIds.value[videoInfo.videoId];
      }
    }
  };

  // Main subtitle fetching function
  const fetchSubtitles = async (forceRefresh: boolean = false, shouldCollect: boolean = false) => {
    // Reset state
    loading.value = true;
    error.value = null;
    
    try {
      // Extract current video information
      const videoInfo = extractVideoInfo();
      if (!videoInfo) {
        throw new Error('Failed to get video information, please ensure you are on a YouTube video page');
      }
      
      // Check if it's a new video, if so, clear existing subtitles
      if (!currentVideoInfo.value || currentVideoInfo.value.videoId !== videoInfo.videoId) {
        subtitles.value = []; // Immediately clear subtitles
        currentSubtitleIndex.value = -1; // Reset current subtitle index
        
        // Also clear current subtitles from browser storage
        try {
          // First check if storage API is available
          if (browser?.storage?.local) {
            await removeSubtitlesFromStorage();
          }
        } catch (error) {
        }
      }
      
      // Update current video information
      currentVideoInfo.value = videoInfo;
      
      // If forced refresh, reset processing state
      if (forceRefresh && processedVideoIds.value[videoInfo.videoId]) {
        delete processedVideoIds.value[videoInfo.videoId];
      }
      
      // Check if the video has already been processed
      if (processedVideoIds.value[videoInfo.videoId] === true) {
        if (subtitles.value.length > 0) {
          // Already have subtitles, return
          loading.value = false;
          return;
        } else {
          // Mark as processed but no subtitles, try to re-fetch
          delete processedVideoIds.value[videoInfo.videoId];
        }
      }
      
      // Processing in progress, avoid duplicate requests
      if (processedVideoIds.value[videoInfo.videoId] === 'collecting') {
        loading.value = false;
        return;
      }
      
      // Mark as processing
      processedVideoIds.value[videoInfo.videoId] = 'collecting';
      
      // Check for existing subtitles
      const hasExistingSubtitles = await checkExistingSubtitles(videoInfo.videoId);
      
      if (hasExistingSubtitles) {
        // Backend already has subtitles, fetch them
        const subs = await fetchSubtitlesFromBackend(videoInfo.videoId);
        subtitles.value = subs;
        processedVideoIds.value[videoInfo.videoId] = true;
        loading.value = false;
      } else if (shouldCollect) {
        // Check if we have local subtitles first
        if (await hasLocalSubtitles(videoInfo.videoId)) {
          // We have local subtitles, try to send them to backend
          const localSubtitleData = await getLocalSubtitles();
          if (localSubtitleData && localSubtitleData.videoInfo.videoId === videoInfo.videoId) {
            // Use local subtitles
            subtitles.value = localSubtitleData.subtitles;
            const localSubtitleResult = await sendLocalSubtitlesToBackend(videoInfo);
            if (localSubtitleResult) {
              processedVideoIds.value[videoInfo.videoId] = true;
              loading.value = false;
              return;
            }
          }
        }
        
        // Only try to collect and send subtitles when shouldCollect is true
        const localSubtitleResult = await sendLocalSubtitlesToBackend(videoInfo);
        
        // If local subtitles are not available or sending fails, try to collect new subtitles
        if (!localSubtitleResult) {
          // When local subtitles are unavailable, try to collect new subtitles from the video
          await collectSubtitlesUsingBackend(videoInfo);
        }
      } else {
        // When shouldCollect is false, do not attempt to send subtitles, only show prompt
        error.value = 'This video has no subtitles, please click the fullscreen button to collect subtitles';
        loading.value = false;
        // Remove 'collecting' state, so future retries are possible
        delete processedVideoIds.value[videoInfo.videoId];
      }
    } catch (err: any) {
      error.value = err.message;
      loading.value = false;
    }
  };
  
  // Initialize on component mount - Remove auto collection logic
  onMounted(() => {
    // No longer automatically call fetchSubtitles()
    // Instead, collect subtitles only when user clicks fullscreen button
  });

  // Format time (seconds -> MM:SS)
  const formatTime = (timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
  };

  // Update current subtitle
  const updateCurrentSubtitle = (currentTime: number) => {
    // Limit update frequency to avoid too frequent calculations
    for (let i = 0; i < subtitles.value.length; i++) {
      const sub = subtitles.value[i];
      if (currentTime >= sub.startTime && currentTime < sub.endTime) {
        if (currentSubtitleIndex.value !== i) {
          currentSubtitleIndex.value = i;
          // When subtitle updates, send subtitle info to side panel
          sendSubtitleToSidePanel(sub);
        }
        return;
      }
    }
    // If no matching subtitle
    if (currentSubtitleIndex.value !== -1) {
      currentSubtitleIndex.value = -1;
      // Notify side panel that there is no subtitle
      sendSubtitleToSidePanel(null);
    }
  };
  
  // Send subtitle information to side panel
  const sendSubtitleToSidePanel = (subtitle: Subtitle | null) => {
      // Use browser API if available
      if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
        browser.runtime.sendMessage({
          action: 'updateCurrentSubtitle',
          subtitle: subtitle,
          videoInfo: currentVideoInfo.value
        });
      }
      // Otherwise try using chrome API
      else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'updateCurrentSubtitle',
          subtitle: subtitle,
          videoInfo: currentVideoInfo.value
        });
      }
  };

  // Get subtitles from local storage and send to backend
  const sendLocalSubtitlesToBackend = async (videoInfo: VideoInfo): Promise<boolean> => {
    try {      
      const allStorage = await browser.storage.local.get(null);
      
      // First check if the video has been marked as having no subtitles
      const noSubsData = await browser.storage.local.get(['noSubtitleVideos']) as { noSubtitleVideos?: string[] };
      if (noSubsData.noSubtitleVideos && 
          Array.isArray(noSubsData.noSubtitleVideos) && 
          videoInfo.videoId && 
          noSubsData.noSubtitleVideos.includes(videoInfo.videoId)) {
        error.value = 'The video has no available subtitles';
        loading.value = false;
        return false;
      }

      // Get subtitles from local storage
      const data = await getLocalSubtitles();
      
      // Validate subtitle data
      if (
        !data || 
        !Array.isArray(data.subtitles) || 
        data.subtitles.length === 0 ||
        !data.videoInfo ||
        data.videoInfo.videoId !== videoInfo.videoId
      ) {
        return false;
      }
      
      const apiData = await browser.storage.local.get(['apiUrl', 'authToken']) as { apiUrl?: string, authToken?: string };
      const apiUrl = apiData.apiUrl || 'http://localhost:8000';
      const authToken = apiData.authToken;
      
      if (!authToken) {
        error.value = 'API authorization failed, please re-login';
        loading.value = false;
        return false;
      }
      
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const normalizedUrl = baseUrl.includes('/api') ? baseUrl : `${baseUrl}/api`;
      
      const formattedSubtitles = data.subtitles.map(sub => ({
        text: sub.text,
        start_time: sub.startTime,
        end_time: sub.endTime
      }));
      
      const requestData = {
        video_id: data.videoInfo.videoId,
        video_title: data.videoInfo.title, // Add video title
        subtitles: formattedSubtitles
      };
      
      const maxRetries = 3;
      let retryCount = 0;
      let lastError = null;
      
      while (retryCount < maxRetries) {
        try {
          const response = await fetch(`${normalizedUrl}/save-subtitles/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Token ${authToken}`
            },
            body: JSON.stringify(requestData)
          });
          
          if (!response.ok) {
            let errorText = '';
            try {
              const errorResponse = await response.text();
              try {
                const errorData = JSON.parse(errorResponse);
                errorText = JSON.stringify(errorData);
              } catch (parseError) {
                errorText = errorResponse;
              }
            } catch (e) {
              errorText = `HTTP error: ${response.status} ${response.statusText}`;
            }
            
            if ((response.status === 500 || response.status === 404) && retryCount < maxRetries - 1) {
              retryCount++;
              lastError = `${response.status} ${errorText.substring(0, 100)}`;
              const delay = 1000 * Math.pow(2, retryCount);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            
            error.value = `Failed to save subtitles: ${response.status} ${errorText.substring(0, 100)}`;
            loading.value = false;
            return false;
          }
          
          const responseData = await response.json();
          
          const subs = await fetchSubtitlesFromBackend(data.videoInfo.videoId);
          subtitles.value = subs;
          processedVideoIds.value[data.videoInfo.videoId] = true;
          loading.value = false;
          return true;
        } catch (err: any) {
          if (retryCount < maxRetries - 1) {
            retryCount++;
            lastError = err.message || 'Unknown error';
            const delay = 1000 * Math.pow(2, retryCount);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          
          error.value = lastError || err.message || 'Failed to send subtitles';
          loading.value = false;
          return false;
        }
      }
      
      error.value = lastError || 'Multiple retries failed';
      loading.value = false;
      return false;
    } catch (err: any) {
      error.value = err.message || 'Failed to send subtitles';
      loading.value = false;
      return false;
    }
  };

  // Save subtitles to local storage for chat functionality
  const saveSubtitlesToLocalStorage = (): Promise<void> => {
    if (!subtitles.value || subtitles.value.length === 0 || !currentVideoInfo.value) {
      return Promise.resolve();
    }
    
    const simplifiedSubtitles = subtitles.value.map(sub => ({
      text: sub.text,
      startTime: sub.startTime,
      endTime: sub.endTime
    }));
    
    return saveSubtitlesToStorage({
      videoInfo: currentVideoInfo.value,
      subtitles: simplifiedSubtitles
    });
  };

  // When subtitles are retrieved, also save to local storage
  watch(subtitles, (newSubtitles) => {
    if (newSubtitles && newSubtitles.length > 0) {
      saveSubtitlesToLocalStorage();
    }
  });

  // Mark current subtitle saved to user dictionary
  const markCurrentSubtitle = async (): Promise<boolean> => {
    if (!currentVideoInfo.value || currentSubtitleIndex.value < 0 || !subtitles.value[currentSubtitleIndex.value]) {
      return false;
    }

    try {
      const apiData = await browser.storage.local.get(['apiUrl', 'authToken']);
      const apiUrl = apiData.apiUrl as string;
      const authToken = apiData.authToken as string;
      const baseUrl = apiUrl?.endsWith('/') ? apiUrl : `${apiUrl}/`;
      
      if (!baseUrl || !authToken) {
        throw new Error('Missing API URL or authentication information');
      }
      
      const currentSub = subtitles.value[currentSubtitleIndex.value];
      const response = await fetch(`${baseUrl}videos/${currentVideoInfo.value.videoId}/mark-subtitle/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${authToken}`
        },
        body: JSON.stringify({
          subtitle_text: currentSub.text,
          start_time: currentSub.startTime,
          end_time: currentSub.endTime
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark subtitle');
      }
      
      subtitles.value[currentSubtitleIndex.value] = {
        ...currentSub,
        saved: true
      };
      
      return true;
    } catch (err) {
      return false;
    }
  };

  /**
   * Listen to video time changes and update current subtitle
   */
  watch(currentVideoTime, (newTime) => {
    updateCurrentSubtitle(newTime);
  });

  /**
   * Current subtitle computed property
   * Gets the subtitle object based on the current index
   */
  const currentSubtitle = computed(() => {
    if (subtitles.value && currentSubtitleIndex.value >= 0 && currentSubtitleIndex.value < subtitles.value.length) {
      return subtitles.value[currentSubtitleIndex.value];
    }
    return null;
  });

  /**
   * Process current subtitle text
   * This function requires an external function to format the text
   */
  const getProcessedCurrentSubtitle = (processTextFunction: (text: string) => string) => {
    return computed(() => {
      if (currentSubtitleIndex.value >= 0 && subtitles.value[currentSubtitleIndex.value]) {
        return processTextFunction(subtitles.value[currentSubtitleIndex.value].text);
      }
      return ''; // Return empty string, do not display "No subtitle"
    });
  };

  /**
   * Control the display and hiding of subtitles
   */
  const subtitlesEnabled = ref(true);

  /**
   * Toggle the display of subtitles
   */
  const toggleSubtitles = () => {
    subtitlesEnabled.value = !subtitlesEnabled.value;
  };

  return {
    subtitles,
    loading,
    error,
    currentSubtitleIndex,
    currentVideoInfo,
    formatTime,
    updateCurrentSubtitle,
    fetchSubtitles,
    markCurrentSubtitle,
    currentSubtitle,
    getProcessedCurrentSubtitle,
    subtitlesEnabled,
    toggleSubtitles,
    saveSubtitlesToLocalStorage  // Expose the method to save subtitles
  };
}

/**
 * Subtitle navigation functionality
 * Handles subtitle navigation and automatic scrolling
 */
export function useSubtitleNavigation(
  videoElement: Ref<HTMLVideoElement | null>,
  subtitles: Ref<{startTime: number, endTime: number, text: string}[]>,
  currentSubtitleIndex: Ref<number>,
  isPlaying?: Ref<boolean>,
  togglePlay?: () => void
) {
  const subtitlesList = ref<HTMLElement | null>(null);

  /**
   * Jump to previous subtitle
   */
  const prevSubtitle = () => {
    if (subtitles.value.length === 0 || currentSubtitleIndex.value <= 0) return;
    
    const prevIndex = Math.max(0, currentSubtitleIndex.value - 1);
    const prevTime = subtitles.value[prevIndex].startTime;
    seekToSubtitle(prevTime);
  };

  // Jump to next subtitle
  const nextSubtitle = () => {
    if (subtitles.value.length === 0 || currentSubtitleIndex.value >= subtitles.value.length - 1) return;
    
    const nextIndex = Math.min(subtitles.value.length - 1, currentSubtitleIndex.value + 1);
    const nextTime = subtitles.value[nextIndex].startTime;
    seekToSubtitle(nextTime);
  };

  // Jump to a specific time point and play
  const seekToSubtitle = (time: number) => {
    if (!videoElement.value) return;
    // Set time position
    videoElement.value.currentTime = time;
    
    // Force play video, even if it's paused
    if (isPlaying && togglePlay) {
      // If provided play state and toggle function, use them to ensure UI state sync
      if (!isPlaying.value) {
        togglePlay(); // Toggle play state
      }
    } else {
      // If no play control provided, directly call play
      videoElement.value.play();
    }
  };


  // Listen to changes in current subtitle index to implement automatic subtitle scrolling
  let disableAutoScroll = false;
  
  // Add method to check screen size and set whether it's a small screen
  const checkScreenSize = () => {
    disableAutoScroll = window.innerWidth <= 991.98;
  };
  
  // Initialize check and add listener
  checkScreenSize();
  
  // Add window size change listener
  window.addEventListener('resize', checkScreenSize);
  
  // Handle component unmount
  onMounted(() => {
    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  });
  
  watch(currentSubtitleIndex, async (newIndex) => {
    if (!subtitlesList.value || newIndex < 0) return;
    
    // Wait for DOM update
    await nextTick();
    
    // Get current subtitle element
    const currentElement = subtitlesList.value.children[newIndex] as HTMLElement;
    if (!currentElement) return;
    
    // Scroll to current subtitle
    // Only scroll in wide screen mode, do not scroll in narrow screen mode
    if (!disableAutoScroll) {
      currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
  });

  return {
    subtitlesList,
    prevSubtitle,
    nextSubtitle,
    seekToSubtitle
  };
}

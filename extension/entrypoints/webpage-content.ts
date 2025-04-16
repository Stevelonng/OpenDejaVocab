/**
 * Webpage Content Script
 * Responsible for extracting current webpage content and sending it to the background script
 */
import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[WebpageContent] Content script loaded');
    
    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[WebpageContent] Received message:', message);
      
      if (message.action === 'extractWebpageContent') {
        console.log('[WebpageContent] Extracting webpage content...');
        
        try {
          // Extract webpage content
          const pageContent = extractPageContent();
          console.log('[WebpageContent] Content extracted successfully');
          
          // Send response back
          sendResponse({ 
            success: true, 
            data: pageContent 
          });
        } catch (error) {
          console.error('[WebpageContent] Error extracting content:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error extracting content' 
          });
        }
        
        return true; // Indicates async response
      }
    });
    
    console.log('[WebpageContent] Message listener registered');
  }
});

/**
 * Extract page content
 * Get title, URL, main text content, etc.
 */
function extractPageContent() {
  // Get page title and URL
  const title = document.title;
  const url = window.location.href;
  
  // Special handling for Google search pages
  if (url.includes('google.com/search')) {
    return extractGoogleSearchContent();
  }
  
  // Get main content area text
  let mainContentText = '';
  
  // Try to find the main content area using more precise selectors
  const contentSelectors = [
    // Content selectors - ordered from most to least specific
    'article[class*="content"]', 
    'article', 
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.main-content',
    '.content',
    '#content',
    '.post', 
    '[role="main"]',
    // Fallbacks
    '.body', 
    '#main'
  ];
  
  let mainElement = null;
  
  // Try all possible selectors
  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      // Find the largest content block by text length
      let maxLength = 0;
      for (const element of elements) {
        const text = element.textContent || '';
        if (text.length > maxLength) {
          maxLength = text.length;
          mainElement = element;
        }
      }
      if (mainElement) break;
    }
  }
  
  // If main content area is found, extract text
  if (mainElement) {
    // Extract visible text, avoiding hidden elements and code blocks
    mainContentText = extractVisibleText(mainElement);
  } else {
    // Fallback: try to extract content from paragraphs
    const paragraphs = document.querySelectorAll('p');
    if (paragraphs.length > 0) {
      mainContentText = Array.from(paragraphs)
        .map(p => p.textContent || '')
        .filter(text => text.trim().length > 40) // Only paragraphs with substantial content
        .join('\n\n');
    } else {
      // Last resort: use body but try to clean it up
      mainContentText = extractVisibleText(document.body);
    }
  }
  
  // Clean and format text
  mainContentText = cleanText(mainContentText);
  
  // Get page metadata
  const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const keywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content') || '';
  
  // Get headings to understand document structure
  const headings = extractHeadings();
  
  // Get all image URLs
  const images = Array.from(document.querySelectorAll('img'))
    .filter(img => {
      // Filter out tiny images (likely icons) and images without source
      const src = img.src;
      const width = img.width;
      const height = img.height;
      return src && src.trim() !== '' && width > 100 && height > 100;
    })
    .map(img => ({
      src: img.src,
      alt: img.alt || ''
    }))
    .slice(0, 10); // Limit to first 10 images
  
  // Get all links
  const links = Array.from(document.querySelectorAll('a'))
    .filter(a => {
      // Filter out navigation links and links without text
      const href = a.href;
      const text = a.textContent;
      const position = a.getBoundingClientRect();
      return href && href.trim() !== '' && 
             text && text.trim().length > 0 &&
             position.width > 0 && position.height > 0; // Ensure the link is visible
    })
    .map(a => ({
      href: a.href,
      text: a.textContent?.trim() || ''
    }))
    .slice(0, 20); // Limit to first 20 links
  
  // Return extracted content
  return {
    title,
    url,
    metaDescription,
    keywords,
    headings,
    mainContent: mainContentText,
    images,
    links,
    timestamp: new Date().toISOString()
  };
}

/**
 * Extract visible text from an element, avoiding hidden elements and script/style content
 */
function extractVisibleText(element: Element): string {
  // Skip invisible elements
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return '';
  }
  
  // Skip script, style, code elements, and common UI elements
  if (element.tagName === 'SCRIPT' || 
      element.tagName === 'STYLE' || 
      element.tagName === 'CODE' ||
      element.tagName === 'NAV' ||
      element.tagName === 'FOOTER' ||
      element.tagName === 'HEADER' ||
      element.tagName === 'NOSCRIPT') {
    return '';
  }
  
  // Skip elements with specific classes often used for UI, not content
  const className = element.className || '';
  if (typeof className === 'string' && (
      className.includes('nav') || 
      className.includes('menu') || 
      className.includes('footer') || 
      className.includes('header') ||
      className.includes('comment') ||
      className.includes('sidebar') ||
      className.includes('widget'))) {
    return '';
  }
  
  // If this is a text node, return its content
  if (element.nodeType === 3) {
    return element.textContent || '';
  }
  
  // If this element doesn't have children, return its text
  if (!element.children || element.children.length === 0) {
    return element.textContent || '';
  }
  
  // Otherwise, recursively get text from all children
  let result = '';
  for (let i = 0; i < element.childNodes.length; i++) {
    if (element.childNodes[i].nodeType === 3) {
      // Text node
      result += element.childNodes[i].textContent;
    } else if (element.childNodes[i].nodeType === 1) {
      // Element node
      result += extractVisibleText(element.childNodes[i] as Element);
    }
  }
  
  return result;
}

/**
 * Extract document headings to understand content structure
 */
function extractHeadings(): {level: number, text: string}[] {
  const headings = [];
  for (let i = 1; i <= 6; i++) {
    const elements = document.querySelectorAll(`h${i}`);
    for (const el of elements) {
      if (el.textContent && el.textContent.trim().length > 0) {
        headings.push({
          level: i,
          text: el.textContent.trim()
        });
      }
    }
  }
  return headings;
}

/**
 * Special handler for Google search pages
 */
function extractGoogleSearchContent() {
  const title = document.title;
  const url = window.location.href;
  
  // Get search results
  const searchResults = [];
  
  // Main search results
  const resultElements = document.querySelectorAll('.g');
  for (const el of resultElements) {
    const titleEl = el.querySelector('h3');
    const linkEl = el.querySelector('a') as HTMLAnchorElement;
    const snippetEl = el.querySelector('.VwiC3b');
    
    if (titleEl && linkEl && linkEl.href) {
      searchResults.push({
        title: titleEl.textContent || '',
        url: linkEl.href,
        snippet: snippetEl ? snippetEl.textContent || '' : ''
      });
    }
  }
  
  // If we can't find structured results, try a more general approach
  if (searchResults.length === 0) {
    // Try to get anything that looks like a search result
    const allLinks = document.querySelectorAll('a[href^="http"]');
    for (const link of allLinks) {
      const rect = link.getBoundingClientRect();
      // Only visible links with some size
      if (rect.width > 0 && rect.height > 0) {
        // Find nearby text
        const parent = link.closest('div');
        if (parent) {
          const text = parent.textContent || '';
          if (text.length > 60) { // Only substantial content
            searchResults.push({
              title: link.textContent || '',
              url: (link as HTMLAnchorElement).href,
              snippet: text
            });
          }
        }
      }
    }
  }
  
  // Organize content
  let mainContent = '搜索结果：\n\n';
  searchResults.forEach((result, index) => {
    mainContent += `${index + 1}. ${result.title}\n   链接：${result.url}\n   摘要：${result.snippet}\n\n`;
  });
  
  return {
    title,
    url,
    metaDescription: `Google 搜索结果 - ${title}`,
    keywords: title.replace(' - Google Search', ''),
    headings: [{level: 1, text: title}],
    mainContent,
    images: [],
    links: searchResults.map(r => ({ href: r.url, text: r.title })),
    timestamp: new Date().toISOString()
  };
}

/**
 * Clean text, remove excess whitespace characters
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')  // Replace multiple whitespace characters with a single space
    .replace(/\n+/g, '\n') // Replace multiple newlines with a single newline
    .trim();               // Remove whitespace at the beginning and end
}

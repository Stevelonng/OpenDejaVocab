import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    // Add Chrome extension permissions
    permissions: [
      'sidePanel',
      'storage',      // Storage API for tokens and settings
      'activeTab',    // Access current tab information
      'tabs',         // Add tabs permission to support tab access
      'scripting'     // Add scripting permission to support script execution in web pages
    ],
    // Add external resource access permissions
    host_permissions: [
      "https://dejavocab.com/*",    // Local development environment API
      "*://*.youtube.com/*",        // YouTube permission
      "*://*.bilibili.com/*"        // Bilibili permission
    ],
    // Content security policy
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'"
    },
    // Add Action icon configuration
    action: {
      default_title: "Dejavocab Extension"
    },
    // Add side panel configuration
    side_panel: {
      default_path: "side-panel.html"
    },
    // Add content script configuration, automatically run auto subtitle collection function on YouTube pages
    content_scripts: [
      {
        matches: ["*://*.youtube.com/*"],
        js: ["auto-subtitles-entry.js"],
        run_at: "document_idle"
      },
      {
        matches: ["*://*.bilibili.com/video/*"],
        js: ["bilibili-content.js"],
        run_at: "document_idle"
      },
      {
        matches: ["<all_urls>"],
        js: ["webpage-content.js"],
        run_at: "document_idle"
      }
    ]
  }
});

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    // 添加Chrome扩展权限
    permissions: [
      'sidePanel',
      'storage',      // 存储API令牌和设置
      'activeTab',    // 访问当前标签页信息
      'tabs',         // 添加tabs权限以支持标签页访问
      'scripting'     // 添加scripting权限以支持在网页中执行脚本
    ],
    // 添加外部资源访问权限
    host_permissions: [
      "https://dejavocab.com/*",  // 生产环境API
      "http://localhost:8000/*",    // 本地开发环境API
      "*://*.youtube.com/*"         // 添加YouTube权限
    ],
    // 内容安全策略
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'"
    },
    // 添加Action图标配置
    action: {
      default_title: "Dejavocab 扩展"
    },
    // 添加侧边栏配置
    side_panel: {
      default_path: "side-panel.html"
    },
    // 添加内容脚本配置，在YouTube页面上自动运行自动字幕收集功能
    content_scripts: [
      {
        matches: ["*://*.youtube.com/*"],
        js: ["auto-subtitles-entry.js"],
        run_at: "document_idle"
      }
    ]
  }
});

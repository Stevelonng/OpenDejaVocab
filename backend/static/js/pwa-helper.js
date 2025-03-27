// PWA Helper for iOS
(function() {
    // 检测是否在iOS设备上以Web App模式运行
    const isInWebAppMode = (window.navigator.standalone === true);
    const isInIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // 添加类名以便CSS可以相应调整
    if (isInWebAppMode) {
        document.documentElement.classList.add('ios-webapp-mode');
    }
    
    if (isInIOSDevice) {
        document.documentElement.classList.add('ios-device');
    }
    
    // 处理所有内部链接，防止在Web App模式下打开Safari
    if (isInWebAppMode) {
        // 当DOM加载完成后执行
        document.addEventListener('DOMContentLoaded', function() {
            // 监听所有链接点击
            document.addEventListener('click', function(event) {
                let target = event.target;
                
                // 查找被点击的链接元素
                while (target && target.tagName !== 'A') {
                    target = target.parentNode;
                    if (!target) return;
                }
                
                // 如果是内部链接，防止默认行为并手动切换页面
                if (target.tagName === 'A') {
                    const href = target.getAttribute('href');
                    // 检查是否为外部链接或特殊链接
                    if (!href) return;
                    
                    const isExternalLink = (
                        href.indexOf('://') > -1 || 
                        href.indexOf('//') === 0 ||
                        href.indexOf('tel:') === 0 ||
                        href.indexOf('mailto:') === 0
                    );
                    
                    if (href && href !== '#' && !isExternalLink) {
                        event.preventDefault();
                        window.location = href;
                    }
                }
            });
        });
    }
    
    // 添加iOS安全区域的CSS变量和布局调整
    function setIOSSafeAreaVars() {
        // 获取安全区域并设置CSS变量
        if (window.CSS && CSS.supports('padding-bottom: env(safe-area-inset-bottom)')) {
            document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top)');
            document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right)');
            document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom)');
            document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left)');
        }
        
        // 添加页面加载后的布局调整
        if (isInWebAppMode || isInIOSDevice) {
            // 延迟执行确保DOM已完全加载
            setTimeout(function() {
                // 获取页面主要元素
                const mobileHeader = document.querySelector('.mobile-header');
                const contentWrapper = document.querySelector('.content-wrapper');
                const footer = document.querySelector('.footer');
                
                // 调整移动端头部，确保不会与状态栏重叠
                if (mobileHeader) {
                    // 添加一个新的类以便CSS可以更精确地应用样式
                    mobileHeader.classList.add('pwa-adjusted');
                }
                
                // 确保内容区不会被头部遮挡
                if (contentWrapper) {
                    contentWrapper.classList.add('pwa-adjusted');
                }
                
                // 优化底部布局
                if (footer) {
                    footer.classList.add('pwa-adjusted');
                    
                    // 确保底部的feedback按钮位置正确
                    const feedbackButton = document.querySelector('.feedback-button');
                    if (feedbackButton) {
                        feedbackButton.classList.add('pwa-adjusted');
                    }
                }
            }, 100);
        }
    }
    
    // 在页面加载和窗口大小改变时设置安全区域CSS变量
    document.addEventListener('DOMContentLoaded', setIOSSafeAreaVars);
    window.addEventListener('resize', setIOSSafeAreaVars);
    window.addEventListener('orientationchange', setIOSSafeAreaVars);
    
    // 初始设置
    setIOSSafeAreaVars();
})();

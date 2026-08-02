// app.js
App({
  globalData: {},
  onLaunch() {
    // 初始化本地存储
    const db = require('./utils/db');
    db.init();

    // F5: 首次使用引导
    const onboardingCompleted = wx.getStorageSync('ls_onboarding_completed');
    if (!onboardingCompleted) {
      wx.redirectTo({
        url: '/pages/onboarding/index'
      });
    }

    // 初始化云开发（可选，失败时 AI 功能降级为本地引擎）
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: 'life-system', // 替换为实际云环境ID
          traceUser: true
        });
        console.log('[app] 云开发初始化成功');
      } catch (e) {
        console.warn('[app] 云开发初始化失败，AI 功能将使用本地引擎:', e.message);
      }
    } else {
      console.warn('[app] 当前环境不支持云开发，AI 功能将使用本地引擎');
    }
  }
});

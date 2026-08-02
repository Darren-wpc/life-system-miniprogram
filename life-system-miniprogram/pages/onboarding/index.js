// pages/onboarding/index.js - F5 首次使用引导

const { DIMENSIONS, DIM_KEYS } = require('../../utils/constants');

Page({
  data: {
    currentStep: 0,
    statusBarHeight: 20,
    steps: [0, 1, 2, 3],
    // Step 2: 从 constants.js 导入的六维数据
    dimensions: DIM_KEYS.map(key => DIMENSIONS[key]),
    // Step 3: 三层节奏
    cadence: [
      { icon: '📝', title: '日级反馈', desc: '每天记录情绪与状态，形成连续的自我观察' },
      { icon: '📊', title: '周级自评', desc: '每周评估六维健康度，生成雷达图与趋势' },
      { icon: '🔍', title: '季级复盘', desc: '每季度深度复盘，识别模式与转折信号' }
    ]
  },

  onLoad() {
    // onboarding 作为入口页时的防御性检查：
    // 已完成引导的用户直接进入首页，避免重复看到引导
    const completed = wx.getStorageSync('ls_onboarding_completed');
    if (completed) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }

    // 获取状态栏高度（自定义导航栏占位）
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 });
    } catch (e) {
      this.setData({ statusBarHeight: 20 });
    }
  },

  onSwiperChange(e) {
    this.setData({ currentStep: e.detail.current });
  },

  onNext() {
    const next = this.data.currentStep + 1;
    if (next < 4) {
      this.setData({ currentStep: next });
    }
  },

  onComplete() {
    wx.setStorageSync('ls_onboarding_completed', true);
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  onSkip() {
    wx.setStorageSync('ls_onboarding_completed', true);
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});

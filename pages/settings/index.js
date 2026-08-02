// pages/settings/index.js - 设置

const db = require('../../utils/db');
const ai = require('../../utils/ai');

const APP_VERSION = 'v2.2.0';
const DEFAULT_REMINDER = '21:00';

Page({
  data: {
    dailyReminder: DEFAULT_REMINDER,
    appVersion: APP_VERSION,
    clearing: false,
    // AI 设置
    aiEnabled: true,
    cloudEnabled: false,
    // P2-2: AI 用量统计
    aiUsage: null,
    // P2-2: 订阅消息
    subscribing: false
  },

  onLoad() {
    this._loadSettings();
  },

  onShow() {
    this._loadSettings();
  },

  onPullDownRefresh() {
    this._loadSettings();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载设置
   */
  _loadSettings() {
    const settings = db.settings.get();
    const aiSettings = ai.getSettings();
    const aiUsage = ai.getUsageStats();
    this.setData({
      dailyReminder: settings.dailyReminder || DEFAULT_REMINDER,
      aiEnabled: aiSettings.enabled,
      cloudEnabled: aiSettings.cloudEnabled,
      aiUsage
    });
  },

  /**
   * 时间选择器变化
   */
  onReminderChange(e) {
    const value = e.detail.value;
    if (!value) return;
    this.setData({ dailyReminder: value });

    const settings = db.settings.get();
    settings.dailyReminder = value;
    db.settings.save(settings);

    wx.showToast({ title: '提醒时间已更新', icon: 'success' });
  },

  /**
   * AI 功能开关切换
   */
  onAIToggle(e) {
    const enabled = e.detail.value;
    this.setData({ aiEnabled: enabled });
    ai.saveSettings({ enabled });
    wx.showToast({
      title: enabled ? 'AI 已开启' : 'AI 已关闭',
      icon: 'none'
    });
  },

  /**
   * 云端 LLM 开关切换
   */
  onCloudToggle(e) {
    const enabled = e.detail.value;
    this.setData({ cloudEnabled: enabled });
    ai.saveSettings({ cloudEnabled: enabled });

    if (enabled) {
      wx.showToast({
        title: '已开启云端AI',
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: '已切换为本地引擎',
        icon: 'none'
      });
    }
  },

  /**
   * P2-2: 请求周评提醒订阅
   */
  onSubscribeWeekly() {
    if (this.data.subscribing) return;
    this.setData({ subscribing: true });
    ai.requestWeeklyReminderSubscription().then((res) => {
      this.setData({ subscribing: false });
      if (res && res.error) {
        wx.showToast({ title: '订阅失败', icon: 'none' });
      } else if (res && res.skipped) {
        wx.showToast({ title: '当前环境不支持', icon: 'none' });
      } else {
        wx.showToast({ title: '订阅成功', icon: 'success' });
      }
    });
  },

  /**
   * P2-2: 请求底线告警订阅
   */
  onSubscribeBottomline() {
    if (this.data.subscribing) return;
    this.setData({ subscribing: true });
    ai.requestBottomlineAlertSubscription().then((res) => {
      this.setData({ subscribing: false });
      if (res && res.error) {
        wx.showToast({ title: '订阅失败', icon: 'none' });
      } else if (res && res.skipped) {
        wx.showToast({ title: '当前环境不支持', icon: 'none' });
      } else {
        wx.showToast({ title: '订阅成功', icon: 'success' });
      }
    });
  },

  /**
   * P2-2: 重置 AI 用量统计
   */
  onResetUsage() {
    wx.showModal({
      title: '重置用量统计',
      content: '确定要重置 AI 用量统计吗？此操作不可恢复。',
      confirmText: '重置',
      confirmColor: '#ef4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          ai.resetUsageStats();
          this._loadSettings();
          wx.showToast({ title: '已重置', icon: 'success' });
        }
      }
    });
  },

  /**
   * 清除全部数据 - 二次确认
   */
  onClearData() {
    if (this.data.clearing) return;
    wx.showModal({
      title: '清除全部数据',
      content: '此操作将永久删除所有记录（含评估、反馈、工具箱、叙事、AI缓存等），且不可恢复。确定继续吗？',
      confirmText: '清除',
      confirmColor: '#ef4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this._doClear();
        }
      }
    });
  },

  /**
   * 执行清除：逐项移除业务数据，保留并重置设置
   * P1-10: 补充清除 RESOURCE_TRANSFORMS
   * AI: 清除 AI 缓存和对话历史
   */
  _doClear() {
    this.setData({ clearing: true });
    try {
      const keys = db.tool.getKeys();
      wx.removeStorageSync(keys.WEEKLY_SCORES);
      wx.removeStorageSync(keys.FACTOR_SCORES);
      wx.removeStorageSync(keys.RESOURCES);
      wx.removeStorageSync(keys.DAILY_FEEDBACK);
      wx.removeStorageSync(keys.QUARTERLY_REVIEW);
      wx.removeStorageSync(keys.TOOL_NOTODO);
      wx.removeStorageSync(keys.TOOL_BOTTOMLINE);
      wx.removeStorageSync(keys.TOOL_EXCHANGE);
      wx.removeStorageSync(keys.TOOL_INTERRUPT);
      wx.removeStorageSync(keys.TOOL_UNCONTROLLABLE);
      wx.removeStorageSync(keys.TOOL_RESTART);
      wx.removeStorageSync(keys.NARRATIVE);
      wx.removeStorageSync(keys.PIVOT);
      // P1-10: 补充清除资源转化记录
      wx.removeStorageSync(keys.RESOURCE_TRANSFORMS);

      // 清除 AI 相关数据
      const aiKeys = ai.KEYS;
      wx.removeStorageSync(aiKeys.AI_INSIGHT_CACHE);
      wx.removeStorageSync(aiKeys.AI_CHAT_HISTORY);
      wx.removeStorageSync(aiKeys.AI_SETTINGS);
      // P2-2: 清除 AI 用量统计
      if (aiKeys.AI_USAGE) {
        wx.removeStorageSync(aiKeys.AI_USAGE);
      }

      // 重置设置为默认值
      db.settings.save({ dailyReminder: DEFAULT_REMINDER });
      // 重新初始化存储结构
      db.init();

      this.setData({
        clearing: false,
        dailyReminder: DEFAULT_REMINDER,
        aiEnabled: true,
        cloudEnabled: false
      });
      wx.showToast({ title: '数据已清除', icon: 'success' });
    } catch (e) {
      console.error('clear data error:', e);
      this.setData({ clearing: false });
      wx.showToast({ title: '清除失败', icon: 'none' });
    }
  }
});

// pages/settings/index.js - 设置

const db = require('../../utils/db');
const ai = require('../../utils/ai');
// P2-23: 从 constants 统一导入 APP_VERSION，不再硬编码
const { APP_VERSION } = require('../../utils/constants');

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
   * P2-22: 改为遍历 STORAGE_KEYS 自动清除所有 key，避免手动列举遗漏
   * AI: 清除 AI 缓存和对话历史（AI key 不在 STORAGE_KEYS 中，单独遍历清除）
   */
  _doClear() {
    this.setData({ clearing: true });
    try {
      const keys = db.tool.getKeys();
      // P2-22: 遍历所有 STORAGE_KEYS 自动清除，新增 key 时无需手动添加
      Object.values(keys).forEach(k => wx.removeStorageSync(k));

      // 清除 AI 相关数据（AI key 不在 STORAGE_KEYS 中，单独遍历清除）
      const aiKeys = ai.KEYS;
      Object.values(aiKeys).forEach(k => wx.removeStorageSync(k));

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

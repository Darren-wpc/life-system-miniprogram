// pages/settings/index.js - 设置

const db = require('../../utils/db');
const ai = require('../../utils/ai');
// F1: 订阅消息推送管理
const subscribe = require('../../utils/subscribe');
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
    subscribing: false,
    // F1: 订阅消息展示列表（4 种推送类型）
    subscribeList: []
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
    // F1: 加载订阅消息展示状态
    const subscribeList = subscribe.getDisplayState();
    this.setData({
      dailyReminder: settings.dailyReminder || DEFAULT_REMINDER,
      aiEnabled: aiSettings.enabled,
      cloudEnabled: aiSettings.cloudEnabled,
      aiUsage,
      subscribeList
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
   * F1: 请求每日记录提醒订阅
   */
  onSubscribeDaily() {
    this._requestSubscribe('daily_reminder');
  },

  /**
   * F1: 请求周评提醒订阅
   */
  onSubscribeWeekly() {
    this._requestSubscribe('weekly_reminder');
  },

  /**
   * F1: 请求连续打卡中断提醒订阅
   */
  onSubscribeStreakBreak() {
    this._requestSubscribe('streak_break');
  },

  /**
   * F1: 请求底线告警订阅
   */
  onSubscribeBottomline() {
    this._requestSubscribe('bottomline_alert');
  },

  /**
   * F1: 一键授权全部订阅类型
   */
  onSubscribeAll() {
    if (this.data.subscribing) return;
    this.setData({ subscribing: true });
    subscribe.requestAllAuth().then((res) => {
      this.setData({ subscribing: false });
      if (res && res.error) {
        wx.showToast({ title: '授权失败', icon: 'none' });
      } else if (res && res.skipped) {
        wx.showToast({ title: '当前环境不支持', icon: 'none' });
      } else if (res && res.success) {
        // 统计已接受授权的数量
        const results = res.results || {};
        const acceptedCount = Object.values(results).filter(r => r.accepted).length;
        const total = Object.keys(results).length;
        wx.showToast({
          title: `已授权 ${acceptedCount}/${total} 项`,
          icon: 'none'
        });
        this._loadSettings();
      } else {
        wx.showToast({ title: '授权完成', icon: 'success' });
        this._loadSettings();
      }
    });
  },

  /**
   * F1: 列表项点击授权（统一派发）
   * 根据列表项 data-type 调用对应类型授权
   */
  onSubscribeTap(e) {
    const typeId = e.currentTarget.dataset.type;
    if (!typeId) return;
    this._requestSubscribe(typeId);
  },

  /**
   * F1: 单项订阅授权统一处理
   * @param {string} typeId - 订阅类型ID
   */
  _requestSubscribe(typeId) {
    if (this.data.subscribing) return;
    this.setData({ subscribing: true });
    subscribe.requestAuth(typeId).then((res) => {
      this.setData({ subscribing: false });
      if (res && res.error) {
        wx.showToast({ title: '授权失败', icon: 'none' });
      } else if (res && res.skipped) {
        wx.showToast({ title: '当前环境不支持', icon: 'none' });
      } else if (res && res.accepted) {
        wx.showToast({ title: '授权成功', icon: 'success' });
        this._loadSettings();
      } else if (res && res.reason === 'rejected') {
        wx.showToast({ title: '已拒绝授权', icon: 'none' });
      } else if (res && res.reason === 'banned') {
        wx.showToast({ title: '授权被禁用', icon: 'none' });
      } else {
        wx.showToast({ title: '授权完成', icon: 'none' });
        this._loadSettings();
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

      // F1: 清除订阅消息授权状态
      subscribe.clearState();

      // 重置设置为默认值
      db.settings.save({ dailyReminder: DEFAULT_REMINDER });
      // 重新初始化存储结构
      db.init();

      this.setData({
        clearing: false,
        dailyReminder: DEFAULT_REMINDER,
        aiEnabled: true,
        cloudEnabled: false,
        // F1: 刷新订阅展示状态（已清除，应显示未授权）
        subscribeList: subscribe.getDisplayState()
      });
      wx.showToast({ title: '数据已清除', icon: 'success' });
    } catch (e) {
      console.error('clear data error:', e);
      this.setData({ clearing: false });
      wx.showToast({ title: '清除失败', icon: 'none' });
    }
  }
});

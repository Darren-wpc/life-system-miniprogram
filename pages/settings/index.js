// pages/settings/index.js - 设置

var db = require('../../utils/db');

var APP_VERSION = 'v1.2.0';
var DEFAULT_REMINDER = '21:00';

Page({
  data: {
    dailyReminder: DEFAULT_REMINDER,
    appVersion: APP_VERSION,
    clearing: false
  },

  onLoad: function () {
    this._loadSettings();
  },

  onShow: function () {
    this._loadSettings();
  },

  onPullDownRefresh: function () {
    this._loadSettings();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载设置
   */
  _loadSettings: function () {
    var settings = db.settings.get();
    this.setData({
      dailyReminder: settings.dailyReminder || DEFAULT_REMINDER
    });
  },

  /**
   * 时间选择器变化
   */
  onReminderChange: function (e) {
    var value = e.detail.value;
    if (!value) return;
    this.setData({ dailyReminder: value });

    var settings = db.settings.get();
    settings.dailyReminder = value;
    db.settings.save(settings);

    wx.showToast({ title: '提醒时间已更新', icon: 'success' });
  },

  /**
   * 清除全部数据 - 二次确认
   */
  onClearData: function () {
    if (this.data.clearing) return;
    var that = this;
    wx.showModal({
      title: '清除全部数据',
      content: '此操作将永久删除所有记录（含评估、反馈、工具箱、叙事等），且不可恢复。确定继续吗？',
      confirmText: '清除',
      confirmColor: '#ef4444',
      cancelText: '取消',
      success: function (res) {
        if (res.confirm) {
          that._doClear();
        }
      }
    });
  },

  /**
   * 执行清除：逐项移除业务数据，保留并重置设置
   */
  _doClear: function () {
    this.setData({ clearing: true });
    try {
      var keys = db.tool.getKeys();
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

      // 重置设置为默认值
      db.settings.save({ dailyReminder: DEFAULT_REMINDER });
      // 重新初始化存储结构
      db.init();

      this.setData({ clearing: false, dailyReminder: DEFAULT_REMINDER });
      wx.showToast({ title: '数据已清除', icon: 'success' });
    } catch (e) {
      console.error('clear data error:', e);
      this.setData({ clearing: false });
      wx.showToast({ title: '清除失败', icon: 'none' });
    }
  }
});

// pages/export/index.js - 数据管理

var db = require('../../utils/db');

Page({
  data: {
    categories: [],
    totalRecords: 0,
    storageUsed: '0',
    storageLimit: '0',
    storagePercent: 0,
    exporting: false,
    lastExportTime: ''
  },

  onLoad: function () {
    this._loadCounts();
  },

  onShow: function () {
    this._loadCounts();
  },

  onPullDownRefresh: function () {
    this._loadCounts();
    wx.stopPullDownRefresh();
  },

  /**
   * 统计各类数据记录数与存储占用
   */
  _loadCounts: function () {
    var weekly = db.weekly.getAll();
    var factors = db.factors.getAll();
    var daily = db.daily.getDays(999);
    var quarterly = db.quarterly.getAll();
    var narrative = db.narrative.getAll();
    var pivot = db.pivot.getAll();
    var toolCount = this._countTools();

    var categories = [
      { key: 'weekly', name: '六维周评', count: weekly.length, desc: '每周一次的健康度自评' },
      { key: 'factors', name: '五因子评分', count: factors.length, desc: '标准 / 行动 / 资源 / 反馈 / 不确定性' },
      { key: 'daily', name: '日级反馈', count: daily.length, desc: '每日能量与情绪记录' },
      { key: 'quarterly', name: '季级复盘', count: quarterly.length, desc: '每季度回顾与下季计划' },
      { key: 'narrative', name: '叙事记录', count: narrative.length, desc: '叙事一致性三问' },
      { key: 'pivot', name: '转向判据', count: pivot.length, desc: '转向信号判断记录' },
      { key: 'tool', name: '工具箱数据', count: toolCount, desc: '不做清单 / 底线 / 汇率等 6 类工具' }
    ];

    var total = 0;
    for (var i = 0; i < categories.length; i++) {
      total += categories[i].count;
    }

    // 存储占用（KB）
    var storageInfo = this._getStorageInfo();
    var used = storageInfo.currentSize || 0;
    var limit = storageInfo.limitSize || 10240;
    var percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

    this.setData({
      categories: categories,
      totalRecords: total,
      storageUsed: String(used),
      storageLimit: String(limit),
      storagePercent: percent
    });
  },

  /**
   * 统计工具箱数据条数（6 类工具汇总）
   */
  _countTools: function () {
    var keys = db.tool.getKeys();
    var total = 0;

    // 列表类：notodo / exchange / uncontrollable
    total += this._countItems(db.tool.get(keys.TOOL_NOTODO));
    total += this._countItems(db.tool.get(keys.TOOL_EXCHANGE));
    total += this._countItems(db.tool.get(keys.TOOL_UNCONTROLLABLE));

    // 脚本类：restart
    var restart = db.tool.get(keys.TOOL_RESTART);
    if (restart && restart.scripts && Array.isArray(restart.scripts)) {
      total += restart.scripts.length;
    }

    // 表单类：bottomline / interrupt（有内容计为 1 条）
    if (this._hasFormContent(db.tool.get(keys.TOOL_BOTTOMLINE))) total += 1;
    if (this._hasFormContent(db.tool.get(keys.TOOL_INTERRUPT))) total += 1;

    return total;
  },

  _countItems: function (data) {
    if (data && data.items && Array.isArray(data.items)) {
      return data.items.length;
    }
    return 0;
  },

  /**
   * 判断表单类工具是否有实质内容
   */
  _hasFormContent: function (obj) {
    if (!obj || typeof obj !== 'object') return false;
    var propNames = Object.keys(obj);
    for (var i = 0; i < propNames.length; i++) {
      var k = propNames[i];
      if (k === 'updatedAt') continue;
      var v = obj[k];
      if (v !== undefined && v !== null && v !== '') return true;
    }
    return false;
  },

  /**
   * 安全读取存储信息
   */
  _getStorageInfo: function () {
    try {
      return wx.getStorageInfoSync();
    } catch (e) {
      console.error('getStorageInfo error:', e);
      return { currentSize: 0, limitSize: 10240 };
    }
  },

  /**
   * 导出全部数据为 JSON 到剪贴板
   */
  onExport: function () {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    var that = this;
    try {
      var data = this._buildExportData();
      var json = JSON.stringify(data);

      wx.setClipboardData({
        data: json,
        success: function () {
          var now = that._formatTime(Date.now());
          that.setData({ exporting: false, lastExportTime: now });
          wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
        },
        fail: function () {
          that.setData({ exporting: false });
          wx.showToast({ title: '导出失败', icon: 'none' });
        }
      });
    } catch (e) {
      console.error('export error:', e);
      this.setData({ exporting: false });
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  /**
   * 组装导出数据对象
   */
  _buildExportData: function () {
    var keys = db.tool.getKeys();
    return {
      appVersion: 'v1.2.0',
      schemaVersion: 2,
      exportTime: this._formatTime(Date.now()),
      weekly: db.weekly.getAll(),
      factors: db.factors.getAll(),
      daily: db.daily.getDays(999),
      quarterly: db.quarterly.getAll(),
      narrative: db.narrative.getAll(),
      pivot: db.pivot.getAll(),
      tools: {
        notodo: db.tool.get(keys.TOOL_NOTODO),
        bottomline: db.tool.get(keys.TOOL_BOTTOMLINE),
        exchange: db.tool.get(keys.TOOL_EXCHANGE),
        interrupt: db.tool.get(keys.TOOL_INTERRUPT),
        uncontrollable: db.tool.get(keys.TOOL_UNCONTROLLABLE),
        restart: db.tool.get(keys.TOOL_RESTART)
      },
      settings: db.settings.get()
    };
  },

  /**
   * 格式化时间戳为可读日期时间
   */
  _formatTime: function (ts) {
    var d = new Date(ts);
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var hh = d.getHours();
    var mm = d.getMinutes();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return y + '-' + p(m) + '-' + p(day) + ' ' + p(hh) + ':' + p(mm);
  }
});

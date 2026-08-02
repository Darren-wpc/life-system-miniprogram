// pages/export/index.js - 数据管理

const db = require('../../utils/db');
const ai = require('../../utils/ai');
// P2-23: 从 constants 统一导入版本号，不再硬编码
const { APP_VERSION, SCHEMA_VERSION } = require('../../utils/constants');

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

  onLoad() {
    this._loadCounts();
  },

  onShow() {
    this._loadCounts();
  },

  onPullDownRefresh() {
    this._loadCounts();
    wx.stopPullDownRefresh();
  },

  /**
   * 统计各类数据记录数与存储占用
   */
  _loadCounts() {
    const weekly = db.weekly.getAll();
    const factors = db.factors.getAll();
    const daily = db.daily.getDays(999);
    const quarterly = db.quarterly.getAll();
    const narrative = db.narrative.getAll();
    const pivot = db.pivot.getAll();
    const resources = db.resources.get();
    const toolCount = this._countTools();
    const transformCount = db.transform.getAll().length;
    const aiChatCount = ai.getChatHistory().length;

    const categories = [
      { key: 'weekly', name: '六维周评', count: weekly.length, desc: '每周一次的健康度自评' },
      { key: 'factors', name: '五因子评分', count: factors.length, desc: '标准 / 行动 / 资源 / 反馈 / 不确定性' },
      { key: 'resources', name: '资源盘点', count: resources ? 1 : 0, desc: '七类资源指标与关系层级数据' },
      { key: 'daily', name: '日级反馈', count: daily.length, desc: '每日能量与情绪记录' },
      { key: 'quarterly', name: '季级复盘', count: quarterly.length, desc: '每季度回顾与下季计划' },
      { key: 'narrative', name: '叙事记录', count: narrative.length, desc: '叙事一致性三问' },
      { key: 'pivot', name: '转向判据', count: pivot.length, desc: '转向信号判断记录' },
      { key: 'tool', name: '工具箱数据', count: toolCount, desc: '不做清单 / 底线 / 汇率等 6 类工具' },
      { key: 'transform', name: '资源转化', count: transformCount, desc: '资源间转化追踪记录' },
      { key: 'ai', name: 'AI 对话', count: aiChatCount, desc: 'AI 教练对话历史与洞察缓存' }
    ];

    let total = 0;
    categories.forEach(cat => {
      total += cat.count;
    });

    // 存储占用（KB）
    const storageInfo = this._getStorageInfo();
    const used = storageInfo.currentSize || 0;
    const limit = storageInfo.limitSize || 10240;
    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

    this.setData({
      categories,
      totalRecords: total,
      storageUsed: String(used),
      storageLimit: String(limit),
      storagePercent: percent
    });
  },

  /**
   * 统计工具箱数据条数（6 类工具汇总）
   */
  _countTools() {
    const keys = db.tool.getKeys();
    let total = 0;

    // 列表类：notodo / exchange / uncontrollable
    total += this._countItems(db.tool.get(keys.TOOL_NOTODO));
    total += this._countItems(db.tool.get(keys.TOOL_EXCHANGE));
    total += this._countItems(db.tool.get(keys.TOOL_UNCONTROLLABLE));

    // 脚本类：restart
    const restart = db.tool.get(keys.TOOL_RESTART);
    if (restart && restart.scripts && Array.isArray(restart.scripts)) {
      total += restart.scripts.length;
    }

    // 表单类：bottomline / interrupt（有内容计为 1 条）
    if (this._hasFormContent(db.tool.get(keys.TOOL_BOTTOMLINE))) total += 1;
    if (this._hasFormContent(db.tool.get(keys.TOOL_INTERRUPT))) total += 1;

    return total;
  },

  _countItems(data) {
    if (data && data.items && Array.isArray(data.items)) {
      return data.items.length;
    }
    return 0;
  },

  /**
   * 判断表单类工具是否有实质内容
   */
  _hasFormContent(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const propNames = Object.keys(obj);
    for (let i = 0; i < propNames.length; i++) {
      const k = propNames[i];
      if (k === 'updatedAt') continue;
      const v = obj[k];
      if (v !== undefined && v !== null && v !== '') return true;
    }
    return false;
  },

  /**
   * 安全读取存储信息
   */
  _getStorageInfo() {
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
  onExport() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    try {
      const data = this._buildExportData();
      const json = JSON.stringify(data);

      wx.setClipboardData({
        data: json,
        success: () => {
          const now = this._formatTime(Date.now());
          this.setData({ exporting: false, lastExportTime: now });
          wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
        },
        fail: () => {
          this.setData({ exporting: false });
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
   * P1-10: 补充导出资源转化记录
   * P0-8: 补充导出资源盘点数据
   */
  _buildExportData() {
    const keys = db.tool.getKeys();
    return {
      // P2-23: 使用从 constants 导入的版本号常量
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportTime: this._formatTime(Date.now()),
      weekly: db.weekly.getAll(),
      factors: db.factors.getAll(),
      resources: db.resources.get(),
      daily: db.daily.getDays(999),
      quarterly: db.quarterly.getAll(),
      narrative: db.narrative.getAll(),
      pivot: db.pivot.getAll(),
      transforms: db.transform.getAll(),
      tools: {
        notodo: db.tool.get(keys.TOOL_NOTODO),
        bottomline: db.tool.get(keys.TOOL_BOTTOMLINE),
        exchange: db.tool.get(keys.TOOL_EXCHANGE),
        interrupt: db.tool.get(keys.TOOL_INTERRUPT),
        uncontrollable: db.tool.get(keys.TOOL_UNCONTROLLABLE),
        restart: db.tool.get(keys.TOOL_RESTART)
      },
      settings: db.settings.get(),
      ai: {
        settings: ai.getSettings(),
        insightCache: ai.getCachedInsight(),
        chatHistory: ai.getChatHistory()
      }
    };
  },

  /**
   * 格式化时间戳为可读日期时间
   */
  _formatTime(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = d.getHours();
    const mm = d.getMinutes();
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return y + '-' + p(m) + '-' + p(day) + ' ' + p(hh) + ':' + p(mm);
  }
});

// pages/toolkit/bottomline/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');

Page({
  data: {
    dimensions: [],
    form: {},
    filledKeys: {},
    filledCount: 0,
    saving: false,
    // P2-11: 底线告警列表
    alerts: []
  },

  // P1-4: 数据加载统一放 onShow
  onShow() {
    this._loadData();
  },

  _loadData() {
    const dimKeys = constants.DIM_KEYS;
    const dimensions = dimKeys.map((key) => {
      const dim = constants.DIMENSIONS[key];
      return {
        key,
        name: dim.name,
        icon: dim.icon,
        desc: dim.desc
      };
    });

    const form = {};
    dimKeys.forEach((key) => {
      form[key] = '';
    });

    // 加载已保存数据
    const keys = db.tool.getKeys();
    const saved = db.tool.get(keys.TOOL_BOTTOMLINE);
    if (saved) {
      dimKeys.forEach((key) => {
        if (saved[key] !== undefined && saved[key] !== null) {
          form[key] = saved[key];
        }
      });
    }

    let filledCount = 0;
    const filledKeys = {};
    dimKeys.forEach((key) => {
      const filled = !!(form[key] && form[key].trim());
      filledKeys[key] = filled;
      if (filled) filledCount++;
    });

    this.setData({
      dimensions,
      form,
      filledKeys,
      filledCount
    });

    // P2-11: 检查底线告警
    this._checkAlert();
  },

  // P2-11: 底线告警检测 - 读取最新周评分，跌破底线(<=2)且已设底线时告警
  _checkAlert() {
    const latest = db.weekly.getLatest();
    const alerts = [];

    if (latest) {
      const dimKeys = constants.DIM_KEYS;
      const form = this.data.form;

      dimKeys.forEach((key) => {
        const score = latest[key];
        const bottomline = form[key];

        if (typeof score === 'number' && score <= 2 && bottomline && bottomline.trim()) {
          const dim = constants.DIMENSIONS[key];
          alerts.push({
            key,
            name: dim.name,
            icon: dim.icon,
            bottomline: bottomline.trim()
          });
        }
      });
    }

    this.setData({ alerts });
  },

  // P2-11: 跳转到中断恢复脚本
  goInterrupt() {
    wx.navigateTo({ url: '/pages/toolkit/interrupt/index' });
  },

  _saveData() {
    const keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_BOTTOMLINE, this.data.form);
  },

  onDimensionInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const form = this.data.form;
    form[key] = value;

    const dimKeys = constants.DIM_KEYS;
    let filledCount = 0;
    const filledKeys = {};
    dimKeys.forEach((k) => {
      const filled = !!(form[k] && form[k].trim());
      filledKeys[k] = filled;
      if (filled) filledCount++;
    });

    this.setData({
      form,
      filledKeys,
      filledCount
    });
  },

  // P1-2 修复：blur 自动保存改为静默，不弹 toast 避免骚扰
  onBlur() {
    this._saveData();
  }
});

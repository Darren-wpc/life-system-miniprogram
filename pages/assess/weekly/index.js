// pages/assess/weekly/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');

Page({
  data: {
    dimensions: [],
    scores: {},
    prevScores: {},
    energyText: '',
    drainText: '',
    saving: false,
    weekLabel: ''
  },

  // P1-4: 数据加载统一放 onShow
  onShow() {
    this._loadData();
  },

  _loadData() {
    const dimensions = constants.DIM_KEYS.map(key => {
      const dim = constants.DIMENSIONS[key];
      return { key, name: dim.name, desc: dim.desc, icon: dim.icon };
    });

    const scores = {};
    const prevScores = {};
    constants.DIM_KEYS.forEach(key => {
      scores[key] = 3;
      prevScores[key] = null;
    });

    const currentWeekId = db.getWeekId(new Date());
    const latest = db.weekly.getLatest();
    if (latest && latest.id === currentWeekId) {
      constants.DIM_KEYS.forEach(key => {
        if (latest[key] !== undefined && latest[key] !== null) {
          scores[key] = latest[key];
        }
      });
      if (latest.energyText) this.setData({ energyText: latest.energyText });
      if (latest.drainText) this.setData({ drainText: latest.drainText });
    } else {
      // 非本周记录：不回填，使用默认分；清空残留文案
      this.setData({ energyText: '', drainText: '' });
    }

    const previous = db.weekly.getPrevious();
    if (previous) {
      constants.DIM_KEYS.forEach(key => {
        if (previous[key] !== undefined && previous[key] !== null) {
          prevScores[key] = previous[key];
        }
      });
    }

    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
    const weekLabel = `${fmt(monday)} - ${fmt(sunday)}`;

    this.setData({ dimensions, scores, prevScores, weekLabel });
  },

  onSliderChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = parseInt(e.detail.value, 10);
    this.setData({ [`scores.${key}`]: value });
  },

  onEnergyInput(e) {
    this.setData({ energyText: e.detail.value });
  },

  onDrainInput(e) {
    this.setData({ drainText: e.detail.value });
  },

  onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    const { scores, energyText, drainText } = this.data;
    const data = { ...scores, energyText, drainText };

    try {
      db.weekly.save(data);
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      console.error('weekly save error:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  goFactors() {
    wx.navigateTo({ url: '/pages/assess/factors/index' });
  },

  goResources() {
    wx.navigateTo({ url: '/pages/assess/resources/index' });
  }
});

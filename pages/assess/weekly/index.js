// pages/assess/weekly/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');
const ai = require('../../../utils/ai');

Page({
  data: {
    dimensions: [],
    scores: {},
    prevScores: {},
    energyText: '',
    drainText: '',
    saving: false,
    weekLabel: '',
    aiTriggering: false
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

      // 保存后触发 AI 深度解读
      this._triggerAIInsight();
    } catch (err) {
      console.error('weekly save error:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  /**
   * 保存后触发 AI 深度解读生成
   */
  _triggerAIInsight() {
    if (!ai.isEnabled()) return;

    this.setData({ aiTriggering: true });

    // 强制重新生成（因为刚保存了新数据）
    ai.generateWeeklyInsight(true).then((insight) => {
      this.setData({ aiTriggering: false });

      if (insight && insight.summary) {
        // 弹窗提示用户查看 AI 解读
        wx.showModal({
          title: 'AI 深度解读已生成',
          content: '基于本周评估数据，AI 已为你生成深度解读。是否立即查看？',
          confirmText: '去查看',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({ url: '/pages/index/index' });
            }
          }
        });
      }
    }).catch(() => {
      this.setData({ aiTriggering: false });
    });
  },

  goFactors() {
    wx.navigateTo({ url: '/pages/assess/factors/index' });
  },

  goResources() {
    wx.navigateTo({ url: '/pages/assess/resources/index' });
  }
});

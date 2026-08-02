// pages/assess/factors/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');
const diagnosis = require('../../../utils/diagnosis');

Page({
  data: {
    factors: [],
    scores: {},
    product: 0,
    productPercent: 0,
    bottleneckKey: null,
    bottleneckName: '',
    bottleneckValue: 0,
    prediction: null,
    saving: false
  },

  // P1-4: 数据加载统一放 onShow
  onShow() {
    this._loadData();
  },

  _loadData() {
    const factors = constants.FACTOR_KEYS.map(key => {
      const factor = constants.FACTORS[key];
      return { key, name: factor.name, desc: factor.desc };
    });

    const scores = {};
    constants.FACTOR_KEYS.forEach(key => {
      scores[key] = 0.5;
    });

    const latest = db.factors.getLatest();
    if (latest) {
      constants.FACTOR_KEYS.forEach(key => {
        if (latest[key] !== undefined && latest[key] !== null) {
          scores[key] = latest[key];
        }
      });
    }

    this.setData({ factors, scores });
    this._calcResult();
  },

  _calcResult() {
    const scores = this.data.scores;
    const product = diagnosis.calcProduct(scores);
    const productPercent = Math.round(product * 100);
    const bottleneckKey = diagnosis.findBottleneckFactor(scores);
    const bottleneckName = bottleneckKey ? constants.FACTORS[bottleneckKey].name : '';
    const bottleneckValue = bottleneckKey ? parseFloat(scores[bottleneckKey].toFixed(2)) : 0;

    // 格式化因子分数为最多2位小数
    const displayScores = {};
    constants.FACTOR_KEYS.forEach(key => {
      displayScores[key] = parseFloat(parseFloat(scores[key]).toFixed(2));
    });

    let prediction = null;
    if (bottleneckKey && scores[bottleneckKey] < 0.5) {
      const pred = diagnosis.predictImprovement(scores, 0.5);
      if (pred) {
        prediction = {
          factorName: bottleneckName,
          currentValue: parseFloat(pred.currentValue.toFixed(2)),
          targetValue: pred.targetValue,
          currentProduct: parseFloat(pred.currentProduct.toFixed(2)),
          boostedProduct: parseFloat(pred.boostedProduct.toFixed(2)),
          multiplier: parseFloat(pred.multiplier.toFixed(2))
        };
      }
    }

    this.setData({
      displayScores,
      product: parseFloat(product.toFixed(2)),
      productPercent,
      bottleneckKey,
      bottleneckName,
      bottleneckValue,
      prediction
    });
  },

  onSliderChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = parseFloat(e.detail.value);
    this.setData({ [`scores.${key}`]: value });
    this._calcResult();
  },

  onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    const { scores } = this.data;
    try {
      db.factors.save(scores);
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      console.error('factors save error:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});

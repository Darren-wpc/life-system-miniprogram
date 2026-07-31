// pages/feedback/quarterly/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');

Page({
  data: {
    currentQuarter: '',
    hasReview: false,
    reviewData: null,
    saving: false,
    // 四个结构检视
    collapseText: '',    // 崩溃点
    leverageText: '',    // 杠杆点
    imbalanceText: '',  // 失衡点
    sustainableText: '', // 可持续性
    // 两个框架问题
    standardUpdateText: '',  // 标准需要更新吗
    focusFactor: '',         // 下一季度集中精力
    // 因子选项
    factorOptions: []
  },

  onLoad() {
    const factorOptions = constants.FACTOR_KEYS.map(key => {
      const f = constants.FACTORS[key];
      return { key, name: f.name, desc: f.desc };
    });

    this.setData({ factorOptions });
  },

  onShow() {
    this._loadData();
  },

  _loadData() {
    const now = new Date();
    const m = now.getMonth();
    const q = Math.floor(m / 3) + 1;
    const currentQuarter = `${now.getFullYear()}-Q${q}`;

    // 查找该季度的复盘记录
    const allReviews = db.quarterly.getAll();
    const review = allReviews.find(r => r.id === currentQuarter);

    const hasReview = !!review;

    if (hasReview) {
      this.setData({
        currentQuarter,
        hasReview: true,
        reviewData: review,
        collapseText: review.collapseText || '',
        leverageText: review.leverageText || '',
        imbalanceText: review.imbalanceText || '',
        sustainableText: review.sustainableText || '',
        standardUpdateText: review.standardUpdateText || '',
        focusFactor: review.focusFactor || ''
      });
    } else {
      this.setData({
        currentQuarter,
        hasReview: false,
        reviewData: null
      });
    }
  },

  onCollapseInput(e) {
    this.setData({ collapseText: e.detail.value });
  },

  onLeverageInput(e) {
    this.setData({ leverageText: e.detail.value });
  },

  onImbalanceInput(e) {
    this.setData({ imbalanceText: e.detail.value });
  },

  onSustainableInput(e) {
    this.setData({ sustainableText: e.detail.value });
  },

  onStandardUpdateInput(e) {
    this.setData({ standardUpdateText: e.detail.value });
  },

  onFactorSelect(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ focusFactor: key });
  },

  onSave() {
    if (this.data.saving) return;

    const {
      collapseText,
      leverageText,
      imbalanceText,
      sustainableText,
      standardUpdateText,
      focusFactor
    } = this.data;

    // 校验四个结构检视
    if (!collapseText.trim() || !leverageText.trim() || !imbalanceText.trim() || !sustainableText.trim()) {
      wx.showToast({ title: '请完成四个结构检视', icon: 'none' });
      return;
    }

    if (!standardUpdateText.trim()) {
      wx.showToast({ title: '请填写标准更新思考', icon: 'none' });
      return;
    }

    if (!focusFactor) {
      wx.showToast({ title: '请选择下一季度集中因子', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      db.quarterly.save({
        collapseText: collapseText.trim(),
        leverageText: leverageText.trim(),
        imbalanceText: imbalanceText.trim(),
        sustainableText: sustainableText.trim(),
        standardUpdateText: standardUpdateText.trim(),
        focusFactor
      });
      wx.showToast({ title: '复盘保存成功', icon: 'success' });
      this._loadData();
    } catch (err) {
      console.error('quarterly save error:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});

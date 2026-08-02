// pages/profile/narrative/index.js - 叙事一致性记录

const db = require('../../../utils/db');
const constants = require('../../../utils/constants');

Page({
  data: {
    currentQuarter: '',
    hasRecord: false,
    isEditing: false,  // P1-3: 编辑模式标志
    latestRecord: null,
    // 三个问题
    questions: [
      {
        key: 'explanatory',
        label: '解释力',
        text: '我现在讲述的"我是谁"，能否解释我过去3年的关键选择？',
        value: ''
      },
      {
        key: 'carrying',
        label: '承载力',
        text: '这个版本撑得起我接下来想做的事吗？',
        value: ''
      },
      {
        key: 'honesty',
        label: '诚实度',
        text: '这个故事是我相信的，还是我希望别人相信的？',
        value: ''
      }
    ],
    filledCount: 0,
    saving: false,
    historyList: [],
    historyExpanded: false
  },

  onLoad() {
    // P1-4: 仅做一次性初始化，数据加载放 onShow
    const currentQuarter = db.getQuarterId(new Date());
    this.setData({ currentQuarter });
  },

  onShow() {
    this._loadData();
  },

  onPullDownRefresh() {
    this._loadData();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载数据：检查本季度是否已有记录
   */
  _loadData() {
    const currentQuarter = db.getQuarterId(new Date());
    const latest = db.narrative.getLatest();

    if (latest && latest.id === currentQuarter) {
      // 本季度已有记录 —— 只读模式
      this.setData({
        hasRecord: true,
        isEditing: false,  // P1-3: 加载时重置编辑状态
        latestRecord: latest,
        'questions[0].value': latest.explanatory || '',
        'questions[1].value': latest.carrying || '',
        'questions[2].value': latest.honesty || ''
      });
    } else {
      // 本季度无记录 —— 编辑模式
      this.setData({
        hasRecord: false,
        latestRecord: null,
        'questions[0].value': '',
        'questions[1].value': '',
        'questions[2].value': ''
      });
    }

    // 加载历史记录
    const allRecords = db.narrative.getAll();
    this.setData({ historyList: allRecords });
  },

  /**
   * textarea 输入
   */
  onQuestionInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const fieldName = `questions[${index}].value`;
    this.setData({ [fieldName]: value });
    this._updateFilledCount();
  },

  /**
   * 更新已填写计数
   */
  _updateFilledCount() {
    const { questions } = this.data;
    let count = 0;
    questions.forEach((q) => {
      if (q.value && q.value.trim()) {
        count++;
      }
    });
    this.setData({ filledCount: count });
  },

  /**
   * 保存记录
   */
  onSave() {
    if (this.data.saving) return;

    // 校验：至少填写一项
    if (this.data.filledCount === 0) {
      wx.showToast({ title: '请至少回答一个问题', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    const { questions } = this.data;
    const data = {
      explanatory: questions[0].value.trim(),
      carrying: questions[1].value.trim(),
      honesty: questions[2].value.trim()
    };

    try {
      db.narrative.save(data);
      wx.showToast({ title: '已保存', icon: 'success' });

      // P1-3: 保存后退出编辑模式
      setTimeout(() => {
        this.setData({ saving: false, isEditing: false });
        this._loadData();
      }, 800);
    } catch (e) {
      console.error('narrative save error:', e);
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // P1-3: 切换到编辑模式
  onEdit() {
    this.setData({ isEditing: true });
  },

  /**
   * 展开/收起历史记录
   */
  toggleHistory() {
    this.setData({ historyExpanded: !this.data.historyExpanded });
  },

  /**
   * 跳转到设置页
   */
  goToSettings() {
    wx.navigateTo({
      url: '/pages/settings/index'
    });
  },

  /**
   * 跳转到数据管理页
   */
  goToExport() {
    wx.navigateTo({
      url: '/pages/export/index'
    });
  }
});

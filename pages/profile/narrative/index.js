// pages/profile/narrative/index.js - 叙事一致性记录

var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

Page({
  data: {
    currentQuarter: '',
    hasRecord: false,
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

  onLoad: function () {
    var currentQuarter = db.getQuarterId(new Date());
    this.setData({ currentQuarter: currentQuarter });
    this._loadData();
  },

  onShow: function () {
    this._loadData();
  },

  onPullDownRefresh: function () {
    this._loadData();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载数据：检查本季度是否已有记录
   */
  _loadData: function () {
    var currentQuarter = db.getQuarterId(new Date());
    var latest = db.narrative.getLatest();

    if (latest && latest.id === currentQuarter) {
      // 本季度已有记录 —— 只读模式
      this.setData({
        hasRecord: true,
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
    var allRecords = db.narrative.getAll();
    this.setData({ historyList: allRecords });
  },

  /**
   * textarea 输入
   */
  onQuestionInput: function (e) {
    var key = e.currentTarget.dataset.key;
    var index = e.currentTarget.dataset.index;
    var value = e.detail.value;
    var fieldName = 'questions[' + index + '].value';
    this.setData({ [fieldName]: value });
    this._updateFilledCount();
  },

  /**
   * 更新已填写计数
   */
  _updateFilledCount: function () {
    var questions = this.data.questions;
    var count = 0;
    questions.forEach(function (q) {
      if (q.value && q.value.trim()) {
        count++;
      }
    });
    this.setData({ filledCount: count });
  },

  /**
   * 保存记录
   */
  onSave: function () {
    if (this.data.saving) return;

    // 校验：至少填写一项
    if (this.data.filledCount === 0) {
      wx.showToast({ title: '请至少回答一个问题', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    var questions = this.data.questions;
    var data = {
      explanatory: questions[0].value.trim(),
      carrying: questions[1].value.trim(),
      honesty: questions[2].value.trim()
    };

    try {
      db.narrative.save(data);
      wx.showToast({ title: '已保存', icon: 'success' });

      // 切换到只读模式
      setTimeout(function () {
        this.setData({ saving: false });
        this._loadData();
      }.bind(this), 800);
    } catch (e) {
      console.error('narrative save error:', e);
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  /**
   * 展开/收起历史记录
   */
  toggleHistory: function () {
    this.setData({ historyExpanded: !this.data.historyExpanded });
  },

  /**
   * 格式化时间戳为可读日期
   */
  formatDate: function (timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
});

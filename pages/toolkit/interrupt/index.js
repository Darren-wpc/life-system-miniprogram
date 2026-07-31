// pages/toolkit/interrupt/index.js
var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

var SECTIONS = [
  { key: 'day1', title: '中断1天怎么办', desc: '漏了一天，如何最小代价回来' },
  { key: 'day3', title: '中断3天怎么办', desc: '连续断了三天，如何重新启动' },
  { key: 'week1', title: '中断1周怎么办', desc: '一周没做，如何不放弃地接上' }
];

Page({
  data: {
    sections: SECTIONS,
    form: {
      day1: '',
      day3: '',
      week1: ''
    },
    filledCount: 0,
    saving: false
  },

  onLoad: function () {
    this._loadData();
  },

  onShow: function () {
    this._loadData();
  },

  _loadData: function () {
    var keys = db.tool.getKeys();
    var saved = db.tool.get(keys.TOOL_INTERRUPT);
    var form = {
      day1: '',
      day3: '',
      week1: ''
    };

    if (saved) {
      if (saved.day1 !== undefined && saved.day1 !== null) form.day1 = saved.day1;
      if (saved.day3 !== undefined && saved.day3 !== null) form.day3 = saved.day3;
      if (saved.week1 !== undefined && saved.week1 !== null) form.week1 = saved.week1;
    }

    var filledCount = 0;
    if (form.day1 && form.day1.trim()) filledCount++;
    if (form.day3 && form.day3.trim()) filledCount++;
    if (form.week1 && form.week1.trim()) filledCount++;

    this.setData({
      form: form,
      filledCount: filledCount
    });
  },

  _saveData: function () {
    var keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_INTERRUPT, {
      day1: this.data.form.day1,
      day3: this.data.form.day3,
      week1: this.data.form.week1
    });
  },

  onTextareaInput: function (e) {
    var key = e.currentTarget.dataset.key;
    var value = e.detail.value;
    this.setData({
      ['form.' + key]: value
    });
  },

  onBlur: function (e) {
    var key = e.currentTarget.dataset.key;
    var value = this.data.form[key];

    // 更新填写计数
    var filledCount = 0;
    var form = this.data.form;
    if (form.day1 && form.day1.trim()) filledCount++;
    if (form.day3 && form.day3.trim()) filledCount++;
    if (form.week1 && form.week1.trim()) filledCount++;
    this.setData({ filledCount: filledCount });

    this._saveData();
    wx.showToast({ title: '已保存', icon: 'success' });
  }
});
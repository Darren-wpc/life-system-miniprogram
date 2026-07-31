// pages/toolkit/bottomline/index.js
var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

Page({
  data: {
    dimensions: [],
    form: {},
    filledKeys: {},
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
    var dimKeys = constants.DIM_KEYS;
    var dimensions = dimKeys.map(function (key) {
      var dim = constants.DIMENSIONS[key];
      return {
        key: key,
        name: dim.name,
        icon: dim.icon,
        desc: dim.desc
      };
    });

    var form = {};
    dimKeys.forEach(function (key) {
      form[key] = '';
    });

    // 加载已保存数据
    var keys = db.tool.getKeys();
    var saved = db.tool.get(keys.TOOL_BOTTOMLINE);
    if (saved) {
      dimKeys.forEach(function (key) {
        if (saved[key] !== undefined && saved[key] !== null) {
          form[key] = saved[key];
        }
      });
    }

    var filledCount = 0;
    var filledKeys = {};
    dimKeys.forEach(function (key) {
      var filled = !!(form[key] && form[key].trim());
      filledKeys[key] = filled;
      if (filled) filledCount++;
    });

    this.setData({
      dimensions: dimensions,
      form: form,
      filledKeys: filledKeys,
      filledCount: filledCount
    });
  },

  _saveData: function () {
    var keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_BOTTOMLINE, this.data.form);
  },

  onDimensionInput: function (e) {
    var key = e.currentTarget.dataset.key;
    var value = e.detail.value;
    var form = this.data.form;
    form[key] = value;

    var dimKeys = constants.DIM_KEYS;
    var filledCount = 0;
    var filledKeys = {};
    dimKeys.forEach(function (k) {
      var filled = !!(form[k] && form[k].trim());
      filledKeys[k] = filled;
      if (filled) filledCount++;
    });

    this.setData({
      form: form,
      filledKeys: filledKeys,
      filledCount: filledCount
    });
  },

  onBlur: function () {
    this._saveData();
    wx.showToast({ title: '已保存', icon: 'success' });
  }
});

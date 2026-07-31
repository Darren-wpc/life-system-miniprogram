// pages/toolkit/exchange/index.js
var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

Page({
  data: {
    items: [],
    fromText: '',
    toText: '',
    showAdd: false,
    saving: false,
    canSubmit: false
  },

  onLoad: function () {
    this._loadData();
  },

  onShow: function () {
    this._loadData();
  },

  _loadData: function () {
    var keys = db.tool.getKeys();
    var saved = db.tool.get(keys.TOOL_EXCHANGE);
    var items = [];
    if (saved && saved.items && Array.isArray(saved.items)) {
      items = saved.items.map(function (item) {
        return {
          id: item.id,
          from: item.from,
          to: item.to,
          createdAt: item.createdAt,
          dateStr: formatDate(item.createdAt)
        };
      });
    }
    this.setData({ items: items });
  },

  _saveData: function () {
    var keys = db.tool.getKeys();
    var rawItems = this.data.items.map(function (item) {
      return {
        id: item.id,
        from: item.from,
        to: item.to,
        createdAt: item.createdAt
      };
    });
    db.tool.save(keys.TOOL_EXCHANGE, { items: rawItems });
  },

  _updateCanSubmit: function () {
    var canSubmit = !!(this.data.fromText.trim() && this.data.toText.trim());
    this.setData({ canSubmit: canSubmit });
  },

  toggleAdd: function () {
    this.setData({
      showAdd: !this.data.showAdd,
      fromText: '',
      toText: '',
      canSubmit: false
    });
  },

  onFromInput: function (e) {
    this.setData({ fromText: e.detail.value });
    this._updateCanSubmit();
  },

  onToInput: function (e) {
    this.setData({ toText: e.detail.value });
    this._updateCanSubmit();
  },

  addItem: function () {
    var from = this.data.fromText.trim();
    var to = this.data.toText.trim();

    if (!from) {
      wx.showToast({ title: '请填写"愿意交换的内容"', icon: 'none' });
      return;
    }
    if (!to) {
      wx.showToast({ title: '请填写"交换目标"', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    var ts = Date.now();
    var newItem = {
      id: generateId(),
      from: from,
      to: to,
      createdAt: ts,
      dateStr: formatDate(ts)
    };
    var items = this.data.items.slice();
    items.unshift(newItem);

    this.setData({
      items: items,
      fromText: '',
      toText: '',
      showAdd: false,
      saving: false
    });
    this._saveData();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  deleteItem: function (e) {
    var id = e.currentTarget.dataset.id;
    var items = this.data.items.filter(function (item) {
      return item.id !== id;
    });
    this.setData({ items: items });
    this._saveData();
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});

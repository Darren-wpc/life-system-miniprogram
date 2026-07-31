// pages/toolkit/notodo-detail/index.js - 不做清单
var db = require('../../../utils/db');

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
    inputText: '',
    inputReason: '',
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
    var saved = db.tool.get(keys.TOOL_NOTODO);
    var items = [];
    if (saved && saved.items && Array.isArray(saved.items)) {
      items = saved.items.map(function (item) {
        return {
          id: item.id,
          text: item.text,
          reason: item.reason || '',
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
        text: item.text,
        reason: item.reason,
        createdAt: item.createdAt
      };
    });
    db.tool.save(keys.TOOL_NOTODO, { items: rawItems });
  },

  toggleAdd: function () {
    this.setData({
      showAdd: !this.data.showAdd,
      inputText: '',
      inputReason: '',
      canSubmit: false
    });
  },

  onTextInput: function (e) {
    var val = e.detail.value;
    this.setData({
      inputText: val,
      canSubmit: !!(val && val.trim())
    });
  },

  onReasonInput: function (e) {
    this.setData({ inputReason: e.detail.value });
  },

  addItem: function () {
    var text = this.data.inputText.trim();
    if (!text) {
      wx.showToast({ title: '请填写不做的事', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    var ts = Date.now();
    var newItem = {
      id: generateId(),
      text: text,
      reason: this.data.inputReason.trim(),
      createdAt: ts,
      dateStr: formatDate(ts)
    };
    var items = this.data.items.slice();
    items.unshift(newItem);

    this.setData({
      items: items,
      inputText: '',
      inputReason: '',
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

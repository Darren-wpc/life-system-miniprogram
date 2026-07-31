// pages/toolkit/uncontrollable/index.js
var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

Page({
  data: {
    items: [],
    inputText: '',
    controllableCount: 0,
    uncontrollableCount: 0,
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
    var saved = db.tool.get(keys.TOOL_UNCONTROLLABLE);
    var items = [];
    if (saved && saved.items && Array.isArray(saved.items)) {
      items = saved.items;
    }

    var controllableCount = 0;
    var uncontrollableCount = 0;
    items.forEach(function (item) {
      if (item.type === 'controllable') {
        controllableCount++;
      } else {
        uncontrollableCount++;
      }
    });

    this.setData({
      items: items,
      controllableCount: controllableCount,
      uncontrollableCount: uncontrollableCount
    });
  },

  _saveData: function () {
    var keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_UNCONTROLLABLE, { items: this.data.items });
  },

  _recalcCounts: function () {
    var controllableCount = 0;
    var uncontrollableCount = 0;
    this.data.items.forEach(function (item) {
      if (item.type === 'controllable') {
        controllableCount++;
      } else {
        uncontrollableCount++;
      }
    });
    this.setData({
      controllableCount: controllableCount,
      uncontrollableCount: uncontrollableCount
    });
  },

  onInput: function (e) {
    var val = e.detail.value;
    this.setData({
      inputText: val,
      canSubmit: !!(val && val.trim())
    });
  },

  addItem: function () {
    var text = this.data.inputText.trim();
    if (!text) {
      wx.showToast({ title: '请输入焦虑事项', icon: 'none' });
      return;
    }

    var newItem = {
      id: generateId(),
      text: text,
      type: 'uncontrollable'
    };
    var items = this.data.items.slice();
    items.unshift(newItem);

    this.setData({
      items: items,
      inputText: '',
      canSubmit: false
    });
    this._recalcCounts();
    this._saveData();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  toggleType: function (e) {
    var id = e.currentTarget.dataset.id;
    var items = this.data.items.map(function (item) {
      if (item.id === id) {
        var newType = item.type === 'controllable' ? 'uncontrollable' : 'controllable';
        return {
          id: item.id,
          text: item.text,
          type: newType
        };
      }
      return item;
    });
    this.setData({ items: items });
    this._recalcCounts();
    this._saveData();
  },

  deleteItem: function (e) {
    var id = e.currentTarget.dataset.id;
    var items = this.data.items.filter(function (item) {
      return item.id !== id;
    });
    this.setData({ items: items });
    this._recalcCounts();
    this._saveData();
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});

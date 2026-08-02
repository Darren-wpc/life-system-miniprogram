// pages/toolkit/uncontrollable/index.js
const db = require('../../../utils/db');
const { generateId, haptic, confirmDelete } = require('../../../utils/common');

Page({
  data: {
    items: [],
    inputText: '',
    controllableCount: 0,
    uncontrollableCount: 0,
    saving: false,
    canSubmit: false
  },

  // P1-4: 数据加载统一放 onShow
  onShow() {
    this._loadData();
  },

  _loadData() {
    const keys = db.tool.getKeys();
    const saved = db.tool.get(keys.TOOL_UNCONTROLLABLE);
    let items = [];
    if (saved && saved.items && Array.isArray(saved.items)) {
      items = saved.items;
    }

    let controllableCount = 0;
    let uncontrollableCount = 0;
    items.forEach((item) => {
      if (item.type === 'controllable') {
        controllableCount++;
      } else {
        uncontrollableCount++;
      }
    });

    this.setData({
      items,
      controllableCount,
      uncontrollableCount
    });
  },

  _saveData() {
    const keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_UNCONTROLLABLE, { items: this.data.items });
  },

  _recalcCounts() {
    let controllableCount = 0;
    let uncontrollableCount = 0;
    this.data.items.forEach((item) => {
      if (item.type === 'controllable') {
        controllableCount++;
      } else {
        uncontrollableCount++;
      }
    });
    this.setData({
      controllableCount,
      uncontrollableCount
    });
  },

  onInput(e) {
    const val = e.detail.value;
    this.setData({
      inputText: val,
      canSubmit: !!(val && val.trim())
    });
  },

  addItem() {
    const text = this.data.inputText.trim();
    if (!text) {
      wx.showToast({ title: '请输入焦虑事项', icon: 'none' });
      return;
    }

    const newItem = {
      id: generateId(),
      text,
      type: 'uncontrollable'
    };
    const items = this.data.items.slice();
    items.unshift(newItem);

    this.setData({
      items,
      inputText: '',
      canSubmit: false
    });
    this._recalcCounts();
    this._saveData();
    haptic();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  toggleType(e) {
    const id = e.currentTarget.dataset.id;
    const items = this.data.items.map((item) => {
      if (item.id === id) {
        const newType = item.type === 'controllable' ? 'uncontrollable' : 'controllable';
        return {
          id: item.id,
          text: item.text,
          type: newType
        };
      }
      return item;
    });
    this.setData({ items });
    this._recalcCounts();
    this._saveData();
  },

  // P1-1 修复：删除操作添加二次确认
  deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    // 查找被删除项用于提示
    const targetItem = this.data.items.find((item) => item.id === id);
    const itemName = targetItem && targetItem.text ? targetItem.text : '';

    confirmDelete(itemName, () => {
      const items = this.data.items.filter((item) => item.id !== id);
      this.setData({ items });
      this._recalcCounts();
      this._saveData();
      haptic();
      wx.showToast({ title: '已删除', icon: 'success' });
    });
  }
});

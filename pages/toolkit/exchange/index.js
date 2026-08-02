// pages/toolkit/exchange/index.js
const db = require('../../../utils/db');
const { generateId, formatDate, haptic, confirmDelete } = require('../../../utils/common');

Page({
  data: {
    items: [],
    fromText: '',
    toText: '',
    showAdd: false,
    saving: false,
    canSubmit: false
  },

  // P1-4: 数据加载统一放 onShow
  onShow() {
    this._loadData();
  },

  _loadData() {
    const keys = db.tool.getKeys();
    const saved = db.tool.get(keys.TOOL_EXCHANGE);
    let items = [];
    if (saved && saved.items && Array.isArray(saved.items)) {
      items = saved.items.map((item) => {
        return {
          id: item.id,
          from: item.from,
          to: item.to,
          createdAt: item.createdAt,
          dateStr: formatDate(item.createdAt)
        };
      });
    }
    this.setData({ items });
  },

  _saveData() {
    const keys = db.tool.getKeys();
    const rawItems = this.data.items.map((item) => {
      return {
        id: item.id,
        from: item.from,
        to: item.to,
        createdAt: item.createdAt
      };
    });
    db.tool.save(keys.TOOL_EXCHANGE, { items: rawItems });
  },

  _updateCanSubmit() {
    const canSubmit = !!(this.data.fromText.trim() && this.data.toText.trim());
    this.setData({ canSubmit });
  },

  toggleAdd() {
    this.setData({
      showAdd: !this.data.showAdd,
      fromText: '',
      toText: '',
      canSubmit: false
    });
  },

  onFromInput(e) {
    this.setData({ fromText: e.detail.value });
    this._updateCanSubmit();
  },

  onToInput(e) {
    this.setData({ toText: e.detail.value });
    this._updateCanSubmit();
  },

  addItem() {
    const from = this.data.fromText.trim();
    const to = this.data.toText.trim();

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

    const ts = Date.now();
    const newItem = {
      id: generateId(),
      from,
      to,
      createdAt: ts,
      dateStr: formatDate(ts)
    };
    const items = this.data.items.slice();
    items.unshift(newItem);

    this.setData({
      items,
      fromText: '',
      toText: '',
      showAdd: false,
      saving: false
    });
    this._saveData();
    haptic();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  // P1-1 修复：删除操作添加二次确认
  deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    // 查找被删除项用于提示
    const targetItem = this.data.items.find((item) => item.id === id);
    const itemName = targetItem && targetItem.from && targetItem.to
      ? `${targetItem.from} ↔ ${targetItem.to}`
      : '';

    confirmDelete(itemName, () => {
      const items = this.data.items.filter((item) => item.id !== id);
      this.setData({ items });
      this._saveData();
      // P2-20: haptic() 已在 confirmDelete 中统一调用，此处不再重复
      wx.showToast({ title: '已删除', icon: 'success' });
    });
  }
});

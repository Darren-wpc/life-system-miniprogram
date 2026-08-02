// pages/toolkit/notodo-detail/index.js - 不做清单
const db = require('../../../utils/db');
const { generateId, formatDate, haptic, confirmDelete } = require('../../../utils/common');

Page({
  data: {
    items: [],
    inputText: '',
    inputReason: '',
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
    const saved = db.tool.get(keys.TOOL_NOTODO);
    let items = [];
    if (saved && saved.items && Array.isArray(saved.items)) {
      items = saved.items.map((item) => {
        return {
          id: item.id,
          text: item.text,
          reason: item.reason || '',
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
        text: item.text,
        reason: item.reason,
        createdAt: item.createdAt
      };
    });
    db.tool.save(keys.TOOL_NOTODO, { items: rawItems });
  },

  toggleAdd() {
    this.setData({
      showAdd: !this.data.showAdd,
      inputText: '',
      inputReason: '',
      canSubmit: false
    });
  },

  onTextInput(e) {
    const val = e.detail.value;
    this.setData({
      inputText: val,
      canSubmit: !!(val && val.trim())
    });
  },

  onReasonInput(e) {
    this.setData({ inputReason: e.detail.value });
  },

  addItem() {
    const text = this.data.inputText.trim();
    if (!text) {
      wx.showToast({ title: '请填写不做的事', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    const ts = Date.now();
    const newItem = {
      id: generateId(),
      text,
      reason: this.data.inputReason.trim(),
      createdAt: ts,
      dateStr: formatDate(ts)
    };
    const items = this.data.items.slice();
    items.unshift(newItem);

    this.setData({
      items,
      inputText: '',
      inputReason: '',
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
    // 查找被删除项的文本用于提示
    const targetItem = this.data.items.find((item) => item.id === id);
    const itemName = targetItem && targetItem.text ? targetItem.text : '';

    confirmDelete(itemName, () => {
      // 用户确认删除才执行
      const items = this.data.items.filter((item) => item.id !== id);
      this.setData({ items });
      this._saveData();
      // P2-20: haptic() 已在 confirmDelete 中统一调用，此处不再重复
      wx.showToast({ title: '已删除', icon: 'success' });
    });
  }
});

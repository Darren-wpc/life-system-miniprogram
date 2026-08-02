// pages/toolkit/interrupt/index.js
const db = require('../../../utils/db');

const SECTIONS = [
  { key: 'day1', title: '中断1天恢复脚本', desc: '如果只中断了1天，今天立刻做哪件最小的事回来？' },
  { key: 'day3', title: '中断3天恢复脚本', desc: '如果中断了3天，如何避免自责并重启节奏？' },
  { key: 'week1', title: '中断1周恢复脚本', desc: '如果中断一周时，如何从\'崩塌感\'回到\'没关系\'？' }
];

Page({
  data: {
    sections: SECTIONS,
    form: { day1: '', day3: '', week1: '' },
    filledCount: 0,
    // P1-13: filledKeys 用于 WXML badge 颜色判断
    filledKeys: { day1: false, day3: false, week1: false },
    saving: false
  },

  // P1-4: 数据加载统一放 onShow
  onShow() { this._loadData(); },

  _loadData() {
    const keys = db.tool.getKeys();
    const saved = db.tool.get(keys.TOOL_INTERRUPT);
    const form = { day1: '', day3: '', week1: '' };
    if (saved) {
      if (saved.day1 !== undefined && saved.day1 !== null) form.day1 = saved.day1;
      if (saved.day3 !== undefined && saved.day3 !== null) form.day3 = saved.day3;
      if (saved.week1 !== undefined && saved.week1 !== null) form.week1 = saved.week1;
    }
    let filledCount = 0;
    const filledKeys = { day1: false, day3: false, week1: false };
    if (form.day1 && form.day1.trim()) { filledCount++; filledKeys.day1 = true; }
    if (form.day3 && form.day3.trim()) { filledCount++; filledKeys.day3 = true; }
    if (form.week1 && form.week1.trim()) { filledCount++; filledKeys.week1 = true; }
    this.setData({ form, filledCount, filledKeys });
  },

  _saveData() {
    const keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_INTERRUPT, {
      day1: this.data.form.day1,
      day3: this.data.form.day3,
      week1: this.data.form.week1
    });
  },

  onTextareaInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    this.setData({ [`form.${key}`]: value });
  },

  // P1-2 fix: silent save on blur, no toast (fix UX bug)
  onBlur() {
    let filledCount = 0;
    const filledKeys = { day1: false, day3: false, week1: false };
    const form = this.data.form;
    if (form.day1 && form.day1.trim()) { filledCount++; filledKeys.day1 = true; }
    if (form.day3 && form.day3.trim()) { filledCount++; filledKeys.day3 = true; }
    if (form.week1 && form.week1.trim()) { filledCount++; filledKeys.week1 = true; }
    this.setData({ filledCount, filledKeys });
    this._saveData();
  }
});

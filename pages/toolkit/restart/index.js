// pages/toolkit/restart/index.js
const db = require('../../../utils/db');
const { generateId, haptic, confirmDelete } = require('../../../utils/common');

const DEFAULT_SCENARIOS = [
  { scenario: '健康崩盘', plan: '' },
  { scenario: '经济断流', plan: '' },
  { scenario: '关系断裂', plan: '' }
];

Page({
  data: {
    scripts: [],
    showAdd: false,
    newScenario: '',
    expandedId: null,
    saving: false,
    canSubmit: false
  },

  // P1-4: 数据加载统一放 onShow
  onShow() {
    this._loadData();
  },

  _loadData() {
    const keys = db.tool.getKeys();
    const saved = db.tool.get(keys.TOOL_RESTART);
    let scripts = [];

    if (saved && saved.scripts && Array.isArray(saved.scripts) && saved.scripts.length > 0) {
      scripts = saved.scripts.map((s) => {
        return {
          id: s.id,
          scenario: s.scenario,
          plan: s.plan || '',
          hasPlan: !!(s.plan && s.plan.trim()),
          createdAt: s.createdAt || Date.now()
        };
      });
    } else {
      // P1-6: 首次生成默认场景后立即保存
      scripts = DEFAULT_SCENARIOS.map((s) => {
        return {
          id: generateId(),
          scenario: s.scenario,
          plan: s.plan,
          hasPlan: false,
          createdAt: Date.now()
        };
      });
      this.setData({ scripts });
      this._saveData();
      return;
    }

    this.setData({ scripts });
  },

  _saveData() {
    const keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_RESTART, { scripts: this.data.scripts });
  },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.expandedId === id) {
      this.setData({ expandedId: null });
    } else {
      this.setData({ expandedId: id });
    }
  },

  onPlanInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const scripts = this.data.scripts;
    for (let i = 0; i < scripts.length; i++) {
      if (scripts[i].id === id) {
        scripts[i].plan = value;
        scripts[i].hasPlan = !!(value && value.trim());
        break;
      }
    }
    this.setData({ scripts });
  },

  // P1-2 fix: silent save on blur, no toast (fix UX bug)
  onPlanBlur() {
    this._saveData();
  },

  toggleAdd() {
    this.setData({
      showAdd: !this.data.showAdd,
      newScenario: '',
      canSubmit: false
    });
  },

  onScenarioInput(e) {
    const val = e.detail.value;
    this.setData({
      newScenario: val,
      canSubmit: !!(val && val.trim())
    });
  },

  addScenario() {
    const scenario = this.data.newScenario.trim();
    if (!scenario) {
      wx.showToast({ title: '请填写场景名称', icon: 'none' });
      return;
    }

    const newScript = {
      id: generateId(),
      scenario,
      plan: '',
      hasPlan: false,
      createdAt: Date.now()
    };
    const scripts = this.data.scripts.slice();
    scripts.push(newScript);

    this.setData({
      scripts,
      showAdd: false,
      newScenario: '',
      expandedId: newScript.id
    });
    this._saveData();
    haptic();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  // P1-1 fix: delete confirmation dialog
  deleteScript(e) {
    const id = e.currentTarget.dataset.id;
    const targetScript = this.data.scripts.find((s) => s.id === id);
    const itemName = targetScript && targetScript.scenario ? targetScript.scenario : '';

    confirmDelete(itemName, () => {
      const scripts = this.data.scripts.filter((s) => s.id !== id);
      this.setData({ scripts });
      this._saveData();
      haptic();
      wx.showToast({ title: '已删除', icon: 'success' });
    });
  }
});

// pages/toolkit/restart/index.js
var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

var DEFAULT_SCENARIOS = [
  { scenario: '如果失业', plan: '' },
  { scenario: '如果关系破裂', plan: '' },
  { scenario: '如果家人重病', plan: '' }
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

  onLoad: function () {
    this._loadData();
  },

  onShow: function () {
    this._loadData();
  },

  _loadData: function () {
    var keys = db.tool.getKeys();
    var saved = db.tool.get(keys.TOOL_RESTART);
    var scripts = [];

    if (saved && saved.scripts && Array.isArray(saved.scripts) && saved.scripts.length > 0) {
      scripts = saved.scripts.map(function (s) {
        return {
          id: s.id,
          scenario: s.scenario,
          plan: s.plan || '',
          hasPlan: !!(s.plan && s.plan.trim()),
          createdAt: s.createdAt || Date.now()
        };
      });
    } else {
      // 首次加载，预填充默认场景
      scripts = DEFAULT_SCENARIOS.map(function (s) {
        return {
          id: generateId(),
          scenario: s.scenario,
          plan: s.plan,
          hasPlan: false,
          createdAt: Date.now()
        };
      });
    }

    this.setData({ scripts: scripts });
  },

  _saveData: function () {
    var keys = db.tool.getKeys();
    db.tool.save(keys.TOOL_RESTART, { scripts: this.data.scripts });
  },

  toggleExpand: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.expandedId === id) {
      this.setData({ expandedId: null });
    } else {
      this.setData({ expandedId: id });
    }
  },

  onPlanInput: function (e) {
    var id = e.currentTarget.dataset.id;
    var value = e.detail.value;
    var scripts = this.data.scripts;
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].id === id) {
        scripts[i].plan = value;
        scripts[i].hasPlan = !!(value && value.trim());
        break;
      }
    }
    this.setData({ scripts: scripts });
  },

  onPlanBlur: function () {
    this._saveData();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  toggleAdd: function () {
    this.setData({
      showAdd: !this.data.showAdd,
      newScenario: '',
      canSubmit: false
    });
  },

  onScenarioInput: function (e) {
    var val = e.detail.value;
    this.setData({
      newScenario: val,
      canSubmit: !!(val && val.trim())
    });
  },

  addScenario: function () {
    var scenario = this.data.newScenario.trim();
    if (!scenario) {
      wx.showToast({ title: '请输入场景名称', icon: 'none' });
      return;
    }

    var newScript = {
      id: generateId(),
      scenario: scenario,
      plan: '',
      hasPlan: false,
      createdAt: Date.now()
    };
    var scripts = this.data.scripts.slice();
    scripts.push(newScript);

    this.setData({
      scripts: scripts,
      showAdd: false,
      newScenario: '',
      expandedId: newScript.id
    });
    this._saveData();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  deleteScript: function (e) {
    var id = e.currentTarget.dataset.id;
    var scripts = this.data.scripts.filter(function (s) {
      return s.id !== id;
    });
    var expandedId = this.data.expandedId;
    if (expandedId === id) {
      expandedId = null;
    }
    this.setData({
      scripts: scripts,
      expandedId: expandedId
    });
    this._saveData();
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});

// pages/assess/resources/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');
const diagnosis = require('../../../utils/diagnosis');

// 七类资源的核心指标定义
const RESOURCE_METRICS = {
  money: [
    { key: 'savings', name: '储蓄（月支出倍数）', placeholder: '如：6' },
    { key: 'income', name: '月收入（元）', placeholder: '如：15000' },
    { key: 'expense', name: '月支出（元）', placeholder: '如：10000' }
  ],
  time: [
    { key: 'freeHours', name: '每日可支配时间（小时）', placeholder: '如：4' },
    { key: 'deepWork', name: '深度工作时长（小时/周）', placeholder: '如：20' },
    { key: 'restDays', name: '完整休息天数/月', placeholder: '如：4' }
  ],
  health: [
    { key: 'sleepHours', name: '平均睡眠时长（小时）', placeholder: '如：7' },
    { key: 'exerciseFreq', name: '运动次数/周', placeholder: '如：3' },
    { key: 'energyLevel', name: '日均精力自评（1-5）', placeholder: '如：3' }
  ],
  relationship: [
    { key: 'closeCount', name: '亲密关系人数', placeholder: '如：3' }
  ],
  capability: [
    { key: 'coreSkills', name: '核心技能数量', placeholder: '如：5' },
    { key: 'learningHours', name: '学习时长（小时/周）', placeholder: '如：10' },
    { key: 'certCount', name: '资质/证书数量', placeholder: '如：2' }
  ],
  info: [
    { key: 'infoChannels', name: '高质量信息源数量', placeholder: '如：8' },
    { key: 'decisionQuality', name: '决策质量自评（1-5）', placeholder: '如：3' }
  ],
  psychology: [
    { key: 'selfAccept', name: '自我接纳度（1-5）', placeholder: '如：3' },
    { key: 'meaningLevel', name: '意义感（1-5）', placeholder: '如：3' },
    { key: 'stressLevel', name: '压力水平（1-5，5最高）', placeholder: '如：3' }
  ]
};

// L1-L4 层级
const LEVEL_KEYS = ['L1', 'L2', 'L3', 'L4'];

// 资源健康判定阈值
const HEALTH_THRESHOLDS = {
  money: { green: [6, 999], yellow: [3, 5.9], red: [0, 2.9] },
  time: { green: [4, 999], yellow: [2, 3.9], red: [0, 1.9] },
  health: { green: [4, 999], yellow: [2, 3.9], red: [0, 1.9] },
  relationship: { green: [3, 999], yellow: [1, 2], red: [0, 0.9] },
  capability: { green: [4, 999], yellow: [2, 3.9], red: [0, 1.9] },
  info: { green: [4, 999], yellow: [2, 3.9], red: [0, 1.9] },
  psychology: { green: [4, 999], yellow: [2, 3.9], red: [0, 1.9] }
};

function getHealthStatus(resourceKey, metrics) {
  const metricDefs = RESOURCE_METRICS[resourceKey] || [];
  if (!metricDefs.length || !metrics) return 'yellow';

  // 计算核心指标的综合分
  let totalScore = 0;
  let count = 0;
  metricDefs.forEach(m => {
    const val = metrics[m.key];
    if (val !== undefined && val !== null && val !== '') {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        // 归一化到 0-5 分（粗略映射）
        if (resourceKey === 'money') {
          totalScore += Math.min(5, num / 3);
        } else if (resourceKey === 'time') {
          totalScore += Math.min(5, num);
        } else {
          totalScore += Math.min(5, num);
        }
        count++;
      }
    }
  });

  if (count === 0) return 'yellow';

  const avgScore = totalScore / count;
  if (avgScore >= 3.5) return 'green';
  if (avgScore >= 2) return 'yellow';
  return 'red';
}

Page({
  data: {
    resources: [],
    healthSummary: { green: 0, yellow: 0, red: 0 },
    expandedKeys: {},
    metricsData: {},
    relLevels: {},
    relationshipExpanded: false,
    saving: false
  },

  onLoad() {
    this._loadData();
  },

  onShow() {
    this._loadData();
  },

  _loadData() {
    const resourceKeys = ['money', 'time', 'health', 'relationship', 'capability', 'info', 'psychology'];
    const resources = resourceKeys.map(key => {
      const res = constants.RESOURCE_TYPES[key];
      return { key, name: res.name, icon: res.icon, metrics: RESOURCE_METRICS[key] || [] };
    });

    const metricsData = {};
    const relLevels = {};
    resourceKeys.forEach(key => {
      metricsData[key] = {};
      (RESOURCE_METRICS[key] || []).forEach(m => {
        metricsData[key][m.key] = '';
      });
    });

    LEVEL_KEYS.forEach(level => {
      relLevels[level] = { names: [] };
    });

    // 加载已保存数据
    const saved = db.resources.get();
    if (saved && saved.metrics) {
      Object.keys(saved.metrics).forEach(rKey => {
        if (saved.metrics[rKey]) {
          Object.keys(saved.metrics[rKey]).forEach(mKey => {
            if (metricsData[rKey]) {
              metricsData[rKey][mKey] = saved.metrics[rKey][mKey];
            }
          });
        }
      });
    }

    if (saved && saved.relLevels) {
      Object.keys(saved.relLevels).forEach(level => {
        relLevels[level] = saved.relLevels[level];
      });
    }

    // 计算健康状态
    const healthSummary = { green: 0, yellow: 0, red: 0 };
    resourceKeys.forEach(key => {
      const status = getHealthStatus(key, metricsData[key]);
      healthSummary[status]++;
      const idx = resources.findIndex(r => r.key === key);
      if (idx >= 0) resources[idx].status = status;
    });

    const expandedKeys = {};
    if (saved && saved.expandedKeys) {
      Object.assign(expandedKeys, saved.expandedKeys);
    }

    this.setData({
      resources,
      healthSummary,
      expandedKeys,
      metricsData,
      relLevels,
      relationshipExpanded: !!(expandedKeys && expandedKeys['relationship'])
    });
  },

  _recalcHealth() {
    const { resources, metricsData } = this.data;
    const healthSummary = { green: 0, yellow: 0, red: 0 };
    resources.forEach(res => {
      const status = getHealthStatus(res.key, metricsData[res.key]);
      healthSummary[status]++;
      res.status = status;
    });
    this.setData({ resources, healthSummary });
  },

  toggleExpand(e) {
    const key = e.currentTarget.dataset.key;
    const expanded = { ...this.data.expandedKeys };
    expanded[key] = !expanded[key];
    this.setData({ expandedKeys: expanded });

    if (key === 'relationship') {
      this.setData({ relationshipExpanded: !!expanded[key] });
    }
  },

  onMetricInput(e) {
    const { resourceKey, metricKey } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`metricsData.${resourceKey}.${metricKey}`]: value
    });
    this._recalcHealth();
  },

  toggleRelationship() {
    this.setData({
      relationshipExpanded: !this.data.relationshipExpanded,
      'expandedKeys.relationship': !this.data.relationshipExpanded
    });
  },

  onRelNameInput(e) {
    const level = e.currentTarget.dataset.level;
    const index = e.currentTarget.dataset.index;
    const name = e.detail.value;
    const relLevels = { ...this.data.relLevels };
    if (!relLevels[level]) relLevels[level] = { names: [] };
    while (relLevels[level].names.length <= index) {
      relLevels[level].names.push('');
    }
    relLevels[level].names[index] = name;
    this.setData({ relLevels });
  },

  addRelItem(e) {
    const level = e.currentTarget.dataset.level;
    const relLevels = { ...this.data.relLevels };
    if (!relLevels[level]) relLevels[level] = { names: [] };
    relLevels[level].names.push('');
    this.setData({ relLevels });
  },

  removeRelItem(e) {
    const level = e.currentTarget.dataset.level;
    const index = e.currentTarget.dataset.index;
    const relLevels = { ...this.data.relLevels };
    if (relLevels[level] && relLevels[level].names) {
      relLevels[level].names.splice(index, 1);
    }
    this.setData({ relLevels });
  },

  _buildSaveData() {
    return {
      metrics: this.data.metricsData,
      relLevels: this.data.relLevels,
      expandedKeys: this.data.expandedKeys
    };
  },

  onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    try {
      db.resources.save(this._buildSaveData());
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      console.error('resources save error:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});

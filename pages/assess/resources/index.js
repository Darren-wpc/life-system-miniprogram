// pages/assess/resources/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');
const { haptic, confirmDelete } = require('../../../utils/common');

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

// P3-7: 资源转化下拉选项键
const RESOURCE_KEYS = ['money', 'time', 'health', 'relationship', 'capability', 'info', 'psychology'];

// P1-9: 反向指标（值越低越好），归一化时需反转 1-5 量纲
const INVERTED_METRICS = ['stressLevel'];

// 金钱资源指标独立归一化（量纲不同，不能混用同一公式）
function _normalizeMoneyMetric(metricKey, num) {
  switch (metricKey) {
    case 'savings':  // 储蓄（月支出倍数），6个月=满分
      return Math.max(0, Math.min(5, (num / 6) * 5));
    case 'income':   // 月收入（元），15000=满分
      return Math.max(0, Math.min(5, (num / 15000) * 5));
    case 'expense':  // 月支出（元），越低越好：≤3000=满分，≥15000=零分
      if (num <= 3000) return 5;
      if (num >= 15000) return 0;
      return 5 - ((num - 3000) / (15000 - 3000)) * 5;
    default:
      return Math.max(0, Math.min(5, num));
  }
}

function getHealthStatus(resourceKey, metrics, relLevels) {
  const metricDefs = RESOURCE_METRICS[resourceKey] || [];
  if (!metricDefs.length && resourceKey !== 'relationship') return 'yellow';
  if (!metrics && !relLevels) return 'yellow';

  // P1-12: relationship 特殊处理 — 基于 L1-L4 关系层级计算健康状态
  if (resourceKey === 'relationship') {
    if (!relLevels) return 'yellow';
    // L1(浅社交)=1分, L2(同事/熟人)=2分, L3(朋友)=3分, L4(亲密关系)=5分
    const levelWeights = { L1: 1, L2: 2, L3: 3, L4: 5 };
    let totalScore = 0;
    let count = 0;
    LEVEL_KEYS.forEach(level => {
      const levelData = relLevels[level];
      if (levelData && levelData.names) {
        const validNames = levelData.names.filter(n => n && n.trim());
        if (validNames.length > 0) {
          const weight = levelWeights[level] || 0;
          // 每层至少1人即得分，多人有递减效益（对数缩放）
          const score = Math.min(5, weight * (1 + Math.log(validNames.length)));
          totalScore += score;
          count++;
        }
      }
    });
    // 同时考虑 closeCount 指标（如果用户填了）
    if (metrics && metrics.closeCount !== undefined && metrics.closeCount !== null && metrics.closeCount !== '') {
      const num = parseFloat(metrics.closeCount);
      if (!isNaN(num)) {
        totalScore += Math.min(5, num * (5 / 3)); // 3人=满分
        count++;
      }
    }
    if (count === 0) return 'yellow';
    const avgScore = totalScore / count;
    if (avgScore >= constants.HEALTH_THRESHOLDS.RESOURCE_GREEN) return 'green';
    if (avgScore >= constants.HEALTH_THRESHOLDS.RESOURCE_YELLOW) return 'yellow';
    return 'red';
  }

  // 计算核心指标的综合分
  let totalScore = 0;
  let count = 0;
  metricDefs.forEach(m => {
    const val = metrics[m.key];
    if (val !== undefined && val !== null && val !== '') {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        // 归一化到 0-5 分
        if (resourceKey === 'money') {
          totalScore += _normalizeMoneyMetric(m.key, num);
        } else if (INVERTED_METRICS.indexOf(m.key) >= 0) {
          // P1-11: 反向指标（值越低越好，如压力水平），反转 1-5 量纲：1→5满分, 5→1最低分
          totalScore += Math.max(0, Math.min(5, 6 - num));
        } else {
          totalScore += Math.min(5, num);
        }
        count++;
      }
    }
  });

  if (count === 0) return 'yellow';

  const avgScore = totalScore / count;
  // P2-17: 使用 HEALTH_THRESHOLDS 常量替代硬编码阈值
  if (avgScore >= constants.HEALTH_THRESHOLDS.RESOURCE_GREEN) return 'green';
  if (avgScore >= constants.HEALTH_THRESHOLDS.RESOURCE_YELLOW) return 'yellow';
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
    saving: false,
    // P3-7: 资源转化追踪
    transforms: [],
    transformOptions: [],
    showTransform: false,
    transformFrom: '',
    transformTo: '',
    transformAmount: '',
    transformNote: ''
  },

  // P1-4: 数据加载统一放 onShow
  onShow() {
    this._loadData();
  },

  // P2-19: 页面卸载时清除 debounce 定时器，防止内存泄漏
  onUnload() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
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
      const status = getHealthStatus(key, metricsData[key], relLevels);
      healthSummary[status]++;
      const idx = resources.findIndex(r => r.key === key);
      if (idx >= 0) resources[idx].status = status;
    });

    const expandedKeys = {};
    if (saved && saved.expandedKeys) {
      Object.assign(expandedKeys, saved.expandedKeys);
    }

    // P3-7: 构建转化选项（key/name/icon）
    const transformOptions = RESOURCE_KEYS.map(key => {
      const res = constants.RESOURCE_TYPES[key];
      return { key, name: res.name, icon: res.icon };
    });

    this.setData({
      resources,
      healthSummary,
      expandedKeys,
      metricsData,
      relLevels,
      relationshipExpanded: !!(expandedKeys && expandedKeys['relationship']),
      transformOptions
    });

    this._loadTransforms();
  },

  // P3-7: 加载资源转化记录并映射为展示对象
  _loadTransforms() {
    const list = db.transform.getAll();
    const transforms = list.map(r => {
      const fromType = constants.RESOURCE_TYPES[r.from] || null;
      const toType = constants.RESOURCE_TYPES[r.to] || null;
      return {
        id: r.id,
        date: r.date,
        from: r.from,
        to: r.to,
        fromName: fromType ? fromType.name : r.from,
        toName: toType ? toType.name : r.to,
        amount: r.amount,
        note: r.note || ''
      };
    });
    this.setData({ transforms });
  },

  _recalcHealth() {
    const { resources, metricsData, relLevels } = this.data;
    const healthSummary = { green: 0, yellow: 0, red: 0 };
    resources.forEach(res => {
      const status = getHealthStatus(res.key, metricsData[res.key], relLevels);
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
    // P2-19: 每次输入只更新输入值，不立即重算健康
    this.setData({
      [`metricsData.${resourceKey}.${metricKey}`]: value
    });
    // P2-19: debounce 300ms 后再执行健康重算，避免每次按键都全量重算
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._recalcHealth();
      this._debounceTimer = null;
    }, 300);
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
  },

  // ===== P3-7: 资源转化追踪 =====
  toggleTransform() {
    haptic();
    this.setData({ showTransform: !this.data.showTransform });
  },

  onTransformFromInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ transformFrom: key });
  },

  onTransformToInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ transformTo: key });
  },

  onTransformAmountInput(e) {
    this.setData({ transformAmount: e.detail.value });
  },

  onTransformNoteInput(e) {
    this.setData({ transformNote: e.detail.value });
  },

  addTransform() {
    const { transformFrom, transformTo, transformAmount, transformNote } = this.data;
    if (!transformFrom) {
      wx.showToast({ title: '请选择消耗的资源', icon: 'none' });
      return;
    }
    if (!transformTo) {
      wx.showToast({ title: '请选择获得的资源', icon: 'none' });
      return;
    }
    if (transformFrom === transformTo) {
      wx.showToast({ title: '来源与目标不能相同', icon: 'none' });
      return;
    }
    if (!transformAmount || !transformAmount.trim()) {
      wx.showToast({ title: '请输入转化数量/描述', icon: 'none' });
      return;
    }

    db.transform.save({
      from: transformFrom,
      to: transformTo,
      amount: transformAmount.trim(),
      note: (transformNote || '').trim()
    });

    haptic();
    this.setData({
      transformFrom: '',
      transformTo: '',
      transformAmount: '',
      transformNote: '',
      showTransform: false
    });
    this._loadTransforms();
    wx.showToast({ title: '已记录转化', icon: 'success' });
  },

  deleteTransform(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.transforms.find(t => t.id === id);
    const name = item ? `${item.fromName} → ${item.toName}` : '';
    confirmDelete(name, () => {
      db.transform.remove(id);
      this._loadTransforms();
      wx.showToast({ title: '已删除', icon: 'none' });
    });
  }
});

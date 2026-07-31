// utils/diagnosis.js - 诊断算法

const { DIMENSIONS, DIM_KEYS, DIM_CORRELATION, FACTOR_KEYS } = require('./constants');

// 维度 key → 中文名（兜底返回 key 本身）
const dimName = (key) => (DIMENSIONS[key] && DIMENSIONS[key].name) || key;

// 崩溃点：分数<=2 或连续两周下降
function findCollapsePoints(current, previous) {
  const results = [];
  if (!current) return results;

  DIM_KEYS.forEach(key => {
    const score = current[key];
    if (score <= 2) {
      results.push({ key, reason: 'current_low', score });
    } else if (previous && previous[key] > score) {
      results.push({ key, reason: 'declining', score, prev: previous[key] });
    }
  });
  return results;
}

// 杠杆点：改善该维度对其他维度的带动效应最大
function findLeveragePoint(current) {
  if (!current) return null;

  let maxScore = 0;
  let leverageKey = null;

  DIM_KEYS.forEach(key => {
    const correlation = DIM_CORRELATION[key] || {};
    let totalImpact = 0;
    // 改善低分维度获得的带动更大
    DIM_KEYS.forEach(otherKey => {
      if (key === otherKey) return;
      const gap = 5 - (current[otherKey] || 1);
      totalImpact += (correlation[otherKey] || 0) * gap;
    });
    if (totalImpact > maxScore) {
      maxScore = totalImpact;
      leverageKey = key;
    }
  });

  return leverageKey ? { key: leverageKey, impactScore: maxScore } : null;
}

// 失衡点：某维度分数-最低维度分数>=2，且最低维度连续两周未改善
function findImbalancePoints(current, previous) {
  if (!current) return [];

  const scores = DIM_KEYS.map(k => ({ key: k, score: current[k] || 0 }));
  scores.sort((a, b) => a.score - b.score);
  const minScore = scores[0].score;
  const minKey = scores[0].key;

  return scores.filter(s => {
    if (s.key === minKey) return false;
    return (s.score - minScore) >= 2;
  }).map(s => ({ key: s.key, score: s.score, gap: s.score - minScore }));
}

// 五因子瓶颈识别
function findBottleneckFactor(factors) {
  if (!factors) return null;

  let min = 1;
  let minKey = null;
  FACTOR_KEYS.forEach(key => {
    const val = factors[key];
    if (val < min) {
      min = val;
      minKey = key;
    }
  });

  return minKey;
}

// 计算五因子乘积
function calcProduct(factors) {
  if (!factors) return 0;
  return FACTOR_KEYS.reduce((product, key) => product * (factors[key] || 0), 1);
}

// 瓶颈提升预测
function predictImprovement(factors, targetValue) {
  const bottleneck = findBottleneckFactor(factors);
  if (!bottleneck) return null;

  const currentProduct = calcProduct(factors);
  const boostedFactors = { ...factors, [bottleneck]: targetValue };
  const boostedProduct = calcProduct(boostedFactors);

  return {
    bottleneck,
    currentValue: factors[bottleneck],
    targetValue,
    currentProduct,
    boostedProduct,
    multiplier: currentProduct > 0 ? boostedProduct / currentProduct : 0
  };
}

// 生成洞察文案
function generateInsights(current, previous) {
  const insights = [];

  const collapses = findCollapsePoints(current, previous);
  if (collapses.length > 0) {
    const names = collapses.map(c => dimName(c.key)).join('、');
    insights.push({
      type: 'danger',
      title: '崩溃点提醒',
      text: names + '需要关注，可能拖垮整个生活系统'
    });
  }

  // 仅当存在改善空间时才显示杠杆点（至少有一个维度低于4分）
  const hasLowScore = current && DIM_KEYS.some(k => (current[k] || 0) < 4);
  const leverage = hasLowScore ? findLeveragePoint(current) : null;
  if (leverage) {
    insights.push({
      type: 'info',
      title: '杠杆点',
      text: '改善「' + dimName(leverage.key) + '」对整体提升效应最大'
    });
  }

  const imbalances = findImbalancePoints(current, previous);
  if (imbalances.length > 0) {
    insights.push({
      type: 'warning',
      title: '失衡点',
      text: dimName(imbalances[0].key) + '过强（' + imbalances[0].score + '分），可能压垮其他维度'
    });
  }

  if (insights.length === 0 && current) {
    insights.push({
      type: 'success',
      title: '系统平稳',
      text: '当前生活系统结构较为健康，继续保持'
    });
  }

  return insights;
}

// 综合健康度（六维平均分）
function calcOverallHealth(current) {
  if (!current) return 0;
  const sum = DIM_KEYS.reduce((s, k) => s + (current[k] || 0), 0);
  return (sum / DIM_KEYS.length).toFixed(1);
}

// 状态判定
function getStatus(score) {
  if (score >= 4) return 'green';
  if (score >= 2) return 'yellow';
  return 'red';
}

module.exports = {
  findCollapsePoints,
  findLeveragePoint,
  findImbalancePoints,
  findBottleneckFactor,
  calcProduct,
  predictImprovement,
  generateInsights,
  calcOverallHealth,
  getStatus
};

// utils/diagnosis.js - 诊断算法

const constants = require('./constants');
const { DIMENSIONS, DIM_KEYS, DIM_CORRELATION, FACTOR_KEYS } = constants;

// 维度 key → 中文名（兜底返回 key 本身）
const dimName = (key) => {
  return (DIMENSIONS[key] && DIMENSIONS[key].name) || key;
};

// 崩溃点：分数<=2 或连续两周下降
const findCollapsePoints = (current, previous) => {
  const results = [];
  if (!current) return results;

  DIM_KEYS.forEach((key) => {
    const score = current[key];
    // P1-17: 跳过 null/undefined 评分，避免 null<=2 误判为崩溃点
    if (score === null || score === undefined || isNaN(score)) return;
    if (score <= 2) {
      results.push({ key, reason: 'current_low', score });
    } else if (previous && previous[key] !== undefined && previous[key] !== null && previous[key] > score) {
      results.push({ key, reason: 'declining', score, prev: previous[key] });
    }
  });
  return results;
};

// 杠杆点：改善该维度对其他维度的带动效应最大
const findLeveragePoint = (current) => {
  if (!current) return null;

  let maxScore = 0;
  let leverageKey = null;

  DIM_KEYS.forEach((key) => {
    const correlation = DIM_CORRELATION[key] || {};
    let totalImpact = 0;
    // 改善低分维度获得的带动更大
    DIM_KEYS.forEach((otherKey) => {
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
};

// 失衡点：某维度分数-最低维度分数>=2，且最低维度连续两周未改善
const findImbalancePoints = (current, previous) => {
  if (!current) return [];

  // P1-17: 过滤掉 null/undefined 评分，不当作 0 分
  const scores = DIM_KEYS
    .filter((k) => current[k] !== null && current[k] !== undefined && !isNaN(current[k]))
    .map((k) => ({ key: k, score: current[k] }));
  if (scores.length === 0) return [];
  scores.sort((a, b) => a.score - b.score);
  const minScore = scores[0].score;
  const minKey = scores[0].key;

  return scores.filter((s) => {
    if (s.key === minKey) return false;
    return (s.score - minScore) >= 2;
  }).map((s) => ({ key: s.key, score: s.score, gap: s.score - minScore }));
};

// 五因子瓶颈识别
const findBottleneckFactor = (factors) => {
  if (!factors) return null;

  let min = 1;
  let minKey = null;
  FACTOR_KEYS.forEach((key) => {
    const val = factors[key];
    if (val < min) {
      min = val;
      minKey = key;
    }
  });

  return minKey;
};

// 计算五因子乘积
const calcProduct = (factors) => {
  if (!factors) return 0;
  return FACTOR_KEYS.reduce((product, key) => product * (factors[key] || 0), 1);
};

// 瓶颈提升预测
const predictImprovement = (factors, targetValue) => {
  const bottleneck = findBottleneckFactor(factors);
  if (!bottleneck) return null;

  const currentProduct = calcProduct(factors);
  const boostedFactors = Object.assign({}, factors);
  boostedFactors[bottleneck] = targetValue;
  const boostedProduct = calcProduct(boostedFactors);

  return {
    bottleneck,
    currentValue: factors[bottleneck],
    targetValue,
    currentProduct,
    boostedProduct,
    multiplier: currentProduct > 0 ? boostedProduct / currentProduct : 0
  };
};

// 生成洞察文案
const generateInsights = (current, previous) => {
  const insights = [];

  const collapses = findCollapsePoints(current, previous);
  if (collapses.length > 0) {
    const names = collapses.map((c) => dimName(c.key)).join('、');
    insights.push({
      type: 'danger',
      title: '崩溃点提醒',
      text: `${names}需要关注，可能拖垮整个生活系统`
    });
  }

  // 仅当存在改善空间时才显示杠杆点（至少有一个维度低于4分）
  const hasLowScore = current && DIM_KEYS.some((k) => (current[k] || 0) < 4);
  const leverage = hasLowScore ? findLeveragePoint(current) : null;
  if (leverage) {
    insights.push({
      type: 'info',
      title: '杠杆点',
      text: `改善「${dimName(leverage.key)}」对整体提升效应最大`
    });
  }

  const imbalances = findImbalancePoints(current, previous);
  if (imbalances.length > 0) {
    insights.push({
      type: 'warning',
      title: '失衡点',
      text: `${dimName(imbalances[0].key)}过强（${imbalances[0].score}分），可能压垮其他维度`
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
};

// 综合健康度（六维平均分）
const calcOverallHealth = (current) => {
  if (!current) return 0;
  const sum = DIM_KEYS.reduce((s, k) => s + (current[k] || 0), 0);
  return (sum / DIM_KEYS.length).toFixed(1);
};

// 状态判定
const getStatus = (score) => {
  if (score >= 4) return 'green';
  if (score >= 2) return 'yellow';
  return 'red';
};

// ===== F7: 智能洞察增强 - 模式识别 =====

/**
 * 检测周期性模式
 * 例如：某个维度总是在每周三下降
 * @param {Array} weeklyData - 周评数据（newest-first）
 * @returns {Array} 检测到的模式列表
 */
const detectPeriodicPattern = (weeklyData) => {
  const patterns = [];
  if (!weeklyData || weeklyData.length < 4) return patterns;

  // 反转为时间正序
  const data = weeklyData.slice().reverse();

  DIM_KEYS.forEach(key => {
    // 检查每个维度是否有周期性下降
    const scores = data.map(r => r[key]).filter(s => s !== undefined && s !== null);
    if (scores.length < 4) return;

    // 检测震荡模式：连续上升后下降，或交替升降
    let upCount = 0;
    let downCount = 0;
    let alternating = 0;
    const diffs = [];

    for (let i = 1; i < scores.length; i++) {
      const diff = scores[i] - scores[i - 1];
      diffs.push(diff);
      if (diff > 0) upCount++;
      else if (diff < 0) downCount++;

      // 检测交替模式（上-下-上-下）
      if (i >= 2) {
        const prevDiff = diffs[diffs.length - 2];
        if ((prevDiff > 0 && diff < 0) || (prevDiff < 0 && diff > 0)) {
          alternating++;
        }
      }
    }

    // 交替模式超过 2 次且占比高
    if (alternating >= 2 && alternating / diffs.length > 0.5) {
      patterns.push({
        type: 'alternating',
        dimension: key,
        description: `「${dimName(key)}」呈现震荡模式，升降交替频繁，可能是过度补偿或周期性波动`
      });
    }

    // 持续下降模式
    let declineStreak = 0;
    let maxDecline = 0;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i] < 0) {
        declineStreak++;
        maxDecline = Math.max(maxDecline, declineStreak);
      } else {
        break;
      }
    }
    if (maxDecline >= 3) {
      patterns.push({
        type: 'sustained_decline',
        dimension: key,
        description: `「${dimName(key)}」已连续 ${maxDecline} 周下降，趋势需警惕`
      });
    }
  });

  return patterns;
};

/**
 * 检测过度补偿模式
 * 连续改善后必然反弹（先连续上升 2+ 周，随后下降）
 * @param {Array} weeklyData - 周评数据（newest-first）
 * @returns {Array} 过度补偿模式列表
 */
const detectOvercompensation = (weeklyData) => {
  const patterns = [];
  if (!weeklyData || weeklyData.length < 4) return patterns;

  const data = weeklyData.slice().reverse(); // oldest-first

  DIM_KEYS.forEach(key => {
    const scores = data.map(r => r[key]).filter(s => s !== undefined && s !== null);
    if (scores.length < 4) return;

    // 寻找 "连续上升 2+ 周后下降" 的模式
    for (let i = 2; i < scores.length; i++) {
      let consecutiveUp = 0;
      for (let j = i; j > 0; j--) {
        if (scores[j] > scores[j - 1]) {
          consecutiveUp++;
        } else {
          break;
        }
      }

      // 连续上升 2+ 周后，当前周下降
      if (consecutiveUp >= 2 && i + 1 < scores.length && scores[i + 1] < scores[i]) {
        const peakScore = scores[i];
        const dropScore = scores[i + 1];
        const dropAmount = peakScore - dropScore;

        if (dropAmount >= 1) {
          patterns.push({
            type: 'overcompensation',
            dimension: key,
            description: `「${dimName(key)}」在连续上升 ${consecutiveUp} 周后回落 ${dropAmount} 分，可能存在过度补偿——改善过快导致反弹`
          });
          break; // 每个维度只报告一次
        }
      }
    }
  });

  return patterns;
};

/**
 * 检测跨维度滞后关联
 * 例如：改善 innerOrder 后 relationship 在 1-2 周后改善
 * @param {Array} weeklyData - 周评数据（newest-first）
 * @returns {Array} 关联模式列表
 */
const detectCrossDimensionLag = (weeklyData) => {
  const patterns = [];
  if (!weeklyData || weeklyData.length < 5) return patterns;

  const data = weeklyData.slice().reverse(); // oldest-first

  DIM_KEYS.forEach(fromKey => {
    DIM_KEYS.forEach(toKey => {
      if (fromKey === toKey) return;

      // 检测 fromKey 上升后 1-2 周 toKey 也上升
      for (let lag = 1; lag <= 2; lag++) {
        let matchedCount = 0;
        let totalCount = 0;

        for (let i = 0; i < data.length - lag - 1; i++) {
          const fromScore = data[i][fromKey];
          const nextFromScore = data[i + 1][fromKey];
          const toScore = data[i + lag][toKey];
          const nextToScore = data[i + lag + 1] ? data[i + lag + 1][toKey] : undefined;

          if (fromScore === undefined || fromScore === null) continue;
          if (nextFromScore === undefined || nextFromScore === null) continue;
          if (toScore === undefined || toScore === null) continue;
          if (nextToScore === undefined || nextToScore === null) continue;

          const fromDelta = nextFromScore - fromScore;
          const toDelta = nextToScore - toScore;

          totalCount++;

          // fromKey 上升时，toKey 也上升
          if (fromDelta > 0 && toDelta > 0) {
            matchedCount++;
          }
        }

        // 如果有足够多的匹配且占比高
        if (totalCount >= 3 && matchedCount / totalCount >= 0.6) {
          patterns.push({
            type: 'cross_dimension_lag',
            from: fromKey,
            to: toKey,
            lag,
            matchRate: Math.round(matchedCount / totalCount * 100),
            description: `改善「${dimName(fromKey)}」后约 ${lag} 周，「${dimName(toKey)}」也会跟着改善（匹配率 ${Math.round(matchedCount / totalCount * 100)}%）`
          });
        }
      }
    });
  });

  // 只返回最强的关联（去重，每个 fromKey 只保留最强的 toKey）
  const bestByFrom = {};
  patterns.forEach(p => {
    if (!bestByFrom[p.from] || p.matchRate > bestByFrom[p.from].matchRate) {
      bestByFrom[p.from] = p;
    }
  });

  return Object.values(bestByFrom).slice(0, 3); // 最多返回 3 个
};

/**
 * 生成增强洞察（在原有规则引擎基础上增加模式识别）
 * @param {Object} current - 当前周评分
 * @param {Object} previous - 上周评分
 * @param {Array} weeklyHistory - 周评历史（newest-first）
 * @returns {Array} 增强洞察列表
 */
const generateEnhancedInsights = (current, previous, weeklyHistory) => {
  const insights = generateInsights(current, previous);

  // 如果有足够历史数据，进行模式检测
  if (weeklyHistory && weeklyHistory.length >= 4) {
    // 周期性模式
    const periodicPatterns = detectPeriodicPattern(weeklyHistory);
    periodicPatterns.forEach(p => {
      insights.push({
        type: p.type === 'sustained_decline' ? 'warning' : 'info',
        title: '趋势模式',
        text: p.description
      });
    });

    // 过度补偿模式
    const overcompensations = detectOvercompensation(weeklyHistory);
    overcompensations.forEach(p => {
      insights.push({
        type: 'warning',
        title: '过度补偿',
        text: p.description
      });
    });

    // 跨维度滞后关联
    const lagPatterns = detectCrossDimensionLag(weeklyHistory);
    lagPatterns.forEach(p => {
      insights.push({
        type: 'info',
        title: '维度关联',
        text: p.description
      });
    });
  }

  // 限制洞察数量，避免信息过载
  return insights.slice(0, 8);
};

module.exports = {
  findCollapsePoints,
  findLeveragePoint,
  findImbalancePoints,
  findBottleneckFactor,
  calcProduct,
  predictImprovement,
  generateInsights,
  calcOverallHealth,
  getStatus,
  // F7: 模式识别
  detectPeriodicPattern,
  detectOvercompensation,
  detectCrossDimensionLag,
  generateEnhancedInsights
};

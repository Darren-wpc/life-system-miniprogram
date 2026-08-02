// utils/correlation.js - F11: 维度关联推荐引擎
// 基于用户历史数据动态学习维度间实际相关性，生成个性化改善路径推荐

const { DIMENSIONS, DIM_KEYS, DIM_CORRELATION } = require('./constants');

/**
 * 分析历史数据，计算维度间的实际相关性
 * @param {Array} weeklyData - 周评数据（newest-first）
 * @returns {Object} 相关性矩阵 { from: { to: { correlation, lag, confidence } } }
 */
function analyzeCorrelations(weeklyData) {
  if (!weeklyData || weeklyData.length < 4) {
    return { correlations: {}, recommendation: '数据量不足，至少需要 4 周数据才能进行关联分析' };
  }

  // 反转为时间正序（oldest-first）
  const data = weeklyData.slice().reverse();
  const correlations = {};

  DIM_KEYS.forEach(fromKey => {
    correlations[fromKey] = {};
    DIM_KEYS.forEach(toKey => {
      if (fromKey === toKey) return;

      // 检测 fromKey 改善后，toKey 是否滞后改善
      const result = _detectLaggedCorrelation(data, fromKey, toKey);
      if (result && result.confidence > 0.3) {
        correlations[fromKey][toKey] = result;
      }
    });
  });

  // 生成推荐
  const recommendation = _generateRecommendation(correlations, data);

  return { correlations, recommendation };
}

/**
 * 检测滞后相关性
 * 检测当 fromKey 上升时，toKey 是否在 lag 周后也上升
 */
function _detectLaggedCorrelation(data, fromKey, toKey, maxLag) {
  maxLag = maxLag || 3; // 最多检测 3 周滞后

  let bestResult = null;

  for (let lag = 0; lag <= maxLag; lag++) {
    const pairs = [];

    for (let i = 0; i < data.length - lag - 1; i++) {
      const fromScore = data[i][fromKey];
      const nextFromScore = data[i + 1][fromKey];
      const toScore = data[i + lag][toKey];
      const nextToScore = data[i + lag + 1] ? data[i + lag + 1][toKey] : undefined;

      // 跳过无效数据
      if (fromScore === undefined || fromScore === null) continue;
      if (nextFromScore === undefined || nextFromScore === null) continue;
      if (toScore === undefined || toScore === null) continue;
      if (nextToScore === undefined || nextToScore === null) continue;

      const fromDelta = nextFromScore - fromScore;
      const toDelta = nextToScore - toScore;

      pairs.push({ fromDelta, toDelta });
    }

    if (pairs.length < 3) continue;

    // 计算皮尔逊相关系数
    const correlation = _pearsonCorrelation(
      pairs.map(p => p.fromDelta),
      pairs.map(p => p.toDelta)
    );

    if (Math.abs(correlation) > 0.3) {
      if (!bestResult || Math.abs(correlation) > Math.abs(bestResult.correlation)) {
        bestResult = {
          correlation: Math.round(correlation * 100) / 100,
          lag,
          confidence: Math.min(1, pairs.length / 10),
          sampleSize: pairs.length
        };
      }
    }
  }

  return bestResult;
}

/**
 * 皮尔逊相关系数计算
 */
function _pearsonCorrelation(x, y) {
  const n = x.length;
  if (n === 0) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * 基于相关性分析生成个性化推荐
 */
function _generateRecommendation(correlations, data) {
  const latest = data[data.length - 1];
  if (!latest) return '暂无足够数据进行个性化推荐';

  // 找到当前最弱维度
  const scores = DIM_KEYS
    .map(k => ({ key: k, score: latest[k] }))
    .filter(s => s.score !== undefined && s.score !== null)
    .sort((a, b) => a.score - b.score);

  if (scores.length === 0) return '暂无评分数据';

  const weakest = scores[0];

  // 查找改善 weakest 后能带动哪些维度
  const leadsTo = correlations[weakest.key] || {};
  const leadsToList = Object.entries(leadsTo)
    .filter(([_, v]) => v.correlation > 0.3)
    .sort((a, b) => b[1].correlation - a[1].correlation);

  const parts = [];

  if (leadsToList.length > 0) {
    const topLeads = leadsToList.slice(0, 2);
    const leadTexts = topLeads.map(([key, val]) => {
      const dimName = (DIMENSIONS[key] && DIMENSIONS[key].name) || key;
      const lagText = val.lag > 0 ? `（约 ${val.lag} 周后见效）` : '';
      return `「${dimName}」${lagText}`;
    });

    parts.push(`基于你的 ${data.length} 周历史数据，改善「${(DIMENSIONS[weakest.key] || {}).name || weakest.key}」最可能带动${leadTexts.join('、')}的改善。`);
    parts.push(`数据置信度约 ${Math.round(topLeads[0][1].confidence * 100)}%。`);
  } else {
    // 使用静态相关性矩阵
    const staticCorr = DIM_CORRELATION[weakest.key] || {};
    const topStatic = Object.entries(staticCorr)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    if (topStatic.length > 0) {
      const leadTexts = topStatic.map(([key, val]) => {
        const dimName = (DIMENSIONS[key] && DIMENSIONS[key].name) || key;
        return `「${dimName}」(${Math.round(val * 100)}%)`;
      });
      parts.push(`改善「${(DIMENSIONS[weakest.key] || {}).name || weakest.key}」预计可带动${leadTexts.join('、')}。`);
      parts.push(`（基于通用关联模型，积累更多数据后将提供个性化分析）`);
    } else {
      parts.push(`当前最需关注「${(DIMENSIONS[weakest.key] || {}).name || weakest.key}」（${weakest.score}分），建议优先改善此维度。`);
    }
  }

  // 检测是否有反向关联（一个维度上升导致另一个下降）
  const negativeCorrs = [];
  Object.entries(correlations).forEach(([fromKey, targets]) => {
    Object.entries(targets).forEach(([toKey, val]) => {
      if (val.correlation < -0.4) {
        negativeCorrs.push({
          from: fromKey,
          to: toKey,
          correlation: val.correlation,
          lag: val.lag
        });
      }
    });
  });

  if (negativeCorrs.length > 0) {
    const top = negativeCorrs[0];
    const fromName = (DIMENSIONS[top.from] && DIMENSIONS[top.from].name) || top.from;
    const toName = (DIMENSIONS[top.to] && DIMENSIONS[top.to].name) || top.to;
    parts.push(`注意：数据表明「${fromName}」与「${toName}」存在负相关，过度投入一方可能影响另一方。`);
  }

  return parts.join('');
}

/**
 * 获取推荐改善路径
 * @param {Array} weeklyData - 周评数据
 * @returns {Object} { path, recommendation, correlations }
 */
function getRecommendation(weeklyData) {
  const result = analyzeCorrelations(weeklyData);

  // 构建改善路径
  const path = _buildImprovementPath(result.correlations, weeklyData);

  return {
    path,
    recommendation: result.recommendation,
    correlations: result.correlations
  };
}

/**
 * 构建改善路径（从当前最弱维度出发的最优改善链）
 */
function _buildImprovementPath(correlations, weeklyData) {
  if (!weeklyData || weeklyData.length === 0) return [];

  const latest = weeklyData[0]; // newest-first
  const scores = DIM_KEYS
    .map(k => ({ key: k, score: latest[k] }))
    .filter(s => s.score !== undefined && s.score !== null)
    .sort((a, b) => a.score - b.score);

  if (scores.length === 0) return [];

  const path = [];
  const visited = new Set();
  let current = scores[0]; // 从最弱维度开始

  while (current && path.length < 3) {
    visited.add(current.key);
    const dimName = (DIMENSIONS[current.key] && DIMENSIONS[current.key].name) || current.key;

    path.push({
      step: path.length + 1,
      dimension: current.key,
      name: dimName,
      score: current.score,
      action: path.length === 0 ? '优先改善此维度' : '随后改善此维度'
    });

    // 找到当前维度能带动的下一个维度
    const leadsTo = correlations[current.key] || {};
    const nextKey = Object.entries(leadsTo)
      .filter(([k, v]) => !visited.has(k) && v.correlation > 0.3)
      .sort((a, b) => b[1].correlation - a[1].correlation)[0];

    if (nextKey) {
      const nextScore = latest[nextKey[0]];
      current = { key: nextKey[0], score: nextScore || 0 };
    } else {
      // 使用静态矩阵
      const staticCorr = DIM_CORRELATION[current.key] || {};
      const nextStatic = Object.entries(staticCorr)
        .filter(([k]) => !visited.has(k))
        .sort((a, b) => b[1] - a[1])[0];

      if (nextStatic) {
        const nextScore = latest[nextStatic[0]];
        current = { key: nextStatic[0], score: nextScore || 0 };
      } else {
        current = null;
      }
    }
  }

  return path;
}

module.exports = {
  analyzeCorrelations,
  getRecommendation
};

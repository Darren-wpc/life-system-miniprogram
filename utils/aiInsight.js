// utils/aiInsight.js - 本地 AI 洞察引擎（无云环境降级方案）
// 基于人生框架的规则引擎，生成结构化深度解读

const constants = require('./constants');
const diagnosis = require('./diagnosis');
const { DIMENSIONS, DIM_KEYS, FACTORS, FACTOR_KEYS, DIM_CORRELATION } = constants;

/**
 * 维度 key -> 中文名
 */
const dimName = (key) => (DIMENSIONS[key] && DIMENSIONS[key].name) || key;

/**
 * 因子 key -> 中文名
 */
const factorName = (key) => (FACTORS[key] && FACTORS[key].name) || key;

/**
 * 生成周度 AI 深度解读
 * @param {Object} params - { current, previous, factors, resources, dailyList }
 * @returns {Object} { summary, details, suggestions, followUp }
 */
function generateWeeklyInsight(params) {
  const { current, previous, factors, resources, dailyList } = params;

  if (!current) {
    return _emptyInsight();
  }

  const overallHealth = parseFloat(diagnosis.calcOverallHealth(current));
  const status = diagnosis.getStatus(overallHealth);

  // 1. 综合状态概述
  const summary = _buildSummary(current, previous, overallHealth, status);

  // 2. 维度深度分析
  const details = _buildDimensionDetails(current, previous);

  // 3. 五因子关联分析
  if (factors) {
    details.push(_buildFactorAnalysis(factors, current));
  }

  // 4. 资源匹配分析
  if (resources && resources.metrics) {
    details.push(_buildResourceAnalysis(resources, current));
  }

  // 5. 日级反馈趋势分析
  if (dailyList && dailyList.length > 0) {
    details.push(_buildDailyTrendAnalysis(dailyList, current));
  }

  // 6. 可执行建议
  const suggestions = _buildSuggestions(current, previous, factors);

  // 7. 引导性问题
  const followUp = _buildFollowUp(current, previous, overallHealth);

  return {
    summary,
    details,
    suggestions,
    followUp,
    generatedAt: Date.now(),
    source: 'local' // 标记来源为本地引擎
  };
}

/**
 * 生成对话式回复（用于 coach 页面）
 * @param {string} message - 用户消息
 * @param {Object} userData - 用户数据上下文
 * @returns {string} 回复文本
 */
function generateCoachReply(message, userData) {
  const { current, previous, factors } = userData;
  const msg = (message || '').toLowerCase();

  // 关键词匹配 -> 框架化回复
  if (_matchAny(msg, ['目标', '计划', '想做', '想改变', '打算'])) {
    return _replyAboutGoal(current, previous);
  }

  if (_matchAny(msg, ['焦虑', '压力', '崩溃', '撑不住', '累', '疲惫'])) {
    return _replyAboutStress(current, previous);
  }

  if (_matchAny(msg, ['关系', '朋友', '家人', '孤独', '社交'])) {
    return _replyAboutRelationship(current, previous);
  }

  if (_matchAny(msg, ['工作', '职业', '赚钱', '收入', '财务'])) {
    return _replyAboutCareer(current, previous);
  }

  if (_matchAny(msg, ['意义', '价值', '为什么', '值得', '活着'])) {
    return _replyAboutMeaning(current, previous);
  }

  if (_matchAny(msg, ['健康', '睡眠', '身体', '运动', '饮食'])) {
    return _replyAboutHealth(current, previous);
  }

  if (_matchAny(msg, ['学习', '成长', '能力', '提升', '技能'])) {
    return _replyAboutGrowth(current, previous, factors);
  }

  // 默认：基于当前数据的通用分析
  return _replyDefault(current, previous);
}

// ===== 内部实现 =====

function _emptyInsight() {
  return {
    summary: '暂无评估数据，请先完成本周六维自评。',
    details: [],
    suggestions: [],
    followUp: [],
    generatedAt: Date.now(),
    source: 'local'
  };
}

function _buildSummary(current, previous, overall, status) {
  const parts = [];

  // 总体状态
  const statusText = {
    green: '整体状态健康',
    yellow: '整体状态需关注',
    red: '整体状态告警'
  }[status] || '整体状态未知';

  parts.push(`本周综合健康度 ${overall.toFixed(1)} 分，${statusText}。`);

  // 趋势
  if (previous) {
    const prevOverall = parseFloat(diagnosis.calcOverallHealth(previous));
    const diff = overall - prevOverall;
    if (diff > 0.3) {
      parts.push(`较上周 ${prevOverall.toFixed(1)} 分提升了 ${diff.toFixed(1)} 分，上升趋势明显。`);
    } else if (diff < -0.3) {
      parts.push(`较上周 ${prevOverall.toFixed(1)} 分下降了 ${Math.abs(diff).toFixed(1)} 分，需要重视。`);
    } else {
      parts.push(`较上周 ${prevOverall.toFixed(1)} 分基本持平。`);
    }
  }

  // 最强/最弱维度
  const scores = DIM_KEYS.map(k => ({ key: k, score: current[k] || 0 }));
  scores.sort((a, b) => b.score - a.score);
  const strongest = scores[0];
  const weakest = scores[scores.length - 1];

  if (strongest.score !== weakest.score) {
    parts.push(`当前最强维度是「${dimName(strongest.key)}」(${strongest.score}分)，最弱维度是「${dimName(weakest.key)}」(${weakest.score}分)。`);
  }

  return parts.join('');
}

function _buildDimensionDetails(current, previous) {
  const details = [];

  // 崩溃点分析
  const collapses = diagnosis.findCollapsePoints(current, previous);
  if (collapses.length > 0) {
    const texts = collapses.map(c => {
      if (c.reason === 'current_low') {
        return `「${dimName(c.key)}」仅 ${c.score} 分，处于危险低位`;
      } else {
        return `「${dimName(c.key)}」从 ${c.prev} 分降至 ${c.score} 分，呈下降趋势`;
      }
    });
    details.push({
      type: 'danger',
      title: '需要紧急关注的维度',
      text: texts.join('；') + '。这些维度若持续走低，可能引发连锁崩盘，建议优先处理。'
    });
  }

  // 杠杆点分析
  const leverage = diagnosis.findLeveragePoint(current);
  if (leverage && leverage.impactScore > 0) {
    const correlations = DIM_CORRELATION[leverage.key] || {};
    const topCorrelations = Object.entries(correlations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => `「${dimName(k)}」(${Math.round(v * 100)}%)`);

    details.push({
      type: 'info',
      title: '最高杠杆点',
      text: `改善「${dimName(leverage.key)}」对整体提升效应最大，它能带动${topCorrelations.join('、')}等维度的改善。建议将注意力集中在此。`
    });
  }

  // 失衡点分析
  const imbalances = diagnosis.findImbalancePoints(current, previous);
  if (imbalances.length > 0) {
    const texts = imbalances.map(i =>
      `「${dimName(i.key)}」(${i.score}分)与最低维度差距 ${i.gap} 分`
    );
    details.push({
      type: 'warning',
      title: '系统失衡',
      text: texts.join('；') + '。过强的维度可能在消耗其他维度的资源，建议适当降低投入或转移注意力。'
    });
  }

  // 均衡状态
  if (collapses.length === 0 && imbalances.length === 0) {
    details.push({
      type: 'success',
      title: '系统均衡',
      text: '六维评分较为均衡，没有明显的崩溃点或失衡点。这是系统健康运转的基础，继续保持。'
    });
  }

  return details;
}

function _buildFactorAnalysis(factors, current) {
  const bottleneck = diagnosis.findBottleneckFactor(factors);
  const product = diagnosis.calcProduct(factors);
  const productPercent = Math.round(product * 100);

  const texts = [];

  if (productPercent < 20) {
    texts.push(`五因子乘积效能仅 ${productPercent}%，整体行动力严重不足。`);
  } else if (productPercent < 50) {
    texts.push(`五因子乘积效能为 ${productPercent}%，有较大提升空间。`);
  } else {
    texts.push(`五因子乘积效能为 ${productPercent}%，行动力较强。`);
  }

  if (bottleneck) {
    const val = factors[bottleneck] || 0;
    texts.push(`当前瓶颈因子是「${factorName(bottleneck)}」(${val.toFixed(1)})。`);

    // 瓶颈因子与维度的关联分析
    if (val < 0.4) {
      texts.push('这个因子严重制约了你的行动转化，建议优先修复。');
    }

    // 预测提升效果
    const prediction = diagnosis.predictImprovement(factors, 0.6);
    if (prediction && prediction.multiplier > 1) {
      texts.push(`若将「${factorName(bottleneck)}」提升到 0.6，乘积效能可提升约 ${(prediction.multiplier).toFixed(1)} 倍。`);
    }
  }

  return {
    type: productPercent < 30 ? 'warning' : 'info',
    title: '五因子诊断',
    text: texts.join('')
  };
}

function _buildResourceAnalysis(resources, current) {
  const resourceKeys = Object.keys(constants.RESOURCE_TYPES);
  let filled = 0;
  let totalScore = 0;
  let scoredCount = 0;

  resourceKeys.forEach(key => {
    const metrics = resources.metrics[key];
    if (metrics) {
      const hasValues = Object.values(metrics).some(v => v !== '' && v !== undefined && v !== null);
      if (hasValues) {
        filled++;
        // 简单评分：有数据就算1分，满分看完整度
        const filledFields = Object.values(metrics).filter(v => v !== '' && v !== undefined && v !== null).length;
        totalScore += filledFields;
        scoredCount++;
      }
    }
  });

  const texts = [];
  texts.push(`已盘点 ${filled}/${resourceKeys.length} 类资源。`);

  if (filled <= 2) {
    texts.push('资源盘点较少，建议完善以获得更全面的系统诊断。');
  } else if (filled >= 5) {
    texts.push('资源盘点较完整，具备较好的资源调度基础。');
  }

  // 资源与维度匹配分析
  if (current.survival <= 2 && filled > 0) {
    texts.push('当前生存基础维度偏低，建议优先盘点金钱与健康资源，确保基本安全网。');
  }

  return {
    type: filled <= 2 ? 'warning' : 'info',
    title: '资源匹配',
    text: texts.join('')
  };
}

function _buildDailyTrendAnalysis(dailyList, current) {
  const recentDays = dailyList.slice(0, 7);
  const energyTexts = recentDays
    .filter(d => d.energyText)
    .map(d => d.energyText);

  const texts = [];
  texts.push(`近 7 天有 ${recentDays.length} 条日级反馈记录。`);

  if (energyTexts.length > 0) {
    // 简单情感分析：检查关键词
    const positiveWords = ['好', '开心', '满足', '充实', '有动力', '顺利'];
    const negativeWords = ['累', '焦虑', '烦', '压力', '疲惫', '低落', '崩溃'];
    let positive = 0;
    let negative = 0;
    energyTexts.forEach(t => {
      if (positiveWords.some(w => t.includes(w))) positive++;
      if (negativeWords.some(w => t.includes(w))) negative++;
    });

    if (positive > negative) {
      texts.push('近期整体能量偏向积极，状态不错。');
    } else if (negative > positive) {
      texts.push('近期整体能量偏低，建议关注身心恢复。');
    }
  }

  // 连续记录天数
  const streak = dailyList.length;
  if (streak >= 7) {
    texts.push(`已连续记录 ${streak} 天，自我觉察能力在持续提升。`);
  }

  return {
    type: 'info',
    title: '日级趋势',
    text: texts.join('')
  };
}

function _buildSuggestions(current, previous, factors) {
  const suggestions = [];

  // 基于崩溃点的建议
  const collapses = diagnosis.findCollapsePoints(current, previous);
  if (collapses.length > 0) {
    const first = collapses[0];
    const dim = DIMENSIONS[first.key];
    if (dim) {
      suggestions.push({
        priority: 'high',
        dimension: first.key,
        text: `立即处理「${dim.name}」：${dim.desc}。当前仅 ${first.score} 分，建议用工具箱中的「中断恢复脚本」快速止损。`
      });
    }
  }

  // 基于杠杆点的建议
  const leverage = diagnosis.findLeveragePoint(current);
  if (leverage) {
    const dim = DIMENSIONS[leverage.key];
    if (dim && (current[leverage.key] || 0) < 4) {
      suggestions.push({
        priority: 'medium',
        dimension: leverage.key,
        text: `集中改善「${dim.name}」：这是当前杠杆点，投入产出比最高。建议每天花 15 分钟做一件改善此维度的事。`
      });
    }
  }

  // 基于因子瓶颈的建议
  if (factors) {
    const bottleneck = diagnosis.findBottleneckFactor(factors);
    if (bottleneck) {
      const factor = FACTORS[bottleneck];
      const val = factors[bottleneck] || 0;
      if (val < 0.5) {
        suggestions.push({
          priority: 'medium',
          dimension: bottleneck,
          text: `修复因子「${factor.name}」：${factor.desc} 当前值偏低 (${val.toFixed(1)})，它是限制行动转化的关键。`
        });
      }
    }
  }

  // 通用建议
  if (suggestions.length === 0) {
    const overall = parseFloat(diagnosis.calcOverallHealth(current));
    if (overall >= 4) {
      suggestions.push({
        priority: 'low',
        text: '系统运转良好，建议继续保持当前节奏，关注长期趋势而非短期波动。'
      });
    } else {
      suggestions.push({
        priority: 'low',
        text: '建议完成本周五因子评估和资源盘点，以获得更全面的系统诊断。'
      });
    }
  }

  return suggestions;
}

function _buildFollowUp(current, previous, overall) {
  const questions = [];

  const weakest = DIM_KEYS
    .map(k => ({ key: k, score: current[k] || 0 }))
    .sort((a, b) => a.score - b.score)[0];

  if (weakest && weakest.score <= 2) {
    const dim = DIMENSIONS[weakest.key];
    questions.push(`「${dim.name}」是当前最弱维度，你觉得这周是什么具体事件导致的？`);
  }

  if (previous) {
    const prevOverall = parseFloat(diagnosis.calcOverallHealth(previous));
    const diff = overall - prevOverall;
    if (diff < -0.3) {
      questions.push('本周评分较上周有明显下降，你注意到了哪个变化？');
    } else if (diff > 0.3) {
      questions.push('本周评分有提升，你做了什么不同的事？');
    }
  }

  const strongest = DIM_KEYS
    .map(k => ({ key: k, score: current[k] || 0 }))
    .sort((a, b) => b.score - a.score)[0];

  if (strongest && strongest.score >= 4) {
    const dim = DIMENSIONS[strongest.key];
    questions.push(`「${dim.name}」是当前最强维度，你能否把它的能量迁移到最弱维度上？`);
  }

  if (questions.length === 0) {
    questions.push('如果下周只能改善一件事，你会选择什么？');
  }

  return questions;
}

// ===== 对话回复模板 =====

function _replyAboutGoal(current, previous) {
  const leverage = diagnosis.findLeveragePoint(current);
  const weakest = DIM_KEYS.map(k => ({ key: k, score: current[k] || 0 })).sort((a, b) => a.score - b.score)[0];
  const dim = DIMENSIONS[weakest.key];

  return `在设定新目标之前，先看看你的生活系统当前状态：

📊 综合健康度：${diagnosis.calcOverallHealth(current)} / 5.0
🔻 最弱维度：「${dim.name}」(${weakest.score}分)
${leverage ? `🎯 杠杆点：「${dimName(leverage.key)}」` : ''}

基于你的系统状态，建议：

1. 先确保「${dim.name}」不低于底线（${dim.desc}），这是安全网
2. 新目标需要匹配你的资源承载量，不要在生存基础未稳时追求高风险目标
3. 用「取舍汇率」工具评估：新目标需要投入什么资源，你愿意用多少来换？

${leverage ? `当前杠杆点是「${dimName(leverage.key)}」，如果你的新目标能同时改善这个维度，投入产出比最高。` : ''}

你想聊的具体目标是什么？`;
}

function _replyAboutStress(current, previous) {
  const collapses = diagnosis.findCollapsePoints(current, previous);
  const survivalScore = current.survival || 0;
  const innerScore = current.innerOrder || 0;

  let text = `感受到你的压力了。先看一下你的系统状态：

`;

  if (collapses.length > 0) {
    text += `⚠️ 当前有 ${collapses.length} 个维度处于崩溃线以下：${collapses.map(c => dimName(c.key)).join('、')}\n\n`;
  }

  if (survivalScore <= 2) {
    text += `生存基础只有 ${survivalScore} 分，这说明你的身体或安全网在发出警报。\n`;
    text += `第一步不是解决问题，而是先确保睡眠和基本休息——没有身体这个底座，其他什么都撑不住。\n\n`;
  }

  if (innerScore <= 2) {
    text += `内在秩序 ${innerScore} 分，说明情绪系统也处于过载状态。\n`;
    text += `建议用工具箱里的「中断恢复脚本」——先停下来，不做任何重大决定，给情绪 24 小时冷却期。\n\n`;
  }

  text += `工具箱推荐：\n`;
  text += `• 「中断恢复脚本」：破功后怎么回来\n`;
  text += `• 「不可控清单」：区分哪些是你能控制的，哪些不是\n`;
  text += `• 「底线设定」：确保生存底线不被击穿\n\n`;

  text += `记住：压力不是你的问题，是系统的信号。先处理系统，情绪会跟着稳定。`;

  return text;
}

function _replyAboutRelationship(current, previous) {
  const relScore = current.relationship || 0;
  const innerScore = current.innerOrder || 0;

  let text = `关系维度分析：\n\n`;
  text += `📊 关系支持：${relScore} / 5\n`;
  text += `📊 内在秩序：${innerScore} / 5\n\n`;

  if (relScore <= 2) {
    text += `关系支持处于低位。这不一定是朋友少，而是「可信任连接」的质量不够。\n\n`;
    text += `建议：\n`;
    text += `1. 盘点你的关系层级：L1（凌晨3点能打电话）有几个？L2（重大决策商量）有几个？\n`;
    text += `2. 不追求数量，健康的关系层级是：L1 1-3人，L2 2-5人\n`;
    text += `3. 先修复一条 L2 级关系——找一个你信任但最近疏远的人，主动联系一次\n\n`;
  } else if (relScore >= 4) {
    text += `关系支持状态良好。你的社交网络能提供足够的支持。\n`;
    text += `注意：关系维度的能量可以迁移到其他维度，考虑用你的关系资源去带动最弱的维度。\n\n`;
  }

  if (innerScore <= 2 && relScore <= 3) {
    text += `内在秩序偏低时，关系质量也会受影响。建议先稳定情绪，再做重大社交决策。\n`;
  }

  text += `\n具体想聊哪段关系？`;

  return text;
}

function _replyAboutCareer(current, previous) {
  const autoScore = current.autonomy || 0;
  const capScore = current.capability || 0;
  const survScore = current.survival || 0;

  let text = `职业与财务维度分析：\n\n`;
  text += `📊 自主权：${autoScore} / 5（时间是否属于自己）\n`;
  text += `📊 能力资产：${capScore} / 5（技能积累与可迁移性）\n`;
  text += `📊 生存基础：${survScore} / 5（基本收入与安全）\n\n`;

  if (survScore <= 2) {
    text += `⚠️ 生存基础不稳。当前优先级不是追求高收入，而是确保基本安全网。\n`;
    text += `建议：先用「底线设定」工具明确最低生存线，确保不被击穿。\n\n`;
  }

  if (autoScore <= 2) {
    text += `自主权偏低，说明你大部分时间在为别人做事。\n`;
    text += `建议：每天争取 1 小时完全自主的时间，用来积累能力或复盘。\n\n`;
  }

  if (capScore <= 2) {
    text += `能力资产偏低，说明你在消耗而非积累。\n`;
    text += `建议：识别一个可迁移技能（沟通、分析、写作等），每周投入 3 小时刻意练习。\n\n`;
  } else if (capScore >= 4) {
    text += `能力资产充足，你有足够的技能储备来应对职业变化。\n`;
    text += `建议：考虑用能力资产去提升自主权——用技能换取更多时间自主权。\n\n`;
  }

  text += `想聊具体的职业方向还是收入策略？`;

  return text;
}

function _replyAboutMeaning(current, previous) {
  const meanScore = current.meaning || 0;
  const innerScore = current.innerOrder || 0;

  let text = `意义维度分析：\n\n`;
  text += `📊 意义贡献：${meanScore} / 5\n`;
  text += `📊 内在秩序：${innerScore} / 5\n\n`;

  if (meanScore <= 2) {
    text += `意义感偏低时，不是「找不到意义」，而是系统过载导致无法感知意义。\n\n`;
    text += `建议：\n`;
    text += `1. 先不要急着找「人生意义」这种大词\n`;
    text += `2. 问自己一个具体问题：这周有没有一件事做完后觉得「值得」？\n`;
    text += `3. 意义往往在行动中浮现，而不是在思考中——去做一件你一直想做但没做的事\n\n`;

    if (innerScore <= 2) {
      text += `内在秩序也偏低，说明你的价值体系在动摇。这很正常，但不要在情绪低谷做重大人生决定。\n\n`;
    }
  } else if (meanScore >= 4) {
    text += `意义感很强，你清楚自己在做什么、为什么做。\n`;
    text += `建议：把这份意义感转化为行动——找一个你关心的人，把你的洞察分享给ta。\n\n`;
  }

  text += `最近是什么让你开始思考这个问题？`;

  return text;
}

function _replyAboutHealth(current, previous) {
  const survScore = current.survival || 0;

  let text = `健康维度分析：\n\n`;
  text += `📊 生存基础：${survScore} / 5\n\n`;

  if (survScore <= 2) {
    text += `⚠️ 生存基础处于危险区。身体在替你说话了。\n\n`;
    text += `紧急建议：\n`;
    text += `1. 今晚保证 7 小时睡眠——没有例外\n`;
    text += `2. 用「底线设定」工具写明健康底线：睡眠不少于X小时、每周运动X次\n`;
    text += `3. 如果有慢性症状（失眠、头痛、消化问题），这不是「太累了」，是身体在报警\n\n`;
    text += `记住：生存基础是所有其他维度的地基。它塌了，其他维度都会跟着崩。\n\n`;
  } else if (survScore >= 4) {
    text += `生存基础稳固，身体状态良好。继续保持当前的健康习惯。\n\n`;
    text += `建议：将健康资源的能量迁移到其他维度——好身体是你最大的杠杆。\n\n`;
  } else {
    text += `生存基础一般，有改善空间。\n`;
    text += `建议：检查睡眠质量、饮食规律和运动频率，找到最薄弱的环节优先修复。\n\n`;
  }

  text += `具体是哪方面的健康问题？`;

  return text;
}

function _replyAboutGrowth(current, previous, factors) {
  const capScore = current.capability || 0;

  let text = `成长与能力维度分析：\n\n`;
  text += `📊 能力资产：${capScore} / 5\n\n`;

  if (factors) {
    const product = diagnosis.calcProduct(factors);
    const bottleneck = diagnosis.findBottleneckFactor(factors);
    text += `📊 五因子乘积效能：${Math.round(product * 100)}%\n`;
    if (bottleneck) {
      text += `📊 瓶颈因子：「${factorName(bottleneck)}」(${factors[bottleneck].toFixed(1)})\n\n`;
    }

    if (product < 0.3) {
      text += `行动转化能力严重不足。有想法但难以落地，核心不在方法而在五因子失衡。\n\n`;
    }
  }

  if (capScore <= 2) {
    text += `能力资产偏低，说明你在消耗而非积累。\n\n`;
    text += `建议：\n`;
    text += `1. 识别一个可迁移技能（沟通、分析、写作、编程等）\n`;
    text += `2. 设定「最小可行练习」：每天 20 分钟，不追求完美\n`;
    text += `3. 用「合适标准」因子审视：是不是对自己要求太高导致不敢开始？\n\n`;
  } else if (capScore >= 4) {
    text += `能力资产充足，你有足够的技能储备。\n`;
    text += `建议：考虑教别人——教学是最高效的能力巩固方式，也能增强意义维度。\n\n`;
  }

  text += `你想提升哪个方面的能力？`;

  return text;
}

function _replyDefault(current, previous) {
  const overall = parseFloat(diagnosis.calcOverallHealth(current));
  const collapses = diagnosis.findCollapsePoints(current, previous);
  const leverage = diagnosis.findLeveragePoint(current);
  const imbalances = diagnosis.findImbalancePoints(current, previous);

  let text = `📊 当前系统状态：\n`;
  text += `综合健康度：${overall.toFixed(1)} / 5.0\n\n`;

  // 各维度得分
  DIM_KEYS.forEach(key => {
    const dim = DIMENSIONS[key];
    const score = current[key] || 0;
    const bar = '█'.repeat(Math.round(score)) + '░'.repeat(5 - Math.round(score));
    text += `${bar} ${dim.name} ${score}\n`;
  });

  text += `\n`;

  if (collapses.length > 0) {
    text += `⚠️ 需要关注：${collapses.map(c => dimName(c.key)).join('、')}\n`;
  }
  if (leverage) {
    text += `🎯 杠杆点：${dimName(leverage.key)}\n`;
  }
  if (imbalances.length > 0) {
    text += `⚖️ 失衡点：${imbalances.map(i => dimName(i.key)).join('、')}\n`;
  }

  text += `\n你可以问我：\n`;
  text += `• 关于某个维度的具体建议\n`;
  text += `• 压力/焦虑/疲惫时的应对策略\n`;
  text += `• 目标设定和职业规划\n`;
  text += `• 关系和社交问题\n`;
  text += `• 意义和价值困惑\n`;

  if (previous) {
    const prevOverall = parseFloat(diagnosis.calcOverallHealth(previous));
    text += `\n📈 上周 ${prevOverall.toFixed(1)} → 本周 ${overall.toFixed(1)}`;
    const diff = overall - prevOverall;
    if (diff > 0.3) text += `（上升 ${diff.toFixed(1)}）`;
    else if (diff < -0.3) text += `（下降 ${Math.abs(diff).toFixed(1)}）`;
    else text += `（持平）`;
  }

  return text;
}

// ===== 工具函数 =====

function _matchAny(text, keywords) {
  return keywords.some(k => text.includes(k));
}

/**
 * 生成每日一句话 AI 解读
 * @param {Object} params - { todayRecord, recentDays, weeklyScores }
 * @returns {string} 一句话解读
 */
function generateDailyReflect(params) {
  const { todayRecord, recentDays, weeklyScores } = params;

  if (!todayRecord) {
    return '记录每一天，是认识自己的第一步。';
  }

  const mood = todayRecord.moodEmoji || '';
  const text = todayRecord.text || '';
  const parts = [];

  // 心情模式分析（AI-P0-4: emoji 与 constants.js MOOD_EMOJIS 对齐）
  const moodMap = {
    '😊': { label: '愉悦', energy: 'high' },
    '😌': { label: '平稳', energy: 'medium' },
    '😐': { label: '中性', energy: 'low' },
    '😔': { label: '低落', energy: 'drain' },
    '😢': { label: '疲惫', energy: 'drain' }
  };
  const moodInfo = moodMap[mood] || { label: '未知', energy: 'neutral' };

  // 趋势分析
  let trend = '';
  if (recentDays && recentDays.length >= 3) {
    const recent3 = recentDays.slice(0, 3);
    const highEnergy = recent3.filter(d => ['😊', '😌'].includes(d.moodEmoji)).length;
    const lowEnergy = recent3.filter(d => ['😔', '😢'].includes(d.moodEmoji)).length;

    if (lowEnergy >= 2) {
      trend = '近期能量持续偏低，';
    } else if (highEnergy >= 2) {
      trend = '近期状态稳定向好，';
    } else {
      trend = '近期情绪有波动，';
    }
  }

  // 周评关联分析
  let weeklyLink = '';
  if (weeklyScores) {
    const dims = ['survival', 'autonomy', 'capability', 'relationship', 'innerOrder', 'meaning'];
    let lowestKey = dims[0];
    let lowestScore = 6;
    dims.forEach(key => {
      const score = weeklyScores[key];
      if (score !== undefined && score < lowestScore) {
        lowestScore = score;
        lowestKey = key;
      }
    });

    if (lowestScore <= 2) {
      const dimLabels = {
        survival: '生存基础', autonomy: '自主权', capability: '能力资产',
        relationship: '关系支持', innerOrder: '内在秩序', meaning: '意义贡献'
      };
      weeklyLink = `本周${dimLabels[lowestKey]}得分较低（${lowestScore}/5），`;
    }
  }

  // 情绪模式识别
  let pattern = '';
  if (moodInfo.energy === 'drain') {
    if (text.includes('累') || text.includes('压力') || text.includes('焦虑')) {
      pattern = '注意识别压力来源，';
    } else if (text.includes('失望') || text.includes('挫败')) {
      pattern = '允许自己有低谷期，';
    } else {
      pattern = '能量低的时候先照顾好身体，';
    }
  } else if (moodInfo.energy === 'high') {
    if (text.includes('完成') || text.includes('成就')) {
      pattern = '抓住这种成就感，';
    } else if (text.includes('开心') || text.includes('满足')) {
      pattern = '记录下这种满足感的来源，';
    } else {
      pattern = '保持这种能量状态，';
    }
  } else {
    pattern = '保持觉察，';
  }

  // 组合一句话
  let sentence = trend + weeklyLink + pattern;

  // 根据心情给出一句话建议（AI-P0-4: emoji 与 constants.js MOOD_EMOJIS 对齐）
  const suggestions = {
    '😊': '今天的状态很好，适合推进一些有挑战的事。',
    '😌': '平稳是积累的基础，继续保持节奏。',
    '😐': '中性不代表平淡，试着找到今天的一个小亮点。',
    '😔': '低落时会过去的，先做一件让自己舒服的小事。',
    '😢': '疲惫时允许休息，明天是新的开始。'
  };

  sentence += suggestions[mood] || '明天继续记录。';

  return sentence;
}

/**
 * 生成季度复盘 AI 总结
 * @param {Object} params - { reviewData, weeklyList, factorsList }
 *   - reviewData: { collapseText, leverageText, imbalanceText, sustainableText, standardUpdateText, focusFactor }
 *   - weeklyList: 过去一季度的周评分数数组（最多 13 条，按时间倒序）
 *   - factorsList: 因子数据数组
 * @returns {Object} { summary, trends, keyFindings, recommendations }
 */
function generateQuarterlySummary(params) {
  const { reviewData, weeklyList, factorsList } = params;

  if (!reviewData) {
    return _emptyQuarterlySummary();
  }

  // 1. 总体评估
  const summary = _buildQuarterlySummary(reviewData, weeklyList);

  // 2. 趋势分析
  const trends = _buildQuarterlyTrends(weeklyList);

  // 3. 关键发现
  const keyFindings = _buildQuarterlyKeyFindings(reviewData, weeklyList, factorsList);

  // 4. 下季度建议
  const recommendations = _buildQuarterlyRecommendations(reviewData, weeklyList, factorsList);

  return {
    summary,
    trends,
    keyFindings,
    recommendations,
    generatedAt: Date.now(),
    source: 'local'
  };
}

// ===== 季度总结内部实现 =====

function _emptyQuarterlySummary() {
  return {
    summary: '暂无季度复盘数据，请先完成季度结构检视。',
    trends: [],
    keyFindings: [],
    recommendations: [],
    generatedAt: Date.now(),
    source: 'local'
  };
}

/**
 * 构建季度总体评估（2-3 句）
 */
function _buildQuarterlySummary(reviewData, weeklyList) {
  const parts = [];

  // 基于周评数据的整体趋势
  if (weeklyList && weeklyList.length >= 2) {
    const latest = weeklyList[0];
    const oldest = weeklyList[weeklyList.length - 1];
    const latestOverall = parseFloat(diagnosis.calcOverallHealth(latest));
    const oldestOverall = parseFloat(diagnosis.calcOverallHealth(oldest));
    const diff = latestOverall - oldestOverall;

    if (diff > 0.5) {
      parts.push(`本季度综合健康度从 ${oldestOverall.toFixed(1)} 提升至 ${latestOverall.toFixed(1)}，整体呈上升趋势。`);
    } else if (diff < -0.5) {
      parts.push(`本季度综合健康度从 ${oldestOverall.toFixed(1)} 下降至 ${latestOverall.toFixed(1)}，整体呈下行趋势，需警惕。`);
    } else {
      parts.push(`本季度综合健康度在 ${oldestOverall.toFixed(1)} ~ ${latestOverall.toFixed(1)} 之间波动，整体基本持平。`);
    }
  } else {
    parts.push('本季度周评数据不足，难以判断整体趋势。');
  }

  // 基于复盘结构的判断
  if (reviewData.collapseText) {
    parts.push(`复盘识别出的核心崩溃风险为「${reviewData.collapseText.slice(0, 40)}${reviewData.collapseText.length > 40 ? '...' : ''}」`);
  }

  if (reviewData.focusFactor && FACTORS[reviewData.focusFactor]) {
    parts.push(`下季度建议聚焦因子「${factorName(reviewData.focusFactor)}」。`);
  }

  return parts.join('');
}

/**
 * 构建季度维度趋势（哪些维度上升/下降/稳定）
 */
function _buildQuarterlyTrends(weeklyList) {
  const trends = [];

  if (!weeklyList || weeklyList.length < 2) {
    return trends;
  }

  const latest = weeklyList[0];
  const oldest = weeklyList[weeklyList.length - 1];

  DIM_KEYS.forEach(key => {
    const latestScore = latest[key];
    const oldestScore = oldest[key];

    if (latestScore == null || oldestScore == null) return;

    const diff = latestScore - oldestScore;
    let direction = 'stable';
    if (diff > 0.5) direction = 'up';
    else if (diff < -0.5) direction = 'down';

    trends.push({
      dimension: key,
      label: dimName(key),
      direction,
      change: +(diff.toFixed(1)),
      from: oldestScore,
      to: latestScore
    });
  });

  return trends;
}

/**
 * 构建季度关键发现
 */
function _buildQuarterlyKeyFindings(reviewData, weeklyList, factorsList) {
  const findings = [];

  // 1. 基于崩溃点检视
  if (reviewData.collapseText && reviewData.collapseText.trim()) {
    findings.push({
      type: 'danger',
      title: '崩溃风险点',
      text: reviewData.collapseText.trim()
    });
  }

  // 2. 基于杠杆点检视
  if (reviewData.leverageText && reviewData.leverageText.trim()) {
    findings.push({
      type: 'leverage',
      title: '关键杠杆点',
      text: reviewData.leverageText.trim()
    });
  }

  // 3. 基于失衡点检视
  if (reviewData.imbalanceText && reviewData.imbalanceText.trim()) {
    findings.push({
      type: 'warning',
      title: '结构性失衡',
      text: reviewData.imbalanceText.trim()
    });
  }

  // 4. 基于可持续性检视
  if (reviewData.sustainableText && reviewData.sustainableText.trim()) {
    findings.push({
      type: 'info',
      title: '可持续性评估',
      text: reviewData.sustainableText.trim()
    });
  }

  // 5. 基于周评数据的量化发现
  if (weeklyList && weeklyList.length >= 2) {
    const latest = weeklyList[0];
    const oldest = weeklyList[weeklyList.length - 1];

    // 找到变化最大的维度
    let maxChange = 0;
    let maxChangeKey = null;
    let maxChangeDir = 'stable';
    DIM_KEYS.forEach(key => {
      const latestScore = latest[key];
      const oldestScore = oldest[key];
      if (latestScore != null && oldestScore != null) {
        const diff = latestScore - oldestScore;
        if (Math.abs(diff) > Math.abs(maxChange)) {
          maxChange = diff;
          maxChangeKey = key;
          maxChangeDir = diff > 0.5 ? 'up' : (diff < -0.5 ? 'down' : 'stable');
        }
      }
    });

    if (maxChangeKey && maxChangeDir !== 'stable') {
      const dirText = maxChangeDir === 'up' ? '上升' : '下降';
      findings.push({
        type: maxChangeDir === 'up' ? 'success' : 'danger',
        title: `季度变化最显著的维度`,
        text: `「${dimName(maxChangeKey)}」本季度${dirText}了 ${Math.abs(maxChange).toFixed(1)} 分（${oldest[maxChangeKey]} → ${latest[maxChangeKey]}），是波动最大的维度。`
      });
    }
  }

  // 6. 基于因子数据的发现
  if (factorsList && factorsList.length > 0) {
    const latestFactors = factorsList[0];
    if (latestFactors) {
      const bottleneck = diagnosis.findBottleneckFactor(latestFactors);
      if (bottleneck) {
        const val = latestFactors[bottleneck] || 0;
        findings.push({
          type: 'warning',
          title: '要素瓶颈',
          text: `当前五因子瓶颈为「${factorName(bottleneck)}」（${val.toFixed(1)}），制约了行动转化效率。`
        });
      }
    }
  }

  return findings;
}

/**
 * 构建下季度行动建议
 */
function _buildQuarterlyRecommendations(reviewData, weeklyList, factorsList) {
  const recommendations = [];

  // 1. 基于聚焦因子的建议
  if (reviewData.focusFactor && FACTORS[reviewData.focusFactor]) {
    const factor = FACTORS[reviewData.focusFactor];
    recommendations.push({
      priority: 'high',
      factor: reviewData.focusFactor,
      title: `聚焦因子：${factor.name}`,
      text: `下季度将主要精力放在「${factor.name}」上。${factor.desc}建议每周至少做一次与此因子相关的刻意练习，并在周评中记录进展。`
    });
  }

  // 2. 基于标准更新的建议
  if (reviewData.standardUpdateText && reviewData.standardUpdateText.trim()) {
    recommendations.push({
      priority: 'medium',
      factor: 'standards',
      title: '更新评价标准',
      text: `根据本季度的反思（${reviewData.standardUpdateText.trim().slice(0, 60)}${reviewData.standardUpdateText.trim().length > 60 ? '...' : ''}），下季度需要调整自我评价标准，确保标准与当前阶段匹配。`
    });
  }

  // 3. 基于杠杆点的建议
  if (reviewData.leverageText && reviewData.leverageText.trim()) {
    recommendations.push({
      priority: 'high',
      title: '持续投入杠杆点',
      text: `本季度识别的杠杆点仍然有效。建议下季度继续在杠杆方向上投入，每天花 15-30 分钟做一件改善杠杆维度的事，观察连带效应。`
    });
  }

  // 4. 基于崩溃风险的建议
  if (reviewData.collapseText && reviewData.collapseText.trim()) {
    recommendations.push({
      priority: 'high',
      title: '建立崩溃防御机制',
      text: `针对识别到的崩溃风险，建议下季度初就设定明确的底线和中断恢复脚本，一旦指标跌破底线立即启动恢复流程，防止连锁崩盘。`
    });
  }

  // 5. 基于周评趋势的建议
  if (weeklyList && weeklyList.length >= 2) {
    const latest = weeklyList[0];
    const latestOverall = parseFloat(diagnosis.calcOverallHealth(latest));

    if (latestOverall < 2.5) {
      recommendations.push({
        priority: 'high',
        title: '优先稳定基础维度',
        text: `当前综合健康度偏低（${latestOverall.toFixed(1)}），下季度应优先稳定生存基础与内在秩序，暂缓追求高目标。`
      });
    } else if (latestOverall >= 4) {
      recommendations.push({
        priority: 'low',
        title: '保持节奏，探索突破',
        text: `当前综合健康度良好（${latestOverall.toFixed(1)}），下季度可在保持现有节奏的基础上，尝试在意义贡献或能力资产维度上寻求突破。`
      });
    }
  }

  // 6. 通用建议（若建议不足）
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'low',
      title: '保持定期复盘',
      text: '建议下季度继续保持每周评估和季度复盘的节奏，用数据驱动决策，用框架指导行动。'
    });
  }

  return recommendations;
}

// ===== 转向信号检测 =====

/**
 * 生成 AI 转向信号检测
 * 基于历史评分趋势自动检测转向信号
 * @param {Object} params - { weeklyList, pivotRecords, currentScores }
 *   - weeklyList: 周评分数组（按时间正序，最旧在前）
 *   - pivotRecords: 已有的转向信号记录数组
 *   - currentScores: 最新一周评分（可选，若未传则取 weeklyList 最后一条）
 * @returns {Object} { signals: [{ type, dimension, severity, description }], recommendation }
 */
function checkPivotSignal(params) {
  const { weeklyList = [], pivotRecords = [], currentScores = null } = params;

  const signals = [];

  // 数据不足时直接返回空结果
  if (!weeklyList || weeklyList.length < 2) {
    return {
      signals: [],
      recommendation: '周评分数据不足，暂无法检测转向信号。建议连续记录至少 3 周后再进行检测。',
      generatedAt: Date.now(),
      source: 'local'
    };
  }

  // 取最新评分：优先用 currentScores，否则取 weeklyList 最后一条
  const latest = currentScores || weeklyList[weeklyList.length - 1];

  // ---------- 规则 1: 连续下行 ----------
  // 综合健康度连续 2+ 周下降
  const overallTrend = weeklyList.map((w) => parseFloat(diagnosis.calcOverallHealth(w)));
  let declineStreak = 0;
  for (let i = overallTrend.length - 1; i >= 1; i--) {
    if (overallTrend[i] < overallTrend[i - 1]) {
      declineStreak++;
    } else {
      break;
    }
  }
  if (declineStreak >= 2) {
    const fromScore = overallTrend[overallTrend.length - 1 - declineStreak];
    const toScore = overallTrend[overallTrend.length - 1];
    signals.push({
      type: 'consecutiveDecline',
      dimension: null,
      severity: declineStreak >= 3 ? 'danger' : 'warning',
      description: `综合健康度已连续 ${declineStreak} 周下行（${fromScore} → ${toScore}），整体系统处于持续衰退状态。`
    });
  }

  // ---------- 规则 2: 重复低位 ----------
  // 同一维度连续 3+ 周得分 <= 2
  DIM_KEYS.forEach((key) => {
    let lowStreak = 0;
    let maxLowStreak = 0;
    for (let i = weeklyList.length - 1; i >= 0; i--) {
      const score = weeklyList[i][key];
      if (score !== undefined && score !== null && score <= 2) {
        lowStreak++;
        maxLowStreak = Math.max(maxLowStreak, lowStreak);
      } else {
        lowStreak = 0;
      }
    }
    if (maxLowStreak >= 3) {
      const dim = DIMENSIONS[key];
      signals.push({
        type: 'repeatedLow',
        dimension: key,
        severity: 'danger',
        description: `「${dim ? dim.name : key}」连续 ${maxLowStreak} 周得分处于低位（≤2），该维度长期未得到改善，可能是结构性问题的信号。`
      });
    }
  });

  // ---------- 规则 3: 结构性崩塌 ----------
  // 单周内 3+ 维度低于 2 分
  const lowDims = DIM_KEYS.filter((key) => {
    const score = latest[key];
    return score !== undefined && score !== null && score <= 2;
  });
  if (lowDims.length >= 3) {
    const dimNames = lowDims.map((k) => (DIMENSIONS[k] ? DIMENSIONS[k].name : k)).join('、');
    signals.push({
      type: 'structuralCollapse',
      dimension: null,
      severity: 'danger',
      description: `最新一周有 ${lowDims.length} 个维度低于 2 分（${dimNames}），系统出现结构性崩塌，多个基础维度同时失守。`
    });
  }

  // ---------- 规则 4: 差距扩大 ----------
  // 维度间极差在 3+ 周内持续扩大
  const gaps = weeklyList.map((w) => {
    const scores = DIM_KEYS.map((k) => (w[k] !== undefined && w[k] !== null ? w[k] : 0));
    return Math.max(...scores) - Math.min(...scores);
  });
  let gapWideningStreak = 0;
  for (let i = gaps.length - 1; i >= 1; i--) {
    if (gaps[i] > gaps[i - 1]) {
      gapWideningStreak++;
    } else {
      break;
    }
  }
  if (gapWideningStreak >= 3) {
    const latestGap = gaps[gaps.length - 1];
    const earliestGap = gaps[gaps.length - 1 - gapWideningStreak];
    signals.push({
      type: 'gapWidening',
      dimension: null,
      severity: 'warning',
      description: `维度间差距连续 ${gapWideningStreak} 周扩大（极差从 ${earliestGap} 扩大到 ${latestGap}），系统失衡加剧，强维度在消耗弱维度的资源。`
    });
  }

  // ---------- 结合已有转向记录 ----------
  // 如果已有转向信号记录，补充信息
  if (pivotRecords && pivotRecords.length > 0) {
    const latestPivot = pivotRecords[0]; // newest-first
    if (latestPivot && latestPivot.checkedCount >= 2) {
      signals.push({
        type: 'historicalSignal',
        dimension: null,
        severity: latestPivot.checkedCount >= 3 ? 'danger' : 'warning',
        description: `历史转向检测记录显示已勾选 ${latestPivot.checkedCount} 个信号，建议结合本次检测综合判断。`
      });
    }
  }

  // ---------- 生成综合建议 ----------
  const recommendation = _buildPivotRecommendation(signals);

  return {
    signals,
    recommendation,
    generatedAt: Date.now(),
    source: 'local'
  };
}

/**
 * 基于检测到的信号生成综合建议
 */
function _buildPivotRecommendation(signals) {
  if (signals.length === 0) {
    return '暂未检测到明显的转向信号。当前系统运转相对稳定，建议继续保持观察，定期复评。';
  }

  const dangerCount = signals.filter((s) => s.severity === 'danger').length;
  const warningCount = signals.filter((s) => s.severity === 'warning').length;

  const parts = [];

  if (dangerCount >= 2) {
    parts.push('检测到多个高危转向信号，系统正处于严重衰退中。');
    parts.push('建议：1）立即暂停新增目标，优先稳定基础维度（生存基础、内在秩序）；');
    parts.push('2）完成转向准备清单，评估是否已具备转向条件；');
    parts.push('3）若身体出现躯体化症状，优先处理健康问题，这是不可拖延的底线。');
  } else if (dangerCount >= 1) {
    parts.push('检测到高危转向信号，某个或多个维度已处于崩溃边缘。');
    parts.push('建议：1）使用"中断恢复脚本"快速止损，先稳定再决策；');
    parts.push('2）识别最低维度的根因，区分是暂时性波动还是结构性问题；');
    parts.push('3）认真思考这是否是反复出现的问题模式——如果是，转向可能比修复更高效。');
  } else if (warningCount >= 1) {
    parts.push('检测到需关注的转向信号，系统出现下行或失衡趋势。');
    parts.push('建议：1）连续观察 2-3 周，确认趋势是否持续；');
    parts.push('2）找到当前杠杆点，集中精力改善它以带动整体回升；');
    parts.push('3）不要急于转向，先尝试在当前系统内做结构性调整。');
  } else {
    parts.push('检测到轻微信号，但尚不构成转向依据。');
    parts.push('建议继续保持定期评估，关注趋势变化。');
  }

  return parts.join('');
}

module.exports = {
  generateWeeklyInsight,
  generateCoachReply,
  generateDailyReflect,
  generateQuarterlySummary,
  checkPivotSignal
};

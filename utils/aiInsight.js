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

module.exports = {
  generateWeeklyInsight,
  generateCoachReply
};

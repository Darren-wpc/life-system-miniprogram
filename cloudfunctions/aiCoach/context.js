/**
 * context.js - 用户上下文组装模块
 *
 * 职责：把数据库中取出的用户数据（周评分、趋势、要素数据、目标、对话历史等）
 * 组装成结构化的自然语言上下文，供 LLM 理解用户当前状态。
 *
 * 三个对外函数：
 *   - assembleWeeklyContext(userData)             周度洞察上下文
 *   - assembleCoachContext(userData, message, history) 对话辅导上下文（含历史）
 *   - assembleGoalContext(userData, message)      目标引导上下文
 */

// ---------------------------------------------------------------------------
// 框架元数据（与 prompts/system.js 保持一致）
// ---------------------------------------------------------------------------
const DIMENSIONS = {
  survival: {
    label: '生存基础',
    desc: '健康、睡眠、饮食、财务安全、居住稳定等基本生存需求的保障',
    items: ['身体健康', '睡眠质量', '饮食规律', '财务安全', '居住稳定']
  },
  autonomy: {
    label: '自主权',
    desc: '对时间、决策、生活方向的掌控感与说“不”的能力',
    items: ['时间自主', '决策自主', '方向掌控', '拒绝能力']
  },
  capability: {
    label: '能力资产',
    desc: '可复用的技能、知识、经验与专业声誉的积累',
    items: ['核心技能', '学习能力', '专业影响', '可迁移能力']
  },
  relationship: {
    label: '关系支持',
    desc: '能提供情感、信息、资源支持的真实人际关系网络质量',
    items: ['亲密关系', '深层友谊', '协作网络', '社群归属']
  },
  innerOrder: {
    label: '内在秩序',
    desc: '内心稳定感、情绪调节与自我认知清晰度',
    items: ['情绪稳定', '自我认知', '压力调节', '价值锚点']
  },
  meaning: {
    label: '意义贡献',
    desc: '超越自身的意义感、创造与贡献带来的价值感',
    items: ['意义感', '贡献感', '价值创造', '正向影响']
  }
}

const FACTORS = {
  standards: { label: '合适标准', desc: '与当前阶段匹配的“够/好”标准' },
  action: { label: '持续行动', desc: '将意图转化为稳定、可累积行动的能力' },
  resources: { label: '资源支持', desc: '时间、精力、金钱、信息、人际的获取与配置' },
  feedback: { label: '反馈修正', desc: '从结果获取反馈、识别偏差并调整' },
  uncertainty: { label: '接受不确定性', desc: '在不确定中依然能行动与决策' }
}

const DIMENSION_KEYS = Object.keys(DIMENSIONS)
const FACTOR_KEYS = Object.keys(FACTORS)

// ---------------------------------------------------------------------------
// 通用辅助
// ---------------------------------------------------------------------------

const safeNum = (n, fallback = 0) => {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

const trendLabel = (delta) => {
  if (delta > 0.5) return '↑ 上升'
  if (delta < -0.5) return '↓ 下降'
  return '→ 持平'
}

/**
 * 格式化周评分区块
 */
const formatScores = (scores) => {
  if (!scores) return '（本周无评分数据）'
  const lines = DIMENSION_KEYS.map((key) => {
    const meta = DIMENSIONS[key]
    const score = safeNum(scores[key], null)
    if (score === null) return `- ${meta.label}（${key}）：未评分`
    return `- ${meta.label}（${key}）：${score}/5`
  })
  return lines.join('\n')
}

/**
 * 格式化趋势区块（相对上周的变化）
 */
const formatTrends = (trends) => {
  if (!trends) return '（无历史趋势数据，本周为首次记录）'
  const lines = DIMENSION_KEYS.map((key) => {
    const meta = DIMENSIONS[key]
    const delta = safeNum(trends[key], 0)
    return `- ${meta.label}（${key}）：${trendLabel(delta)}（${delta > 0 ? '+' : ''}${delta.toFixed(1)}）`
  })
  return lines.join('\n')
}

/**
 * 格式化要素数据区块
 */
const formatFactors = (factorData) => {
  if (!factorData) return '（无要素数据）'
  const lines = FACTOR_KEYS.map((key) => {
    const meta = FACTORS[key]
    const val = factorData[key]
    if (val == null) return `- ${meta.label}（${key}）：未记录`
    if (typeof val === 'object') {
      const score = safeNum(val.score, null)
      const note = val.note ? `，备注：${val.note}` : ''
      return `- ${meta.label}（${key}）：${score === null ? '未评分' : `${score}/10`}${note}`
    }
    return `- ${meta.label}（${key}）：${val}`
  })
  return lines.join('\n')
}

/**
 * 格式化目标列表
 */
const formatGoals = (goals) => {
  if (!goals || !goals.length) return '（用户当前没有设定目标）'
  const lines = goals.map((g, i) => {
    const title = g.title || g.name || `目标${i + 1}`
    const status = g.status || '进行中'
    const progress = safeNum(g.progress, null)
    const related = g.dimension ? `关联维度：${g.dimension}` : ''
    const deadline = g.deadline ? `截止：${g.deadline}` : ''
    return `- ${title}（状态：${status}${progress !== null ? `，进度：${progress}%` : ''}${related ? '，' + related : ''}${deadline ? '，' + deadline : ''}）`
  })
  return lines.join('\n')
}

/**
 * 格式化对话历史
 */
const formatHistory = (history) => {
  if (!history || !history.length) return '（无历史对话）'
  const recent = history.slice(-8) // 仅取最近 8 轮，控制 token
  const lines = recent.map((turn) => {
    const role = turn.role === 'assistant' ? 'AI教练' : '用户'
    const content = (turn.content || '').slice(0, 500)
    return `${role}：${content}`
  })
  return lines.join('\n')
}

/**
 * 计算简单的统计摘要（均值、最高/最低维度），帮助 LLM 快速定位
 */
const computeSummary = (scores) => {
  if (!scores) return null
  const entries = DIMENSION_KEYS
    .map((k) => [k, safeNum(scores[k], null)])
    .filter(([, v]) => v !== null)
  if (!entries.length) return null

  const values = entries.map(([, v]) => v)
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const sorted = [...entries].sort((a, b) => a[1] - b[1])
  const lowest = sorted[0]
  const highest = sorted[sorted.length - 1]
  const gap = highest[1] - lowest[1]

  return {
    avg: +avg.toFixed(2),
    lowest: { key: lowest[0], label: DIMENSIONS[lowest[0]].label, score: lowest[1] },
    highest: { key: highest[0], label: DIMENSIONS[highest[0]].label, score: highest[1] },
    gap
  }
}

// ---------------------------------------------------------------------------
// 对外函数 1：周度洞察上下文
// ---------------------------------------------------------------------------

/**
 * 组装周度洞察上下文
 * @param {Object} userData 用户数据
 *   - weeklyScores  本周 6 维度评分
 *   - trends        相对上周的变化
 *   - factorData    5 要素数据
 *   - goals         目标列表
 *   - profile       用户档案（可选）
 * @returns {string} 组装好的上下文文本
 */
const assembleWeeklyContext = (userData = {}) => {
  const { weeklyScores, trends, factorData, goals, profile = {} } = userData
  const summary = computeSummary(weeklyScores)

  const parts = []

  parts.push('【用户基本信息】')
  parts.push(`昵称：${profile.nickName || '匿名用户'}`)
  if (profile.stage) parts.push(`人生阶段：${profile.stage}`)
  if (profile.tags && profile.tags.length) parts.push(`标签：${profile.tags.join('、')}`)

  parts.push('\n【本周六维度评分】')
  parts.push(formatScores(weeklyScores))

  if (summary) {
    parts.push(`\n【评分摘要】`)
    parts.push(`均值 ${summary.avg}；最低维度：${summary.lowest.label}（${summary.lowest.score}）；最高维度：${summary.highest.label}（${summary.highest.score}）；维度极差：${summary.gap}`)
  }

  parts.push('\n【相对上周的趋势】')
  parts.push(formatTrends(trends))

  parts.push('\n【五大要素状态】')
  parts.push(formatFactors(factorData))

  parts.push('\n【当前目标】')
  parts.push(formatGoals(goals))

  parts.push('\n【任务说明】')
  parts.push('请基于上述数据生成本周洞察：识别崩溃点、杠杆点、维度失衡，并给出可执行的具体建议。')

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// 对外函数 2：对话辅导上下文（含历史）
// ---------------------------------------------------------------------------

/**
 * 组装对话辅导上下文
 * @param {Object} userData 用户数据（同上）
 * @param {string} message  用户本次消息
 * @param {Array}  history  历史对话 [{role, content}]
 * @returns {string}
 */
const assembleCoachContext = (userData = {}, message, history = []) => {
  const { weeklyScores, factorData, goals, profile = {} } = userData
  const summary = computeSummary(weeklyScores)

  const parts = []

  parts.push('【用户当前状态快照】')
  if (summary) {
    parts.push(
      `本周均值 ${summary.avg}；最低维度：${summary.lowest.label}（${summary.lowest.score}）；最高维度：${summary.highest.label}（${summary.highest.score}）。`
    )
  }
  parts.push(formatScores(weeklyScores))

  parts.push('\n【五大要素状态】')
  parts.push(formatFactors(factorData))

  if (goals && goals.length) {
    parts.push('\n【当前目标】')
    parts.push(formatGoals(goals))
  }

  if (profile.focusDimension) {
    parts.push(`\n用户重点关注维度：${DIMENSIONS[profile.focusDimension]?.label || profile.focusDimension}`)
  }

  parts.push('\n【历史对话】')
  parts.push(formatHistory(history))

  parts.push('\n【用户本次消息】')
  parts.push(message || '（用户未输入文字）')

  parts.push('\n【任务说明】')
  parts.push('请以 AI 教练身份回应用户消息，结合其当前状态给出框架对齐、具体可执行的建议。')

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// 对外函数 3：目标引导上下文
// ---------------------------------------------------------------------------

/**
 * 组装目标引导上下文
 * @param {Object} userData 用户数据
 * @param {string} message  用户关于目标的问题/诉求
 * @returns {string}
 */
const assembleGoalContext = (userData = {}, message) => {
  const { goals, weeklyScores, factorData, profile = {} } = userData
  const summary = computeSummary(weeklyScores)

  const parts = []

  parts.push('【用户目标清单】')
  parts.push(formatGoals(goals))

  parts.push('\n【用户当前状态】')
  if (summary) {
    parts.push(`本周均值 ${summary.avg}；最低维度：${summary.lowest.label}（${summary.lowest.score}）；最高维度：${summary.highest.label}（${summary.highest.score}）。`)
  }
  parts.push(formatScores(weeklyScores))

  parts.push('\n【五大要素状态】')
  parts.push(formatFactors(factorData))

  if (profile.stage) parts.push(`\n人生阶段：${profile.stage}`)

  parts.push('\n【用户本次诉求】')
  parts.push(message || '（用户未输入文字）')

  parts.push('\n【任务说明】')
  parts.push('请针对用户目标提供引导：拆解为符合“合适标准→持续行动→资源支持→反馈修正→接受不确定性”要素链的路径，指出当前最该补齐的要素，并给出下一步最小可行行动。')

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// 对外函数 4：每日一句话解读上下文
// ---------------------------------------------------------------------------

/**
 * 组装每日反馈上下文
 * @param {Object} todayRecord - 今日记录 { text, moodEmoji }
 * @param {Array} recentDays - 最近7天记录 [{ moodEmoji, text }]
 * @param {Object} weeklyScores - 本周六维评分（可选）
 * @returns {string}
 */
const assembleDailyContext = (todayRecord, recentDays = [], weeklyScores = null) => {
  const parts = []

  parts.push('【今日记录】')
  if (todayRecord) {
    parts.push(`心情：${todayRecord.moodEmoji || '未选择'}`)
    parts.push(`内容：${todayRecord.text || '（无文字记录）'}`)
  } else {
    parts.push('（今日无记录）')
  }

  parts.push('\n【近7天心情序列】')
  if (recentDays && recentDays.length > 0) {
    const moods = recentDays.map(d => d.moodEmoji || '❓').join(' → ')
    parts.push(moods)
  } else {
    parts.push('（无历史数据）')
  }

  parts.push('\n【本周六维评分】')
  parts.push(formatScores(weeklyScores))

  const summary = computeSummary(weeklyScores)
  if (summary) {
    parts.push(`\n【评分摘要】`)
    parts.push(`均值 ${summary.avg}；最低维度：${summary.lowest.label}（${summary.lowest.score}）`)
  }

  parts.push('\n【任务说明】')
  parts.push('请生成一句话解读（50字以内），识别能量趋势和情绪模式，给出温和的引导。只返回一句话，不需要 JSON 结构。')

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// 对外函数 5：季度复盘总结上下文
// ---------------------------------------------------------------------------

/**
 * 组装季度复盘总结上下文
 * @param {Object} reviewData - 季度复盘数据
 *   - collapseText      崩溃点检视
 *   - leverageText      杠杆点检视
 *   - imbalanceText     失衡点检视
 *   - sustainableText   可持续性检视
 *   - standardUpdateText 标准更新思考
 *   - focusFactor       下季度聚焦因子 key
 * @param {Array} weeklyList - 本季度周评分数数组（最多 13 条，按时间倒序）
 * @param {Array} factorsList - 因子数据数组
 * @returns {string} 组装好的上下文文本
 */
const assembleQuarterlyContext = (reviewData = {}, weeklyList = [], factorsList = []) => {
  const parts = []

  // 1. 四个结构检视
  parts.push('【季度结构检视】')
  parts.push(`崩溃点检视（哪个维度的崩塌会把一切拖下去）：${reviewData.collapseText || '（未填写）'}`)
  parts.push(`杠杆点检视（改善哪个维度能带动其他维度）：${reviewData.leverageText || '（未填写）'}`)
  parts.push(`失衡点检视（是否有某个维度过强，压制了其他维度）：${reviewData.imbalanceText || '（未填写）'}`)
  parts.push(`可持续性检视（当前的生活方式能再坚持一年吗）：${reviewData.sustainableText || '（未填写）'}`)

  // 2. 两个框架问题
  parts.push('\n【框架更新】')
  parts.push(`标准更新思考（本季度标准需要更新吗）：${reviewData.standardUpdateText || '（未填写）'}`)
  const focusFactorMeta = reviewData.focusFactor ? FACTORS[reviewData.focusFactor] : null
  parts.push(`下季度聚焦因子：${focusFactorMeta ? `${focusFactorMeta.label}（${reviewData.focusFactor}）—— ${focusFactorMeta.desc}` : '（未选择）'}`)

  // 3. 本季度周评趋势
  parts.push('\n【本季度周评分趋势】')
  if (weeklyList && weeklyList.length > 0) {
    parts.push(`共 ${weeklyList.length} 周评分记录（按时间倒序排列）：`)
    const trendLines = weeklyList.map((w, i) => {
      const weekNum = weeklyList.length - i
      const scores = DIMENSION_KEYS.map((key) => {
        const score = safeNum(w[key], null)
        return score === null ? '—' : `${score}`
      })
      return `第${weekNum}周：${DIMENSION_KEYS.map((k, j) => `${DIMENSIONS[k].label}${scores[j]}`).join('，')}`
    })
    parts.push(trendLines.join('\n'))

    // 计算季度均值与变化
    if (weeklyList.length >= 2) {
      const latest = weeklyList[0]
      const oldest = weeklyList[weeklyList.length - 1]
      const summary = computeSummary(latest)
      if (summary) {
        parts.push(`\n最新一周均值 ${summary.avg}；最低维度：${summary.lowest.label}（${summary.lowest.score}）；最高维度：${summary.highest.label}（${summary.highest.score}）。`)
      }

      // 各维度季度变化
      const changeLines = DIMENSION_KEYS.map((key) => {
        const latestScore = safeNum(latest[key], null)
        const oldestScore = safeNum(oldest[key], null)
        if (latestScore === null || oldestScore === null) return null
        const diff = +(latestScore - oldestScore).toFixed(1)
        const dir = diff > 0.5 ? '↑上升' : diff < -0.5 ? '↓下降' : '→持平'
        return `- ${DIMENSIONS[key].label}（${key}）：${oldestScore} → ${latestScore}（${dir}，${diff > 0 ? '+' : ''}${diff}）`
      }).filter(Boolean)
      if (changeLines.length > 0) {
        parts.push('\n各维度季度变化：')
        parts.push(changeLines.join('\n'))
      }
    }
  } else {
    parts.push('（本季度无周评数据）')
  }

  // 4. 要素数据
  parts.push('\n【五要素状态（最近一条）】')
  if (factorsList && factorsList.length > 0) {
    parts.push(formatFactors(factorsList[0]))
  } else {
    parts.push('（无要素数据）')
  }

  // 5. 任务说明
  parts.push('\n【任务说明】')
  parts.push('请基于上述季度复盘数据生成本季度总结，输出 JSON 格式，包含以下字段：')
  parts.push('- summary: 2-3 句总体评估，概括本季度系统运转状态与核心发现')
  parts.push('- trends: 数组，每个元素包含 dimension（维度 key）、label（中文名）、direction（up/down/stable）、change（数值变化）、from、to')
  parts.push('- keyFindings: 数组，基于复盘数据和周评趋势的关键发现，每个元素包含 type（danger/leverage/warning/info/success）、title、text')
  parts.push('- recommendations: 数组，下季度可执行建议，每个元素包含 title、text、priority（high/medium/low）、factor（关联要素 key）')
  parts.push('只输出 JSON 本身，确保可被 JSON.parse 直接解析。')

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// 对外函数 6：转向信号检测上下文
// ---------------------------------------------------------------------------

/**
 * 组装转向信号检测上下文
 * @param {Array} weeklyList - 周评分数组（按时间正序，最旧在前）
 * @param {Array} pivotRecords - 已有的转向信号记录数组（newest-first）
 * @returns {string} 组装好的上下文文本
 */
const assemblePivotContext = (weeklyList = [], pivotRecords = []) => {
  const parts = []

  // 1. 周评分趋势（最多 13 周）
  parts.push('【最近周评分趋势】')
  if (weeklyList && weeklyList.length > 0) {
    parts.push(`共 ${weeklyList.length} 周评分记录（按时间正序，最旧在前）：`)
    const trendLines = weeklyList.map((w, i) => {
      const weekNum = i + 1
      const scores = DIMENSION_KEYS.map((key) => {
        const score = safeNum(w[key], null)
        return score === null ? '—' : `${score}`
      })
      const overall = DIMENSION_KEYS.reduce((sum, key) => sum + safeNum(w[key], 0), 0) / DIMENSION_KEYS.length
      return `第${weekNum}周：${DIMENSION_KEYS.map((k, j) => `${DIMENSIONS[k].label}${scores[j]}`).join('，')}（均值 ${overall.toFixed(1)}）`
    })
    parts.push(trendLines.join('\n'))

    // 计算趋势变化
    if (weeklyList.length >= 2) {
      const latest = weeklyList[weeklyList.length - 1]
      const oldest = weeklyList[0]
      const latestOverall = DIMENSION_KEYS.reduce((sum, key) => sum + safeNum(latest[key], 0), 0) / DIMENSION_KEYS.length
      const oldestOverall = DIMENSION_KEYS.reduce((sum, key) => sum + safeNum(oldest[key], 0), 0) / DIMENSION_KEYS.length
      const diff = +(latestOverall - oldestOverall).toFixed(1)
      const dir = diff > 0.3 ? '↑上升' : diff < -0.3 ? '↓下降' : '→持平'
      parts.push(`\n趋势：最早一周均值 ${oldestOverall.toFixed(1)} → 最新一周均值 ${latestOverall.toFixed(1)}（${dir}，${diff > 0 ? '+' : ''}${diff}）`)

      // 各维度变化
      const changeLines = DIMENSION_KEYS.map((key) => {
        const latestScore = safeNum(latest[key], null)
        const oldestScore = safeNum(oldest[key], null)
        if (latestScore === null || oldestScore === null) return null
        const dimDiff = +(latestScore - oldestScore).toFixed(1)
        const dimDir = dimDiff > 0.5 ? '↑' : dimDiff < -0.5 ? '↓' : '→'
        return `- ${DIMENSIONS[key].label}（${key}）：${oldestScore} → ${latestScore}（${dimDir}，${dimDiff > 0 ? '+' : ''}${dimDiff}）`
      }).filter(Boolean)
      if (changeLines.length > 0) {
        parts.push('\n各维度变化：')
        parts.push(changeLines.join('\n'))
      }

      // 检测连续下行
      const overallTrend = weeklyList.map((w) => DIMENSION_KEYS.reduce((sum, key) => sum + safeNum(w[key], 0), 0) / DIMENSION_KEYS.length)
      let declineStreak = 0
      for (let i = overallTrend.length - 1; i >= 1; i--) {
        if (overallTrend[i] < overallTrend[i - 1]) declineStreak++
        else break
      }
      if (declineStreak >= 2) {
        parts.push(`\n⚠ 综合健康度已连续 ${declineStreak} 周下行`)
      }

      // 检测重复低位
      DIMENSION_KEYS.forEach((key) => {
        let lowStreak = 0
        let maxLowStreak = 0
        for (let i = weeklyList.length - 1; i >= 0; i--) {
          const score = safeNum(weeklyList[i][key], null)
          if (score !== null && score <= 2) {
            lowStreak++
            maxLowStreak = Math.max(maxLowStreak, lowStreak)
          } else {
            lowStreak = 0
          }
        }
        if (maxLowStreak >= 3) {
          parts.push(`\n⚠ ${DIMENSIONS[key].label}连续 ${maxLowStreak} 周得分 ≤2`)
        }
      })

      // 检测结构性崩塌（最新一周）
      const latestLowDims = DIMENSION_KEYS.filter((key) => safeNum(latest[key], null) !== null && safeNum(latest[key], 0) <= 2)
      if (latestLowDims.length >= 3) {
        parts.push(`\n⚠ 最新一周有 ${latestLowDims.length} 个维度低于 2 分：${latestLowDims.map((k) => DIMENSIONS[k].label).join('、')}`)
      }

      // 检测差距扩大
      const gaps = weeklyList.map((w) => {
        const scores = DIMENSION_KEYS.map((k) => safeNum(w[k], 0))
        return Math.max(...scores) - Math.min(...scores)
      })
      let gapWideningStreak = 0
      for (let i = gaps.length - 1; i >= 1; i--) {
        if (gaps[i] > gaps[i - 1]) gapWideningStreak++
        else break
      }
      if (gapWideningStreak >= 3) {
        parts.push(`\n⚠ 维度间差距连续 ${gapWideningStreak} 周扩大（极差从 ${gaps[gaps.length - 1 - gapWideningStreak]} 到 ${gaps[gaps.length - 1]}）`)
      }
    }
  } else {
    parts.push('（无周评数据）')
  }

  // 2. 已有转向信号记录
  parts.push('\n【已有转向信号记录】')
  if (pivotRecords && pivotRecords.length > 0) {
    parts.push(`共 ${pivotRecords.length} 条历史记录（newest-first）：`)
    const recordLines = pivotRecords.slice(0, 5).map((r, i) => {
      const checkedSignals = r.checkedSignals || []
      const checkedCount = r.checkedCount || checkedSignals.length
      const recommendationLevel = r.recommendationLevel || 'unknown'
      return `- 记录${i + 1}（${r.id || r.date || '未知日期'}）：勾选 ${checkedCount} 个信号，推荐级别 ${recommendationLevel}`
    })
    parts.push(recordLines.join('\n'))
  } else {
    parts.push('（无历史转向信号记录）')
  }

  // 3. 任务说明
  parts.push('\n【任务说明】')
  parts.push('请基于上述历史评分趋势和已有转向信号记录，检测以下四类转向信号：')
  parts.push('1. consecutiveDecline（连续下行）：综合健康度连续 2+ 周下降')
  parts.push('2. repeatedLow（重复低位）：同一维度连续 3+ 周得分 ≤2')
  parts.push('3. structuralCollapse（结构性崩塌）：单周内 3+ 维度低于 2 分')
  parts.push('4. gapWidening（差距扩大）：维度间极差连续 3+ 周扩大')
  parts.push('')
  parts.push('输出 JSON 格式，包含以下字段：')
  parts.push('- signals: 数组，每个元素包含 type（信号类型）、dimension（关联维度 key，无则 null）、severity（danger/warning/info）、description（信号描述）')
  parts.push('- recommendation: 字符串，基于检测到的信号给出综合建议')
  parts.push('只输出 JSON 本身，确保可被 JSON.parse 直接解析。')

  return parts.join('\n')
}

module.exports = {
  assembleWeeklyContext,
  assembleCoachContext,
  assembleGoalContext,
  assembleDailyContext,
  assembleQuarterlyContext,
  assemblePivotContext,
  // 导出元数据与辅助函数供其他模块复用
  DIMENSIONS,
  FACTORS,
  computeSummary
}

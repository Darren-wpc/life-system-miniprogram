/**
 * index.js - AI 教练云函数主入口
 *
 * 支持的 action：
 *   - weeklyInsight  周度洞察：基于本周评分生成结构化洞察与建议
 *   - coachChat      对话辅导：结合用户状态与历史进行多轮对话
 *   - goalGuidance   目标引导：针对用户目标拆解要素链与下一步行动
 *
 * 返回结构：
 *   成功：{ success: true, data: result }
 *   失败：{ success: false, fallback: <规则引擎结果>, error: <错误信息> }
 */

const cloud = require('wx-server-sdk')
const { chat } = require('./llm')
const {
  assembleWeeklyContext,
  assembleCoachContext,
  assembleGoalContext,
  assembleDailyContext,
  assembleQuarterlyContext,
  assemblePivotContext,
  DIMENSIONS,
  computeSummary
} = require('./context')
const { SYSTEM_PROMPT } = require('./prompts/system')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const VALID_ACTIONS = ['weeklyInsight', 'coachChat', 'goalGuidance', 'syncHistory', 'dailyReflect', 'quarterlySummary', 'pivotCheck']

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------
exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  console.log(`[aiCoach] 收到请求 openid=${openid} action=${action}`)

  // 1. 校验 action
  if (!VALID_ACTIONS.includes(action)) {
    return {
      success: false,
      fallback: null,
      error: `无效的 action: ${action}，支持的值: ${VALID_ACTIONS.join(', ')}`
    }
  }

  // 2. 拉取用户数据（在 try 外声明，便于回退时复用）
  let userData = {}
  try {
    userData = await fetchUserData(openid)
  } catch (err) {
    console.warn('[aiCoach] 拉取用户数据失败，使用空数据继续:', err.message)
    userData = {}
  }

  // 2.5 同步历史动作：直接写入云数据库后返回
  if (action === 'syncHistory') {
    const result = await syncHistory(openid, event.history || [])
    return { success: true, data: result }
  }

  // 3. 根据动作组装上下文并调用 LLM
  //    coachChat 场景启用流式响应，降低首字延迟
  try {
    const userContext = buildUserContext(action, event, userData)
    const useStream = action === 'coachChat'
    const raw = await chat({
      system: SYSTEM_PROMPT,
      user: userContext,
      stream: useStream,
      temperature: 0.7,
      maxTokens: action === 'dailyReflect' ? 200 : 2000
    })

    // dailyReflect 返回纯文本一句话，无需 JSON 解析
    if (action === 'dailyReflect') {
      const reflect = (raw || '').trim().slice(0, 100) // 限制 100 字
      return { success: true, data: { reflect } }
    }

    const parsed = parseLLMJson(raw)

    // quarterlySummary: 返回解析后的季度总结数据，使用独立的字段校验
    if (action === 'quarterlySummary') {
      const result = validateQuarterlyResult(parsed)
      return { success: true, data: result }
    }

    // pivotCheck: 返回解析后的转向信号检测结果，使用独立的字段校验
    if (action === 'pivotCheck') {
      const result = validatePivotResult(parsed)
      return { success: true, data: result }
    }

    const result = validateResult(parsed, action, userData)

    // 4. 持久化对话历史到云数据库（仅对话类 action）
    if (action === 'coachChat' || action === 'goalGuidance') {
      await saveHistory(openid, event.message, result, action)
    }

    return { success: true, data: result }
  } catch (err) {
    console.error(`[aiCoach] action=${action} 失败，回退到规则引擎:`, err.message || err)
    const fallback = ruleEngineFallback(action, event, userData)
    return {
      success: false,
      fallback,
      error: err.message || String(err)
    }
  }
}

// ---------------------------------------------------------------------------
// 上下文组装分发
// ---------------------------------------------------------------------------
const buildUserContext = (action, event, userData) => {
  switch (action) {
    case 'weeklyInsight':
      return assembleWeeklyContext(userData)
    case 'coachChat':
      return assembleCoachContext(userData, event.message, event.history)
    case 'goalGuidance':
      return assembleGoalContext(userData, event.message)
    case 'dailyReflect':
      return assembleDailyContext(event.todayRecord, event.recentDays, userData.weeklyScores)
    case 'quarterlySummary':
      return assembleQuarterlyContext(event.reviewData, event.weeklyList, event.factorsList)
    case 'pivotCheck':
      return assemblePivotContext(event.weeklyList, event.pivotRecords)
    default:
      return assembleWeeklyContext(userData)
  }
}

// ---------------------------------------------------------------------------
// 用户数据拉取
// ---------------------------------------------------------------------------
/**
 * 从云数据库拉取用户相关数据：
 *   - profile     用户档案
 *   - weeklyScores 本周评分（取最近一条）
 *   - lastWeekScores 上周评分（用于计算趋势）
 *   - factorData  要素数据
 *   - goals       目标列表
 *   - chatHistory 对话历史
 */
const fetchUserData = async (openid) => {
  if (!openid) {
    return {}
  }

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  // 并行查询，提升速度
  const [profileRes, scoresRes, factorRes, goalsRes, historyRes] = await Promise.all([
    safeQuery(() => db.collection('user_profile').where({ openid }).limit(1).get()),
    safeQuery(() =>
      db
        .collection('weekly_scores')
        .where({ openid, createdAt: _.gte(twoWeeksAgo) })
        .orderBy('createdAt', 'desc')
        .limit(2)
        .get()
    ),
    safeQuery(() =>
      db
        .collection('factor_data')
        .where({ openid })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get()
    ),
    safeQuery(() => db.collection('goals').where({ openid, status: _.neq('archived') }).get()),
    safeQuery(() =>
      db
        .collection('chat_history')
        .where({ openid, createdAt: _.gte(weekAgo) })
        .orderBy('createdAt', 'desc')
        .limit(8)
        .get()
    )
  ])

  // 解析本周 / 上周评分
  const scoresList = (scoresRes && scoresRes.data) || []
  const thisWeek = scoresList[0] || null
  const lastWeek = scoresList[1] || null
  const weeklyScores = thisWeek ? thisWeek.scores : null
  const lastWeekScores = lastWeek ? lastWeek.scores : null
  const trends = computeTrends(weeklyScores, lastWeekScores)

  const factorData = factorRes && factorRes.data && factorRes.data[0]
    ? factorRes.data[0].factors
    : null

  const goals = (goalsRes && goalsRes.data) || []

  // 历史按时间正序排列
  const historyRaw = (historyRes && historyRes.data) || []
  const chatHistory = historyRaw
    .reverse()
    .map((item) => ({ role: item.role, content: item.content }))

  const profile = (profileRes && profileRes.data && profileRes.data[0]) || {}

  return {
    profile,
    weeklyScores,
    trends,
    factorData,
    goals,
    chatHistory
  }
}

/**
 * 计算各维度相对上周的变化
 */
const computeTrends = (current, previous) => {
  if (!current || !previous) return null
  const trends = {}
  Object.keys(DIMENSIONS).forEach((key) => {
    const c = Number(current[key])
    const p = Number(previous[key])
    if (Number.isFinite(c) && Number.isFinite(p)) {
      trends[key] = +(c - p).toFixed(2)
    }
  })
  return trends
}

/**
 * 安全查询：单个查询失败不影响整体，返回空结果
 */
const safeQuery = async (fn) => {
  try {
    return await fn()
  } catch (err) {
    console.warn('[aiCoach] 子查询失败:', err.message)
    return { data: [] }
  }
}

/**
 * 将对话记录持久化到云数据库 chat_history 集合
 * @param {string} openid - 用户 openid
 * @param {string} userMessage - 用户消息
 * @param {Object} aiResult - AI 返回结果
 * @param {string} action - 动作类型
 */
const saveHistory = async (openid, userMessage, aiResult, action) => {
  if (!openid || !userMessage) return

  const now = new Date()
  const replyText = aiResult.reply || aiResult.summary || ''

  try {
    // 写入用户消息
    await db.collection('chat_history').add({
      data: {
        openid,
        role: 'user',
        content: userMessage,
        action,
        createdAt: now
      }
    })

    // 写入 AI 回复
    if (replyText) {
      await db.collection('chat_history').add({
        data: {
          openid,
          role: 'assistant',
          content: replyText,
          action,
          createdAt: new Date(now.getTime() + 1000) // +1s 保证 AI 消息在用户消息之后
        }
      })
    }

    console.log('[aiCoach] 对话历史已持久化到云数据库')
  } catch (err) {
    // 持久化失败不影响主流程，仅记录日志
    console.warn('[aiCoach] 对话历史持久化失败:', err.message)
  }
}

/**
 * 批量同步本地对话历史到云数据库
 * @param {string} openid - 用户 openid
 * @param {Array} history - 本地对话历史 [{role, content, timestamp}]
 */
const syncHistory = async (openid, history) => {
  if (!openid || !history || !history.length) return { synced: 0 }

  let synced = 0
  try {
    // 批量写入（每次最多 20 条，云数据库单次批量限制）
    const batchSize = 20
    for (let i = 0; i < history.length; i += batchSize) {
      const batch = history.slice(i, i + batchSize)
      const tasks = batch.map((msg) =>
        db.collection('chat_history').add({
          data: {
            openid,
            role: msg.role === 'ai' ? 'assistant' : 'user',
            content: msg.content,
            action: 'sync',
            createdAt: new Date(msg.timestamp || Date.now())
          }
        })
      )
      await Promise.all(tasks)
      synced += batch.length
    }
    console.log(`[aiCoach] 同步 ${synced} 条对话历史到云数据库`)
    return { synced }
  } catch (err) {
    console.warn('[aiCoach] 对话历史同步失败:', err.message)
    return { synced, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// LLM 响应解析与校验
// ---------------------------------------------------------------------------

/**
 * 解析 LLM 返回的文本为 JSON。
 * 兼容：纯 JSON、被 markdown 代码块包裹、前后多余文字等情况。
 */
const parseLLMJson = (raw) => {
  if (!raw || typeof raw !== 'string') {
    throw new Error('LLM 返回内容为空')
  }

  let text = raw.trim()

  // 去除 markdown 代码块包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // 尝试直接解析
  try {
    return JSON.parse(text)
  } catch (e) {
    // 兜底：提取首个 { 到末尾 } 的子串
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      const slice = text.slice(start, end + 1)
      return JSON.parse(slice)
    }
    throw new Error(`LLM 返回内容无法解析为 JSON: ${text.slice(0, 200)}`)
  }
}

/**
 * 校验并规范化结果结构，确保下游可消费。
 */
const validateResult = (parsed, action, userData) => {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM 返回结构非法（非对象）')
  }

  // 基础字段兜底
  const result = {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    details: Array.isArray(parsed.details) ? parsed.details : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    followUp: Array.isArray(parsed.followUp) ? parsed.followUp : []
  }

  // details 字段补全
  result.details = result.details.map((d) => ({
    dimension: d.dimension || null,
    label: d.label || (d.dimension ? DIMENSIONS[d.dimension]?.label : '') || '',
    score: typeof d.score === 'number' ? d.score : null,
    type: ['collapse', 'leverage', 'imbalance', 'stable'].includes(d.type) ? d.type : 'stable',
    analysis: typeof d.analysis === 'string' ? d.analysis : ''
  }))

  // suggestions 字段补全
  result.suggestions = result.suggestions.map((s) => ({
    title: s.title || '',
    content: s.content || '',
    priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
    dimension: s.dimension || null,
    factor: s.factor || null
  }))

  // followUp 字段补全
  result.followUp = result.followUp.map((f) => ({
    question: f.question || '',
    intent: f.intent || ''
  }))

  // 对话辅导场景：补充自由文本回复字段（若 LLM 给出则保留）
  if (action === 'coachChat' && typeof parsed.reply === 'string') {
    result.reply = parsed.reply
  }

  return result
}

/**
 * 校验并规范化季度总结结果结构
 */
const validateQuarterlyResult = (parsed) => {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM 返回结构非法（非对象）')
  }

  const result = {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    trends: Array.isArray(parsed.trends) ? parsed.trends.map((t) => ({
      dimension: t.dimension || null,
      label: t.label || (t.dimension ? DIMENSIONS[t.dimension]?.label : '') || '',
      direction: ['up', 'down', 'stable'].includes(t.direction) ? t.direction : 'stable',
      change: typeof t.change === 'number' ? t.change : 0,
      from: typeof t.from === 'number' ? t.from : null,
      to: typeof t.to === 'number' ? t.to : null
    })) : [],
    keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings.map((f) => ({
      type: ['danger', 'leverage', 'warning', 'info', 'success'].includes(f.type) ? f.type : 'info',
      title: f.title || '',
      text: f.text || ''
    })) : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map((r) => ({
      title: r.title || '',
      text: r.text || '',
      priority: ['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium',
      factor: r.factor || null
    })) : []
  }

  return result
}

/**
 * 校验并规范化转向信号检测结果结构
 */
const validatePivotResult = (parsed) => {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM 返回结构非法（非对象）')
  }

  const result = {
    signals: Array.isArray(parsed.signals) ? parsed.signals.map((s) => ({
      type: typeof s.type === 'string' ? s.type : 'unknown',
      dimension: s.dimension || null,
      severity: ['danger', 'warning', 'info'].includes(s.severity) ? s.severity : 'info',
      description: typeof s.description === 'string' ? s.description : ''
    })) : [],
    recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : ''
  }

  return result
}

// ---------------------------------------------------------------------------
// 规则引擎兜底（无 LLM / LLM 失败时使用）
// ---------------------------------------------------------------------------

/**
 * 基于评分的本地规则引擎，生成结构化兜底结果。
 * 逻辑：定位最低维度为崩溃点/杠杆点，最高维度为优势，
 *       给出与要素绑定的通用建议。
 */
const ruleEngineFallback = (action, event, userData) => {
  const scores = userData && userData.weeklyScores
  const summary = computeSummary(scores)

  // pivotCheck: 基于周评趋势生成基础转向信号检测
  if (action === 'pivotCheck') {
    return _buildPivotFallback(event)
  }

  // 无评分数据时的最小兜底
  if (!summary) {
    return buildMinimalFallback(action, event)
  }

  const details = []
  const suggestions = []
  const followUp = []

  // 1. 最低维度 —— 视为崩溃点 / 杠杆点
  const low = summary.lowest
  details.push({
    dimension: low.key,
    label: low.label,
    score: low.score,
    type: low.score <= 2 ? 'collapse' : 'leverage',
    analysis: `${low.label}（${low.score}/5）为本周最低维度，是当前最需要稳定的结构性短板。建议先从"合适标准"与"持续行动"两个要素入手，建立最小可行动作。`
  })

  // 2. 最高维度 —— 优势点
  const high = summary.highest
  if (high.key !== low.key) {
    details.push({
      dimension: high.key,
      label: high.label,
      score: high.score,
      type: 'stable',
      analysis: `${high.label}（${high.score}/5）为本周最高维度，是当前相对稳定的优势区，可作为支撑其他维度的资源。`
    })
  }

  // 3. 失衡判断
  if (summary.gap >= 4) {
    details.push({
      dimension: low.key,
      label: `${low.label} 与 ${high.label}`,
      score: null,
      type: 'imbalance',
      analysis: `最高与最低维度极差达 ${summary.gap}，存在结构性失衡，长期会形成“高处无地基、低处无资源”的风险。`
    })
  }

  // 4. 通用建议
  suggestions.push({
    title: `为「${low.label}」设定合适标准`,
    content: `本周为 ${low.label} 设定一个与当前阶段匹配的最低合格线（而非理想标准），并连续 5 天记录是否达标。目标是先建立稳定节奏，再逐步提升标准。`,
    priority: 'high',
    dimension: low.key,
    factor: 'standards'
  })
  suggestions.push({
    title: '建立最小反馈闭环',
    content: '每天用 3 分钟回顾当天在最低维度的一个小动作是否完成，并标注一个阻力原因，形成“行动—反馈—修正”的闭环。',
    priority: 'medium',
    dimension: low.key,
    factor: 'feedback'
  })

  // 5. 后续追问
  followUp.push({
    question: `本周${low.label}得分较低，主要受什么因素影响？`,
    intent: '定位崩溃点根因，校准下一步建议标准'
  })

  const summaryText =
    summary.gap >= 4
      ? `本周均值 ${summary.avg}，${low.label}为最低维度（${low.score}）且与最高维度极差 ${summary.gap}，存在结构性失衡，建议优先稳定${low.label}。`
      : `本周均值 ${summary.avg}，${low.label}为最需关注的杠杆点（${low.score}），稳定它可带动整体提升。`

  const base = {
    summary: summaryText,
    details,
    suggestions,
    followUp
  }

  // 按动作微调输出
  if (action === 'coachChat') {
    base.reply = `（规则引擎兜底）${summaryText} 你可以告诉我更多关于${low.label}的情况，我来帮你拆解下一步。`
  }
  if (action === 'goalGuidance') {
    base.reply = `（规则引擎兜底）针对你的目标，当前最该补齐的是${low.label}对应的"合适标准"与"持续行动"要素，建议先设定最小合格线并开始记录。`
  }
  if (action === 'dailyReflect') {
    const mood = (event.todayRecord && event.todayRecord.moodEmoji) || ''
    const moodText = {
      '😄': '状态良好，抓住能量推进重要事项。',
      '🙂': '平稳是积累的基础，继续保持。',
      '😐': '试试找到今天的一个小亮点。',
      '😔': `${low.label}本周得分较低，注意能量管理。`,
      '😢': '疲惫时优先休息，允许低谷期存在。'
    }
    return {
      reflect: moodText[mood] || `${summaryText}保持觉察，继续记录。`
    }
  }

  // quarterlySummary: 基于复盘数据生成基础季度总结
  if (action === 'quarterlySummary') {
    return _buildQuarterlyFallback(event, summary, low, high)
  }

  return base
}

/**
 * 季度总结规则引擎兜底：基于复盘数据生成基础总结
 */
const _buildQuarterlyFallback = (event, summary, low, high) => {
  const reviewData = event.reviewData || {}
  const weeklyList = event.weeklyList || []

  // 总体评估
  const summaryText = summary
    ? `本季度均值 ${summary.avg}，最低维度为${low.label}（${low.score}），最高维度为${high.label}（${high.score}）。`
    : '本季度评分数据不足，基于复盘内容生成总结。'

  const reviewSnippet = reviewData.collapseText
    ? `核心崩溃风险：${reviewData.collapseText.slice(0, 50)}。`
    : ''

  const fullSummary = reviewSnippet
    ? `${summaryText}${reviewSnippet}`
    : summaryText

  // 趋势分析
  const trends = []
  if (weeklyList.length >= 2) {
    const latest = weeklyList[0]
    const oldest = weeklyList[weeklyList.length - 1]
    Object.keys(DIMENSIONS).forEach((key) => {
      const latestScore = Number(latest[key])
      const oldestScore = Number(oldest[key])
      if (Number.isFinite(latestScore) && Number.isFinite(oldestScore)) {
        const diff = +(latestScore - oldestScore).toFixed(1)
        let direction = 'stable'
        if (diff > 0.5) direction = 'up'
        else if (diff < -0.5) direction = 'down'
        trends.push({
          dimension: key,
          label: DIMENSIONS[key].label,
          direction,
          change: diff,
          from: oldestScore,
          to: latestScore
        })
      }
    })
  }

  // 关键发现
  const keyFindings = []
  if (reviewData.collapseText) {
    keyFindings.push({ type: 'danger', title: '崩溃风险点', text: reviewData.collapseText })
  }
  if (reviewData.leverageText) {
    keyFindings.push({ type: 'leverage', title: '关键杠杆点', text: reviewData.leverageText })
  }
  if (reviewData.imbalanceText) {
    keyFindings.push({ type: 'warning', title: '结构性失衡', text: reviewData.imbalanceText })
  }
  if (reviewData.sustainableText) {
    keyFindings.push({ type: 'info', title: '可持续性评估', text: reviewData.sustainableText })
  }

  // 建议
  const recommendations = []
  if (reviewData.focusFactor) {
    const factorLabels = {
      standards: '合适标准', action: '持续行动', resources: '资源支持',
      feedback: '反馈修正', uncertainty: '接受不确定性'
    }
    recommendations.push({
      title: `聚焦因子：${factorLabels[reviewData.focusFactor] || reviewData.focusFactor}`,
      text: '下季度将主要精力放在此因子上，每周做一次刻意练习并记录进展。',
      priority: 'high',
      factor: reviewData.focusFactor
    })
  }
  if (reviewData.collapseText) {
    recommendations.push({
      title: '建立崩溃防御机制',
      text: '针对识别到的崩溃风险，设定明确底线和中断恢复脚本，防止连锁崩盘。',
      priority: 'high'
    })
  }
  if (reviewData.leverageText) {
    recommendations.push({
      title: '持续投入杠杆点',
      text: '继续在杠杆方向上投入，每天 15-30 分钟，观察连带效应。',
      priority: 'high'
    })
  }
  if (recommendations.length === 0) {
    recommendations.push({
      title: '保持定期复盘',
      text: '继续每周评估和季度复盘的节奏，用数据驱动决策。',
      priority: 'low'
    })
  }

  return {
    summary: fullSummary,
    trends,
    keyFindings,
    recommendations
  }
}

/**
 * 转向信号检测规则引擎兜底：基于周评趋势生成基础检测
 */
const _buildPivotFallback = (event) => {
  const weeklyList = event.weeklyList || []
  const pivotRecords = event.pivotRecords || []
  const signals = []

  const dimKeys = Object.keys(DIMENSIONS)

  if (weeklyList.length < 2) {
    return {
      signals: [],
      recommendation: '周评分数据不足，暂无法检测转向信号。建议连续记录至少 3 周后再进行检测。'
    }
  }

  const latest = weeklyList[weeklyList.length - 1]

  // 规则 1: 连续下行（综合健康度连续 2+ 周下降）
  const overallTrend = weeklyList.map((w) => {
    const vals = dimKeys.map((k) => Number(w[k])).filter((v) => Number.isFinite(v))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  })
  let declineStreak = 0
  for (let i = overallTrend.length - 1; i >= 1; i--) {
    if (overallTrend[i] < overallTrend[i - 1]) declineStreak++
    else break
  }
  if (declineStreak >= 2) {
    signals.push({
      type: 'consecutiveDecline',
      dimension: null,
      severity: declineStreak >= 3 ? 'danger' : 'warning',
      description: `综合健康度已连续 ${declineStreak} 周下行，整体系统处于持续衰退状态。`
    })
  }

  // 规则 2: 重复低位（同一维度连续 3+ 周得分 <= 2）
  dimKeys.forEach((key) => {
    let lowStreak = 0
    let maxLowStreak = 0
    for (let i = weeklyList.length - 1; i >= 0; i--) {
      const score = Number(weeklyList[i][key])
      if (Number.isFinite(score) && score <= 2) {
        lowStreak++
        maxLowStreak = Math.max(maxLowStreak, lowStreak)
      } else {
        lowStreak = 0
      }
    }
    if (maxLowStreak >= 3) {
      signals.push({
        type: 'repeatedLow',
        dimension: key,
        severity: 'danger',
        description: `${DIMENSIONS[key].label}连续 ${maxLowStreak} 周得分处于低位（≤2），该维度长期未得到改善。`
      })
    }
  })

  // 规则 3: 结构性崩塌（单周内 3+ 维度低于 2 分）
  const lowDims = dimKeys.filter((key) => {
    const score = Number(latest[key])
    return Number.isFinite(score) && score <= 2
  })
  if (lowDims.length >= 3) {
    signals.push({
      type: 'structuralCollapse',
      dimension: null,
      severity: 'danger',
      description: `最新一周有 ${lowDims.length} 个维度低于 2 分（${lowDims.map((k) => DIMENSIONS[k].label).join('、')}），系统出现结构性崩塌。`
    })
  }

  // 规则 4: 差距扩大（维度间极差连续 3+ 周扩大）
  const gaps = weeklyList.map((w) => {
    const scores = dimKeys.map((k) => Number(w[k])).filter((v) => Number.isFinite(v))
    return scores.length ? Math.max(...scores) - Math.min(...scores) : 0
  })
  let gapWideningStreak = 0
  for (let i = gaps.length - 1; i >= 1; i--) {
    if (gaps[i] > gaps[i - 1]) gapWideningStreak++
    else break
  }
  if (gapWideningStreak >= 3) {
    signals.push({
      type: 'gapWidening',
      dimension: null,
      severity: 'warning',
      description: `维度间差距连续 ${gapWideningStreak} 周扩大，系统失衡加剧。`
    })
  }

  // 结合已有转向记录
  if (pivotRecords.length > 0) {
    const latestPivot = pivotRecords[0]
    if (latestPivot && latestPivot.checkedCount >= 2) {
      signals.push({
        type: 'historicalSignal',
        dimension: null,
        severity: latestPivot.checkedCount >= 3 ? 'danger' : 'warning',
        description: `历史转向检测记录显示已勾选 ${latestPivot.checkedCount} 个信号，建议结合本次检测综合判断。`
      })
    }
  }

  // 生成综合建议
  const dangerCount = signals.filter((s) => s.severity === 'danger').length
  const warningCount = signals.filter((s) => s.severity === 'warning').length
  let recommendation = ''

  if (dangerCount >= 2) {
    recommendation = '检测到多个高危转向信号，系统正处于严重衰退中。建议立即暂停新增目标，优先稳定基础维度，并完成转向准备清单评估转向条件。'
  } else if (dangerCount >= 1) {
    recommendation = '检测到高危转向信号，某个或多个维度已处于崩溃边缘。建议使用中断恢复脚本快速止损，识别最低维度的根因，区分暂时性波动还是结构性问题。'
  } else if (warningCount >= 1) {
    recommendation = '检测到需关注的转向信号，系统出现下行或失衡趋势。建议连续观察 2-3 周确认趋势，找到当前杠杆点集中改善。'
  } else {
    recommendation = '暂未检测到明显的转向信号。当前系统运转相对稳定，建议继续保持观察，定期复评。'
  }

  return {
    signals,
    recommendation
  }
}

/**
 * 完全无数据时的最小兜底
 */
const buildMinimalFallback = (action, event) => {
  // dailyReflect 兜底
  if (action === 'dailyReflect') {
    const mood = (event.todayRecord && event.todayRecord.moodEmoji) || ''
    const moodSuggestion = {
      '😄': '今天状态不错，保持节奏继续推进。',
      '🙂': '平稳的一天，积累就是力量。',
      '😐': '中性不代表平淡，试试找到一个小亮点。',
      '😔': '低落时会过去的，先照顾好自己。',
      '😢': '疲惫时允许休息，明天是新的开始。'
    }
    return {
      reflect: moodSuggestion[mood] || '记录每一天，是认识自己的第一步。'
    }
  }

  if (action === 'coachChat') {
    return {
      summary: '尚未有足够的评分数据，暂以通用引导回应。',
      details: [],
      suggestions: [
        {
          title: '先完成本周六维度自评',
          content: '完成一次六维度评分（1-10 分），AI 教练才能给出框架对齐的建议。',
          priority: 'high',
          dimension: null,
          factor: 'standards'
        }
      ],
      followUp: [
        { question: '你希望从生活的哪个方面开始梳理？', intent: '在无数据时引导用户切入' }
      ],
      reply: '我还没有你的评分数据。建议你先完成本周六维度自评，之后我能给你更精准的框架建议。'
    }
  }

  // quarterlySummary 最小兜底
  if (action === 'quarterlySummary') {
    const reviewData = event.reviewData || {}
    return {
      summary: reviewData.collapseText
        ? `本季度复盘已完成。核心关注点：${reviewData.collapseText.slice(0, 60)}。建议下季度持续关注并定期评估。`
        : '本季度复盘已完成，但数据有限。建议下季度继续保持定期评估和复盘的节奏。',
      trends: [],
      keyFindings: reviewData.collapseText
        ? [{ type: 'danger', title: '崩溃风险点', text: reviewData.collapseText }]
        : [],
      recommendations: [
        {
          title: '保持定期复盘',
          text: '继续每周评估和季度复盘的节奏，用数据驱动决策，用框架指导行动。',
          priority: 'low'
        }
      ]
    }
  }

  // pivotCheck 最小兜底
  if (action === 'pivotCheck') {
    return {
      signals: [],
      recommendation: '周评分数据不足，暂无法检测转向信号。建议连续记录至少 3 周后再进行检测。'
    }
  }

  return {
    summary: '暂无评分数据，无法生成结构化洞察。请先完成本周六维度自评。',
    details: [],
    suggestions: [
      {
        title: '完成本周六维度自评',
        content: '对生存基础、自主权、能力资产、关系支持、内在秩序、意义贡献六个维度打分（1-5），作为洞察基础。',
        priority: 'high',
        dimension: null,
        factor: 'standards'
      }
    ],
    followUp: [
      { question: '你希望本周重点改善哪个维度？', intent: '引导用户设定切入点' }
    ]
  }
}

// ---------------------------------------------------------------------------
// 暴露内部函数便于单测（不影响云函数运行）
// ---------------------------------------------------------------------------
module.exports = {
  main: exports.main,
  parseLLMJson,
  validateResult,
  validateQuarterlyResult,
  validatePivotResult,
  ruleEngineFallback,
  computeTrends,
  saveHistory,
  syncHistory
}

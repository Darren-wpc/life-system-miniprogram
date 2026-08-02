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
  DIMENSIONS,
  computeSummary
} = require('./context')
const { SYSTEM_PROMPT } = require('./prompts/system')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const VALID_ACTIONS = ['weeklyInsight', 'coachChat', 'goalGuidance']

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

  // 3. 根据动作组装上下文并调用 LLM
  try {
    const userContext = buildUserContext(action, event, userData)
    const raw = await chat({
      system: SYSTEM_PROMPT,
      user: userContext,
      temperature: 0.7,
      maxTokens: 2000
    })

    const parsed = parseLLMJson(raw)
    const result = validateResult(parsed, action, userData)

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
    base.reply = `（规则引擎兜底）针对你的目标，当前最该补齐的是${low.label}对应的“合适标准”与“持续行动”要素，建议先设定最小合格线并开始记录。`
  }

  return base
}

/**
 * 完全无数据时的最小兜底
 */
const buildMinimalFallback = (action, event) => {
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
  ruleEngineFallback,
  computeTrends
}

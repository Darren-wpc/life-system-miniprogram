/**
 * llm.js - LLM API 封装模块
 *
 * 职责：
 * 1. 封装对 LLM API 的调用（兼容 OpenAI 接口规范与自定义 endpoint）
 * 2. 从环境变量读取 API Key 与 URL（process.env.LLM_API_KEY / process.env.LLM_API_URL）
 * 3. 提供超时与重试逻辑
 * 4. 提供开发用 mock 模式（process.env.LLM_MOCK_MODE === 'true' 时返回预置响应）
 * 5. 未配置 API Key 且未开启 mock 时抛出错误，由调用方回退到本地规则引擎
 */

const axios = require('axios')

// ---------------------------------------------------------------------------
// 配置常量
// ---------------------------------------------------------------------------
const DEFAULT_TIMEOUT = 30000 // 单次请求超时 30s
const MAX_RETRIES = 2 // 失败重试次数（不含首次，共最多 3 次请求）
const RETRY_BASE_DELAY = 1000 // 重试基础退避 1s

// ---------------------------------------------------------------------------
// 对外主函数
// ---------------------------------------------------------------------------

/**
 * 调用 LLM 进行一次对话
 * @param {Object} params
 * @param {string} params.system       系统提示词
 * @param {string} params.user         用户消息 / 拼接好的上下文
 * @param {boolean} [params.stream]    是否使用流式响应（默认 false）
 * @param {number} [params.temperature] 采样温度（默认 0.7）
 * @param {number} [params.maxTokens]  最大输出 token 数（默认 2000）
 * @param {string} [params.model]      模型名（默认读 LLM_MODEL 环境变量）
 * @returns {Promise<string>} LLM 返回的纯文本内容
 */
const chat = async ({
  system,
  user,
  stream = false,
  temperature = 0.7,
  maxTokens = 2000,
  model
} = {}) => {
  const apiKey = process.env.LLM_API_KEY
  const apiUrl = process.env.LLM_API_URL
  const mockMode = process.env.LLM_MOCK_MODE === 'true'

  // ---- 开发环境 mock 模式 ----
  // 显式开启 LLM_MOCK_MODE 时返回预置响应，便于本地无 Key 开发联调
  if (mockMode) {
    console.log('[llm] mock 模式已开启，返回预置响应')
    return mockResponse({ system, user })
  }

  // ---- 未配置 API Key ----
  // 默认行为：无 Key 则抛错，由 index.js 回退到本地规则引擎
  if (!apiKey) {
    throw new Error('LLM_API_KEY 未配置，无法调用 LLM 服务')
  }

  if (!user) {
    throw new Error('调用 LLM 缺少 user 内容')
  }

  const endpoint = apiUrl || 'https://api.openai.com/v1/chat/completions'
  const headers = buildHeaders(apiKey)
  const payload = buildPayload({
    system,
    user,
    stream,
    temperature,
    maxTokens,
    model: model || process.env.LLM_MODEL || 'gpt-4o-mini'
  })

  // ---- 带重试的请求循环 ----
  let lastError = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(endpoint, payload, {
        headers,
        timeout: DEFAULT_TIMEOUT,
        responseType: stream ? 'stream' : 'json'
      })

      if (stream) {
        return await handleStreamResponse(response.data)
      }
      return parseResponse(response.data)
    } catch (err) {
      lastError = err
      const retryable = isRetryableError(err)
      console.warn(
        `[llm] 第 ${attempt + 1} 次请求失败 (可重试=${retryable}):`,
        err.message || err
      )
      if (!retryable || attempt === MAX_RETRIES) {
        break
      }
      // 指数退避
      await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt))
    }
  }

  // 所有重试均失败，抛出包装后的错误
  throw wrapError(lastError)
}

// ---------------------------------------------------------------------------
// 内部辅助函数
// ---------------------------------------------------------------------------

/**
 * 构建请求头。兼容 Bearer 鉴权与自定义 header。
 */
const buildHeaders = (apiKey) => {
  const headers = {
    'Content-Type': 'application/json'
  }
  // 兼容部分自建网关：允许用 LLM_AUTH_HEADER / LLM_AUTH_PREFIX 自定义鉴权头
  const authHeader = process.env.LLM_AUTH_HEADER || 'Authorization'
  const authPrefix = process.env.LLM_AUTH_PREFIX || 'Bearer'
  headers[authHeader] = authPrefix ? `${authPrefix} ${apiKey}` : apiKey
  return headers
}

/**
 * 构建请求体（OpenAI 兼容格式）。
 * 若配置了 LLM_EXTRA_BODY，会尝试合并进请求体（用于自定义 endpoint 的额外字段）。
 */
const buildPayload = ({ system, user, stream, temperature, maxTokens, model }) => {
  const messages = []
  if (system) {
    messages.push({ role: 'system', content: system })
  }
  messages.push({ role: 'user', content: user })

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  }

  if (stream) {
    payload.stream = true
  }

  // 合并自定义额外参数
  const extra = process.env.LLM_EXTRA_BODY
  if (extra) {
    try {
      Object.assign(payload, JSON.parse(extra))
    } catch (e) {
      console.warn('[llm] LLM_EXTRA_BODY 解析失败，已忽略:', e.message)
    }
  }

  return payload
}

/**
 * 从响应体中解析出文本内容。
 * 兼容 OpenAI 标准结构 choices[0].message.content 与部分变体。
 */
const parseResponse = (data) => {
  // 标准 OpenAI 格式
  if (data && data.choices && data.choices.length > 0) {
    const choice = data.choices[0]
    if (choice.message && typeof choice.message.content === 'string') {
      return choice.message.content.trim()
    }
    // 部分接口把内容直接放在 text 字段
    if (typeof choice.text === 'string') {
      return choice.text.trim()
    }
  }
  // 自定义 endpoint：直接返回 content / text / output 字段
  if (typeof data === 'string') {
    return data.trim()
  }
  if (data && typeof data.content === 'string') {
    return data.content.trim()
  }
  if (data && typeof data.text === 'string') {
    return data.text.trim()
  }
  if (data && typeof data.output === 'string') {
    return data.output.trim()
  }

  console.error('[llm] 无法解析的响应结构:', JSON.stringify(data).slice(0, 500))
  throw new Error('LLM 响应结构无法解析')
}

/**
 * 处理流式响应，聚合为完整文本。
 */
const handleStreamResponse = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = []
    let buffer = ''

    stream.on('data', (chunk) => {
      buffer += chunk.toString()
      // SSE 以双换行分隔事件
      const lines = buffer.split('\n')
      buffer = lines.pop() // 保留最后不完整的一行

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const payload = trimmed.replace(/^data:\s*/, '')
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const delta = json.choices && json.choices[0] && json.choices[0].delta
          if (delta && typeof delta.content === 'string') {
            chunks.push(delta.content)
          }
        } catch (e) {
          // 忽略无法解析的分片
        }
      }
    })

    stream.on('end', () => {
      resolve(chunks.join('').trim())
    })

    stream.on('error', (err) => {
      reject(wrapError(err))
    })
  })
}

/**
 * 判断错误是否值得重试（网络错误、5xx、429）。
 */
const isRetryableError = (err) => {
  // axios 网络层错误 / 超时
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') return true
  if (err.message && err.message.includes('timeout')) return true

  const status = err.response && err.response.status
  if (status === 429) return true // 限流，可重试
  if (status && status >= 500) return true // 服务端错误
  return false
}

/**
 * 包装错误，统一信息格式。
 */
const wrapError = (err) => {
  if (err.response) {
    const status = err.response.status
    let detail = ''
    try {
      detail = JSON.stringify(err.response.data).slice(0, 300)
    } catch (e) {
      detail = ''
    }
    const wrapped = new Error(`LLM 请求失败 (HTTP ${status}): ${detail}`)
    wrapped.status = status
    wrapped.original = err.message
    return wrapped
  }
  if (err instanceof Error) {
    return err
  }
  return new Error(String(err))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Mock 响应（开发环境）
// ---------------------------------------------------------------------------

/**
 * 返回预置的 mock 响应，结构与真实 LLM 返回的 JSON 一致，
 * 便于前端在无 API Key 时联调展示。
 */
const mockResponse = ({ system, user } = {}) => {
  const mock = {
    summary: '【mock 模式】本周生存基础略有波动，内在秩序成为当前最关键的杠杆点，建议优先稳定睡眠与情绪节奏。',
    details: [
      {
        dimension: 'survival',
        label: '生存基础',
        score: 6,
        analysis: '睡眠与饮食节奏本周出现下滑，身体信号已发出预警，属轻度崩溃点。'
      },
      {
        dimension: 'innerOrder',
        label: '内在秩序',
        score: 5,
        analysis: '情绪稳定性偏低，自我认知出现模糊，是带动其他维度提升的杠杆点。'
      },
      {
        dimension: 'meaning',
        label: '意义贡献',
        score: 7,
        analysis: '意义感尚可，但贡献渠道单一，与能力资产之间存在轻度失衡。'
      }
    ],
    suggestions: [
      {
        title: '固定就寝时间窗口',
        content: '本周内将就寝时间固定在 23:30 前，连续 5 天记录睡眠时长，作为生存基础的稳定锚点。',
        priority: 'high',
        dimension: 'survival',
        factor: 'action'
      },
      {
        title: '每日 3 分钟情绪标注',
        content: '每晚用 3 分钟为当天最强情绪打标签并写一句话归因，重建内在秩序的反馈闭环。',
        priority: 'medium',
        dimension: 'innerOrder',
        factor: 'feedback'
      }
    ],
    followUp: [
      { question: '本周睡眠下滑主要受什么因素影响？', intent: '定位生存基础崩溃点根因' },
      { question: '你希望先把哪个维度稳定下来？', intent: '确认用户优先级，校准建议标准' }
    ]
  }
  // 返回 JSON 字符串，模拟真实 LLM 的文本输出
  return JSON.stringify(mock, null, 2)
}

module.exports = {
  chat,
  // 导出辅助函数便于单测
  buildHeaders,
  buildPayload,
  parseResponse,
  isRetryableError,
  mockResponse
}

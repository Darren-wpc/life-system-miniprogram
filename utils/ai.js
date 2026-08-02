// utils/ai.js - 前端 AI 调用封装
// 统一管理 AI 功能的调用、降级、缓存

const aiInsight = require('./aiInsight');
const db = require('./db');

// AI 洞察缓存 key
const AI_INSIGHT_CACHE_KEY = 'ls_ai_insight_cache';
// 对话历史 key
const AI_CHAT_HISTORY_KEY = 'ls_ai_chat_history';
// AI 设置 key
const AI_SETTINGS_KEY = 'ls_ai_settings';

// 默认 AI 设置
const DEFAULT_AI_SETTINGS = {
  enabled: true,           // AI 功能总开关
  cloudEnabled: false,     // 云端 LLM 开关（需要云开发环境）
  lastInsightWeekId: ''    // 上次生成洞察的周ID
};

/**
 * 获取 AI 设置
 */
function getSettings() {
  try {
    const settings = wx.getStorageSync(AI_SETTINGS_KEY);
    return { ...DEFAULT_AI_SETTINGS, ...settings };
  } catch (e) {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

/**
 * 保存 AI 设置
 */
function saveSettings(settings) {
  try {
    wx.setStorageSync(AI_SETTINGS_KEY, { ...getSettings(), ...settings });
  } catch (e) {
    console.error('ai.saveSettings error:', e);
  }
}

/**
 * 检查 AI 是否启用
 */
function isEnabled() {
  return getSettings().enabled;
}

/**
 * 检查云端是否可用
 */
function isCloudAvailable() {
  const settings = getSettings();
  if (!settings.cloudEnabled) return false;
  // 检查 wx.cloud 是否可用
  if (!wx.cloud) return false;
  return true;
}

/**
 * 组装用户数据上下文
 */
function assembleUserData() {
  const current = db.weekly.getLatest();
  const previous = db.weekly.getPrevious();
  const factors = db.factors.getLatest();
  const resources = db.resources.get();
  const dailyList = db.daily.getDays(7);

  return { current, previous, factors, resources, dailyList };
}

/**
 * 生成周度 AI 深度解读
 * @param {boolean} force - 强制重新生成（忽略缓存）
 * @returns {Promise<Object>} AI 洞察结果
 */
function generateWeeklyInsight(force = false) {
  // 检查是否启用
  if (!isEnabled()) {
    return Promise.resolve({ disabled: true, message: 'AI 功能未开启' });
  }

  const userData = assembleUserData();
  if (!userData.current) {
    return Promise.resolve({ noData: true, message: '请先完成本周评估' });
  }

  // 检查缓存（同一周不重复生成）
  const settings = getSettings();
  const currentWeekId = db.getWeekId(new Date());
  if (!force && settings.lastInsightWeekId === currentWeekId) {
    const cached = getCachedInsight();
    if (cached) {
      return Promise.resolve(cached);
    }
  }

  return new Promise((resolve) => {
    // 尝试调用云端 LLM
    if (isCloudAvailable()) {
      _callCloudFunction('aiCoach', {
        action: 'weeklyInsight',
        userData: _sanitizeForCloud(userData)
      }).then(result => {
        if (result && result.success) {
          // 云端成功
          const insight = { ...result.data, source: 'cloud' };
          _cacheInsight(insight);
          _updateLastInsightWeek(currentWeekId);
          resolve(insight);
        } else {
          // 云端失败，降级到本地
          const insight = _generateLocalInsight(userData);
          resolve(insight);
        }
      }).catch(() => {
        // 云端异常，降级到本地
        const insight = _generateLocalInsight(userData);
        resolve(insight);
      });
    } else {
      // 无云端，直接使用本地引擎
      const insight = _generateLocalInsight(userData);
      resolve(insight);
    }
  });
}

/**
 * 发送对话消息
 * @param {string} message - 用户消息
 * @returns {Promise<string>} AI 回复
 */
function sendChatMessage(message) {
  if (!isEnabled()) {
    return Promise.resolve('AI 功能未开启，请在设置中开启。');
  }

  const userData = assembleUserData();
  if (!userData.current) {
    return Promise.resolve('请先完成本周六维自评，我才能为你提供基于框架的解读。');
  }

  // 保存用户消息
  _saveChatMessage('user', message);

  return new Promise((resolve) => {
    if (isCloudAvailable()) {
      _callCloudFunction('aiCoach', {
        action: 'coachChat',
        message,
        userData: _sanitizeForCloud(userData),
        history: getChatHistory().slice(-10) // 最近10条对话
      }).then(result => {
        if (result && result.success) {
          const reply = result.data.reply || result.data;
          _saveChatMessage('ai', reply);
          resolve(reply);
        } else {
          // 降级
          const reply = aiInsight.generateCoachReply(message, userData);
          _saveChatMessage('ai', reply);
          resolve(reply);
        }
      }).catch(() => {
        const reply = aiInsight.generateCoachReply(message, userData);
        _saveChatMessage('ai', reply);
        resolve(reply);
      });
    } else {
      // 本地引擎回复
      // 模拟思考延迟
      setTimeout(() => {
        const reply = aiInsight.generateCoachReply(message, userData);
        _saveChatMessage('ai', reply);
        resolve(reply);
      }, 300);
    }
  });
}

/**
 * 获取缓存洞察
 */
function getCachedInsight() {
  try {
    return wx.getStorageSync(AI_INSIGHT_CACHE_KEY) || null;
  } catch (e) {
    return null;
  }
}

/**
 * 获取对话历史
 */
function getChatHistory() {
  try {
    return wx.getStorageSync(AI_CHAT_HISTORY_KEY) || [];
  } catch (e) {
    return [];
  }
}

/**
 * 清空对话历史
 */
function clearChatHistory() {
  try {
    wx.removeStorageSync(AI_CHAT_HISTORY_KEY);
  } catch (e) {
    console.error('ai.clearChatHistory error:', e);
  }
}

// ===== 内部方法 =====

function _generateLocalInsight(userData) {
  const insight = aiInsight.generateWeeklyInsight(userData);
  _cacheInsight(insight);
  const currentWeekId = db.getWeekId(new Date());
  _updateLastInsightWeek(currentWeekId);
  return insight;
}

function _cacheInsight(insight) {
  try {
    wx.setStorageSync(AI_INSIGHT_CACHE_KEY, insight);
  } catch (e) {
    console.error('ai.cacheInsight error:', e);
  }
}

function _updateLastInsightWeek(weekId) {
  const settings = getSettings();
  settings.lastInsightWeekId = weekId;
  saveSettings(settings);
}

function _saveChatMessage(role, content) {
  const history = getChatHistory();
  history.push({
    role,
    content,
    timestamp: Date.now()
  });
  // 保留最近 50 条
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }
  try {
    wx.setStorageSync(AI_CHAT_HISTORY_KEY, history);
  } catch (e) {
    console.error('ai.saveChatMessage error:', e);
  }
}

/**
 * 调用云函数
 */
function _callCloudFunction(name, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error('cloud not available'));
      return;
    }
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => resolve(res.result),
      fail: (err) => reject(err)
    });
  });
}

/**
 * 清理数据用于云端传输（移除敏感信息，精简数据量）
 */
function _sanitizeForCloud(userData) {
  const { current, previous, factors, resources, dailyList } = userData;

  // 精简周评数据
  const slimCurrent = current ? {
    survival: current.survival,
    autonomy: current.autonomy,
    capability: current.capability,
    relationship: current.relationship,
    innerOrder: current.innerOrder,
    meaning: current.meaning,
    energyText: current.energyText || '',
    drainText: current.drainText || ''
  } : null;

  const slimPrevious = previous ? {
    survival: previous.survival,
    autonomy: previous.autonomy,
    capability: previous.capability,
    relationship: previous.relationship,
    innerOrder: previous.innerOrder,
    meaning: previous.meaning
  } : null;

  // 精简因子数据
  const slimFactors = factors ? {
    standards: factors.standards,
    action: factors.action,
    resources: factors.resources,
    feedback: factors.feedback,
    uncertainty: factors.uncertainty
  } : null;

  // 精简日级数据
  const slimDaily = (dailyList || []).slice(0, 7).map(d => ({
    energyText: d.energyText || '',
    drainText: d.drainText || '',
    moodEmoji: d.moodEmoji || ''
  }));

  // 精简资源数据
  let slimResources = null;
  if (resources && resources.metrics) {
    const slimMetrics = {};
    Object.keys(resources.metrics).forEach(key => {
      const m = resources.metrics[key];
      if (m) {
        const filledFields = Object.entries(m)
          .filter(([, v]) => v !== '' && v !== undefined && v !== null);
        if (filledFields.length > 0) {
          const obj = {};
          filledFields.forEach(([k, v]) => { obj[k] = v; });
          slimMetrics[key] = obj;
        }
      }
    });
    slimResources = { metrics: slimMetrics };
  }

  return {
    current: slimCurrent,
    previous: slimPrevious,
    factors: slimFactors,
    resources: slimResources,
    dailyList: slimDaily
  };
}

module.exports = {
  getSettings,
  saveSettings,
  isEnabled,
  isCloudAvailable,
  assembleUserData,
  generateWeeklyInsight,
  sendChatMessage,
  getCachedInsight,
  getChatHistory,
  clearChatHistory,
  KEYS: {
    AI_INSIGHT_CACHE: AI_INSIGHT_CACHE_KEY,
    AI_CHAT_HISTORY: AI_CHAT_HISTORY_KEY,
    AI_SETTINGS: AI_SETTINGS_KEY
  }
};

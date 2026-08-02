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
// AI 用量统计 key
const AI_USAGE_KEY = 'ls_ai_usage';

// 默认 AI 设置
const DEFAULT_AI_SETTINGS = {
  enabled: true,           // AI 功能总开关
  cloudEnabled: false,     // 云端 LLM 开关（需要云开发环境）
  lastInsightWeekId: ''    // 上次生成洞察的周ID
};

// 默认用量统计
const DEFAULT_USAGE = {
  totalCalls: 0,
  cloudCalls: 0,
  localCalls: 0,
  byAction: {
    weeklyInsight: 0,
    coachChat: 0,
    goalGuidance: 0,
    dailyReflect: 0,
    quarterlySummary: 0,
    pivotCheck: 0
  },
  lastCallTime: 0,
  lastCallAction: ''
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
          _recordUsage('weeklyInsight', 'cloud');
          resolve(insight);
        } else {
          // 云端失败，降级到本地
          const insight = _generateLocalInsight(userData);
          _recordUsage('weeklyInsight', 'local');
          resolve(insight);
        }
      }).catch(() => {
        // 云端异常，降级到本地
        const insight = _generateLocalInsight(userData);
        _recordUsage('weeklyInsight', 'local');
        resolve(insight);
      });
    } else {
      // 无云端，直接使用本地引擎
      const insight = _generateLocalInsight(userData);
      _recordUsage('weeklyInsight', 'local');
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
        _recordUsage('coachChat', 'local');
        resolve(reply);
      }, 300);
    }
  });
}

/**
 * 生成每日一句话 AI 解读
 * @param {Object} todayRecord - 今日记录 { text, moodEmoji }
 * @returns {Promise<string>} 一句话解读
 */
function generateDailyReflect(todayRecord) {
  if (!isEnabled()) {
    return Promise.resolve('');
  }

  if (!todayRecord) {
    return Promise.resolve('');
  }

  const recentDays = db.daily.getDays(7);
  const weeklyData = db.weekly.getLatest();
  const weeklyScores = weeklyData ? {
    survival: weeklyData.survival,
    autonomy: weeklyData.autonomy,
    capability: weeklyData.capability,
    relationship: weeklyData.relationship,
    innerOrder: weeklyData.innerOrder,
    meaning: weeklyData.meaning
  } : null;

  return new Promise((resolve) => {
    if (isCloudAvailable()) {
      _callCloudFunction('aiCoach', {
        action: 'dailyReflect',
        todayRecord,
        recentDays: recentDays.slice(0, 7).map(d => ({
          moodEmoji: d.moodEmoji || '',
          text: d.text || ''
        })),
        weeklyScores
      }).then(result => {
        if (result && result.success && result.data && result.data.reflect) {
          resolve(result.data.reflect);
        } else if (result && result.fallback && result.fallback.reflect) {
          resolve(result.fallback.reflect);
        } else {
          const reflect = aiInsight.generateDailyReflect({
            todayRecord,
            recentDays,
            weeklyScores
          });
          resolve(reflect);
        }
      }).catch(() => {
        const reflect = aiInsight.generateDailyReflect({
          todayRecord,
          recentDays,
          weeklyScores
        });
        resolve(reflect);
      });
    } else {
      const reflect = aiInsight.generateDailyReflect({
        todayRecord,
        recentDays,
        weeklyScores
      });
      _recordUsage('dailyReflect', 'local');
      resolve(reflect);
    }
  });
}

/**
 * 请求目标引导
 * @param {string} goalText - 用户目标/诉求
 * @returns {Promise<string>} AI 目标引导回复
 */
function requestGoalGuidance(goalText) {
  if (!isEnabled()) {
    return Promise.resolve('AI 功能未开启，请在设置中开启。');
  }

  const userData = assembleUserData();

  // 保存用户消息
  _saveChatMessage('user', '[目标引导] ' + goalText);

  return new Promise((resolve) => {
    if (isCloudAvailable()) {
      _callCloudFunction('aiCoach', {
        action: 'goalGuidance',
        message: goalText,
        userData: _sanitizeForCloud(userData)
      }).then(result => {
        if (result && result.success) {
          const reply = result.data.reply || result.data.summary || JSON.stringify(result.data);
          _saveChatMessage('ai', reply);
          resolve(reply);
        } else if (result && result.fallback) {
          const reply = result.fallback.reply || result.fallback.summary || '无法生成目标引导，请稍后重试。';
          _saveChatMessage('ai', reply);
          resolve(reply);
        } else {
          const reply = _generateLocalGoalGuidance(goalText, userData);
          _saveChatMessage('ai', reply);
          resolve(reply);
        }
      }).catch(() => {
        const reply = _generateLocalGoalGuidance(goalText, userData);
        _saveChatMessage('ai', reply);
        resolve(reply);
      });
    } else {
      const reply = _generateLocalGoalGuidance(goalText, userData);
      _saveChatMessage('ai', reply);
      _recordUsage('goalGuidance', 'local');
      resolve(reply);
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

/**
 * 获取 AI 用量统计
 */
function getUsageStats() {
  try {
    const usage = wx.getStorageSync(AI_USAGE_KEY);
    return { ...DEFAULT_USAGE, ...usage, byAction: { ...DEFAULT_USAGE.byAction, ...(usage && usage.byAction) } };
  } catch (e) {
    return { ...DEFAULT_USAGE };
  }
}

/**
 * 重置 AI 用量统计
 */
function resetUsageStats() {
  try {
    wx.setStorageSync(AI_USAGE_KEY, { ...DEFAULT_USAGE });
  } catch (e) {
    console.error('ai.resetUsageStats error:', e);
  }
}

/**
 * 订阅消息推送
 * 请求用户授权订阅消息通知
 * @param {Array<string>} tmplIds - 模板ID列表
 * @returns {Promise<Object>} 订阅结果
 */
function requestSubscription(tmplIds) {
  if (!wx.requestSubscribeMessage) {
    return Promise.resolve({ skipped: true, reason: 'not supported' });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: tmplIds || [],
      success: (res) => {
        console.log('[ai] 订阅消息授权结果:', res);
        resolve(res);
      },
      fail: (err) => {
        console.warn('[ai] 订阅消息授权失败:', err);
        resolve({ error: err.errMsg || 'failed' });
      }
    });
  });
}

/**
 * 请求周评提醒订阅
 */
function requestWeeklyReminderSubscription() {
  // 模板ID需要在小程序管理后台创建后替换
  const WEEKLY_REMINDER_TMPL_ID = 'weekly_reminder_template_id';
  return requestSubscription([WEEKLY_REMINDER_TMPL_ID]);
}

/**
 * 请求底线告警订阅
 */
function requestBottomlineAlertSubscription() {
  const BOTTOMLINE_ALERT_TMPL_ID = 'bottomline_alert_template_id';
  return requestSubscription([BOTTOMLINE_ALERT_TMPL_ID]);
}

/**
 * 同步本地对话历史到云端
 * 在云可用时将本地历史推送到云数据库，换设备可恢复
 * @returns {Promise<Object>} 同步结果
 */
function syncChatHistoryToCloud() {
  if (!isCloudAvailable()) {
    return Promise.resolve({ skipped: true, reason: 'cloud not available' });
  }

  const history = getChatHistory();
  if (history.length === 0) {
    return Promise.resolve({ skipped: true, reason: 'no history' });
  }

  return _callCloudFunction('aiCoach', {
    action: 'syncHistory',
    history: history.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }))
  }).then(result => {
    if (result && result.success) {
      console.log('[ai] 对话历史同步成功:', result.data);
      return result.data;
    }
    return { synced: 0, error: 'sync failed' };
  }).catch(err => {
    console.warn('[ai] 对话历史同步失败:', err);
    return { synced: 0, error: err.message || String(err) };
  });
}

// ===== 内部方法 =====

/**
 * 记录 AI 用量
 * @param {string} action - 调用的 action 类型
 * @param {string} source - 来源 'cloud' 或 'local'
 */
function _recordUsage(action, source) {
  try {
    const usage = getUsageStats();
    usage.totalCalls++;
    if (source === 'cloud') {
      usage.cloudCalls++;
    } else {
      usage.localCalls++;
    }
    if (usage.byAction && usage.byAction[action] !== undefined) {
      usage.byAction[action]++;
    }
    usage.lastCallTime = Date.now();
    usage.lastCallAction = action;
    wx.setStorageSync(AI_USAGE_KEY, usage);
  } catch (e) {
    console.error('ai._recordUsage error:', e);
  }
}

function _generateLocalInsight(userData) {
  const insight = aiInsight.generateWeeklyInsight(userData);
  _cacheInsight(insight);
  const currentWeekId = db.getWeekId(new Date());
  _updateLastInsightWeek(currentWeekId);
  return insight;
}

/**
 * 本地目标引导生成（降级方案）
 * @param {string} goalText - 用户目标
 * @param {Object} userData - 用户数据
 * @returns {string} 引导回复
 */
function _generateLocalGoalGuidance(goalText, userData) {
  const { current, factors } = userData;

  if (!current) {
    return '我还没有你的六维评分数据。建议先完成本周自评，然后我可以根据你的当前状态为目标拆解要素链。\n\n你的目标：「' + goalText + '」\n\n通用建议：按"合适标准 → 持续行动 → 资源支持 → 反馈修正 → 接受不确定性"五要素拆解，先确定一个最小可行动作。';
  }

  // 找到最低维度作为需要补齐的方向
  const dims = ['survival', 'autonomy', 'capability', 'relationship', 'innerOrder', 'meaning'];
  const dimNames = {
    survival: '生存基础', autonomy: '自主权', capability: '能力资产',
    relationship: '关系支持', innerOrder: '内在秩序', meaning: '意义贡献'
  };

  let lowestKey = 'survival';
  let lowestScore = 5;
  dims.forEach(key => {
    const score = current[key] || 3;
    if (score < lowestScore) {
      lowestScore = score;
      lowestKey = key;
    }
  });

  const parts = [];
  parts.push('针对你的目标：「' + goalText + '」，基于当前六维状态分析：\n');
  parts.push('【当前最需关注】' + dimNames[lowestKey] + '（' + lowestScore + '/5）是当前的结构性短板，建议优先补齐。\n');
  parts.push('【要素链拆解】');
  parts.push('1. 合适标准：为这个目标设定一个"当前阶段够用"的最低合格线，而非理想标准。');
  parts.push('2. 持续行动：确定一个每天可执行的最小动作（5-15分钟），连续记录 7 天。');
  parts.push('3. 资源支持：盘点时间、精力、金钱、信息、人际中哪一项最缺，找到获取途径。');
  parts.push('4. 反馈修正：每周回顾一次完成情况，标注偏差原因并调整标准。');
  parts.push('5. 接受不确定性：承认无法完全控制结果，聚焦"能控制的行动"而非"期望的 outcome"。\n');
  parts.push('【下一步】本周先完成第 1-2 步：设定最低合格线 + 确定每日最小动作。');

  return parts.join('\n');
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

/**
 * 生成季度复盘 AI 总结
 * @param {Object} reviewData - 季度复盘数据 { collapseText, leverageText, imbalanceText, sustainableText, standardUpdateText, focusFactor }
 * @returns {Promise<Object>} AI 季度总结结果
 */
function generateQuarterlySummary(reviewData) {
  // 检查是否启用
  if (!isEnabled()) {
    return Promise.resolve({ disabled: true, message: 'AI 功能未开启' });
  }

  if (!reviewData) {
    return Promise.resolve({ noData: true, message: '请先完成季度复盘' });
  }

  // 组装季度数据
  const quarterlyList = db.quarterly.getAll();
  const allWeekly = db.weekly.getAll();
  const factorsList = db.factors.getAll();

  // 过滤当前季度的周评数据（最近 13 周）
  const weeklyList = allWeekly.slice(0, 13);

  return new Promise((resolve) => {
    // 尝试调用云端 LLM
    if (isCloudAvailable()) {
      _callCloudFunction('aiCoach', {
        action: 'quarterlySummary',
        reviewData,
        weeklyList,
        factorsList
      }).then(result => {
        if (result && result.success) {
          // 云端成功
          const summary = { ...result.data, source: 'cloud' };
          resolve(summary);
        } else if (result && result.fallback) {
          // 云端返回降级结果
          const summary = { ...result.fallback, source: 'cloud-fallback' };
          resolve(summary);
        } else {
          // 云端失败，降级到本地
          const summary = aiInsight.generateQuarterlySummary({
            reviewData,
            weeklyList,
            factorsList
          });
          resolve(summary);
        }
      }).catch(() => {
        // 云端异常，降级到本地
        const summary = aiInsight.generateQuarterlySummary({
          reviewData,
          weeklyList,
          factorsList
        });
        resolve(summary);
      });
    } else {
      // 无云端，直接使用本地引擎
      const summary = aiInsight.generateQuarterlySummary({
        reviewData,
        weeklyList,
        factorsList
      });
      resolve(summary);
    }
  });
}

/**
 * AI 转向信号检测
 * 基于历史评分趋势自动检测转向信号（连续下行、重复低位、结构性崩塌、差距扩大）
 * @returns {Promise<Object>} { signals, recommendation }
 */
function checkPivotSignal() {
  if (!isEnabled()) {
    return Promise.resolve({ disabled: true, message: 'AI 功能未开启' });
  }

  // 获取最近 13 周周评数据（db 返回 newest-first，需反转为 oldest-first）
  const allWeekly = db.weekly.getAll();
  const recentWeekly = allWeekly.slice(0, 13);
  const weeklyList = recentWeekly.slice().reverse();

  // 获取最新一周评分
  const latestWeekly = allWeekly.length > 0 ? allWeekly[0] : null;
  const currentScores = latestWeekly ? {
    survival: latestWeekly.survival,
    autonomy: latestWeekly.autonomy,
    capability: latestWeekly.capability,
    relationship: latestWeekly.relationship,
    innerOrder: latestWeekly.innerOrder,
    meaning: latestWeekly.meaning
  } : null;

  // 获取已有转向信号记录
  const pivotRecords = db.pivot.getAll();

  if (!currentScores) {
    return Promise.resolve({ noData: true, message: '请先完成本周评估' });
  }

  return new Promise((resolve) => {
    if (isCloudAvailable()) {
      _callCloudFunction('aiCoach', {
        action: 'pivotCheck',
        weeklyList,
        pivotRecords,
        currentScores
      }).then(result => {
        if (result && result.success) {
          const pivotResult = { ...result.data, source: 'cloud' };
          resolve(pivotResult);
        } else if (result && result.fallback) {
          const pivotResult = { ...result.fallback, source: 'cloud-fallback' };
          resolve(pivotResult);
        } else {
          const pivotResult = aiInsight.checkPivotSignal({
            weeklyList,
            pivotRecords,
            currentScores
          });
          resolve(pivotResult);
        }
      }).catch(() => {
        const pivotResult = aiInsight.checkPivotSignal({
          weeklyList,
          pivotRecords,
          currentScores
        });
        resolve(pivotResult);
      });
    } else {
      const pivotResult = aiInsight.checkPivotSignal({
        weeklyList,
        pivotRecords,
        currentScores
      });
      resolve(pivotResult);
    }
  });
}

module.exports = {
  getSettings,
  saveSettings,
  isEnabled,
  isCloudAvailable,
  assembleUserData,
  generateWeeklyInsight,
  generateDailyReflect,
  generateQuarterlySummary,
  sendChatMessage,
  requestGoalGuidance,
  checkPivotSignal,
  getCachedInsight,
  getChatHistory,
  clearChatHistory,
  syncChatHistoryToCloud,
  getUsageStats,
  resetUsageStats,
  requestSubscription,
  requestWeeklyReminderSubscription,
  requestBottomlineAlertSubscription,
  KEYS: {
    AI_INSIGHT_CACHE: AI_INSIGHT_CACHE_KEY,
    AI_CHAT_HISTORY: AI_CHAT_HISTORY_KEY,
    AI_SETTINGS: AI_SETTINGS_KEY,
    AI_USAGE: AI_USAGE_KEY
  }
};

// utils/subscribe.js - F1: 订阅消息推送提醒管理
// 管理微信小程序订阅消息的授权状态、再授权引导、推送类型

const SUBSCRIBE_STATE_KEY = 'ls_subscribe_state';

// 订阅消息类型定义
const SUBSCRIBE_TYPES = {
  DAILY_REMINDER: {
    id: 'daily_reminder',
    name: '每日记录提醒',
    desc: '每天在设定时间提醒你完成日级反馈',
    tmplId: 'daily_reminder_template', // 替换为实际模板ID
    // 每次授权可推送一次，需定期再授权
  },
  WEEKLY_REMINDER: {
    id: 'weekly_reminder',
    name: '周评提醒',
    desc: '每周提醒你完成六维自评',
    tmplId: 'weekly_reminder_template',
  },
  STREAK_BREAK: {
    id: 'streak_break',
    name: '连续打卡中断提醒',
    desc: '连续记录即将中断时推送提醒',
    tmplId: 'streak_break_template',
  },
  BOTTOMLINE_ALERT: {
    id: 'bottomline_alert',
    name: '底线告警',
    desc: '健康度跌破底线时推送提醒',
    tmplId: 'bottomline_alert_template',
  }
};

// 默认订阅状态
const DEFAULT_STATE = {
  // 各类型最后授权时间
  lastAuth: {},
  // 各类型剩余可推送次数
  remaining: {},
  // 是否曾经授权过
  everAuthorized: {},
  // 上次检查时间
  lastCheck: 0
};

/**
 * 获取订阅状态
 */
function getState() {
  try {
    const state = wx.getStorageSync(SUBSCRIBE_STATE_KEY);
    return { ...DEFAULT_STATE, ...state };
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

/**
 * 保存订阅状态
 */
function saveState(state) {
  try {
    wx.setStorageSync(SUBSCRIBE_STATE_KEY, state);
  } catch (e) {
    console.error('[subscribe] saveState error:', e);
  }
}

/**
 * 请求订阅消息授权
 * @param {string} typeId - 订阅类型ID
 * @returns {Promise<Object>} 授权结果
 */
function requestAuth(typeId) {
  const type = Object.values(SUBSCRIBE_TYPES).find(t => t.id === typeId);
  if (!type) {
    return Promise.resolve({ error: 'unknown type' });
  }

  if (!wx.requestSubscribeMessage) {
    return Promise.resolve({ skipped: true, reason: 'not supported' });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [type.tmplId],
      success: (res) => {
        const result = res[type.tmplId];
        const state = getState();

        // 更新授权状态
        state.lastAuth[typeId] = Date.now();
        state.everAuthorized[typeId] = true;

        if (result === 'accept') {
          // 授权成功，增加可推送次数
          state.remaining[typeId] = (state.remaining[typeId] || 0) + 1;
          saveState(state);
          resolve({ success: true, accepted: true });
        } else if (result === 'reject') {
          saveState(state);
          resolve({ success: true, accepted: false, reason: 'rejected' });
        } else if (result === 'ban') {
          saveState(state);
          resolve({ success: false, reason: 'banned' });
        } else {
          saveState(state);
          resolve({ success: true, accepted: false, reason: result });
        }
      },
      fail: (err) => {
        console.warn('[subscribe] requestAuth failed:', err);
        resolve({ error: err.errMsg || 'failed' });
      }
    });
  });
}

/**
 * 批量请求授权所有订阅类型
 * @returns {Promise<Object>} 批量授权结果
 */
function requestAllAuth() {
  const types = Object.values(SUBSCRIBE_TYPES);
  const tmplIds = types.map(t => t.tmplId);

  if (!wx.requestSubscribeMessage) {
    return Promise.resolve({ skipped: true, reason: 'not supported' });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const state = getState();
        const results = {};

        types.forEach(type => {
          const result = res[type.tmplId];
          state.lastAuth[type.id] = Date.now();

          if (result === 'accept') {
            state.remaining[type.id] = (state.remaining[type.id] || 0) + 1;
            state.everAuthorized[type.id] = true;
            results[type.id] = { accepted: true };
          } else {
            results[type.id] = { accepted: false, reason: result };
          }
        });

        saveState(state);
        resolve({ success: true, results });
      },
      fail: (err) => {
        resolve({ error: err.errMsg || 'failed' });
      }
    });
  });
}

/**
 * 检查是否需要再授权
 * 微信订阅消息每次授权只能推送一次，用完需要再授权
 * @param {string} typeId - 订阅类型ID
 * @returns {boolean} 是否需要再授权
 */
function needsReauth(typeId) {
  const state = getState();
  const remaining = state.remaining[typeId] || 0;
  return remaining <= 0;
}

/**
 * 消费一次推送次数（模拟推送时调用）
 * @param {string} typeId - 订阅类型ID
 */
function consumePush(typeId) {
  const state = getState();
  if (state.remaining[typeId] && state.remaining[typeId] > 0) {
    state.remaining[typeId]--;
    saveState(state);
  }
}

/**
 * 获取所有订阅类型的展示状态
 * 用于设置页渲染
 */
function getDisplayState() {
  const state = getState();
  const now = Date.now();

  return Object.values(SUBSCRIBE_TYPES).map(type => {
    const lastAuth = state.lastAuth[type.id] || 0;
    const remaining = state.remaining[type.id] || 0;
    const everAuth = state.everAuthorized[type.id] || false;

    // 计算距上次授权的天数
    const daysSinceAuth = lastAuth > 0
      ? Math.floor((now - lastAuth) / (24 * 60 * 60 * 1000))
      : -1;

    return {
      id: type.id,
      name: type.name,
      desc: type.desc,
      remaining,
      everAuthorized: everAuth,
      needsReauth: remaining <= 0,
      daysSinceAuth,
      statusText: _getStatusText(remaining, everAuth, daysSinceAuth)
    };
  });
}

function _getStatusText(remaining, everAuth, daysSinceAuth) {
  if (!everAuth) {
    return '未授权';
  }
  if (remaining > 0) {
    return `可推送 ${remaining} 次`;
  }
  if (daysSinceAuth >= 0 && daysSinceAuth < 7) {
    return `${daysSinceAuth} 天前授权`;
  }
  return '需重新授权';
}

/**
 * 检查是否应该触发连续打卡中断提醒
 * 在每日反馈页面 onShow 时调用
 * @returns {boolean} 是否应提醒
 */
function shouldAlertStreakBreak() {
  const db = require('./db');
  const streak = db.daily.getStreak();

  // 连续 3 天以上记录，但今天还没记录，到提醒时间了
  if (streak >= 3) {
    const today = db.daily.getToday();
    if (!today) {
      return true;
    }
  }
  return false;
}

/**
 * 清除订阅状态
 */
function clearState() {
  try {
    wx.removeStorageSync(SUBSCRIBE_STATE_KEY);
  } catch (e) {
    console.error('[subscribe] clearState error:', e);
  }
}

module.exports = {
  SUBSCRIBE_TYPES,
  getState,
  saveState,
  requestAuth,
  requestAllAuth,
  needsReauth,
  consumePush,
  getDisplayState,
  shouldAlertStreakBreak,
  clearState,
  KEYS: {
    SUBSCRIBE_STATE: SUBSCRIBE_STATE_KEY
  }
};

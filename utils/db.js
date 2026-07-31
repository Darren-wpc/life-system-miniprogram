// utils/db.js - 本地存储管理器

const STORAGE_KEYS = {
  WEEKLY_SCORES: 'ls_weekly_scores',
  FACTOR_SCORES: 'ls_factor_scores',
  RESOURCES: 'ls_resources',
  DAILY_FEEDBACK: 'ls_daily_feedback',
  QUARTERLY_REVIEW: 'ls_quarterly_review',
  TOOL_NOTODO: 'ls_tool_notodo',
  TOOL_BOTTOMLINE: 'ls_tool_bottomline',
  TOOL_EXCHANGE: 'ls_tool_exchange',
  TOOL_INTERRUPT: 'ls_tool_interrupt',
  TOOL_UNCONTROLLABLE: 'ls_tool_uncontrollable',
  TOOL_RESTART: 'ls_tool_restart',
  NARRATIVE: 'ls_narrative',
  PIVOT: 'ls_pivot',
  SETTINGS: 'ls_settings',
  INITIALIZED: 'ls_initialized'
};

function _get(key) {
  try {
    return wx.getStorageSync(key);
  } catch (e) {
    console.error('db.get error:', key, e);
    return null;
  }
}

function _set(key, data) {
  try {
    wx.setStorageSync(key, data);
    return true;
  } catch (e) {
    console.error('db.set error:', key, e);
    return false;
  }
}

function _getDateStr(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _getWeekId(date) {
  const d = date || new Date();
  const start = new Date(d);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return _getDateStr(start);
}

function _getQuarterId(date) {
  const d = date || new Date();
  const m = d.getMonth();
  const q = Math.floor(m / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

// ===== 六维周评 =====
const weeklyDB = {
  save(scores) {
    // scores: { survival, autonomy, capability, relationship, innerOrder, meaning, energyText, drainText }
    const list = _get(STORAGE_KEYS.WEEKLY_SCORES) || [];
    const record = {
      id: _getWeekId(),
      date: _getDateStr(),
      ...scores,
      createdAt: Date.now()
    };
    // 同一周覆盖
    const idx = list.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.unshift(record);
    }
    _set(STORAGE_KEYS.WEEKLY_SCORES, list);
    return record;
  },

  getLatest() {
    const list = _get(STORAGE_KEYS.WEEKLY_SCORES) || [];
    return list[0] || null;
  },

  getPrevious() {
    const list = _get(STORAGE_KEYS.WEEKLY_SCORES) || [];
    return list[1] || null;
  },

  getAll() {
    return _get(STORAGE_KEYS.WEEKLY_SCORES) || [];
  },

  getWeeks(count) {
    const list = _get(STORAGE_KEYS.WEEKLY_SCORES) || [];
    return list.slice(0, count);
  }
};

// ===== 五因子评分 =====
const factorDB = {
  save(scores) {
    // scores: { standards, action, resources, feedback, uncertainty }
    const list = _get(STORAGE_KEYS.FACTOR_SCORES) || [];
    const record = {
      id: _getDateStr(),
      date: _getDateStr(),
      ...scores,
      createdAt: Date.now()
    };
    // 同日覆盖
    const idx = list.findIndex(r => r.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    _set(STORAGE_KEYS.FACTOR_SCORES, list);
    return record;
  },

  getLatest() {
    const list = _get(STORAGE_KEYS.FACTOR_SCORES) || [];
    return list[0] || null;
  },

  getAll() {
    return _get(STORAGE_KEYS.FACTOR_SCORES) || [];
  }
};

// ===== 资源盘点 =====
const resourceDB = {
  save(data) {
    const record = {
      ...data,
      updatedAt: Date.now()
    };
    _set(STORAGE_KEYS.RESOURCES, record);
    return record;
  },

  get() {
    return _get(STORAGE_KEYS.RESOURCES) || null;
  }
};

// ===== 日级反馈 =====
const dailyDB = {
  save(data) {
    // data: { energyText, drainText, moodEmoji }
    const list = _get(STORAGE_KEYS.DAILY_FEEDBACK) || [];
    const dateStr = _getDateStr();
    const record = {
      id: dateStr,
      date: dateStr,
      ...data,
      createdAt: Date.now()
    };
    const idx = list.findIndex(r => r.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    _set(STORAGE_KEYS.DAILY_FEEDBACK, list);
    return record;
  },

  getToday() {
    const list = _get(STORAGE_KEYS.DAILY_FEEDBACK) || [];
    return list.find(r => r.id === _getDateStr()) || null;
  },

  getDays(count) {
    const list = _get(STORAGE_KEYS.DAILY_FEEDBACK) || [];
    return list.slice(0, count);
  },

  getStreak() {
    const list = _get(STORAGE_KEYS.DAILY_FEEDBACK) || [];
    if (!list.length) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = _getDateStr(d);
      if (list.find(r => r.id === dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }
};

// ===== 季级复盘 =====
const quarterlyDB = {
  save(data) {
    const list = _get(STORAGE_KEYS.QUARTERLY_REVIEW) || [];
    const record = {
      id: _getQuarterId(),
      date: _getDateStr(),
      ...data,
      createdAt: Date.now()
    };
    const idx = list.findIndex(r => r.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    _set(STORAGE_KEYS.QUARTERLY_REVIEW, list);
    return record;
  },

  getLatest() {
    const list = _get(STORAGE_KEYS.QUARTERLY_REVIEW) || [];
    return list[0] || null;
  },

  getAll() {
    return _get(STORAGE_KEYS.QUARTERLY_REVIEW) || [];
  }
};

// ===== 通用工具存储 =====
const toolDB = {
  save(toolKey, data) {
    const record = {
      ...data,
      updatedAt: Date.now()
    };
    _set(toolKey, record);
    return record;
  },

  get(toolKey) {
    return _get(toolKey) || null;
  },

  getKeys() {
    return STORAGE_KEYS;
  }
};

// ===== 叙事记录 =====
const narrativeDB = {
  save(data) {
    const list = _get(STORAGE_KEYS.NARRATIVE) || [];
    const record = {
      id: _getQuarterId(),
      date: _getDateStr(),
      ...data,
      createdAt: Date.now()
    };
    const idx = list.findIndex(r => r.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    _set(STORAGE_KEYS.NARRATIVE, list);
    return record;
  },

  getLatest() {
    const list = _get(STORAGE_KEYS.NARRATIVE) || [];
    return list[0] || null;
  },

  getAll() {
    return _get(STORAGE_KEYS.NARRATIVE) || [];
  }
};

// ===== 转向判据 =====
const pivotDB = {
  save(data) {
    const list = _get(STORAGE_KEYS.PIVOT) || [];
    const record = {
      id: _getQuarterId(),
      date: _getDateStr(),
      ...data,
      createdAt: Date.now()
    };
    const idx = list.findIndex(r => r.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    _set(STORAGE_KEYS.PIVOT, list);
    return record;
  },

  getLatest() {
    const list = _get(STORAGE_KEYS.PIVOT) || [];
    return list[0] || null;
  },

  getAll() {
    return _get(STORAGE_KEYS.PIVOT) || [];
  }
};

// ===== 设置 =====
const settingsDB = {
  get() {
    return _get(STORAGE_KEYS.SETTINGS) || { dailyReminder: '21:00' };
  },
  save(settings) {
    _set(STORAGE_KEYS.SETTINGS, settings);
  }
};

// ===== 初始化 =====
function init() {
  if (_get(STORAGE_KEYS.INITIALIZED)) return;
  _set(STORAGE_KEYS.WEEKLY_SCORES, []);
  _set(STORAGE_KEYS.FACTOR_SCORES, []);
  _set(STORAGE_KEYS.DAILY_FEEDBACK, []);
  _set(STORAGE_KEYS.QUARTERLY_REVIEW, []);
  _set(STORAGE_KEYS.NARRATIVE, []);
  _set(STORAGE_KEYS.PIVOT, []);
  _set(STORAGE_KEYS.SETTINGS, { dailyReminder: '21:00' });
  _set(STORAGE_KEYS.INITIALIZED, true);
}

module.exports = {
  init,
  weekly: weeklyDB,
  factors: factorDB,
  resources: resourceDB,
  daily: dailyDB,
  quarterly: quarterlyDB,
  tool: toolDB,
  narrative: narrativeDB,
  pivot: pivotDB,
  settings: settingsDB,
  getDateStr: _getDateStr,
  getWeekId: _getWeekId,
  getQuarterId: _getQuarterId,
  KEYS: STORAGE_KEYS
};
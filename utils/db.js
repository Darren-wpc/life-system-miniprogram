// utils/db.js - 本地存储管理器

// P2-8: 数据版本号
const SCHEMA_VERSION = 2;

// P2-22: STORAGE_KEYS 集中管理所有存储 key，可遍历用于批量清除，避免手动列举遗漏
const STORAGE_KEYS = {
  WEEKLY_SCORES: 'ls_weekly_scores',
  FACTOR_SCORES: 'ls_factor_scores',
  RESOURCES: 'ls_resources',
  RESOURCE_TRANSFORMS: 'ls_resource_transforms',
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
  INITIALIZED: 'ls_initialized',
  SCHEMA_VERSION: 'ls_schema_version'
};

// 列表存储最大保留条数（防止超 1MB 单 key / 10MB 总量限制）
const MAX_RETENTION = {
  WEEKLY_SCORES: 104,    // 2年
  FACTOR_SCORES: 365,    // 1年
  DAILY_FEEDBACK: 180,   // 半年
  QUARTERLY_REVIEW: 40,  // 10年
  NARRATIVE: 40,
  PIVOT: 40,
  RESOURCE_TRANSFORMS: 100  // P3-7: 资源转化记录
};

function _trimList(list, max) {
  if (max && list.length > max) list.length = max; // newest-first，截掉尾部最旧
  return list;
}

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
    _trimList(list, MAX_RETENTION.WEEKLY_SCORES);
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
    _trimList(list, MAX_RETENTION.FACTOR_SCORES);
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

// ===== 资源转化追踪（P3-7）=====
const transformDB = {
  save(data) {
    const list = _get(STORAGE_KEYS.RESOURCE_TRANSFORMS) || [];
    const record = {
      id: _getDateStr() + '-' + Date.now().toString(36),
      date: _getDateStr(),
      ...data,
      createdAt: Date.now()
    };
    list.unshift(record);
    _trimList(list, MAX_RETENTION.RESOURCE_TRANSFORMS);
    _set(STORAGE_KEYS.RESOURCE_TRANSFORMS, list);
    return record;
  },
  getAll() {
    return _get(STORAGE_KEYS.RESOURCE_TRANSFORMS) || [];
  },
  remove(id) {
    const list = _get(STORAGE_KEYS.RESOURCE_TRANSFORMS) || [];
    const filtered = list.filter(r => r.id !== id);
    _set(STORAGE_KEYS.RESOURCE_TRANSFORMS, filtered);
    return filtered;
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
    _trimList(list, MAX_RETENTION.DAILY_FEEDBACK);
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

  // P1-8/P2-15: 按周过滤获取日级反馈（增加上界，避免混入后续周数据）
  getByWeek(weekId) {
    const list = _get(STORAGE_KEYS.DAILY_FEEDBACK) || [];
    if (!weekId) return list;
    // 计算该周末日期（weekId + 6天）作为上界
    const startDate = new Date(weekId);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const endStr = _getDateStr(endDate);
    return list.filter(r => r.id >= weekId && r.id <= endStr);
  },

  getStreak() {
    const list = _get(STORAGE_KEYS.DAILY_FEEDBACK) || [];
    if (!list.length) return 0;
    // P2-7: 用 Set 替代线性查找，O(365+n) → O(365)
    const dateSet = new Set(list.map(r => r.id));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = _getDateStr(d);
      if (dateSet.has(dateStr)) {
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
    _trimList(list, MAX_RETENTION.QUARTERLY_REVIEW);
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
    // P2-12: items 列表长度保护
    if (record.items && Array.isArray(record.items)) {
      const maxItems = 100;
      if (record.items.length > maxItems) {
        record.items = record.items.slice(0, maxItems);
      }
    }
    // P2-12: 存储异常捕获
    const ok = _set(toolKey, record);
    if (!ok) {
      console.error('toolDB.save failed for key:', toolKey);
    }
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
    _trimList(list, MAX_RETENTION.NARRATIVE);
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
    _trimList(list, MAX_RETENTION.PIVOT);
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
  // P2-8: 数据版本号与迁移机制
  const savedVersion = _get(STORAGE_KEYS.SCHEMA_VERSION);
  if (!savedVersion) {
    // 首次安装或从旧版升级
    _set(STORAGE_KEYS.WEEKLY_SCORES, _get(STORAGE_KEYS.WEEKLY_SCORES) || []);
    _set(STORAGE_KEYS.FACTOR_SCORES, _get(STORAGE_KEYS.FACTOR_SCORES) || []);
    _set(STORAGE_KEYS.DAILY_FEEDBACK, _get(STORAGE_KEYS.DAILY_FEEDBACK) || []);
    _set(STORAGE_KEYS.QUARTERLY_REVIEW, _get(STORAGE_KEYS.QUARTERLY_REVIEW) || []);
    _set(STORAGE_KEYS.NARRATIVE, _get(STORAGE_KEYS.NARRATIVE) || []);
    _set(STORAGE_KEYS.PIVOT, _get(STORAGE_KEYS.PIVOT) || []);
    // P1-10: 补充初始化资源转化记录
    _set(STORAGE_KEYS.RESOURCE_TRANSFORMS, _get(STORAGE_KEYS.RESOURCE_TRANSFORMS) || []);
  }
  _set(STORAGE_KEYS.SETTINGS, _get(STORAGE_KEYS.SETTINGS) || { dailyReminder: '21:00' });
  _set(STORAGE_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
  _set(STORAGE_KEYS.INITIALIZED, true);
}

module.exports = {
  init,
  // P2-23: 导出 SCHEMA_VERSION 供 constants.js 统一引用，避免多处硬编码
  SCHEMA_VERSION,
  weekly: weeklyDB,
  factors: factorDB,
  resources: resourceDB,
  transform: transformDB,
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
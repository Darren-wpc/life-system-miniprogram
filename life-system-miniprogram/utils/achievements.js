// utils/achievements.js - F2: 成就徽章系统
// 管理成就定义、解锁检测、徽章展示

const ACHIEVEMENT_KEY = 'ls_achievements';

// 成就定义
const ACHIEVEMENTS = [
  // 入门类
  {
    id: 'first_assessment',
    name: '初次自评',
    description: '完成第一次周级自评',
    icon: '🏆',
    category: '入门',
    check: (ctx) => {
      const weekly = ctx.weeklyList || [];
      return weekly.length >= 1;
    }
  },
  {
    id: 'first_daily',
    name: '每日一笔',
    description: '完成第一次日级反馈',
    icon: '✏️',
    category: '入门',
    check: (ctx) => {
      const daily = ctx.dailyList || [];
      return daily.length >= 1;
    }
  },
  {
    id: 'first_factor',
    name: '因子觉醒',
    description: '完成第一次五因子评估',
    icon: '🔢',
    category: '入门',
    check: (ctx) => {
      const factors = ctx.factorList || [];
      return factors.length >= 1;
    }
  },
  // 坚持类
  {
    id: 'seven_days',
    name: '七日不辍',
    description: '连续 7 天日级反馈',
    icon: '🔥',
    category: '坚持',
    check: (ctx) => {
      return ctx.dailyStreak >= 7;
    }
  },
  {
    id: 'thirty_days',
    name: '满月达阵',
    description: '连续 30 天日级反馈',
    icon: '🌙',
    category: '坚持',
    check: (ctx) => {
      return ctx.dailyStreak >= 30;
    }
  },
  {
    id: 'hundred_days',
    name: '百日记',
    description: '连续 100 天日级反馈',
    icon: '💯',
    category: '坚持',
    check: (ctx) => {
      return ctx.dailyStreak >= 100;
    }
  },
  {
    id: 'total_50_days',
    name: '积少成多',
    description: '累计记录 50 天日级反馈',
    icon: '📚',
    category: '坚持',
    check: (ctx) => {
      return (ctx.dailyList || []).length >= 50;
    }
  },
  // 深度类
  {
    id: 'four_quarters',
    name: '四季轮回',
    description: '完成 4 次季级复盘',
    icon: '🍂',
    category: '深度',
    check: (ctx) => {
      return (ctx.quarterlyList || []).length >= 4;
    }
  },
  {
    id: 'first_quarter',
    name: '初次复盘',
    description: '完成第一次季级复盘',
    icon: '📋',
    category: '深度',
    check: (ctx) => {
      return (ctx.quarterlyList || []).length >= 1;
    }
  },
  // 健康类
  {
    id: 'six_dim_balanced',
    name: '六维均衡',
    description: '六维评分全部 ≥4 分',
    icon: '⚖️',
    category: '健康',
    check: (ctx) => {
      const latest = ctx.latestScore;
      if (!latest) return false;
      const dims = ['survival', 'autonomy', 'capability', 'relationship', 'innerOrder', 'meaning'];
      return dims.every(k => latest[k] !== undefined && latest[k] !== null && latest[k] >= 4);
    }
  },
  {
    id: 'overall_4_plus',
    name: '系统健康',
    description: '综合健康度达到 4.0+',
    icon: '🌟',
    category: '健康',
    check: (ctx) => {
      const latest = ctx.latestScore;
      if (!latest) return false;
      const dims = ['survival', 'autonomy', 'capability', 'relationship', 'innerOrder', 'meaning'];
      const valid = dims.filter(k => latest[k] !== undefined && latest[k] !== null);
      if (valid.length === 0) return false;
      const avg = valid.reduce((s, k) => s + latest[k], 0) / valid.length;
      return avg >= 4.0;
    }
  },
  // 韧性类
  {
    id: 'bounce_back',
    name: '触底反弹',
    description: '从 ≤2 分回升到 ≥4 分',
    icon: '🚀',
    category: '韧性',
    check: (ctx) => {
      const weekly = ctx.weeklyList || [];
      if (weekly.length < 2) return false;
      // 检查是否存在某个维度从<=2回升到>=4
      const dims = ['survival', 'autonomy', 'capability', 'relationship', 'innerOrder', 'meaning'];
      // weekly 是 newest-first，需要找到先低后高的模式
      for (let i = 0; i < weekly.length; i++) {
        for (let j = i + 1; j < weekly.length; j++) {
          // weekly[j] 是更早的记录
          for (const dim of dims) {
            const earlier = weekly[j][dim];
            const later = weekly[i][dim];
            if (earlier !== undefined && earlier !== null && earlier <= 2 &&
                later !== undefined && later !== null && later >= 4) {
              return true;
            }
          }
        }
      }
      return false;
    }
  },
  // 盘点类
  {
    id: 'resource_master',
    name: '资源大师',
    description: '完成 7 类资源全部盘点',
    icon: '💎',
    category: '盘点',
    check: (ctx) => {
      const resources = ctx.resources;
      if (!resources || !resources.metrics) return false;
      const types = ['money', 'time', 'health', 'relationship', 'capability', 'info', 'psychology'];
      return types.every(key => {
        const m = resources.metrics[key];
        if (!m) return false;
        return Object.values(m).some(v => v !== '' && v !== undefined && v !== null);
      });
    }
  },
  // 反思类
  {
    id: 'narrator',
    name: '叙事者',
    description: '完成 4 次叙事一致性记录',
    icon: '📖',
    category: '反思',
    check: (ctx) => {
      return (ctx.narrativeList || []).length >= 4;
    }
  },
  {
    id: 'first_narrative',
    name: '初识自我',
    description: '完成第一次叙事一致性记录',
    icon: '🔍',
    category: '反思',
    check: (ctx) => {
      return (ctx.narrativeList || []).length >= 1;
    }
  },
  // 觉察类
  {
    id: 'pivot_signal',
    name: '转向信号',
    description: '触发自动检测转向信号',
    icon: '🧭',
    category: '觉察',
    check: (ctx) => {
      return (ctx.pivotList || []).length >= 1;
    }
  },
  // 工具类
  {
    id: 'toolkit_explorer',
    name: '工具探索者',
    description: '使用 3 种以上工具箱工具',
    icon: '🛠️',
    category: '工具',
    check: (ctx) => {
      if (!ctx.toolKeys) return false;
      const toolKeys = ctx.toolKeys;
      let usedCount = 0;
      ['TOOL_NOTODO', 'TOOL_BOTTOMLINE', 'TOOL_EXCHANGE', 'TOOL_INTERRUPT', 'TOOL_UNCONTROLLABLE', 'TOOL_RESTART'].forEach(key => {
        if (toolKeys[key]) {
          const data = wx.getStorageSync(toolKeys[key]);
          if (data && data.items && Array.isArray(data.items) && data.items.length > 0) {
            usedCount++;
          } else if (data && data.updatedAt) {
            usedCount++;
          }
        }
      });
      return usedCount >= 3;
    }
  },
  // AI 类
  {
    id: 'ai_explorer',
    name: 'AI 探索者',
    description: '使用 AI 教练功能',
    icon: '🤖',
    category: 'AI',
    check: (ctx) => {
      if (!ctx.aiUsage) return false;
      return ctx.aiUsage.totalCalls > 0;
    }
  },
  {
    id: 'weekly_streak_4',
    name: '月度坚持',
    description: '连续 4 周完成周级自评',
    icon: '📅',
    category: '坚持',
    check: (ctx) => {
      const weekly = ctx.weeklyList || [];
      if (weekly.length < 4) return false;
      // 检查最近 4 周是否连续（每周都有记录）
      const now = new Date();
      for (let i = 0; i < 4; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        const day = d.getDay() || 7;
        d.setDate(d.getDate() - day + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const weekId = `${y}-${m}-${dd}`;
        const found = weekly.some(w => w.id === weekId);
        if (!found) return false;
      }
      return true;
    }
  }
];

/**
 * 获取成就解锁状态
 */
function getUnlockedState() {
  try {
    return wx.getStorageSync(ACHIEVEMENT_KEY) || {};
  } catch (e) {
    return {};
  }
}

/**
 * 保存成就解锁状态
 */
function saveUnlockedState(state) {
  try {
    wx.setStorageSync(ACHIEVEMENT_KEY, state);
  } catch (e) {
    console.error('[achievements] saveState error:', e);
  }
}

/**
 * 组装上下文数据用于成就检测
 */
function assembleContext() {
  const db = require('./db');
  const ai = require('./ai');

  return {
    weeklyList: db.weekly.getAll(),
    latestScore: db.weekly.getLatest(),
    factorList: db.factors.getAll(),
    dailyList: db.daily.getDays(365),
    dailyStreak: db.daily.getStreak(),
    quarterlyList: db.quarterly.getAll(),
    narrativeList: db.narrative.getAll(),
    pivotList: db.pivot.getAll(),
    resources: db.resources.get(),
    toolKeys: db.tool.getKeys(),
    aiUsage: ai.getUsageStats()
  };
}

/**
 * 检查所有成就，返回新解锁的成就列表
 * @param {Object} [ctx] - 预组装的上下文（可选）
 * @returns {Array} 新解锁的成就
 */
function checkAchievements(ctx) {
  const context = ctx || assembleContext();
  const unlocked = getUnlockedState();
  const newlyUnlocked = [];

  ACHIEVEMENTS.forEach(achievement => {
    if (unlocked[achievement.id]) return; // 已解锁

    try {
      const isUnlocked = achievement.check(context);
      if (isUnlocked) {
        unlocked[achievement.id] = {
          unlockedAt: Date.now(),
          name: achievement.name,
          icon: achievement.icon
        };
        newlyUnlocked.push(achievement);
      }
    } catch (e) {
      console.error('[achievements] check error for', achievement.id, e);
    }
  });

  if (newlyUnlocked.length > 0) {
    saveUnlockedState(unlocked);
  }

  return newlyUnlocked;
}

/**
 * 获取所有成就的展示数据（含解锁状态）
 * @returns {Object} { total, unlocked, locked, categories, list }
 */
function getAchievementDisplay() {
  const unlocked = getUnlockedState();

  const list = ACHIEVEMENTS.map(a => {
    const state = unlocked[a.id];
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      category: a.category,
      unlocked: !!state,
      unlockedAt: state ? state.unlockedAt : 0
    };
  });

  const unlockedCount = list.filter(a => a.unlocked).length;
  const categories = {};
  list.forEach(a => {
    if (!categories[a.category]) {
      categories[a.category] = { name: a.category, total: 0, unlocked: 0 };
    }
    categories[a.category].total++;
    if (a.unlocked) categories[a.category].unlocked++;
  });

  return {
    total: list.length,
    unlocked: unlockedCount,
    locked: list.length - unlockedCount,
    categories: Object.values(categories),
    list
  };
}

/**
 * 显示成就解锁通知
 * @param {Array} achievements - 新解锁的成就列表
 */
function showUnlockNotification(achievements) {
  if (!achievements || achievements.length === 0) return;

  const first = achievements[0];
  const more = achievements.length > 1 ? ` 等 ${achievements.length} 项` : '';

  wx.showToast({
    title: `${first.icon} 解锁成就「${first.name}」${more}`,
    icon: 'none',
    duration: 3000
  });
}

/**
 * 清除成就数据
 */
function clearAchievements() {
  try {
    wx.removeStorageSync(ACHIEVEMENT_KEY);
  } catch (e) {
    console.error('[achievements] clear error:', e);
  }
}

module.exports = {
  ACHIEVEMENTS,
  getUnlockedState,
  saveUnlockedState,
  assembleContext,
  checkAchievements,
  getAchievementDisplay,
  showUnlockNotification,
  clearAchievements,
  KEYS: {
    ACHIEVEMENTS: ACHIEVEMENT_KEY
  }
};

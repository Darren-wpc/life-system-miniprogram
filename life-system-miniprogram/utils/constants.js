// utils/constants.js

// P2-23: 集中管理版本号，避免在 settings/export 等多处独立硬编码
// SCHEMA_VERSION 从 db.js 导出，APP_VERSION 在此处统一定义
const { SCHEMA_VERSION } = require('./db');
const APP_VERSION = 'v3.0.0';

const DIMENSIONS = {
  survival: { key: 'survival', name: '生存基础', desc: '健康、安全、睡眠、饮食、住处、基本收入', icon: '❤' },
  autonomy: { key: 'autonomy', name: '自主权', desc: '时间是否属于自己，能否拒绝，能否选择', icon: '⭐' },
  capability: { key: 'capability', name: '能力资产', desc: '可迁移技能、学习新东西的能力、积累而非消耗', icon: '📐' },
  relationship: { key: 'relationship', name: '关系支持', desc: '可信任连接的质量，而不是数量', icon: '🤝' },
  innerOrder: { key: 'innerOrder', name: '内在秩序', desc: '情绪、价值观、自我接纳、独处能力', icon: '🧠' },
  meaning: { key: 'meaning', name: '意义贡献', desc: '价值连接、创造、承担、人生值得感', icon: '💡' }
};

const DIM_KEYS = ['survival', 'autonomy', 'capability', 'relationship', 'innerOrder', 'meaning'];

const FACTORS = {
  standards: { key: 'standards', name: '合适的标准', desc: '我在用什么尺看自己？' },
  action: { key: 'action', name: '持续行动', desc: '对的事会不会自动发生？' },
  resources: { key: 'resources', name: '资源支持', desc: '我手里能动用什么？' },
  feedback: { key: 'feedback', name: '反馈修正', desc: '我能不能看见自己的真实状态？' },
  uncertainty: { key: 'uncertainty', name: '接受不确定性', desc: '出事的时候我能不能继续？' }
};

const FACTOR_KEYS = ['standards', 'action', 'resources', 'feedback', 'uncertainty'];

// 维度关联矩阵：改善行维度对列维度的带动系数 (0-1)
const DIM_CORRELATION = {
  survival: { autonomy: 0.3, capability: 0.2, relationship: 0.4, innerOrder: 0.7, meaning: 0.3 },
  autonomy: { survival: 0.3, capability: 0.5, relationship: 0.3, innerOrder: 0.6, meaning: 0.5 },
  capability: { survival: 0.1, autonomy: 0.6, relationship: 0.2, innerOrder: 0.4, meaning: 0.5 },
  relationship: { survival: 0.2, autonomy: 0.2, capability: 0.1, innerOrder: 0.6, meaning: 0.4 },
  innerOrder: { survival: 0.4, autonomy: 0.4, capability: 0.5, relationship: 0.4, meaning: 0.6 },
  meaning: { survival: 0.2, autonomy: 0.3, capability: 0.3, relationship: 0.3, innerOrder: 0.5 }
};

const RESOURCE_TYPES = {
  money: { key: 'money', name: '金钱资源', icon: '💰' },
  time: { key: 'time', name: '时间资源', icon: '⏰' },
  health: { key: 'health', name: '健康资源', icon: '🏃' },
  relationship: { key: 'relationship', name: '关系资源', icon: '👥' },
  capability: { key: 'capability', name: '能力资源', icon: '📚' },
  info: { key: 'info', name: '信息与判断', icon: '📡' },
  psychology: { key: 'psychology', name: '心理与意义', icon: '🧩' }
};

const RELATIONSHIP_LEVELS = {
  L1: { level: 'L1', name: '凌晨3点', desc: '紧急时能立刻接电话/上门', healthyRange: '1-3人' },
  L2: { level: 'L2', name: '重大决策', desc: '做大决定时愿意先问的人', healthyRange: '2-5人' },
  L3: { level: 'L3', name: '真话伙伴', desc: '能告诉你"你这次是错的"的人', healthyRange: '3-8人' },
  L4: { level: 'L4', name: '弱连接', desc: '行业内能介绍机会的人', healthyRange: '30-100人' }
};

const PIVOT_SIGNALS = [
  { id: 1, text: '连续2个季度在≥2个维度上持续下行', autoDetect: true },
  { id: 2, text: '修复当前系统的成本已超过重建', autoDetect: false },
  { id: 3, text: '同一类问题过去3年反复出现', autoDetect: true },
  { id: 4, text: '即使所有外部目标达成也不觉得这是我想过的人生', autoDetect: false },
  { id: 5, text: '留下的理由是沉没成本/别人怎么看/不知道去哪', autoDetect: false },
  { id: 6, text: '身体已经在替我说话：慢性症状/失眠/情绪躯体化', autoDetect: true }
];

const TOOL_TYPES = {
  notodo: { name: '不做清单', desc: '即使有钱也不愿做的事', key: 'TOOL_NOTODO' },
  bottomline: { name: '底线设定', desc: '跌破就必须停下处理的客观线', key: 'TOOL_BOTTOMLINE' },
  exchange: { name: '取舍汇率', desc: '我愿意用X换Y的兑换率', key: 'TOOL_EXCHANGE' },
  interrupt: { name: '中断恢复脚本', desc: '破功后怎么回来', key: 'TOOL_INTERRUPT' },
  uncontrollable: { name: '不可控清单', desc: '区分可控与不可控', key: 'TOOL_UNCONTROLLABLE' },
  restart: { name: '重启剧本', desc: '最大恐惧发生时前30天做什么', key: 'TOOL_RESTART' }
};

const MOOD_EMOJIS = ['😊', '😌', '😐', '😔', '😢'];

// P2-14: 集中管理硬编码色值
const COLORS = {
  PRIMARY: '#0d9488',
  PRIMARY_LIGHT: '#ccfbf1',
  ACCENT: '#f59e0b',
  DANGER: '#e11d48',
  SUCCESS: '#16a34a',
  INFO: '#2563eb',
  INK: '#1e293b',
  MUTED: '#64748b',
  RULE: '#e2e8f0',
  BG: '#f8fafc',
  SURFACE: '#ffffff',
  GRID_LINE: '#e2e8f0',
  GRID_FILL: 'rgba(248, 250, 252, 0.6)',
  COMPARE_FILL: 'rgba(13, 148, 136, 0.08)',
  COMPARE_STROKE: 'rgba(13, 148, 136, 0.25)',
  DATA_FILL: 'rgba(13, 148, 136, 0.18)',
  DATA_STROKE: '#0d9488',
  VERTEX_FILL: '#0d9488',
  VERTEX_STROKE: '#ffffff',
  EMPTY_STROKE: '#cbd5e1',
  EMPTY_AXIS: '#e2e8f0'
};

// P2-14/P2-17: 集中管理健康度阈值
const HEALTH_THRESHOLDS = {
  GREEN: 4,            // 六维健康度：≥4 为绿色
  YELLOW: 2,           // 六维健康度：≥2 为黄色
  RED: 0,              // 六维健康度：<2 为红色
  RESOURCE_GREEN: 3.5, // 资源健康度：≥3.5 为绿色（70%阈值）
  RESOURCE_YELLOW: 2    // 资源健康度：≥2 为黄色
};

// P2-18: 五因子瓶颈告警阈值，统一引用此常量避免 0.3/0.5 不一致
const FACTOR_BOTTLENECK_THRESHOLD = 0.5;

// P2-14: 集中管理列表存储上限
const RETENTION_DAYS = {
  WEEKLY_SCORES: 104,
  FACTOR_SCORES: 365,
  DAILY_FEEDBACK: 180,
  QUARTERLY_REVIEW: 40,
  NARRATIVE: 40,
  PIVOT: 40,
  TOOL_ITEMS: 100
};

module.exports = {
  // P2-23: 统一导出版本号常量
  APP_VERSION,
  SCHEMA_VERSION,
  DIMENSIONS,
  DIM_KEYS,
  FACTORS,
  FACTOR_KEYS,
  DIM_CORRELATION,
  RESOURCE_TYPES,
  RELATIONSHIP_LEVELS,
  PIVOT_SIGNALS,
  TOOL_TYPES,
  MOOD_EMOJIS,
  COLORS,
  HEALTH_THRESHOLDS,
  FACTOR_BOTTLENECK_THRESHOLD,
  RETENTION_DAYS
};
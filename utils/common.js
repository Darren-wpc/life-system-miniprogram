// utils/common.js - 公共工具函数（P2-4 提取重复代码, P2-5 统一ES6, P3-4 触觉反馈）

/**
 * 生成唯一 ID
 * @returns {string} 唯一标识符
 */
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
};

/**
 * 格式化时间戳为 YYYY-MM-DD
 * @param {number} ts 时间戳（毫秒）
 * @returns {string} 格式化日期
 */
const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * 深拷贝简单对象
 * @param {*} obj
 * @returns {*} 深拷贝结果
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item));
  const result = {};
  Object.keys(obj).forEach(key => { result[key] = deepClone(obj[key]); });
  return result;
};

/**
 * 防抖函数
 * @param {Function} fn
 * @param {number} delay 毫秒
 * @returns {Function}
 */
const debounce = (fn, delay) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * P3-4: 触觉反馈 - 短震动
 * 在保存、删除、切换等关键操作中调用
 */
const haptic = () => {
  if (wx.vibrateShort) {
    wx.vibrateShort({ type: 'light' });
  }
};

/**
 * P1-1: 通用删除确认弹窗
 * P2-20: 统一在此处调用 haptic()，回调中不再重复调用，避免双重震动
 * @param {string} itemName 被删除项名称（可选）
 * @param {Function} onConfirm 用户确认后的回调
 */
const confirmDelete = (itemName, onConfirm) => {
  let content = '确定要删除这条记录吗？删除后不可恢复。';
  if (itemName) {
    content = `确定要删除「${itemName}」吗？删除后不可恢复。`;
  }
  wx.showModal({
    title: '确认删除',
    content,
    confirmText: '删除',
    confirmColor: '#e11d48',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm && onConfirm) {
        haptic();
        onConfirm();
      }
    }
  });
};

module.exports = {
  generateId,
  formatDate,
  deepClone,
  debounce,
  haptic,
  confirmDelete
};

// pages/profile/pivot/index.js - 转向信号检测

const db = require('../../../utils/db');
const constants = require('../../../utils/constants');

Page({
  data: {
    currentQuarter: '',
    // 6个转向信号
    signals: [],
    checkedCount: 0,
    // 推荐级别: 0-1=info, 2=warning, 3+=danger
    recommendationLevel: 'info',
    recommendationText: '',
    // 转向准备清单（信号>=2时显示）
    showPrepList: false,
    prepList: [
      { key: 'seen', label: '看见了', text: '我能清晰地说出现在哪里不对劲', checked: false },
      { key: 'direction', label: '有方向', text: '我大致知道转向后想做什么', checked: false },
      { key: 'afford', label: '能承担', text: '我有足够的资源撑过转型期', checked: false },
      { key: 'returnable', label: '留得回', text: '如果失败，我还能退回来', checked: false }
    ],
    prepCheckedCount: 0,
    // 准备清单结论
    prepConclusion: '',
    prepConclusionType: '',
    saving: false,
    hasRecord: false
  },

  onLoad() {
    const currentQuarter = db.getQuarterId(new Date());
    this.setData({ currentQuarter });

    // 加载 PIVOT_SIGNALS 常量
    const signals = constants.PIVOT_SIGNALS.map((s) => ({
      id: s.id,
      text: s.text,
      autoDetect: s.autoDetect,
      checked: false,
      autoDetected: false  // P1-7: 标记是否由系统自动检测勾选
    }));

    this.setData({ signals });
    // P1-4: 数据加载放 onShow，onLoad 仅做初始化
  },

  onShow() {
    this._loadData();
  },

  onPullDownRefresh() {
    this._loadData();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载已保存数据
   */
  _loadData() {
    const currentQuarter = db.getQuarterId(new Date());
    const latest = db.pivot.getLatest();

    if (latest && latest.id === currentQuarter) {
      // 本季度已有记录，恢复状态
      const signals = this.data.signals;
      const checkedSignalIds = latest.checkedSignals || [];

      signals.forEach((s) => {
        s.checked = checkedSignalIds.indexOf(s.id) >= 0;
        s.autoDetected = false;  // 重置自动检测标志
      });

      // 恢复准备清单
      const prepList = this.data.prepList;
      const savedPrep = latest.prepList || {};
      prepList.forEach((item) => {
        item.checked = !!savedPrep[item.key];
      });
      const prepCheckedCount = prepList.filter((item) => item.checked).length;

      this.setData({
        signals,
        hasRecord: true,
        prepList,
        prepCheckedCount
      });

      // P1-7: 自动检测 —— 仅对未在已保存勾选列表中的信号进行检测，
      // 避免覆盖用户已做出的手动选择
      this._autoDetectSignals(checkedSignalIds);

      // 重新计算已勾选数量（自动检测可能新增勾选）
      const checkedCount = this.data.signals.filter((s) => s.checked).length;
      this.setData({ checkedCount });

      this._updateRecommendation();
      this._updatePrepConclusion();
    } else {
      // 本季度无记录 —— 运行自动检测预勾选
      this._autoDetectSignals();

      const checkedCount = this.data.signals.filter((s) => s.checked).length;
      this.setData({ checkedCount, hasRecord: false });

      this._updateRecommendation();
    }
  },

  /**
   * P1-7: 转向信号自动检测
   * 根据周评分数据自动检测信号 1、3、6 并预勾选
   * @param {Array} excludeIds - 已保存的勾选信号ID列表，这些信号不会被自动检测覆盖
   */
  _autoDetectSignals(excludeIds = []) {
    const signals = this.data.signals;
    const weeklyList = db.weekly.getAll();

    if (weeklyList.length < 4) return; // 需要至少4周数据

    const excludeSet = new Set(excludeIds);

    // 按季度聚合周评分
    const quarterData = {};
    // 记录每个维度在哪些季度出现过低分（≤2），用于信号3检测
    const lowDimQuarters = {};
    constants.DIM_KEYS.forEach((k) => { lowDimQuarters[k] = new Set(); });

    weeklyList.forEach((record) => {
      const qId = db.getQuarterId(new Date(record.date || record.id));
      if (!quarterData[qId]) {
        quarterData[qId] = { count: 0, dims: {} };
        constants.DIM_KEYS.forEach((k) => { quarterData[qId].dims[k] = 0; });
      }
      quarterData[qId].count++;
      constants.DIM_KEYS.forEach((k) => {
        const score = record[k] || 0;
        quarterData[qId].dims[k] += score;
        if (score <= 2) {
          lowDimQuarters[k].add(qId);
        }
      });
    });

    const quarters = Object.keys(quarterData).sort().reverse();

    // Signal 1: 连续2个季度在≥2个维度上持续下行
    if (quarters.length >= 2) {
      const recent = quarterData[quarters[0]];
      const prev = quarterData[quarters[1]];
      let declineCount = 0;
      constants.DIM_KEYS.forEach((k) => {
        const recentAvg = recent.dims[k] / recent.count;
        const prevAvg = prev.dims[k] / prev.count;
        if (recentAvg < prevAvg) declineCount++;
      });
      if (declineCount >= 2) {
        const sig = signals.find((s) => s.id === 1);
        if (sig && !excludeSet.has(1)) {
          sig.checked = true;
          sig.autoDetected = true;
        }
      }
    }

    // Signal 3: 同一类问题过去3年反复出现
    // 简化判定：任一维度在3个以上不同季度的记录中得分≤2
    const hasRecurringProblem = constants.DIM_KEYS.some(
      (k) => lowDimQuarters[k].size >= 3
    );
    if (hasRecurringProblem) {
      const sig = signals.find((s) => s.id === 3);
      if (sig && !excludeSet.has(3)) {
        sig.checked = true;
        sig.autoDetected = true;
      }
    }

    // Signal 6: 身体已经在替我说话：慢性症状/失眠/情绪躯体化
    // 判定：survival维度连续3周以上得分≤2
    const recentWeeks = weeklyList.slice(0, 10);
    let consecutiveLow = 0;
    let maxConsecutive = 0;
    for (let i = 0; i < recentWeeks.length; i++) {
      if ((recentWeeks[i].survival || 0) <= 2) {
        consecutiveLow++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveLow);
      } else {
        consecutiveLow = 0;
      }
    }
    if (maxConsecutive >= 3) {
      const sig = signals.find((s) => s.id === 6);
      if (sig && !excludeSet.has(6)) {
        sig.checked = true;
        sig.autoDetected = true;
      }
    }

    this.setData({ signals });
  },

  /**
   * 信号勾选/取消
   */
  onSignalToggle(e) {
    const id = e.currentTarget.dataset.id;
    const signals = this.data.signals;

    signals.forEach((s) => {
      if (s.id === id) {
        s.checked = !s.checked;
        s.autoDetected = false;  // 用户手动操作后清除自动检测标记
      }
    });

    const checkedCount = signals.filter((s) => s.checked).length;

    this.setData({
      signals,
      checkedCount
    });

    this._updateRecommendation();
  },

  /**
   * 更新推荐级别
   */
  _updateRecommendation() {
    const { checkedCount } = this.data;
    let level = 'info';
    let text = '';

    if (checkedCount <= 1) {
      level = 'info';
      text = '暂无强烈转向信号。继续保持观察，定期复评。';
    } else if (checkedCount === 2) {
      level = 'warning';
      text = '出现多个转向信号，建议认真思考：这些信号指向同一个方向吗？';
    } else {
      level = 'danger';
      text = '强烈转向信号。是时候认真考虑了——但先完成转向准备清单。';
    }

    const showPrepList = checkedCount >= 2;

    this.setData({
      recommendationLevel: level,
      recommendationText: text,
      showPrepList
    });
  },

  /**
   * 准备清单勾选/取消
   */
  onPrepToggle(e) {
    const key = e.currentTarget.dataset.key;
    const prepList = this.data.prepList;

    prepList.forEach((item) => {
      if (item.key === key) {
        item.checked = !item.checked;
      }
    });

    const prepCheckedCount = prepList.filter((item) => item.checked).length;

    this.setData({
      prepList,
      prepCheckedCount
    });

    this._updatePrepConclusion();
  },

  /**
   * 更新准备清单结论
   */
  _updatePrepConclusion() {
    const { prepCheckedCount: count } = this.data;
    let conclusion = '';
    let type = '';

    if (count >= 4) {
      conclusion = '转向是设计';
      type = 'green';
    } else if (count <= 2) {
      conclusion = '可能是逃跑';
      type = 'red';
    } else {
      conclusion = '接近就绪，还需补足';
      type = 'yellow';
    }

    this.setData({
      prepConclusion: conclusion,
      prepConclusionType: type
    });
  },

  /**
   * 保存
   */
  onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    const signals = this.data.signals;
    const checkedSignals = [];
    signals.forEach((s) => {
      if (s.checked) {
        checkedSignals.push(s.id);
      }
    });

    const prepList = this.data.prepList;
    const prepData = {};
    prepList.forEach((item) => {
      prepData[item.key] = item.checked;
    });

    const data = {
      checkedSignals,
      checkedCount: this.data.checkedCount,
      prepList: prepData,
      prepCheckedCount: this.data.prepCheckedCount,
      recommendationLevel: this.data.recommendationLevel
    };

    try {
      db.pivot.save(data);
      this.setData({ hasRecord: true });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      console.error('pivot save error:', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }

    setTimeout(() => {
      this.setData({ saving: false });
    }, 800);
  }
});

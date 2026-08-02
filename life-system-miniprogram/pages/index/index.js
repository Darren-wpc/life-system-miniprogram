// pages/index/index.js - 六维健康度仪表盘首页逻辑

const db = require('../../utils/db');
const diagnosis = require('../../utils/diagnosis');
const { DIMENSIONS, DIM_KEYS, FACTORS, RESOURCE_TYPES, COLORS, FACTOR_BOTTLENECK_THRESHOLD } = require('../../utils/constants');
const { haptic } = require('../../utils/common');
const ai = require('../../utils/ai');
const chartHelper = require('../../utils/chartHelper');
const shareCard = require('../../utils/shareCard');
const correlation = require('../../utils/correlation');

Page({
  data: {
    hasData: false,
    loading: true,           // P2-9: 加载状态
    currentDate: '',
    // 完成状态
    todayDone: false,
    weekDone: false,
    quarterDone: false,
    dailyStreak: 0,
    // 雷达图
    overallHealth: '0.0',
    overallStatus: 'green',
    // 维度卡片
    dimensionCards: [],
    activeDim: null,
    // 洞察
    insights: [],
    // P1-5: 五因子数据
    factorProduct: 0,
    factorProductPercent: 0,
    factorBottleneck: '',
    hasFactorData: false,
    // P1-5: 资源数据
    resourceFilled: 0,
    resourceTotal: 7,
    hasResourceData: false,
    // 周对比弹窗
    showWeekModal: false,
    compareWeekId: '',
    weekList: [],
    // P2-11: 底线告警
    bottomlineAlerts: [],
    // F3: 趋势图与热力图
    showTrendChart: false,
    showHeatMap: false,
    hasTrendData: false,
    // F10: 洞察卡片分享
    showShareModal: false,
    shareCanvasReady: false,
    shareThemeIndex: 0,
    shareInsightIndex: 0,
    // F11: 维度关联推荐
    correlationRec: null,
    hasCorrelationData: false,
    // AI 深度解读
    aiInsight: null,
    aiLoading: false,
    aiEnabled: false
  },

  // P2-1: Canvas 2D 非响应式缓存
  // _radarCenter: { x, y, maxR } — 用于 P2-2 点击检测

  onShow() {
    this._loadDashboardData();
  },

  onPullDownRefresh() {
    this._loadDashboardData();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载仪表盘全部数据
   * P1-5: 同时加载五因子和资源数据，闭环接入首页
   */
  _loadDashboardData() {
    // P2-24: 包裹 try-catch，防止数据格式异常时 loading 永远为 true（骨架屏永久卡住）
    try {
      const today = new Date();
      const dateStr = db.getDateStr(today);
      const weekId = db.getWeekId(today);
      const quarterId = db.getQuarterId(today);

      this.setData({ currentDate: dateStr, loading: true });

      // 1. 检查完成状态
      this._checkCompletionStatus(dateStr, weekId, quarterId);

      // P1-5: 获取全部评估数据（周评 + 五因子 + 资源）
      const latestScore = db.weekly.getLatest();
      const previousScore = db.weekly.getPrevious();
      const latestFactors = db.factors.getLatest();
      const savedResources = db.resources.get();

      if (!latestScore) {
        this.setData({ hasData: false, loading: false });
        wx.nextTick(() => {
          this._drawEmptyRadar();
        });
        return;
      }

      // 3. 构建维度卡片
      const dimensionCards = this._buildDimensionCards(latestScore, previousScore);

      // 4. 计算综合健康度
      const overallHealth = diagnosis.calcOverallHealth(latestScore);
      const overallStatus = diagnosis.getStatus(parseFloat(overallHealth));

      // 5. 运行诊断，生成洞察
      // F7: 当有 4+ 周数据时使用增强洞察（含模式识别）
      const weeklyList = db.weekly.getAll();
      let insights;
      if (weeklyList.length >= 4) {
        insights = diagnosis.generateEnhancedInsights(latestScore, previousScore, weeklyList);
      } else {
        insights = diagnosis.generateInsights(latestScore, previousScore);
      }

      // F11: 当有 4+ 周数据时计算维度关联推荐
      let correlationRec = null;
      let hasCorrelationData = false;
      if (weeklyList.length >= 4) {
        const recResult = correlation.getRecommendation(weeklyList);
        correlationRec = recResult.recommendation;
        hasCorrelationData = !!correlationRec;
      }

      // F3: 2+ 周数据时启用趋势图
      const hasTrendData = weeklyList.length >= 2;

      // P1-5: 处理五因子数据
      let factorProduct = 0;
      let factorProductPercent = 0;
      let factorBottleneck = '';
      let hasFactorData = false;

      if (latestFactors) {
        hasFactorData = true;
        factorProduct = diagnosis.calcProduct(latestFactors);
        factorProductPercent = Math.round(factorProduct * 100);
        const bottleneckKey = diagnosis.findBottleneckFactor(latestFactors);
        if (bottleneckKey && FACTORS[bottleneckKey]) {
          factorBottleneck = FACTORS[bottleneckKey].name;
          // 将因子瓶颈加入洞察
          // P2-18: 统一使用 FACTOR_BOTTLENECK_THRESHOLD 常量
          if (latestFactors[bottleneckKey] < FACTOR_BOTTLENECK_THRESHOLD) {
            insights.push({
              type: 'warning',
              title: '五因子瓶颈',
              text: `「${factorBottleneck}」是当前最弱因子，提升它可大幅放大整体效能`
            });
          }
        }
      }

      // P1-5: 处理资源数据
      let resourceFilled = 0;
      let hasResourceData = false;
      const resourceKeys = Object.keys(RESOURCE_TYPES);

      if (savedResources && savedResources.metrics) {
        hasResourceData = true;
        resourceKeys.forEach(key => {
          const metrics = savedResources.metrics[key];
          if (metrics) {
            const hasValues = Object.values(metrics).some(v => v !== '' && v !== undefined && v !== null);
            if (hasValues) resourceFilled++;
          }
        });

        // 资源健康度洞察
        if (resourceFilled <= 2) {
          insights.push({
            type: 'info',
            title: '资源盘点提醒',
            text: `仅盘点了 ${resourceFilled} 类资源，建议完善资源盘点以获得全面诊断`
          });
        }
      }

      this.setData({
        hasData: true,
        loading: false,
        dimensionCards,
        overallHealth,
        overallStatus,
        insights,
        factorProduct: parseFloat(factorProduct.toFixed(2)),
        factorProductPercent,
        factorBottleneck,
        hasFactorData,
        resourceFilled,
        hasResourceData,
        bottomlineAlerts: this._checkBottomlineAlerts(latestScore),
        // F3/F11: 新增数据字段
        hasTrendData,
        correlationRec,
        hasCorrelationData
      });

      // 6. 绘制雷达图（延迟确保 canvas 已渲染）
      wx.nextTick(() => {
        this._drawRadarChart(latestScore, previousScore);
      });

      // 7. 加载 AI 深度解读
      this._loadAIInsight();
    } catch (err) {
      // P2-24: 异常时确保 loading 置为 false 并提示用户，避免骨架屏永久卡住
      console.error('_loadDashboardData error:', err);
      this.setData({ loading: false, hasData: false });
      wx.showToast({ title: '数据加载失败', icon: 'none' });
    }
  },

  /**
   * 检查日/周/季三级完成状态
   */
  _checkCompletionStatus(dateStr, weekId, quarterId) {
    const todayDone = !!db.daily.getToday();
    const weeklyList = db.weekly.getAll();
    const weekDone = weeklyList.some(r => r.id === weekId);
    const quarterReview = db.quarterly.getLatest();
    const quarterDone = quarterReview && quarterReview.id === quarterId;
    const dailyStreak = db.daily.getStreak();

    this.setData({ todayDone, weekDone, quarterDone, dailyStreak });
  },

  /**
   * 构建六维维度卡片数据
   * P3-5: 趋势图标统一为 ↑↓→
   */
  _buildDimensionCards(current, previous) {
    return DIM_KEYS.map(key => {
      const dim = DIMENSIONS[key];
      const score = current[key] || 0;
      const prevScore = previous ? (previous[key] || 0) : 0;

      // P3-5: 统一趋势图标
      let trendIcon = '';
      let trendClass = '';
      if (previous) {
        if (score > prevScore) {
          trendIcon = '↑';
          trendClass = 'trend-up';
        } else if (score < prevScore) {
          trendIcon = '↓';
          trendClass = 'trend-down';
        } else {
          trendIcon = '→';
          trendClass = 'trend-flat';
        }
      }

      const status = diagnosis.getStatus(score);
      const statusClass = status === 'green' ? 'bar-green'
        : status === 'yellow' ? 'bar-yellow' : 'bar-red';

      return {
        key,
        icon: dim.icon,
        name: dim.name,
        desc: dim.desc,
        score,
        trendIcon,
        trendClass,
        statusClass,
        progressPercent: Math.max(score / 5 * 100, 0)
      };
    });
  },

  // ===== P2-1: Canvas 2D API 绘制 =====

  /**
   * 绘制雷达图（使用 Canvas 2D API）
   */
  _drawRadarChart(current, previous) {
    const query = wx.createSelectorQuery().in(this);
    query.select('#radarChart').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const w = res[0].width;
      const h = res[0].height || w;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      this._renderRadar(ctx, current, previous, w, h);
    });
  },

  /**
   * 实际绘制逻辑（Canvas 2D API）
   * P2-6: 使用 COLORS 常量替代硬编码色值
   */
  _renderRadar(ctx, current, previous, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.36;
    const levels = 5;
    const dims = DIM_KEYS.length;
    const angleStep = (Math.PI * 2) / dims;
    const startAngle = -Math.PI / 2;

    // P2-2: 缓存中心坐标和半径用于点击检测
    this._radarCenter = { x: cx, y: cy, maxR };

    ctx.clearRect(0, 0, w, h);

    // 绘制背景网格（5层六边形）
    for (let i = 1; i <= levels; i++) {
      const r = (maxR / levels) * i;
      ctx.beginPath();
      for (let j = 0; j < dims; j++) {
        const angle = startAngle + j * angleStep;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = COLORS.RULE;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (i === levels) {
        ctx.fillStyle = COLORS.GRID_FILL;
        ctx.fill();
      }
    }

    // 绘制轴线
    for (let j = 0; j < dims; j++) {
      const angle = startAngle + j * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.strokeStyle = COLORS.RULE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 绘制上周数据（虚线效果）
    if (previous) {
      this._drawRadarArea(ctx, cx, cy, maxR, angleStep, startAngle, previous, dims, true);
    }

    // 绘制本周数据
    this._drawRadarArea(ctx, cx, cy, maxR, angleStep, startAngle, current, dims, false);

    // 绘制维度标签
    const labelFont = Math.max(10, Math.round(w * 0.04));
    const labelOffset = maxR * 0.22;
    ctx.font = `${labelFont}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = COLORS.INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let j = 0; j < dims; j++) {
      const key = DIM_KEYS[j];
      const dim = DIMENSIONS[key];
      const angle = startAngle + j * angleStep;
      const labelR = maxR + labelOffset;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle);
      ctx.fillText(dim.name, x, y);
    }

    // 绘制中心综合分
    const overall = diagnosis.calcOverallHealth(current);
    const scoreFont = Math.max(18, Math.round(w * 0.075));
    const subFont = Math.max(10, Math.round(w * 0.035));
    ctx.font = `bold ${scoreFont}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = COLORS.PRIMARY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(overall, cx, cy - w * 0.018);
    ctx.font = `${subFont}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = COLORS.MUTED;
    ctx.fillText('综合分', cx, cy + w * 0.045);

    // Canvas 2D API 无需调用 draw()
  },

  /**
   * 绘制雷达图数据区域（Canvas 2D API）
   */
  _drawRadarArea(ctx, cx, cy, maxR, angleStep, startAngle, data, dims, isCompare) {
    ctx.beginPath();
    for (let j = 0; j < dims; j++) {
      const key = DIM_KEYS[j];
      const score = data[key] || 0;
      const r = (score / 5) * maxR;
      const angle = startAngle + j * angleStep;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (j === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    if (isCompare) {
      ctx.fillStyle = COLORS.COMPARE_FILL;
      ctx.fill();
      ctx.strokeStyle = COLORS.COMPARE_STROKE;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = COLORS.DATA_FILL;
      ctx.fill();
      ctx.strokeStyle = COLORS.DATA_STROKE;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 绘制顶点（仅当前数据）
    if (!isCompare) {
      for (let j = 0; j < dims; j++) {
        const key = DIM_KEYS[j];
        const score = data[key] || 0;
        const r = (score / 5) * maxR;
        const angle = startAngle + j * angleStep;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.VERTEX_FILL;
        ctx.fill();
        ctx.strokeStyle = COLORS.VERTEX_STROKE;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  },

  /**
   * 绘制空状态虚线雷达图（Canvas 2D API）
   */
  _drawEmptyRadar() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#emptyRadar').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const w = res[0].width;
      const h = res[0].height || w;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      this._renderEmptyRadar(ctx, w, h);
    });
  },

  _renderEmptyRadar(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.4;
    const dims = DIM_KEYS.length;
    const angleStep = (Math.PI * 2) / dims;
    const startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, w, h);

    // 虚线六边形
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let j = 0; j < dims; j++) {
      const angle = startAngle + j * angleStep;
      const x = cx + maxR * Math.cos(angle);
      const y = cy + maxR * Math.sin(angle);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = COLORS.EMPTY_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // 虚线轴
    for (let j = 0; j < dims; j++) {
      const angle = startAngle + j * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.strokeStyle = COLORS.EMPTY_AXIS;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  },

  /**
   * P2-2: 点击雷达图 - 根据触摸坐标定位维度
   */
  onRadarTap(e) {
    const touch = e.detail;
    if (!touch || typeof touch.x !== 'number') return;

    const center = this._radarCenter;
    if (!center) return;

    const dx = touch.x - center.x;
    const dy = touch.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 点击离中心太远则忽略
    if (dist > center.maxR * 1.4) return;

    // 计算角度（从顶部开始，顺时针）
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    if (angle >= Math.PI * 2) angle -= Math.PI * 2;

    // 找到最近的维度顶点
    const dims = DIM_KEYS.length;
    const angleStep = (Math.PI * 2) / dims;
    const nearestIdx = Math.round(angle / angleStep) % dims;
    const nearestKey = DIM_KEYS[nearestIdx];

    // P3-4: 触觉反馈
    haptic();
    this.setData({
      activeDim: this.data.activeDim === nearestKey ? null : nearestKey
    });
  },

  /**
   * 长按雷达图 - 弹出历史对比选择器
   */
  onRadarLongPress() {
    haptic();
    this._loadWeekList();
    this.setData({ showWeekModal: true });
  },

  /**
   * 点击维度卡片
   */
  onDimTap(e) {
    const key = e.currentTarget.dataset.key;
    haptic();
    this.setData({
      activeDim: this.data.activeDim === key ? null : key
    });
  },

  /**
   * 加载周列表数据
   */
  _loadWeekList() {
    const weeklyList = db.weekly.getAll();
    const weekList = weeklyList.map(r => {
      const avg = diagnosis.calcOverallHealth(r);
      return {
        id: r.id,
        avg: parseFloat(avg)
      };
    });
    this.setData({ weekList, compareWeekId: weekList[1] ? weekList[1].id : '' });
  },

  /**
   * 显示周对比选择器
   */
  showWeekPicker() {
    this._loadWeekList();
    this.setData({ showWeekModal: true });
  },

  /**
   * 隐藏周对比选择器
   */
  hideWeekPicker() {
    this.setData({ showWeekModal: false });
  },

  /**
   * 选择对比周次
   */
  selectCompareWeek(e) {
    const id = e.currentTarget.dataset.id;
    const weeklyList = db.weekly.getAll();
    const compareData = weeklyList.find(r => r.id === id);
    const latestData = db.weekly.getLatest();

    if (compareData && latestData) {
      haptic();
      wx.nextTick(() => {
        this._drawRadarChart(latestData, compareData);
      });

      const dimensionCards = this._buildDimensionCards(latestData, compareData);
      this.setData({
        compareWeekId: id,
        dimensionCards,
        showWeekModal: false
      });
    }
  },

  /**
   * 跳转到周级自评
   */
  goToWeeklyAssess() {
    wx.switchTab({
      url: '/pages/assess/weekly/index'
    });
  },

  /**
   * 跳转到今日记录
   */
  goToDailyFeedback() {
    wx.switchTab({
      url: '/pages/feedback/daily/index'
    });
  },

  /**
   * 跳转到五因子
   */
  goToFactors() {
    wx.navigateTo({
      url: '/pages/assess/factors/index'
    });
  },

  /**
   * 跳转到资源盘点
   */
  goToResources() {
    wx.navigateTo({
      url: '/pages/assess/resources/index'
    });
  },

  /**
   * P2-11: 底线告警检测 - 检查最新周评分是否跌破已设底线
   * @param {Object} latestScore 最新周评分
   * @returns {Array} 告警列表
   */
  _checkBottomlineAlerts(latestScore) {
    if (!latestScore) return [];

    const keys = db.tool.getKeys();
    const savedBottomline = db.tool.get(keys.TOOL_BOTTOMLINE);
    if (!savedBottomline) return [];

    const alerts = [];
    DIM_KEYS.forEach((key) => {
      const score = latestScore[key];
      const bottomline = savedBottomline[key];

      if (typeof score === 'number' && score <= 2 && bottomline && bottomline.trim()) {
        const dim = DIMENSIONS[key];
        alerts.push({
          key,
          name: dim.name,
          icon: dim.icon,
          bottomline: bottomline.trim()
        });
      }
    });

    return alerts;
  },

  /**
   * P2-11: 跳转到中断恢复脚本
   */
  goToInterrupt() {
    wx.navigateTo({
      url: '/pages/toolkit/interrupt/index'
    });
  },

  /**
   * 加载 AI 深度解读
   */
  _loadAIInsight() {
    const aiEnabled = ai.isEnabled();
    this.setData({ aiEnabled });

    if (!aiEnabled) return;

    // 先尝试读取缓存
    const cached = ai.getCachedInsight();
    if (cached && cached.summary) {
      this.setData({ aiInsight: cached });
    }

    // 异步生成新的洞察（本周未生成过时才会重新生成）
    this.setData({ aiLoading: true });
    ai.generateWeeklyInsight().then((insight) => {
      if (insight && insight.summary) {
        this.setData({ aiInsight: insight, aiLoading: false });
      } else {
        this.setData({ aiLoading: false });
      }
    }).catch(() => {
      this.setData({ aiLoading: false });
    });
  },

  /**
   * 刷新 AI 洞察（强制重新生成）
   */
  onRefreshAIInsight() {
    haptic();
    if (this.data.aiLoading) return;
    this.setData({ aiLoading: true });

    ai.generateWeeklyInsight(true).then((insight) => {
      if (insight && insight.summary) {
        this.setData({ aiInsight: insight, aiLoading: false });
        wx.showToast({ title: '已更新', icon: 'success' });
      } else {
        this.setData({ aiLoading: false });
      }
    }).catch(() => {
      this.setData({ aiLoading: false });
      wx.showToast({ title: '生成失败', icon: 'none' });
    });
  },

  /**
   * 跳转到 AI 对话页
   */
  goToCoach() {
    wx.navigateTo({
      url: '/pages/coach/index'
    });
  },

  // ===== F3: 趋势折线图 & 打卡热力图 =====

  /**
   * 切换趋势折线图显示/隐藏
   */
  onToggleTrendChart() {
    haptic();
    const show = !this.data.showTrendChart;
    this.setData({ showTrendChart: show });
    if (show) {
      wx.nextTick(() => {
        this._drawTrendChart();
      });
    }
  },

  /**
   * 绘制趋势折线图
   */
  _drawTrendChart() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#trendChart').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const w = res[0].width;
      const h = res[0].height || 300;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      const weeklyData = db.weekly.getAll();
      chartHelper.drawTrendLineChart(ctx, w, h, weeklyData, this.data.activeDim);
    });
  },

  /**
   * 切换打卡热力图显示/隐藏
   */
  onToggleHeatMap() {
    haptic();
    const show = !this.data.showHeatMap;
    this.setData({ showHeatMap: show });
    if (show) {
      wx.nextTick(() => {
        this._drawHeatMap();
      });
    }
  },

  /**
   * 绘制打卡热力图
   */
  _drawHeatMap() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#heatMap').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const w = res[0].width;
      const h = res[0].height || 200;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      const dailyData = db.daily.getDays(90);
      chartHelper.drawHeatMap(ctx, w, h, dailyData, 12);
    });
  },

  // ===== F10: 洞察卡片分享 =====

  /**
   * 打开洞察分享弹窗
   */
  onShareInsight(e) {
    haptic();
    const index = e.currentTarget.dataset.index;
    this.setData({
      showShareModal: true,
      shareInsightIndex: index
    });
    wx.nextTick(() => {
      this._drawShareCard();
    });
  },

  /**
   * 绘制分享卡片
   */
  _drawShareCard() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#shareCard').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const w = 320;
      const h = 450;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      const insight = this.data.insights[this.data.shareInsightIndex] || {};
      const latestScore = db.weekly.getLatest();
      const shareData = {
        insight: insight,
        overallHealth: this.data.overallHealth,
        dimScores: latestScore || {},
        streak: this.data.dailyStreak
      };
      shareCard.drawInsightCard(ctx, w, h, shareData, this.data.shareThemeIndex);
      this.setData({ shareCanvasReady: true });
    });
  },

  /**
   * 切换分享卡片主题
   */
  onShareThemeChange() {
    haptic();
    const next = (this.data.shareThemeIndex + 1) % 5;
    this.setData({ shareThemeIndex: next });
    wx.nextTick(() => {
      this._drawShareCard();
    });
  },

  /**
   * 保存分享卡片到相册
   */
  onShareSave() {
    haptic();
    const query = wx.createSelectorQuery().in(this);
    query.select('#shareCard').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const dpr = wx.getSystemInfoSync().pixelRatio;
      shareCard.generateAndSaveImage(canvas, dpr).then((tempPath) => {
        return shareCard.saveToAlbum(tempPath);
      }).then(() => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      }).catch((err) => {
        console.error('[share] save error:', err);
        if (!err || !err.errMsg || !err.errMsg.includes('auth deny')) {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      });
    });
  },

  /**
   * 关闭分享弹窗
   */
  onCloseShareModal() {
    this.setData({ showShareModal: false });
  }
});

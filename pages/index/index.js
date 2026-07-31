// pages/index/index.js - 六维健康度仪表盘首页逻辑

const db = require('../../utils/db');
const diagnosis = require('../../utils/diagnosis');
const { DIMENSIONS, DIM_KEYS } = require('../../utils/constants');

Page({
  data: {
    hasData: false,
    currentDate: '',
    // 完成状态
    todayDone: false,
    weekDone: false,
    quarterDone: false,
    dailyStreak: 0,
    // 雷达图
    overallHealth: '0.0',
    overallStatus: 'green', // green / yellow / red
    // 维度卡片
    dimensionCards: [],
    activeDim: null,
    // 洞察
    insights: [],
    // 周对比弹窗
    showWeekModal: false,
    compareWeekId: '',
    weekList: []
  },

  onLoad() {
    this._loadDashboardData();
  },

  onShow() {
    // 每次回到页面时刷新数据（用户可能从评估页返回）
    this._loadDashboardData();
  },

  onPullDownRefresh() {
    this._loadDashboardData();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载仪表盘全部数据
   */
  _loadDashboardData() {
    const today = new Date();
    const dateStr = db.getDateStr(today);
    const weekId = db.getWeekId(today);
    const quarterId = db.getQuarterId(today);

    this.setData({ currentDate: dateStr });

    // 1. 检查完成状态
    this._checkCompletionStatus(dateStr, weekId, quarterId);

    // 2. 获取最新周评数据
    const latestScore = db.weekly.getLatest();
    const previousScore = db.weekly.getPrevious();

    if (!latestScore) {
      // 无数据，显示空状态
      this.setData({ hasData: false });
      this._drawEmptyRadar();
      return;
    }

    // 3. 构建维度卡片
    const dimensionCards = this._buildDimensionCards(latestScore, previousScore);

    // 4. 计算综合健康度
    const overallHealth = diagnosis.calcOverallHealth(latestScore);
    const overallStatus = diagnosis.getStatus(parseFloat(overallHealth));

    // 5. 运行诊断，生成洞察
    const insights = diagnosis.generateInsights(latestScore, previousScore);

    this.setData({
      hasData: true,
      dimensionCards,
      overallHealth,
      overallStatus,
      insights
    });

    // 6. 绘制雷达图（延迟确保 canvas 已渲染）
    wx.nextTick(() => {
      this._drawRadarChart(latestScore, previousScore);
    });
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
   */
  _buildDimensionCards(current, previous) {
    return DIM_KEYS.map(key => {
      const dim = DIMENSIONS[key];
      const score = current[key] || 0;
      const prevScore = previous ? (previous[key] || 0) : 0;

      // 趋势
      let trendIcon = '';
      let trendClass = '';
      if (previous) {
        if (score > prevScore) {
          trendIcon = '^';
          trendClass = 'trend-up';
        } else if (score < prevScore) {
          trendIcon = 'v';
          trendClass = 'trend-down';
        } else {
          trendIcon = '-';
          trendClass = 'trend-flat';
        }
      }

      // 状态颜色
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

  /**
   * 绘制雷达图（使用 Canvas 2D API）
   */
  _drawRadarChart(current, previous) {
    // 动态获取 canvas 实际显示尺寸，保证比例正确
    const query = wx.createSelectorQuery().in(this);
    query.select('#radarChart').boundingClientRect();
    query.exec((res) => {
      let w = 300;
      let h = 300;
      if (res && res[0] && res[0].width) {
        w = res[0].width;
        h = res[0].height || res[0].width;
      }
      this._renderRadar(current, previous, w, h);
    });
  },

  /**
   * 实际绘制逻辑
   */
  _renderRadar(current, previous, w, h) {
    const ctx = wx.createCanvasContext('radarChart', this);
    const cx = w / 2;
    const cy = h / 2;
    // 最大半径根据实际尺寸自适应，留出标签空间
    const maxR = Math.min(w, h) * 0.36;
    const levels = 5; // 5个刻度
    const dims = DIM_KEYS.length;
    const angleStep = (Math.PI * 2) / dims;
    const startAngle = -Math.PI / 2; // 从顶部开始

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
      ctx.setStrokeStyle('#e2e8f0');
      ctx.setLineWidth(1);
      ctx.stroke();

      // 最外层填充极浅背景
      if (i === levels) {
        ctx.setFillStyle('rgba(248, 250, 252, 0.6)');
        ctx.fill();
      }
    }

    // 绘制轴线
    for (let j = 0; j < dims; j++) {
      const angle = startAngle + j * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.setStrokeStyle('#e2e8f0');
      ctx.setLineWidth(1);
      ctx.stroke();
    }

    // 绘制上周数据（如果有，虚线效果用浅色半透明模拟）
    if (previous) {
      this._drawRadarArea(ctx, cx, cy, maxR, angleStep, startAngle, previous, dims, true);
    }

    // 绘制本周数据
    this._drawRadarArea(ctx, cx, cy, maxR, angleStep, startAngle, current, dims, false);

    // 绘制维度标签（字号与位置按尺寸自适应）
    const labelFont = Math.max(10, Math.round(w * 0.04));
    const labelOffset = maxR * 0.22;
    ctx.setFontSize(labelFont);
    ctx.setFillStyle('#1e293b');
    ctx.setTextAlign('center');
    ctx.setTextBaseline('middle');
    for (let j = 0; j < dims; j++) {
      const key = DIM_KEYS[j];
      const dim = DIMENSIONS[key];
      const angle = startAngle + j * angleStep;
      const labelR = maxR + labelOffset;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle);
      ctx.fillText(dim.name, x, y);
    }

    // 绘制中心综合分（字号按尺寸自适应）
    const overall = diagnosis.calcOverallHealth(current);
    const scoreFont = Math.max(18, Math.round(w * 0.075));
    const subFont = Math.max(10, Math.round(w * 0.035));
    ctx.setFontSize(scoreFont);
    ctx.setFillStyle('#0d9488');
    ctx.setTextAlign('center');
    ctx.setTextBaseline('middle');
    ctx.fillText(overall, cx, cy - w * 0.018);
    ctx.setFontSize(subFont);
    ctx.setFillStyle('#64748b');
    ctx.fillText('综合分', cx, cy + w * 0.045);

    ctx.draw();
  },

  /**
   * 绘制雷达图数据区域
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
      ctx.setFillStyle('rgba(13, 148, 136, 0.08)');
      ctx.fill();
      ctx.setStrokeStyle('rgba(13, 148, 136, 0.25)');
      ctx.setLineWidth(2);
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.setFillStyle('rgba(13, 148, 136, 0.18)');
      ctx.fill();
      ctx.setStrokeStyle('#0d9488');
      ctx.setLineWidth(3);
      ctx.stroke();
    }

    // 绘制顶点
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
        ctx.setFillStyle('#0d9488');
        ctx.fill();
        ctx.setStrokeStyle('#ffffff');
        ctx.setLineWidth(2);
        ctx.stroke();
      }
    }
  },

  /**
   * 绘制空状态虚线雷达图
   */
  _drawEmptyRadar() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#emptyRadar').boundingClientRect();
    query.exec((res) => {
      let w = 150;
      let h = 150;
      if (res && res[0] && res[0].width) {
        w = res[0].width;
        h = res[0].height || res[0].width;
      }
      this._renderEmptyRadar(w, h);
    });
  },

  _renderEmptyRadar(w, h) {
    const ctx = wx.createCanvasContext('emptyRadar', this);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.4;
    const dims = DIM_KEYS.length;
    const angleStep = (Math.PI * 2) / dims;
    const startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, w, h);

    // 绘制虚线六边形
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
    ctx.setStrokeStyle('#cbd5e1');
    ctx.setLineWidth(2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制虚线轴
    for (let j = 0; j < dims; j++) {
      const angle = startAngle + j * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.setStrokeStyle('#e2e8f0');
      ctx.setLineWidth(1);
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.draw();
  },

  /**
   * 点击雷达图顶点 - 高亮对应维度卡片
   */
  onRadarTap(e) {
    const touch = e.touches && e.touches[0] || e.detail;
    if (!touch) return;

    // 简化处理：点击雷达图时依次循环高亮维度
    const cards = this.data.dimensionCards;
    const currentIdx = cards.findIndex(c => c.key === this.data.activeDim);
    const nextIdx = (currentIdx + 1) % cards.length;
    this.setData({ activeDim: cards[nextIdx].key });
  },

  /**
   * 长按雷达图 - 弹出历史对比选择器
   */
  onRadarLongPress() {
    this._loadWeekList();
    this.setData({ showWeekModal: true });
  },

  /**
   * 点击维度卡片
   */
  onDimTap(e) {
    const key = e.currentTarget.dataset.key;
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
      // 重新绘制带对比的雷达图
      wx.nextTick(() => {
        this._drawRadarChart(latestData, compareData);
      });

      // 刷新维度卡片为对比数据
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
  }
});

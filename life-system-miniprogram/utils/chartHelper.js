// utils/chartHelper.js - F3: 趋势折线图与热力图绘制工具
// 基于 Canvas 2D API 的图表绘制方法

const { COLORS, DIM_KEYS, DIMENSIONS } = require('./constants');

// 维度颜色映射
const DIM_COLORS = {
  survival: '#e11d48',
  autonomy: '#6366f1',
  capability: '#0d9488',
  relationship: '#f59e0b',
  innerOrder: '#8b5cf6',
  meaning: '#16a34a'
};

/**
 * 绘制六维趋势折线图
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - canvas 宽度
 * @param {number} h - canvas 高度
 * @param {Array} weeklyData - 周评数据（newest-first），取最近 12 周
 * @param {string} activeDim - 当前选中的维度 key
 */
function drawTrendLineChart(ctx, w, h, weeklyData, activeDim) {
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 30, right: 20, bottom: 40, left: 35 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // 反转为时间正序（oldest-first）
  const data = (weeklyData || []).slice(0, 12).reverse();
  if (data.length === 0) {
    _drawNoDataText(ctx, w, h, '暂无趋势数据');
    return;
  }

  const maxScore = 5;
  const yStep = chartH / maxScore;

  // 绘制 Y 轴刻度线
  ctx.strokeStyle = COLORS.RULE;
  ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = COLORS.MUTED;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= maxScore; i++) {
    const y = padding.top + chartH - (i * yStep);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.strokeStyle = i === 0 ? COLORS.RULE : 'rgba(226, 232, 240, 0.5)';
    ctx.stroke();

    ctx.fillText(String(i), padding.left - 6, y);
  }

  // X 轴标签（显示周次日期）
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xStep = data.length > 1 ? chartW / (data.length - 1) : 0;

  data.forEach((record, i) => {
    if (i % Math.ceil(data.length / 4) !== 0 && i !== data.length - 1) return;
    const x = padding.left + i * xStep;
    // 只显示 MM-DD
    const dateStr = (record.id || record.date || '').slice(5);
    ctx.fillText(dateStr, x, padding.top + chartH + 8);
  });

  // 绘制各维度折线
  DIM_KEYS.forEach(dimKey => {
    const isActive = activeDim === dimKey;
    const color = DIM_COLORS[dimKey] || COLORS.PRIMARY;

    // 非选中维度且存在选中维度时，以淡色绘制
    const alpha = activeDim && !isActive ? 0.15 : 1.0;
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = isActive ? 2.5 : 1.5;

    data.forEach((record, i) => {
      const score = record[dimKey];
      if (score === undefined || score === null) return;

      const x = padding.left + i * xStep;
      const y = padding.top + chartH - (score * yStep);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // 选中维度绘制数据点
    if (isActive) {
      data.forEach((record, i) => {
        const score = record[dimKey];
        if (score === undefined || score === null) return;

        const x = padding.left + i * xStep;
        const y = padding.top + chartH - (score * yStep);

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    ctx.globalAlpha = 1.0;
  });

  // 绘制图例
  const legendY = 10;
  let legendX = padding.left;
  ctx.font = '9px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  DIM_KEYS.forEach(dimKey => {
    const dim = DIMENSIONS[dimKey];
    const isActive = !activeDim || activeDim === dimKey;
    const color = DIM_COLORS[dimKey] || COLORS.PRIMARY;

    ctx.globalAlpha = isActive ? 1.0 : 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(legendX + 4, legendY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.INK;
    ctx.fillText(dim.name, legendX + 10, legendY);

    legendX += ctx.measureText(dim.name).width + 22;
  });

  ctx.globalAlpha = 1.0;
}

/**
 * 绘制打卡热力图
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - canvas 宽度
 * @param {number} h - canvas 高度
 * @param {Array} dailyData - 日级反馈数据（newest-first）
 * @param {number} weeks - 显示周数（默认 12）
 */
function drawHeatMap(ctx, w, h, dailyData, weeks) {
  weeks = weeks || 12;
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 25, right: 10, bottom: 10, left: 30 };
  const cellSize = Math.floor((w - padding.left - padding.right) / weeks);
  const cellGap = 2;
  const actualCellSize = cellSize - cellGap;
  const rowHeight = cellSize;

  // 构建日期集合
  const dateSet = new Set();
  (dailyData || []).forEach(d => {
    if (d.id) dateSet.add(d.id);
  });

  // 获取今天日期
  const today = new Date();
  const todayDay = today.getDay() || 7; // 1-7, Monday=1

  // 从今天往前推 weeks 周
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (weeks - 1) * 7 - todayDay + 1);

  // 星期标签
  ctx.font = '9px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = COLORS.MUTED;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  dayLabels.forEach((label, i) => {
    const y = padding.top + i * rowHeight + actualCellSize / 2;
    ctx.fillText(label, padding.left - 4, y);
  });

  // 绘制热力格子
  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + week * 7 + day);

      // 只绘制今天及之前的日期
      if (date > today) continue;

      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const x = padding.left + week * cellSize;
      const cellY = padding.top + day * rowHeight;

      const hasRecord = dateSet.has(dateStr);

      ctx.beginPath();
      ctx.roundRect(x, cellY, actualCellSize, actualCellSize, 2);

      if (hasRecord) {
        ctx.fillStyle = COLORS.PRIMARY;
      } else {
        // 周末用稍深的底色
        const isWeekend = day >= 5;
        ctx.fillStyle = isWeekend ? '#e2e8f0' : '#f1f5f9';
      }
      ctx.fill();
    }
  }

  // 月份标签
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '9px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = COLORS.MUTED;

  let lastMonth = -1;
  for (let week = 0; week < weeks; week++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + week * 7);
    const month = date.getMonth() + 1;

    if (month !== lastMonth) {
      const x = padding.left + week * cellSize + actualCellSize / 2;
      ctx.fillText(month + '月', x, 8);
      lastMonth = month;
    }
  }

  // 图例
  const legendY = h - 8;
  const legendX = w - padding.right - 50;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = COLORS.MUTED;
  ctx.fillText('少', legendX, legendY);

  ctx.beginPath();
  ctx.roundRect(legendX + 14, legendY - 4, 8, 8, 2);
  ctx.fillStyle = '#f1f5f9';
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(legendX + 26, legendY - 4, 8, 8, 2);
  ctx.fillStyle = COLORS.PRIMARY;
  ctx.fill();

  ctx.fillStyle = COLORS.MUTED;
  ctx.fillText('多', legendX + 40, legendY);
}

/**
 * 绘制五因子乘积趋势图
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {Array} factorData - 五因子数据（newest-first）
 */
function drawFactorTrendChart(ctx, w, h, factorData) {
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 30, right: 20, bottom: 40, left: 45 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const data = (factorData || []).slice(0, 12).reverse();
  if (data.length === 0) {
    _drawNoDataText(ctx, w, h, '暂无五因子趋势数据');
    return;
  }

  const { FACTOR_KEYS, FACTORS } = require('./constants');

  // Y 轴：0-1
  const ySteps = 5;
  const yStep = chartH / ySteps;

  ctx.strokeStyle = COLORS.RULE;
  ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = COLORS.MUTED;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= ySteps; i++) {
    const y = padding.top + chartH - (i * yStep);
    const val = (i / ySteps).toFixed(1);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.strokeStyle = i === 0 ? COLORS.RULE : 'rgba(226, 232, 240, 0.5)';
    ctx.stroke();
    ctx.fillText(val, padding.left - 6, y);
  }

  // 计算乘积趋势
  const xStep = data.length > 1 ? chartW / (data.length - 1) : 0;

  // 绘制乘积折线
  ctx.beginPath();
  ctx.strokeStyle = COLORS.PRIMARY;
  ctx.lineWidth = 2.5;

  data.forEach((record, i) => {
    let product = 1;
    FACTOR_KEYS.forEach(key => {
      product *= (record[key] || 0);
    });

    const x = padding.left + i * xStep;
    const y = padding.top + chartH - (product * chartH);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // 填充区域
  ctx.lineTo(padding.left + (data.length - 1) * xStep, padding.top + chartH);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(13, 148, 136, 0.1)';
  ctx.fill();

  // 数据点
  data.forEach((record, i) => {
    let product = 1;
    FACTOR_KEYS.forEach(key => {
      product *= (record[key] || 0);
    });
    const x = padding.left + i * xStep;
    const y = padding.top + chartH - (product * chartH);

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.PRIMARY;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // X 轴标签
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.MUTED;
  data.forEach((record, i) => {
    if (i % Math.ceil(data.length / 4) !== 0 && i !== data.length - 1) return;
    const x = padding.left + i * xStep;
    const dateStr = (record.id || record.date || '').slice(5);
    ctx.fillText(dateStr, x, padding.top + chartH + 8);
  });

  // 标题
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.INK;
  ctx.font = 'bold 11px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('五因子乘积效能趋势', padding.left, 12);
}

/**
 * 绘制无数据提示
 */
function _drawNoDataText(ctx, w, h, text) {
  ctx.fillStyle = COLORS.MUTED;
  ctx.font = '13px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

module.exports = {
  drawTrendLineChart,
  drawHeatMap,
  drawFactorTrendChart,
  DIM_COLORS
};

// utils/shareCard.js - F10: 洞察卡片分享
// 使用 Canvas 2D 绘制精美分享卡片

const { COLORS, DIMENSIONS, DIM_KEYS } = require('./constants');

// 分享卡片背景色方案
const CARD_THEMES = [
  { name: 'teal', bg: '#0d9488', text: '#ffffff', card: 'rgba(255,255,255,0.15)' },
  { name: 'sunset', bg: '#f59e0b', text: '#ffffff', card: 'rgba(255,255,255,0.15)' },
  { name: 'ocean', bg: '#2563eb', text: '#ffffff', card: 'rgba(255,255,255,0.15)' },
  { name: 'dark', bg: '#1e293b', text: '#ffffff', card: 'rgba(255,255,255,0.1)' },
  { name: 'rose', bg: '#e11d48', text: '#ffffff', card: 'rgba(255,255,255,0.15)' }
];

/**
 * 绘制洞察分享卡片
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - canvas 宽度
 * @param {number} h - canvas 高度
 * @param {Object} data - 分享数据
 * @param {Object} data.insight - 洞察内容 { title, text, type }
 * @param {number} data.overallHealth - 综合健康度
 * @param {Object} data.dimScores - 各维度分数
 * @param {number} data.streak - 连续天数
 * @param {number} themeIndex - 主题索引
 */
function drawInsightCard(ctx, w, h, data, themeIndex) {
  const theme = CARD_THEMES[themeIndex] || CARD_THEMES[0];

  ctx.clearRect(0, 0, w, h);

  // 绘制渐变背景
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, theme.bg);
  gradient.addColorStop(1, _adjustColor(theme.bg, -20));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // 装饰圆形
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.beginPath();
  ctx.arc(w - 30, 50, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(30, h - 30, 60, 0, Math.PI * 2);
  ctx.fill();

  // 顶部：应用名
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '12px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('人生系统', 24, 24);

  // 综合健康度
  if (data.overallHealth !== undefined) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('综合健康度', w - 24, 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(data.overallHealth, w - 24, 38);
  }

  // 连续天数
  if (data.streak && data.streak > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`连续 ${data.streak} 天`, w - 24, 72);
  }

  // 六维分数条
  if (data.dimScores) {
    const barStartY = 110;
    const barHeight = 8;
    const barGap = 18;
    const barMaxWidth = w - 120;

    DIM_KEYS.forEach((key, i) => {
      const dim = DIMENSIONS[key];
      const score = data.dimScores[key] || 0;
      const y = barStartY + i * (barHeight + barGap);

      // 维度名
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(dim.name, 24, y + barHeight / 2);

      // 背景条
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.roundRect(80, y, barMaxWidth, barHeight, 4);
      ctx.fill();

      // 分数条
      const fillWidth = barMaxWidth * (score / 5);
      if (fillWidth > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.roundRect(80, y, fillWidth, barHeight, 4);
        ctx.fill();
      }

      // 分数数字
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(score), 80 + barMaxWidth + 8, y + barHeight / 2);
    });
  }

  // 洞察内容卡片
  if (data.insight) {
    const cardY = data.dimScores ? 260 : 120;
    const cardH = h - cardY - 60;

    // 卡片背景
    ctx.fillStyle = theme.card;
    ctx.beginPath();
    ctx.roundRect(20, cardY, w - 40, cardH, 12);
    ctx.fill();

    // 洞察标题
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(data.insight.title || '本周洞察', 36, cardY + 20);

    // 洞察文本（自动换行）
    ctx.font = '13px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const text = data.insight.text || '';
    const maxWidth = w - 72;
    _drawWrappedText(ctx, text, 36, cardY + 48, maxWidth, 20);
  }

  // 底部：日期 + 二维码占位
  const date = new Date();
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '10px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(dateStr, 24, h - 24);

  ctx.textAlign = 'right';
  ctx.fillText('人生系统 · 自我觉察工具', w - 24, h - 24);
}

/**
 * 生成分享图片并保存
 * @param {Object} canvas - canvas 节点
 * @param {number} dpr - 设备像素比
 * @returns {Promise<string>} 临时文件路径
 */
function generateAndSaveImage(canvas, dpr) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width / dpr,
      height: canvas.height / dpr,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      quality: 1,
      success: (res) => {
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        console.error('[shareCard] generateImage error:', err);
        reject(err);
      }
    }, this);
  });
}

/**
 * 保存图片到相册
 * @param {string} tempFilePath - 临时文件路径
 * @returns {Promise<void>}
 */
function saveToAlbum(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath: tempFilePath,
      success: () => resolve(),
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('auth deny')) {
          // 引导用户授权
          wx.showModal({
            title: '需要相册权限',
            content: '保存图片需要相册权限，请前往设置开启',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        }
        reject(err);
      }
    });
  });
}

// ===== 内部工具 =====

function _adjustColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = text.split('');
  let line = '';
  let currentY = y;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, currentY);
      line = chars[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

module.exports = {
  CARD_THEMES,
  drawInsightCard,
  generateAndSaveImage,
  saveToAlbum
};

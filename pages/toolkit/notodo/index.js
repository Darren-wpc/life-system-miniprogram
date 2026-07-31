// pages/toolkit/notodo/index.js - 工具箱枢纽页

var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

Page({
  data: {
    tools: [],
    filledTools: {},      // 哪些工具有数据
    filledCount: 0,       // 已启用工具数
    dailyTip: '',
    dailyTipIndex: 0
  },

  onLoad: function () {
    this._buildTools();
    this._loadTip();
    this._checkFilledStatus();
  },

  onShow: function () {
    this._checkFilledStatus();
  },

  onPullDownRefresh: function () {
    this._loadTip();
    this._checkFilledStatus();
    wx.stopPullDownRefresh();
  },

  /**
   * 构建六个工具卡片数据
   */
  _buildTools: function () {
    var toolTypes = constants.TOOL_TYPES;
    var toolEmojis = {
      notodo: '\uD83D\uDEE1',
      bottomline: '\uD83D\uDD3C',
      exchange: '\u2696',
      interrupt: '\uD83D\uDD04',
      uncontrollable: '\uD83C\uDF2C',
      restart: '\uD83D\uDD04'
    };
    var toolColors = {
      notodo: '#0d9488',
      bottomline: '#ef4444',
      exchange: '#f59e0b',
      interrupt: '#6366f1',
      uncontrollable: '#64748b',
      restart: '#22c55e'
    };
    var toolPages = {
      notodo: '/pages/toolkit/notodo-detail/index',
      bottomline: '/pages/toolkit/bottomline/index',
      exchange: '/pages/toolkit/exchange/index',
      interrupt: '/pages/toolkit/interrupt/index',
      uncontrollable: '/pages/toolkit/uncontrollable/index',
      restart: '/pages/toolkit/restart/index'
    };

    var tools = Object.keys(toolTypes).map(function (key) {
      var t = toolTypes[key];
      return {
        key: key,
        name: t.name,
        desc: t.desc,
        icon: toolEmojis[key] || '\uD83D\uDCE6',
        color: toolColors[key] || '#0d9488',
        page: toolPages[key] || ''
      };
    });

    this.setData({ tools: tools });
  },

  /**
   * 加载每日提示
   */
  _loadTip: function () {
    var tips = [
      '写下三件"即使给钱也不做"的事，你会发现自己的底线在哪里。',
      '设定底线不是限制自由，而是保护你真正在乎的东西。',
      '用取舍汇率思考：你愿意用多少加班换取一次和家人晚餐？',
      '中断恢复脚本的关键是：不要追求完美，追求"回来就好"。',
      '区分可控和不可控，减少80%的焦虑。',
      '写下重启剧本不是为了悲观，而是为了拥有"不怕倒下"的底气。'
    ];
    var dayIndex = new Date().getDate() % tips.length;
    this.setData({
      dailyTip: tips[dayIndex],
      dailyTipIndex: dayIndex
    });
  },

  /**
   * 检查哪些工具有已填写数据
   */
  _checkFilledStatus: function () {
    var keys = db.tool.getKeys();
    var toolKeys = constants.TOOL_TYPES;
    var filled = {};
    var filledCount = 0;

    Object.keys(toolKeys).forEach(function (key) {
      var storageKey = keys[toolKeys[key].key];
      var data = db.tool.get(storageKey);
      var hasData = false;

      if (data) {
        // 数组类数据（exchange, uncontrollable）
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          hasData = true;
        }
        // 脚本类数据（restart）
        if (data.scripts && Array.isArray(data.scripts) && data.scripts.length > 0) {
          hasData = true;
        }
        // 表单类数据（bottomline, interrupt）
        if (typeof data === 'object' && !data.items && !data.scripts) {
          var hasContent = false;
          var propNames = Object.keys(data);
          for (var i = 0; i < propNames.length; i++) {
            var v = data[propNames[i]];
            if (propNames[i] === 'updatedAt') continue;
            if (v !== undefined && v !== null && v !== '') {
              hasContent = true;
              break;
            }
          }
          if (hasContent) {
            hasData = true;
          }
        }
      }

      filled[key] = hasData;
      if (hasData) filledCount++;
    });

    this.setData({ filledTools: filled, filledCount: filledCount });
  },

  /**
   * 点击工具卡片
   */
  onToolTap: function (e) {
    var key = e.currentTarget.dataset.key;
    var tools = this.data.tools;
    var target = null;
    for (var i = 0; i < tools.length; i++) {
      if (tools[i].key === key) {
        target = tools[i];
        break;
      }
    }
    if (!target || !target.page) return;

    wx.navigateTo({
      url: target.page
    });
  },

  /**
   * 刷新每日提示
   */
  refreshTip: function () {
    var tips = [
      '写下三件"即使给钱也不做"的事，你会发现自己的底线在哪里。',
      '设定底线不是限制自由，而是保护你真正在乎的东西。',
      '用取舍汇率思考：你愿意用多少加班换取一次和家人晚餐？',
      '中断恢复脚本的关键是：不要追求完美，追求"回来就好"。',
      '区分可控和不可控，减少80%的焦虑。',
      '写下重启剧本不是为了悲观，而是为了拥有"不怕倒下"的底气。'
    ];
    var idx = (this.data.dailyTipIndex + 1) % tips.length;
    this.setData({
      dailyTip: tips[idx],
      dailyTipIndex: idx
    });
  }
});
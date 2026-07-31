// pages/profile/pivot/index.js - 转向信号检测

var db = require('../../../utils/db');
var constants = require('../../../utils/constants');

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

  onLoad: function () {
    var currentQuarter = db.getQuarterId(new Date());
    this.setData({ currentQuarter: currentQuarter });

    // 加载 PIVOT_SIGNALS 常量
    var signals = constants.PIVOT_SIGNALS.map(function (s) {
      return {
        id: s.id,
        text: s.text,
        autoDetect: s.autoDetect,
        checked: false
      };
    });

    this.setData({ signals: signals });
    this._loadData();
  },

  onShow: function () {
    if (this.data.signals.length > 0) {
      this._loadData();
    }
  },

  onPullDownRefresh: function () {
    this._loadData();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载已保存数据
   */
  _loadData: function () {
    var currentQuarter = db.getQuarterId(new Date());
    var latest = db.pivot.getLatest();

    if (latest && latest.id === currentQuarter) {
      // 本季度已有记录，恢复状态
      var signals = this.data.signals;
      var checkedSignalIds = latest.checkedSignals || [];

      signals.forEach(function (s) {
        s.checked = checkedSignalIds.indexOf(s.id) >= 0;
      });

      var checkedCount = signals.filter(function (s) { return s.checked; }).length;

      // 恢复准备清单
      var prepList = this.data.prepList;
      var savedPrep = latest.prepList || {};
      prepList.forEach(function (item) {
        item.checked = !!savedPrep[item.key];
      });
      var prepCheckedCount = prepList.filter(function (item) { return item.checked; }).length;

      this.setData({
        signals: signals,
        checkedCount: checkedCount,
        hasRecord: true,
        prepList: prepList,
        prepCheckedCount: prepCheckedCount
      });

      this._updateRecommendation();
      this._updatePrepConclusion();
    }
  },

  /**
   * 信号勾选/取消
   */
  onSignalToggle: function (e) {
    var id = e.currentTarget.dataset.id;
    var signals = this.data.signals;
    var target = null;

    signals.forEach(function (s) {
      if (s.id === id) {
        s.checked = !s.checked;
        target = s;
      }
    });

    var checkedCount = signals.filter(function (s) { return s.checked; }).length;

    this.setData({
      signals: signals,
      checkedCount: checkedCount
    });

    this._updateRecommendation();
  },

  /**
   * 更新推荐级别
   */
  _updateRecommendation: function () {
    var count = this.data.checkedCount;
    var level = 'info';
    var text = '';

    if (count <= 1) {
      level = 'info';
      text = '暂无强烈转向信号。继续保持观察，定期复评。';
    } else if (count === 2) {
      level = 'warning';
      text = '出现多个转向信号，建议认真思考：这些信号指向同一个方向吗？';
    } else {
      level = 'danger';
      text = '强烈转向信号。是时候认真考虑了——但先完成转向准备清单。';
    }

    var showPrepList = count >= 2;

    this.setData({
      recommendationLevel: level,
      recommendationText: text,
      showPrepList: showPrepList
    });
  },

  /**
   * 准备清单勾选/取消
   */
  onPrepToggle: function (e) {
    var key = e.currentTarget.dataset.key;
    var prepList = this.data.prepList;

    prepList.forEach(function (item) {
      if (item.key === key) {
        item.checked = !item.checked;
      }
    });

    var prepCheckedCount = prepList.filter(function (item) { return item.checked; }).length;

    this.setData({
      prepList: prepList,
      prepCheckedCount: prepCheckedCount
    });

    this._updatePrepConclusion();
  },

  /**
   * 更新准备清单结论
   */
  _updatePrepConclusion: function () {
    var count = this.data.prepCheckedCount;
    var conclusion = '';
    var type = '';

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
  onSave: function () {
    if (this.data.saving) return;
    this.setData({ saving: true });

    var signals = this.data.signals;
    var checkedSignals = [];
    signals.forEach(function (s) {
      if (s.checked) {
        checkedSignals.push(s.id);
      }
    });

    var prepList = this.data.prepList;
    var prepData = {};
    prepList.forEach(function (item) {
      prepData[item.key] = item.checked;
    });

    var data = {
      checkedSignals: checkedSignals,
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

    setTimeout(function () {
      this.setData({ saving: false });
    }.bind(this), 800);
  }
});

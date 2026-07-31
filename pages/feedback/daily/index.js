// pages/feedback/daily/index.js
const db = require('../../../utils/db');
const constants = require('../../../utils/constants');

Page({
  data: {
    todayStr: '',
    streak: 0,
    todayDone: false,
    todayRecord: null,
    moodEmojis: constants.MOOD_EMOJIS,
    selectedMood: '',
    inputText: '',
    saving: false,
    historyList: []
  },

  onLoad() {
    this._loadData();
  },

  onShow() {
    this._loadData();
  },

  _loadData() {
    // 今日日期
    const now = new Date();
    const todayStr = db.getDateStr(now);
    const weekDayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDayNames[now.getDay()];
    const displayDate = `${now.getMonth() + 1}月${now.getDate()}日 周${weekDay}`;

    // 连续打卡天数
    const streak = db.daily.getStreak();

    // 今日记录
    const todayRecord = db.daily.getToday();
    const todayDone = !!todayRecord;

    // 历史记录（最近30天，排除今天）
    const allDays = db.daily.getDays(31);
    const historyList = allDays.filter(item => item.id !== todayStr);

    this.setData({
      todayStr: displayDate,
      streak,
      todayDone,
      todayRecord: todayRecord || null,
      historyList,
      selectedMood: todayRecord ? todayRecord.moodEmoji : '',
      inputText: todayRecord ? todayRecord.text : ''
    });
  },

  onMoodSelect(e) {
    const emoji = e.currentTarget.dataset.emoji;
    this.setData({ selectedMood: emoji });
  },

  onTextInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onSave() {
    if (this.data.saving) return;

    const { inputText, selectedMood } = this.data;

    if (!inputText.trim()) {
      wx.showToast({ title: '请先写点什么', icon: 'none' });
      return;
    }

    if (!selectedMood) {
      wx.showToast({ title: '请选择一个心情', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      db.daily.save({
        text: inputText.trim(),
        moodEmoji: selectedMood
      });
      wx.showToast({ title: '记录成功', icon: 'success' });
      this._loadData();
    } catch (err) {
      console.error('daily save error:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  goQuarterly() {
    wx.navigateTo({ url: '/pages/feedback/quarterly/index' });
  }
});

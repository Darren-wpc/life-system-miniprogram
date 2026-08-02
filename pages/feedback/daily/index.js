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
    historyList: [],
    // P2-10: 低谷期降级 - 连续3天负面心情时启用简化记录
    isLowPeriod: false,
    // P2-10: 是否切换回完整模式
    showFullMode: false
  },

  // P1-4: 数据加载统一放 onShow
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

    // P2-10: 低谷期检测 - 最近3天（不含今天）心情均为负面（😔/😢）时降级为简化记录
    let isLowPeriod = false;
    if (historyList.length >= 3) {
      const negativeMoods = ['😔', '😢'];
      const last3Days = historyList.slice(0, 3);
      isLowPeriod = last3Days.every(item => negativeMoods.indexOf(item.moodEmoji) >= 0);
    }

    this.setData({
      todayStr: displayDate,
      streak,
      todayDone,
      todayRecord: todayRecord || null,
      historyList,
      isLowPeriod,
      // P2-10: 每次加载重置为简化模式（仅在 isLowPeriod 时生效）
      showFullMode: false,
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

  // P2-10: 简化模式 - 一键保存心情
  onSimpleMood(e) {
    if (this.data.saving) return;

    const mood = e.currentTarget.dataset.mood;
    const text = e.currentTarget.dataset.text;

    this.setData({ saving: true });

    try {
      db.daily.save({
        text: text,
        moodEmoji: mood
      });
      wx.showToast({ title: '记录成功', icon: 'success' });
      this._loadData();
    } catch (err) {
      console.error('daily simple save error:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // P2-10: 切换回完整记录模式
  switchToFullMode() {
    this.setData({ showFullMode: true });
  },

  goQuarterly() {
    wx.navigateTo({ url: '/pages/feedback/quarterly/index' });
  }
});

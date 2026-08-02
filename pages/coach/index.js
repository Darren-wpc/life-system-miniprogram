// pages/coach/index.js - AI 教练对话页

const ai = require('../../utils/ai');

Page({
  data: {
    // 对话消息列表，格式: { role: 'user'|'ai', content: string, timestamp: number, typing?: boolean }
    messages: [],
    // 输入框文本
    inputText: '',
    // 是否正在发送/等待 AI 回复
    sending: false,
    // 发送按钮是否可用
    canSend: false,
    // scroll-view 滚动位置
    scrollTop: 0,
    // AI 功能是否开启
    aiEnabled: true,
    // 是否有周评数据
    hasData: false,
    // 目标引导弹窗
    showGoalModal: false,
    goalInput: '',
    // 快捷建议
    suggestions: [
      '我的压力很大',
      '如何设定目标',
      '最近找不到意义',
      '想改善健康'
    ]
  },

  // 打字机定时器引用
  _typingTimer: null,

  onLoad() {
    this._loadChatHistory();
    this._refreshState();
    // 云端可用时，异步同步对话历史
    if (ai.isCloudAvailable()) {
      ai.syncChatHistoryToCloud();
    }
  },

  onShow() {
    this._refreshState();
  },

  onUnload() {
    // 清理打字机定时器
    if (this._typingTimer) {
      clearInterval(this._typingTimer);
      this._typingTimer = null;
    }
  },

  /**
   * 刷新数据状态：AI 开关 & 是否有周评数据
   */
  _refreshState() {
    const userData = ai.assembleUserData();
    this.setData({
      aiEnabled: ai.isEnabled(),
      hasData: !!userData.current
    });
  },

  /**
   * 加载对话历史并转换为显示格式
   * 历史格式与显示格式一致：{ role, content, timestamp }
   * role 'user' 映射为右侧气泡，role 'ai' 映射为左侧气泡
   */
  _loadChatHistory() {
    const history = ai.getChatHistory();
    this.setData({ messages: history });
    if (history.length > 0) {
      this.scrollToBottom();
    }
  },

  /**
   * 输入框内容变化
   */
  onInput(e) {
    const value = e.detail.value;
    this.setData({
      inputText: value,
      canSend: value.trim().length > 0
    });
  },

  /**
   * 发送消息
   */
  async sendMessage() {
    const content = this.data.inputText.trim();
    if (!content || this.data.sending) return;

    // 立即显示用户消息
    const userMsg = {
      role: 'user',
      content,
      timestamp: Date.now()
    };

    this.setData({
      messages: [...this.data.messages, userMsg],
      inputText: '',
      canSend: false,
      sending: true
    });

    this.scrollToBottom();

    try {
      // ai.sendChatMessage 内部会保存用户消息和 AI 回复到历史记录
      const reply = await ai.sendChatMessage(content);

      // 打字机效果：逐字显示 AI 回复
      this._typewriterReply(reply);
    } catch (err) {
      console.error('coach sendMessage error:', err);
      const errMsg = {
        role: 'ai',
        content: '抱歉，出了点问题，请稍后重试。',
        timestamp: Date.now()
      };
      this.setData({
        messages: [...this.data.messages, errMsg],
        sending: false
      });
      this.scrollToBottom();
    }
  },

  /**
   * 点击快捷建议：填入输入框并自动发送
   */
  useSuggestion(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({
      inputText: text,
      canSend: true
    });
    this.sendMessage();
  },

  /**
   * 清空对话：二次确认后清除历史
   */
  clearChat() {
    if (this.data.messages.length === 0) return;
    wx.showModal({
      title: '清空对话',
      content: '确定要清空所有对话记录吗？此操作不可恢复。',
      confirmText: '清空',
      confirmColor: '#ef4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          ai.clearChatHistory();
          this.setData({
            messages: [],
            scrollTop: 0
          });
          wx.showToast({ title: '对话已清空', icon: 'success' });
        }
      }
    });
  },

  /**
   * 打开目标引导弹窗
   */
  openGoalModal() {
    this.setData({ showGoalModal: true, goalInput: '' });
  },

  /**
   * 关闭目标引导弹窗
   */
  closeGoalModal() {
    this.setData({ showGoalModal: false });
  },

  /**
   * 阻止冒泡
   */
  noop() {},

  /**
   * 目标输入
   */
  onGoalInput(e) {
    this.setData({ goalInput: e.detail.value });
  },

  /**
   * 提交目标引导请求
   */
  async submitGoal() {
    const goalText = this.data.goalInput.trim();
    if (!goalText || this.data.sending) return;

    // 关闭弹窗
    this.setData({ showGoalModal: false });

    // 显示用户目标消息
    const userMsg = {
      role: 'user',
      content: '🎯 ' + goalText,
      timestamp: Date.now()
    };

    this.setData({
      messages: [...this.data.messages, userMsg],
      goalInput: '',
      sending: true
    });
    this.scrollToBottom();

    try {
      const reply = await ai.requestGoalGuidance(goalText);
      this._typewriterReply(reply);
    } catch (err) {
      console.error('coach submitGoal error:', err);
      const errMsg = {
        role: 'ai',
        content: '抱歉，目标引导生成失败，请稍后重试。',
        timestamp: Date.now()
      };
      this.setData({
        messages: [...this.data.messages, errMsg],
        sending: false
      });
      this.scrollToBottom();
    }
  },

  /**
   * 打字机效果：逐字显示 AI 回复
   * @param {string} fullText - AI 完整回复
   */
  _typewriterReply(fullText) {
    if (!fullText) {
      this.setData({ sending: false });
      return;
    }

    // 先添加一条空消息
    const msgIndex = this.data.messages.length;
    const aiMsg = {
      role: 'ai',
      content: '',
      timestamp: Date.now(),
      typing: true
    };
    this.setData({
      messages: [...this.data.messages, aiMsg],
      sending: false
    });
    this.scrollToBottom();

    // 逐字显示
    let charIndex = 0;
    const charsPerTick = 2; // 每次显示 2 个字符，提升速度感
    const interval = 30; // 30ms 间隔

    this._typingTimer = setInterval(() => {
      charIndex += charsPerTick;
      if (charIndex >= fullText.length) {
        // 显示完成
        clearInterval(this._typingTimer);
        this._typingTimer = null;
        const messages = [...this.data.messages];
        messages[msgIndex] = {
          role: 'ai',
          content: fullText,
          timestamp: Date.now(),
          typing: false
        };
        this.setData({ messages });
        this.scrollToBottom();
      } else {
        const messages = [...this.data.messages];
        messages[msgIndex] = {
          role: 'ai',
          content: fullText.slice(0, charIndex),
          timestamp: Date.now(),
          typing: true
        };
        this.setData({ messages });
        // 每 3 次更新滚动一次，减少频繁查询
        if (charIndex % (charsPerTick * 3) === 0) {
          this.scrollToBottom();
        }
      }
    }, interval);
  },

  /**
   * 跳转到周评估页（tabBar 页，需要 switchTab）
   */
  goToWeekly() {
    wx.switchTab({
      url: '/pages/assess/weekly/index'
    });
  },

  /**
   * 滚动到底部：通过 createSelectorQuery 获取内容高度并设置 scrollTop
   */
  scrollToBottom() {
    setTimeout(() => {
      const query = wx.createSelectorQuery();
      query.select('.chat-content').boundingClientRect();
      query.exec((res) => {
        if (res && res[0] && res[0].height > 0) {
          this.setData({ scrollTop: res[0].height });
        }
      });
    }, 100);
  }
});

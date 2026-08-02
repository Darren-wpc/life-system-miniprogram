// pages/coach/index.js - AI 教练对话页

const ai = require('../../utils/ai');

Page({
  data: {
    // 对话消息列表，格式: { role: 'user'|'ai', content: string, timestamp: number }
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
    // 快捷建议
    suggestions: [
      '我的压力很大',
      '如何设定目标',
      '最近找不到意义',
      '想改善健康'
    ]
  },

  onLoad() {
    this._loadChatHistory();
    this._refreshState();
  },

  onShow() {
    this._refreshState();
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
      const aiMsg = {
        role: 'ai',
        content: reply,
        timestamp: Date.now()
      };
      this.setData({
        messages: [...this.data.messages, aiMsg],
        sending: false
      });
      this.scrollToBottom();
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

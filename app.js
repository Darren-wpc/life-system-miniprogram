// app.js
App({
  globalData: {},
  onLaunch() {
    // 初始化本地存储
    const db = require('./utils/db');
    db.init();
  }
});
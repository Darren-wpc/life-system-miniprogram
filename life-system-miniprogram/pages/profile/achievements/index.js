const achievements = require('../../../utils/achievements');
const { haptic } = require('../../../utils/common');

Page({
  data: {
    display: null,  // { total, unlocked, locked, categories, list }
    newlyUnlocked: []
  },

  onShow() {
    this._loadAchievements();
  },

  _loadAchievements() {
    // Check for new achievements
    const newlyUnlocked = achievements.checkAchievements();

    // Show notification if any new achievements
    if (newlyUnlocked.length > 0) {
      achievements.showUnlockNotification(newlyUnlocked);
    }

    // Get display data
    const display = achievements.getAchievementDisplay();

    // Sort list: unlocked first (by unlockedAt desc), then locked (by category)
    display.list.sort((a, b) => {
      if (a.unlocked && !b.unlocked) return -1;
      if (!a.unlocked && b.unlocked) return 1;
      if (a.unlocked && b.unlocked) return b.unlockedAt - a.unlockedAt;
      // Both locked: sort by category then name
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    // Calculate progress percent
    display.progressPercent = display.total > 0 ? Math.round(display.unlocked / display.total * 100) : 0;

    this.setData({ display, newlyUnlocked });
  },

  onShareAppMessage() {
    const d = this.data.display;
    return {
      title: `我在人生系统中解锁了 ${d ? d.unlocked : 0} 个成就！`,
      path: '/pages/index/index'
    };
  }
});

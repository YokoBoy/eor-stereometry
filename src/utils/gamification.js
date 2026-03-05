const { db } = require('../db');

async function checkAndAward(userId, type) {
  try {
    const user = await db.get('SELECT points FROM users WHERE id = ?', [userId]);
    if (!user) return;

    if (type === 'register') {
      const ach = await db.get('SELECT id, points FROM achievements WHERE title = ?', ['Первые шаги']);
      if (ach) await award(userId, ach);
    } else if (type === 'watch_5_videos') {
      const res = await db.get("SELECT COUNT(*) as c FROM progress WHERE user_id = ? AND status = 'watched'", [userId]);
      const count = res.c;
      if (count >= 5) {
        const ach = await db.get('SELECT id, points FROM achievements WHERE title = ?', ['Знаток теории']);
        if (ach) await award(userId, ach);
      }
    }
  } catch (e) {
    console.error('Gamification error:', e);
  }
}

async function award(userId, ach) {
  try {
    const exists = await db.get('SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?', [userId, ach.id]);
    if (!exists) {
      await db.run('INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)', [userId, ach.id]);
      await db.run('UPDATE users SET points = points + ? WHERE id = ?', [ach.points, userId]);
    }
  } catch (e) {}
}

module.exports = { checkAndAward };

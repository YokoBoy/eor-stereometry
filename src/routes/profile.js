const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { checkAndAward } = require('../utils/gamification');

const router = express.Router();

router.put('/update', requireAuth, async (req, res) => {
  const { email, password, name } = req.body;
  const userId = req.user.id;

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let updateFields = [];
    let params = [];

    if (email) {
      const exists = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (exists) return res.status(409).json({ error: 'Email already exists' });
      updateFields.push('email = ?');
      params.push(email);
    }

    if (name) {
      updateFields.push('name = ?');
      params.push(name);
    }

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      updateFields.push('password_hash = ?');
      params.push(hash);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(userId);
    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    await db.run(query, params);

    const updatedUser = await db.get('SELECT id, email, role, name, points FROM users WHERE id = ?', [userId]);
    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  // Get achievements
  const achievements = await db.all(`
    SELECT a.title, a.description, a.icon, a.points, ua.earned_at 
    FROM user_achievements ua 
    JOIN achievements a ON ua.achievement_id = a.id 
    WHERE ua.user_id = ?
  `, [req.user.id]);

  // Calculate detailed progress
  const watched = await db.all('SELECT video_id FROM progress WHERE user_id = ? AND (status = \'completed\' OR watched_seconds > 60)', [req.user.id]);
  const watchedIds = new Set(watched.map(w => w.video_id));

  // Get all assignments per video
  const assignments = await db.all('SELECT id, video_id FROM assignments');
  const assignMap = {};
  assignments.forEach(a => {
    if (!assignMap[a.video_id]) assignMap[a.video_id] = [];
    assignMap[a.video_id].push(a.id);
  });

  // Get user submissions
  const submissions = await db.all("SELECT assignment_id, grade FROM submissions WHERE user_id = ? AND status = 'graded'", [req.user.id]);
  const passedAssignIds = new Set(submissions.filter(s => s.grade >= 3).map(s => s.assignment_id)); // Grade 3-5 is pass

  // Determine fully completed videos
  let completedCount = 0;
  const completedVideoIds = [];

  // Get all videos to check
  const allVideos = await db.all('SELECT id FROM videos');
  
  for (const v of allVideos) {
    const isWatched = watchedIds.has(v.id);
    if (!isWatched) continue;

    // Check assignments
    const vAssigns = assignMap[v.id] || [];
    if (vAssigns.length === 0) {
      completedCount++;
      completedVideoIds.push(v.id);
    } else {
      const allPassed = vAssigns.every(aid => passedAssignIds.has(aid));
      if (allPassed) {
         completedCount++;
         completedVideoIds.push(v.id);
      }
    }
  }

  // Check achievements
  await checkAndAward(req.user.id, 'watch_5', completedCount);

  res.json({ 
    user: req.user, 
    achievements, 
    completedVideoIds,
    stats: {
        watched: completedCount,
        totalVideos: allVideos.length
    }
  });
});

router.post('/video-progress', requireAuth, async (req, res) => {
  const { video_id, status, watched_seconds } = req.body;
  if (!video_id || !status) return res.status(400).json({ error: 'invalid' });
  const exists = await db.get('SELECT id FROM videos WHERE id = ?', [video_id]);
  if (!exists) return res.status(404).json({ error: 'not_found' });
  
  await db.run('INSERT INTO progress (user_id, video_id, status, watched_seconds) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, video_id) DO UPDATE SET status=excluded.status, watched_seconds=excluded.watched_seconds, updated_at=CURRENT_TIMESTAMP', [req.user.id, video_id, status, watched_seconds || 0]);
  
  if (status === 'watched') {
    await checkAndAward(req.user.id, 'watch_5_videos');
  }

  res.json({ ok: true });
});

module.exports = router;

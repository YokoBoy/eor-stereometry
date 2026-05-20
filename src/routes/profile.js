const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

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

    const updatedUser = await db.get('SELECT id, email, role, name FROM users WHERE id = ?', [userId]);
    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  // Get watched videos details
  const watchedVideosDetails = await db.all(`
      SELECT v.id, v.title, p.watched_seconds, p.updated_at
      FROM progress p
      JOIN videos v ON p.video_id = v.id
      WHERE p.user_id = ? AND (p.status = 'completed' OR p.status = 'watched' OR p.watched_seconds > 60)
      ORDER BY p.updated_at DESC
  `, [req.user.id]);
  
  const watchedIds = new Set(watchedVideosDetails.map(w => w.id));

  // Get all graded submissions for profile display
  const gradedSubmissions = await db.all(`
      SELECT s.id, s.assignment_id, s.grade, s.feedback, s.created_at, a.title as assignment_title, v.title as video_title
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      LEFT JOIN videos v ON a.video_id = v.id
      WHERE s.user_id = ? AND s.status = 'graded'
      ORDER BY s.created_at DESC
  `, [req.user.id]);

  // Get all assignments per video
  const assignments = await db.all('SELECT id, video_id FROM assignments');
  const assignMap = {};
  assignments.forEach(a => {
    if (!assignMap[a.video_id]) assignMap[a.video_id] = [];
    assignMap[a.video_id].push(a.id);
  });

  const gradedGrades = gradedSubmissions.map(s => s.grade).filter(g => g != null);
  const averageGrade = gradedGrades.length > 0 
    ? Math.round((gradedGrades.reduce((a, b) => a + b, 0) / gradedGrades.length) * 100) / 100
    : 0;

  // Determine grade level
  let gradeLevel = 'none'; // неудовлетворительно
  if (averageGrade >= 4.5) gradeLevel = 'excellent';       // отличник
  else if (averageGrade >= 3.5) gradeLevel = 'good';       // хорошист (4)
  else if (averageGrade >= 3.0) gradeLevel = 'acceptable'; // приемлемо (3)
  else if (averageGrade >= 2.6) gradeLevel = 'passing';    // проходной

  // Get all videos to check
  const allVideos = await db.all('SELECT id FROM videos');
  
  const allWatched = allVideos.length > 0 && watchedIds.size >= allVideos.length;
  const hasCertificate = allWatched && gradeLevel !== 'none' && gradedGrades.length > 0;
  const needsImprovement = allWatched && !hasCertificate && gradedGrades.length > 0;

  res.json({ 
    user: req.user, 
    watchedVideosDetails,
    gradedSubmissions,
    hasCertificate,
    needsImprovement,
    averageGrade,
    gradeLevel,
    completedVideoIds: [...watchedIds],
    stats: {
        watched: watchedIds.size,
        totalGraded: gradedGrades.length,
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
  
  res.json({ ok: true });
});

module.exports = router;

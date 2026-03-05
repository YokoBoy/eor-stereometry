const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all users with summary statistics
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT 
        u.id, u.email, u.name, u.role, u.points, u.created_at,
        (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id AND (p.status = 'completed' OR p.watched_seconds > 60)) as watched_videos,
        (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.status = 'graded' AND s.grade >= 3) as completed_assignments,
        (SELECT COUNT(*) FROM user_achievements ua WHERE ua.user_id = u.id) as achievements_count
      FROM users u
      WHERE u.role = 'student'
      ORDER BY u.created_at DESC
    `);
    
    res.json(users);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed stats for a specific user
router.get('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await db.get('SELECT id, email, name, role, points, created_at FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Watched videos detail
    const watchedVideos = await db.all(`
      SELECT v.title, p.status, p.watched_seconds, p.updated_at
      FROM progress p
      JOIN videos v ON p.video_id = v.id
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC
    `, [id]);

    // Submissions detail
    const submissions = await db.all(`
      SELECT a.title, s.status, s.grade, s.feedback, s.created_at
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `, [id]);

    // Achievements detail
    const achievements = await db.all(`
      SELECT a.title, a.icon, ua.earned_at
      FROM user_achievements ua
      JOIN achievements a ON ua.achievement_id = a.id
      WHERE ua.user_id = ?
      ORDER BY ua.earned_at DESC
    `, [id]);

    res.json({
      user,
      watchedVideos,
      submissions,
      achievements
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard stats (optional but useful)
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalUsers = (await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'student'")).count;
    const totalVideos = (await db.get("SELECT COUNT(*) as count FROM videos")).count;
    const totalAssignments = (await db.get("SELECT COUNT(*) as count FROM assignments")).count;
    const totalSubmissions = (await db.get("SELECT COUNT(*) as count FROM submissions")).count;
    const pendingSubmissions = (await db.get("SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'")).count;

    res.json({
      totalUsers,
      totalVideos,
      totalAssignments,
      totalSubmissions,
      pendingSubmissions
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

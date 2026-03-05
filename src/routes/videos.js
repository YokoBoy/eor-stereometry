const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const { section_id, topic } = req.query;
  let q = `
    SELECT v.id, v.title, s.title as section_name, v.section_id, v.topic, v.description, v.url, v.duration, v.is_free, v.published_at 
    FROM videos v
    LEFT JOIN sections s ON v.section_id = s.id
  `;
  const params = [];
  const cond = [];
  if (section_id) { cond.push('v.section_id = ?'); params.push(section_id); }
  if (topic) { cond.push('v.topic = ?'); params.push(topic); }
  if (cond.length) q += ' WHERE ' + cond.join(' AND ');
  q += ' ORDER BY s.order_index, v.id DESC';
  const rows = await db.all(q, params);
  res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const v = await db.get('SELECT v.*, s.title as section_name FROM videos v LEFT JOIN sections s ON v.section_id = s.id WHERE v.id = ?', [id]);
  if (!v) return res.status(404).json({ error: 'not_found' });
  
  // Assignments
  const assignments = await db.all('SELECT * FROM assignments WHERE video_id = ?', [id]);

  // User Submission status for these assignments
  const submissions = await db.all('SELECT * FROM submissions WHERE user_id = ? AND assignment_id IN (SELECT id FROM assignments WHERE video_id = ?)', [req.user.id, id]);
  
  // Comments
  const comments = await db.all(`
    SELECT c.id, c.content, c.created_at, u.name as user_name, c.user_id 
    FROM comments c 
    JOIN users u ON c.user_id = u.id 
    WHERE c.video_id = ? AND c.is_approved = 1 
    ORDER BY c.created_at DESC
  `, [id]);

  res.json({ video: v, assignments, submissions, comments });
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'empty' });
  
  // Auto-approve if admin, else pending
  const isApproved = req.user.role === 'admin' ? 1 : 0;
  
  const info = await db.run('INSERT INTO comments (user_id, video_id, content, is_approved) VALUES (?, ?, ?, ?)', [req.user.id, id, content, isApproved]);
  res.json({ id: info.lastInsertRowid, is_approved: isApproved });
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { title, section_id, topic, description, content, url, duration, is_free } = req.body;
  if (!title || !section_id || !topic || !url) return res.status(400).json({ error: 'invalid' });

  const info = await db.run('INSERT INTO videos (title, section_id, topic, description, content, url, duration, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
    [title, section_id, topic, description || null, content || null, url, duration || null, is_free === undefined ? 1 : is_free]);

  const row = await db.get('SELECT * FROM videos WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json(row);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const v = await db.get('SELECT * FROM videos WHERE id = ?', [id]);
  if (!v) return res.status(404).json({ error: 'not_found' });
  const payload = {
    title: req.body.title ?? v.title,
    section_id: req.body.section_id ?? v.section_id,
    topic: req.body.topic ?? v.topic,
    description: req.body.description ?? v.description,
    content: req.body.content ?? v.content,
    url: req.body.url ?? v.url,
    duration: req.body.duration ?? v.duration,
    is_free: req.body.is_free ?? v.is_free
  };
  await db.run('UPDATE videos SET title = ?, section_id = ?, topic = ?, description = ?, content = ?, url = ?, duration = ?, is_free = ? WHERE id = ?', [
    payload.title,
    payload.section_id,
    payload.topic,
    payload.description,
    payload.content,
    payload.url,
    payload.duration,
    payload.is_free,
    id
  ]);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  await db.run('DELETE FROM comments WHERE video_id = ?', [id]);
  await db.run('DELETE FROM progress WHERE video_id = ?', [id]);
  await db.run('DELETE FROM assignments WHERE video_id = ?', [id]);
  await db.run('DELETE FROM videos WHERE id = ?', [id]);
  res.json({ ok: true });
});

// Admin comments routes
router.get('/comments/pending', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.content, c.created_at, u.name as user_name, v.title as video_title 
    FROM comments c 
    JOIN users u ON c.user_id = u.id 
    JOIN videos v ON c.video_id = v.id 
    WHERE c.is_approved = 0 
    ORDER BY c.created_at ASC
  `).all();
  res.json(rows);
});

router.patch('/comments/:id/approve', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE comments SET is_approved = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.delete('/comments/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

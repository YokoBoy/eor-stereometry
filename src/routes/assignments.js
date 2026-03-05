const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { type } = req.query;
  let q = `
    SELECT a.*, v.title as video_title,
           s.status as submission_status,
           s.grade as submission_grade,
           s.feedback as submission_feedback,
           s.content as submission_content
    FROM assignments a
    LEFT JOIN videos v ON a.video_id = v.id
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.user_id = ?
  `;
  const params = [req.user.id];
  
  if (type) {
    q += ' WHERE a.type = ?';
    params.push(type);
  }
  
  q += ' ORDER BY a.created_at DESC';
  
  const rows = await db.all(q, params);
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { video_id, type, title, content } = req.body;
  if (!type || !title || !content) return res.status(400).json({ error: 'invalid' });
  const info = await db.run('INSERT INTO assignments (video_id, type, title, content) VALUES (?, ?, ?, ?)', [video_id || null, type, title, content]);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { video_id, type, title, content } = req.body;
  const a = await db.get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'not_found' });
  
  await db.run('UPDATE assignments SET video_id = ?, type = ?, title = ?, content = ? WHERE id = ?', [
    video_id !== undefined ? video_id : a.video_id,
    type || a.type,
    title || a.title,
    content || a.content,
    id
  ]);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  await db.run('DELETE FROM submissions WHERE assignment_id = ?', [id]);
  await db.run('DELETE FROM assignments WHERE id = ?', [id]);
  res.json({ ok: true });
});

// Submit assignment (Student)
router.post('/:id/submit', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content_required' });
  
  // Check if exists
  const exist = await db.get('SELECT id FROM submissions WHERE user_id = ? AND assignment_id = ?', [req.user.id, id]);
  if (exist) {
    await db.run("UPDATE submissions SET content = ?, status = 'pending', grade = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?", [content, exist.id]);
  } else {
    await db.run('INSERT INTO submissions (user_id, assignment_id, content) VALUES (?, ?, ?)', [req.user.id, id, content]);
  }
  res.json({ ok: true });
});

// Get submissions (Admin)
router.get('/submissions', requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.all(`
    SELECT s.*, u.name as user_name, u.email as user_email, a.title as assignment_title 
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN assignments a ON s.assignment_id = a.id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC
  `);
  res.json(rows);
});

// Grade submission (Admin)
router.post('/submissions/:id/grade', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { grade, feedback } = req.body;
  await db.run("UPDATE submissions SET grade = ?, feedback = ?, status = 'graded' WHERE id = ?", [grade, feedback, id]);
  res.json({ ok: true });
});

module.exports = router;

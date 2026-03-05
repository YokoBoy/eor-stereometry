const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all sections
router.get('/', async (req, res) => {
  const rows = await db.all('SELECT * FROM sections ORDER BY order_index, id');
  res.json(rows);
});

// Create section (Admin)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { title, description, order_index } = req.body;
  if (!title) return res.status(400).json({ error: 'title_required' });
  try {
    const info = await db.run('INSERT INTO sections (title, description, order_index) VALUES (?, ?, ?)', [title, description || null, order_index || 0]);
    res.json({ id: info.lastInsertRowid, title, description, order_index });
  } catch (e) {
    if (e.message && e.message.includes('unique')) return res.status(400).json({ error: 'duplicate_title' });
    throw e;
  }
});

// Update section (Admin)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, description, order_index } = req.body;
  const sec = await db.get('SELECT * FROM sections WHERE id = ?', [id]);
  if (!sec) return res.status(404).json({ error: 'not_found' });
  
  await db.run('UPDATE sections SET title = ?, description = ?, order_index = ? WHERE id = ?', [
    title ?? sec.title,
    description ?? sec.description,
    order_index ?? sec.order_index,
    id
  ]);
  res.json({ ok: true });
});

// Delete section (Admin)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const sec = await db.get('SELECT id FROM sections WHERE id = ?', [id]);
  if (!sec) return res.status(404).json({ error: 'not_found' });
  
  const videos = await db.all('SELECT id FROM videos WHERE section_id = ?', [id]);
  for (const v of videos) {
    await db.run('DELETE FROM comments WHERE video_id = ?', [v.id]);
    await db.run('DELETE FROM progress WHERE video_id = ?', [v.id]);
    await db.run('DELETE FROM assignments WHERE video_id = ?', [v.id]);
    await db.run('DELETE FROM videos WHERE id = ?', [v.id]);
  }
  await db.run('DELETE FROM sections WHERE id = ?', [id]);
  res.json({ ok: true });
});

module.exports = router;

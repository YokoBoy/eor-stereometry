const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if(ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg' && ext !== '.pdf' && ext !== '.doc' && ext !== '.docx') {
        return cb(new Error('Только картинки, PDF и DOCX разрешены!'));
    }
    cb(null, true);
  }
});

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { type } = req.query;
  let q = `
    SELECT a.*, v.title as video_title,
           s.status as submission_status,
           s.grade as submission_grade,
           s.feedback as submission_feedback,
           s.content as submission_content,
           s.file_url as submission_file_url
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
router.post('/:id/submit', requireAuth, upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  let fileUrl = null;

  if (req.file) {
      try {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const filename = `assignments/${uniqueSuffix}${path.extname(req.file.originalname)}`;
          const blob = await put(filename, req.file.buffer, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
          fileUrl = blob.url;
      } catch (e) {
          return res.status(500).json({ error: 'file_upload_error - ' + e.message });
      }
  }

  if (!content && !fileUrl) return res.status(400).json({ error: 'content_required' });
  
  const a = await db.get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'not_found' });

  let status = 'pending';
  let grade = null;

  if (a.type === 'test') {
    try {
      const testData = JSON.parse(a.content);
      if (parseInt(content, 10) === parseInt(testData.correct, 10)) {
         grade = 5;
      } else {
         grade = 2;
      }
      status = 'graded';
    } catch(e) {}
  }

  const exist = await db.get('SELECT id FROM submissions WHERE user_id = ? AND assignment_id = ?', [req.user.id, id]);
  if (exist) {
    await db.run("UPDATE submissions SET content = ?, file_url = COALESCE(?, file_url), status = ?, grade = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?", [content || '', fileUrl, status, grade, exist.id]);
  } else {
    await db.run('INSERT INTO submissions (user_id, assignment_id, content, file_url, status, grade) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, id, content || '', fileUrl, status, grade]);
  }
  res.json({ ok: true, grade });
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

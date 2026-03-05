const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');

const router = express.Router();

const { checkAndAward } = require('../utils/gamification');

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'invalid' });
  const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) return res.status(409).json({ error: 'exists' });
  const hash = bcrypt.hashSync(password, 10);
  const info = await db.run('INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)', [email, hash, 'student', name || null]);
  
  // Award registration achievement
  await checkAndAward(info.lastInsertRowid, 'register');

  const user = await db.get('SELECT id, email, role, name, points FROM users WHERE id = ?', [info.lastInsertRowid]);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
  res.json({ token, user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const userFull = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!userFull) return res.status(401).json({ error: 'not_found' });
  const ok = bcrypt.compareSync(password, userFull.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid' });
  const user = { id: userFull.id, email: userFull.email, role: userFull.role, name: userFull.name, points: userFull.points };
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
  res.json({ token, user });
});

module.exports = router;

const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let db;
let isPostgres = false;

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (dbUrl) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  isPostgres = true;

  // Helper to convert ? to $1, $2...
  const convertPlaceholders = (sql) => {
    let count = 1;
    return sql.replace(/\?/g, () => `$${count++}`);
  };
  
  db = {
    async query(text, params = []) {
      return pool.query(convertPlaceholders(text), params);
    },
    async get(text, params = []) {
      const res = await pool.query(convertPlaceholders(text), params);
      return res.rows[0];
    },
    async all(text, params = []) {
      const res = await pool.query(convertPlaceholders(text), params);
      return res.rows;
    },
    async run(text, params = []) {
      const sql = convertPlaceholders(text);
      const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
      const finalSql = (isInsert && !sql.toUpperCase().includes('RETURNING')) ? sql + ' RETURNING id' : sql;
      const res = await pool.query(finalSql, params);
      return { lastInsertRowid: res.rows[0] ? res.rows[0].id : null, changes: res.rowCount };
    },
    async exec(text) {
      return pool.query(text);
    },
    prepare(text) {
        return {
            get: async (...params) => this.get(text, params),
            all: async (...params) => this.all(text, params),
            run: async (...params) => this.run(text, params)
        };
    }
  };
} else {
  const Database = require('better-sqlite3');
  const sqlite = new Database(path.join(__dirname, '..', 'data.sqlite'));
  
  db = {
    async query(text, params = []) {
      return sqlite.prepare(text).all(...params);
    },
    async get(text, params = []) {
      return sqlite.prepare(text).get(...params);
    },
    async all(text, params = []) {
      return sqlite.prepare(text).all(...params);
    },
    async run(text, params = []) {
      const info = sqlite.prepare(text).run(...params);
      return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
    },
    async exec(text) {
      return sqlite.exec(text);
    },
    prepare(text) {
      const stmt = sqlite.prepare(text);
      return {
        get: async (...params) => stmt.get(...params),
        all: async (...params) => stmt.all(...params),
        run: async (...params) => stmt.run(...params)
      };
    },
    transaction(fn) {
        return sqlite.transaction(fn);
    }
  };
}

async function init() {
  const usersTable = isPostgres 
    ? 'CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'student\', name TEXT, points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
    : 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "student", name TEXT, points INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)';
  
  const sectionsTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS sections (id SERIAL PRIMARY KEY, title TEXT NOT NULL UNIQUE, description TEXT, order_index INTEGER DEFAULT 0)'
    : 'CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL UNIQUE, description TEXT, order_index INTEGER DEFAULT 0)';

  const videosTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS videos (id SERIAL PRIMARY KEY, title TEXT NOT NULL, section_id INTEGER, topic TEXT NOT NULL, description TEXT, content TEXT, url TEXT NOT NULL, duration INTEGER, is_free INTEGER DEFAULT 1, published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(section_id) REFERENCES sections(id) ON DELETE CASCADE)'
    : 'CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, section_id INTEGER, topic TEXT NOT NULL, description TEXT, content TEXT, url TEXT NOT NULL, duration INTEGER, is_free INTEGER DEFAULT 1, published_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(section_id) REFERENCES sections(id) ON DELETE CASCADE)';

  const assignmentsTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS assignments (id SERIAL PRIMARY KEY, video_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE)'
    : 'CREATE TABLE IF NOT EXISTS assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, video_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE)';

  const submissionsTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS submissions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, assignment_id INTEGER NOT NULL, content TEXT, grade INTEGER, feedback TEXT, status TEXT DEFAULT \'pending\', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE)'
    : 'CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, assignment_id INTEGER NOT NULL, content TEXT, grade INTEGER, feedback TEXT, status TEXT DEFAULT "pending", created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE)';

  const progressTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS progress (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, video_id INTEGER NOT NULL, status TEXT NOT NULL, watched_seconds INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, video_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE)'
    : 'CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, video_id INTEGER NOT NULL, status TEXT NOT NULL, watched_seconds INTEGER DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, video_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE)';

  const achievementsTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS achievements (id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, icon TEXT, points INTEGER DEFAULT 10)'
    : 'CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, icon TEXT, points INTEGER DEFAULT 10)';

  const userAchievementsTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS user_achievements (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, achievement_id INTEGER NOT NULL, earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, achievement_id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(achievement_id) REFERENCES achievements(id))'
    : 'CREATE TABLE IF NOT EXISTS user_achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, achievement_id INTEGER NOT NULL, earned_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, achievement_id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(achievement_id) REFERENCES achievements(id))';

  const commentsTable = isPostgres
    ? 'CREATE TABLE IF NOT EXISTS comments (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, video_id INTEGER NOT NULL, content TEXT NOT NULL, is_approved INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE)'
    : 'CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, video_id INTEGER NOT NULL, content TEXT NOT NULL, is_approved INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE)';

  await db.exec(usersTable);
  await db.exec(sectionsTable);
  await db.exec(videosTable);
  await db.exec(assignmentsTable);
  await db.exec(submissionsTable);
  await db.exec(progressTable);
  await db.exec(achievementsTable);
  await db.exec(userAchievementsTable);
  await db.exec(commentsTable);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@local';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  
  const adminCheckQuery = 'SELECT id FROM users WHERE role = $1';
  const existingAdmin = isPostgres 
    ? await db.get(adminCheckQuery, ['admin'])
    : await db.get('SELECT id FROM users WHERE role = ?', ['admin']);

  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPass, 10);
    const insertAdmin = isPostgres
      ? 'INSERT INTO users (email, password_hash, role, name, points) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING'
      : 'INSERT OR IGNORE INTO users (email, password_hash, role, name, points) VALUES (?, ?, ?, ?, ?)';
    await db.run(insertAdmin, [adminEmail, hash, 'admin', 'Главный Администратор', 9999]);
  }

  // Seed data if empty
  const videoCountQuery = 'SELECT COUNT(*) AS c FROM videos';
  const vCountRes = await db.get(videoCountQuery);
  const videoCount = vCountRes ? vCountRes.c : 0;
  
  if (parseInt(videoCount) === 0) {
    console.log('Seeding initial data...');
    const seedSection = isPostgres
      ? 'INSERT INTO sections (title, order_index) VALUES ($1, $2) RETURNING id'
      : 'INSERT INTO sections (title, order_index) VALUES (?, ?)';
    
    const secResult = await db.run(seedSection, ['Основы', 1]);
    const secId = secResult.lastInsertRowid;

    const seedVideo = isPostgres
      ? 'INSERT INTO videos (title, section_id, topic, description, url, is_free) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id'
      : 'INSERT INTO videos (title, section_id, topic, description, url, is_free) VALUES (?, ?, ?, ?, ?, ?)';

    const v1 = await db.run(seedVideo, ['Введение в стереометрию', secId, 'Введение', 'Что такое стереометрия и зачем она нужна.', 'https://www.w3schools.com/html/mov_bbb.mp4', 1]);
    const v2 = await db.run(seedVideo, ['Призма и её свойства', secId, 'Призма', 'Изучаем призму подробно.', 'https://www.w3schools.com/html/movie.mp4', 0]);

    const seedAssign = isPostgres
      ? 'INSERT INTO assignments (video_id, type, title, content) VALUES ($1, $2, $3, $4)'
      : 'INSERT INTO assignments (video_id, type, title, content) VALUES (?, ?, ?, ?)';
    
    if (v1.lastInsertRowid) {
      await db.run(seedAssign, [v1.lastInsertRowid, 'theory', 'Основные аксиомы', 'Прочитайте главу 1 и выпишите 3 аксиомы.']);
    }
    if (v2.lastInsertRowid) {
      await db.run(seedAssign, [v2.lastInsertRowid, 'practice', 'Задача на объём', 'Вычислите объём призмы с высотой 10 и площадью основания 5.']);
    }
    console.log('Seeding completed.');
  }
}

module.exports = { db, init, isPostgres };

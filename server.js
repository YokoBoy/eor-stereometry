const express = require('express');
const path = require('path');
const cors = require('cors');
const { db, init } = require('./src/db');
const authRoutes = require('./src/routes/auth');
const videoRoutes = require('./src/routes/videos');
const assignmentRoutes = require('./src/routes/assignments');
const profileRoutes = require('./src/routes/profile');
const sectionRoutes = require('./src/routes/sections');
const adminRoutes = require('./src/routes/admin');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Ignore favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/admin', adminRoutes);

const port = process.env.PORT || 3000;

init().then(() => {
  if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
      console.log(`http://localhost:${port}/`);
    });
  }
}).catch(err => {
  console.error('Database initialization failed:', err);
});

module.exports = app;

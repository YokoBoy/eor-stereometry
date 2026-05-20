const express = require('express');
const app = express();
const router = express.Router();

router.get('/:id', (req, res) => {
  res.json({ route: '/:id', id: req.params.id });
});

router.get('/comments/pending', (req, res) => {
  res.json({ route: '/comments/pending' });
});

app.use('/api/videos', router);

const request = require('supertest');

request(app)
  .get('/api/videos/comments/pending')
  .expect('Content-Type', /json/)
  .end(function(err, res) {
    if (err) throw err;
    console.log("Response:", res.body);
  });

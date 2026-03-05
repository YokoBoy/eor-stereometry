const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const parts = h.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    try {
      const payload = jwt.verify(parts[1], process.env.JWT_SECRET || 'dev-secret');
      req.user = payload;
      return next();
    } catch (e) {}
  }
  res.status(401).json({ error: 'unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ error: 'forbidden' });
}

module.exports = { requireAuth, requireAdmin };

// middleware/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env variable is required');
  return process.env.JWT_SECRET;
};

const sign = (user) => jwt.sign({ id: String(user._id) }, secret(), { expiresIn: '30d' });

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/'
});
const setCookie = (res, token) => res.cookie('ff_token', token, cookieOpts());
const clearCookie = (res) => res.clearCookie('ff_token', { ...cookieOpts(), maxAge: undefined });

const publicUser = (u) => ({
  id: String(u._id), name: u.name, email: u.email,
  balance: u.balance || 0, role: u.role, createdAt: u.createdAt
});

function getToken(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return req.cookies && req.cookies.ff_token;
}

async function loadUser(req) {
  const t = getToken(req);
  if (!t) return null;
  try {
    const p = jwt.verify(t, secret());
    return await User.findById(p.id);
  } catch { return null; }
}

async function auth(req, res, next) {
  const u = await loadUser(req);
  if (!u) return res.status(401).json({ error: 'Please log in first' });
  req.user = u;
  next();
}

async function optionalAuth(req, res, next) {
  req.user = await loadUser(req);
  next();
}

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// Admin access: header "x-admin-key" must equal ADMIN_KEY env var.
// If your existing /admin already has its own login middleware, replace this function with it.
function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  const key = req.headers['x-admin-key'];
  if (expected && key && safeEqual(key, expected)) return next();
  return res.status(403).json({ error: 'Admin access denied' });
}

module.exports = { sign, setCookie, clearCookie, publicUser, auth, optionalAuth, adminAuth };

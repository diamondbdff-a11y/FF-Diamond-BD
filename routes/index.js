// routes/index.js — wallet / orders / admin-approval API for the plain-http server.js
const crypto = require('crypto');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }

module.exports = function createApi(deps) {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  let connecting = null;
  let M = null;

  function connect() {
    if (!uri) throw new HttpError(503, 'Wallet/orders are not available yet: MONGODB_URI is not set on the server.');
    if (!connecting) {
      const mongoose = require('mongoose');
      connecting = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
        .then(() => { M = require('../models'); })
        .catch((e) => { connecting = null; console.error('MongoDB connect error:', e.message); throw new HttpError(503, 'Database is not reachable right now. Please try again.'); });
    }
    return connecting;
  }

  const hits = new Map();
  function limit(key, max, windowMs) {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.first > windowMs) { hits.set(key, { n: 1, first: now }); return; }
    if (++h.n > max) throw new HttpError(429, 'Too many requests. Please wait a few minutes.');
  }
  setInterval(() => { const now = Date.now(); hits.forEach((v, k) => { if (now - v.first > 15 * 60 * 1000) hits.delete(k); }); }, 5 * 60 * 1000).unref();

  const ctxBase = { deps, HttpError, limit, crypto, M: () => M };

  async function handle(req, res, pathname) {
    const isUser = pathname === '/api/orders' || pathname.startsWith('/api/orders/') || pathname.startsWith('/api/wallet/');
    const isAdminR = pathname.startsWith('/api/admin/orders') || pathname.startsWith('/api/admin/addmoney') || pathname.startsWith('/api/admin/codes');
    if (!isUser && !isAdminR) return false;
    try {
      if (isAdminR && !deps.isAdmin(req)) throw new HttpError(401, 'লগইন করুন');
      let customer = null;
      if (isUser) { customer = deps.getCustomer(req); if (!customer) throw new HttpError(401, 'Please log in first'); }
      await connect();
      const ctx = Object.assign({}, ctxBase, { req, res, pathname, method: req.method, user: customer, models: M });
      const mods = isAdminR ? [require('./admin')] : [require('./wallet'), require('./orders')];
      for (const m of mods) { if (await m.handle(ctx)) return true; }
      throw new HttpError(404, 'Not found');
    } catch (e) {
      if (e && e.message === 'too_large') deps.sendJson(res, 413, { error: 'Data too large' });
      else if (e && e.message === 'bad_json') deps.sendJson(res, 400, { error: 'Bad request data' });
      else if (e && e.expose) deps.sendJson(res, e.status, { error: e.message });
      else { console.error('api error', e); deps.sendJson(res, 500, { error: 'Server error' }); }
    }
    return true;
  }

  async function balanceOf(customerId) {
    try {
      if (!uri) return 0;
      await connect();
      return await require('../services/wallet').balanceOf(customerId);
    } catch (_) { return 0; }
  }

  return { handle, balanceOf, HttpError };
};
module.exports.HttpError = HttpError;
        

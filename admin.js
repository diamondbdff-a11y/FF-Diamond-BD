// routes/admin.js — admin API (uses the same admin login token as /admin, header "Authorization: Bearer <token>")
//   GET  /api/admin/orders?status=Pending          POST /api/admin/orders/:id/complete {code,note}   POST /api/admin/orders/:id/reject {note}
//   GET  /api/admin/addmoney?status=pending        POST /api/admin/addmoney/:id/approve {note}       POST /api/admin/addmoney/:id/reject {note}
//   GET  /api/admin/codes                          POST /api/admin/codes {amount,count}
const wallet = require('../services/wallet');

const ID = '([a-f0-9]{24})';

async function handle(c) {
  const { req, res, pathname, method, deps, HttpError, models, crypto } = c;
  const { Order, AddRequest, Code } = models;
  const send = (obj) => deps.sendJson(res, 200, obj);
  const who = (id) => { const u = deps.customerById(id); return u ? { name: u.name, email: u.email } : { name: '', email: '' }; };
  const q = new URL(req.url, 'http://x').searchParams;
  let m;

  if (method === 'GET' && pathname === '/api/admin/orders') {
    const f = {}; if (['Pending', 'Completed', 'Rejected'].includes(q.get('status'))) f.status = q.get('status');
    const rows = await Order.find(f).sort({ createdAt: -1 }).limit(200).lean();
    send({ orders: rows.map((o) => Object.assign({}, o, { customer: who(o.customerId) })) });
    return true;
  }
  if (method === 'POST' && (m = pathname.match(new RegExp('^/api/admin/orders/' + ID + '/(complete|reject)$')))) {
    const b = await deps.readJson(req, 4096);
    const note = String(b.note || '').slice(0, 300);
    if (m[2] === 'complete') {
      const code = String(b.code || '').trim().slice(0, 200);
      const o = await Order.findOneAndUpdate({ _id: m[1], status: 'Pending' }, { status: 'Completed', paid: true, deliveredCode: code, adminNote: note }, { new: true });
      if (!o) throw new HttpError(409, 'Order is not pending');
      return send({ ok: true, order: o }), true;
    }
    const o = await Order.findOneAndUpdate({ _id: m[1], status: 'Pending' }, { status: 'Rejected', adminNote: note }, { new: true });
    if (!o) throw new HttpError(409, 'Order is not pending');
    if (o.payMethod === 'wallet' && o.paid) await wallet.credit(o.customerId, o.price, 'Refund: ' + o.packageName, o._id); // wallet orders are refunded
    return send({ ok: true, order: o, refunded: o.payMethod === 'wallet' && o.paid }), true;
  }

  if (method === 'GET' && pathname === '/api/admin/addmoney') {
    const f = {}; if (['pending', 'approved', 'rejected'].includes(q.get('status'))) f.status = q.get('status');
    const rows = await AddRequest.find(f).sort({ createdAt: -1 }).limit(200).lean();
    send({ requests: rows.map((r) => Object.assign({}, r, { customer: who(r.customerId) })) });
    return true;
  }
  if (method === 'POST' && (m = pathname.match(new RegExp('^/api/admin/addmoney/' + ID + '/(approve|reject)$')))) {
    const b = await deps.readJson(req, 4096);
    const note = String(b.note || '').slice(0, 300);
    const approve = m[2] === 'approve';
    // status flips first (only from "pending"), so a double click can never credit twice
    const r = await AddRequest.findOneAndUpdate({ _id: m[1], status: 'pending' }, { status: approve ? 'approved' : 'rejected', adminNote: note }, { new: true });
    if (!r) throw new HttpError(409, 'Request is not pending');
    if (approve) await wallet.credit(r.customerId, r.amount, 'Add money (' + r.method + ')', r._id);
    return send({ ok: true, request: r }), true;
  }

  if (method === 'GET' && pathname === '/api/admin/codes') {
    return send({ codes: await Code.find({}).sort({ createdAt: -1 }).limit(200).lean() }), true;
  }
  if (method === 'POST' && pathname === '/api/admin/codes') {
    const b = await deps.readJson(req, 2048);
    const amount = Math.round(Number(b.amount) * 100) / 100;
    const count = Math.min(Math.max(parseInt(b.count, 10) || 1, 1), 100);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) throw new HttpError(400, 'Enter a valid amount');
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = 'FF-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      await Code.create({ code, amount });
      codes.push(code);
    }
    return send({ ok: true, amount, codes }), true;
  }
  return false;
}
module.exports = { handle };

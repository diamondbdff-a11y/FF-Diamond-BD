// routes/admin.js — admin API (uses the same admin login token as /admin, header "Authorization: Bearer <token>")
const wallet = require('../services/wallet');

const ID = '([a-f0-9]{24})';
const UID = '([a-zA-Z0-9-]{8,64})';

async function handle(c) {
  const { req, res, pathname, method, deps, HttpError, models, crypto, paymentInfo } = c;
  const { Order, AddRequest, Code, Wallet, Setting } = models;
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
    if (o.payMethod === 'wallet' && o.paid) await wallet.credit(o.customerId, o.price, 'Refund: ' + o.packageName, o._id);
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
  // ---- users + balance
  if (method === 'GET' && pathname === '/api/admin/users') {
    const s = String(q.get('q') || '').trim().toLowerCase();
    const all = deps.listCustomers().filter((u) => !s || String(u.name || '').toLowerCase().includes(s) || String(u.email || '').toLowerCase().includes(s));
    const list = all.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200);
    const ws = await Wallet.find({ customerId: { $in: list.map((u) => u.id) } }).lean();
    const bal = {}; ws.forEach((w) => { bal[w.customerId] = w.balance; });
    return send({ total: all.length, users: list.map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, balance: bal[u.id] || 0 })) }), true;
  }
  if (method === 'POST' && (m = pathname.match(new RegExp('^/api/admin/users/' + UID + '/balance$')))) {
    const u = deps.customerById(m[1]);
    if (!u) throw new HttpError(404, 'ইউজার পাওয়া যায়নি');
    const b = await deps.readJson(req, 2048);
    const amount = Math.round(Number(b.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) throw new HttpError(400, 'সঠিক পরিমাণ দিন');
    const note = String(b.note || '').trim().slice(0, 100);
    const tag = note ? ' (' + note + ')' : '';
    if (b.action === 'subtract') {
      const w = await wallet.debit(u.id, amount, 'Admin: balance deducted' + tag, 'admin');
      if (!w) throw new HttpError(400, 'ইউজারের ব্যালেন্স এত নেই');
      return send({ ok: true, balance: w.balance }), true;
    }
    const w = await wallet.credit(u.id, amount, 'Admin: balance added' + tag, 'admin');
    return send({ ok: true, balance: w.balance }), true;
  }

  // ---- payment numbers
  if (method === 'GET' && pathname === '/api/admin/payment') {
    return send({ payment: await paymentInfo() }), true;
  }
  if (method === 'POST' && pathname === '/api/admin/payment') {
    const b = await deps.readJson(req, 2048);
    const val = {};
    ['bkash', 'nagad', 'rocket'].forEach((k) => {
      const v = String(b[k] == null ? '' : b[k]).trim();
      if (!/^[0-9+\-\s]{0,20}$/.test(v)) throw new HttpError(400, k + ': নম্বর ঠিক নেই');
      val[k] = v;
    });
    await Setting.findOneAndUpdate({ key: 'payment' }, { value: val }, { upsert: true });
    return send({ ok: true, payment: await paymentInfo() }), true;
  }
  return false;
}
module.exports = { handle };

// routes/wallet.js → /api/wallet/*
const wallet = require('../services/wallet');
const { verifyTrx } = require('../services/paymentVerify');
const { publicUser } = require('../middleware/auth');

const METHODS = ['bkash', 'nagad', 'rocket'];

async function handle(c) {
  const { req, res, pathname, method, user, deps, HttpError, limit, models } = c;
  const { AddRequest, Txn, Code, Order } = models;
  const cid = user.id;

  if (method === 'GET' && pathname === '/api/wallet/payment-info') {
    deps.sendJson(res, 200, { bkash: process.env.PAY_BKASH || '', nagad: process.env.PAY_NAGAD || '', rocket: process.env.PAY_ROCKET || '' });
    return true;
  }

  if (method === 'POST' && pathname === '/api/wallet/add-money') {
    limit('add:' + cid, 15, 10 * 60 * 1000);
    const b = await deps.readJson(req, 8192);
    const via = String(b.method || '').toLowerCase();
    const mode = b.mode === 'instant' ? 'instant' : 'manual';
    const amount = Math.round(Number(b.amount) * 100) / 100;
    const senderNumber = String(b.senderNumber || '').trim();
    const trxId = String(b.trxId || '').trim().toUpperCase();
    if (!METHODS.includes(via)) throw new HttpError(400, 'Choose bKash, Nagad or Rocket');
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) throw new HttpError(400, 'Enter a valid amount');
    if (!/^01\d{9}$/.test(senderNumber)) throw new HttpError(400, 'Enter a valid 11-digit sender number');
    if (!/^[A-Z0-9]{6,20}$/.test(trxId)) throw new HttpError(400, 'Enter a valid Transaction ID');
    if (!(await wallet.reserveTrx(trxId, 'addmoney'))) throw new HttpError(409, 'This Transaction ID was already used');

    let doc, verified = false;
    try {
      if (mode === 'instant') { try { verified = !!(await verifyTrx({ trxId, amount, method: via, senderNumber })); } catch (e) { console.error('verifyTrx', e.message); } }
      doc = await AddRequest.create({ customerId: cid, method: via, amount, senderNumber, trxId, mode, status: 'pending' });
    } catch (e) { await wallet.releaseTrx(trxId).catch(() => {}); throw e; }

    if (verified) {
      const done = await AddRequest.findOneAndUpdate({ _id: doc._id, status: 'pending' }, { status: 'approved', autoVerified: true });
      if (done) await wallet.credit(cid, amount, 'Add money (' + via + ')', doc._id);
      deps.sendJson(res, 200, { ok: true, approved: true, message: 'Payment verified. Money added to your wallet.' });
    } else {
      deps.sendJson(res, 200, { ok: true, approved: false, message: 'Request submitted. Your balance will be added after admin approval.' });
    }
    return true;
  }

  if (method === 'GET' && pathname === '/api/wallet/transactions') {
    const transactions = await Txn.find({ customerId: cid }).sort({ createdAt: -1 }).limit(100).lean();
    deps.sendJson(res, 200, { transactions });
    return true;
  }

  if (method === 'GET' && pathname === '/api/wallet/requests') {
    const requests = await AddRequest.find({ customerId: cid }).sort({ createdAt: -1 }).limit(50).lean();
    deps.sendJson(res, 200, { requests });
    return true;
  }

  if (method === 'GET' && pathname === '/api/wallet/codes') {
    const redeemed = await Code.find({ usedBy: cid }).sort({ usedAt: -1 }).limit(100).lean();
    const delivered = await Order.find({ customerId: cid, status: 'Completed', deliveredCode: { $ne: '' } }).sort({ updatedAt: -1 }).limit(100).lean();
    deps.sendJson(res, 200, { redeemed, delivered });
    return true;
  }

  if (method === 'POST' && pathname === '/api/wallet/redeem') {
    limit('redeem:' + cid, 10, 10 * 60 * 1000);
    const b = await deps.readJson(req, 2048);
    const code = String(b.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw new HttpError(400, 'Invalid code');
    const c1 = await Code.findOneAndUpdate({ code, usedBy: null }, { usedBy: cid, usedAt: new Date() }, { new: true });
    if (!c1) throw new HttpError(400, 'Invalid or already used code');
    const w = await wallet.credit(cid, c1.amount, 'Redeemed code ' + code, c1._id);
    deps.sendJson(res, 200, { ok: true, amount: c1.amount, user: publicUser(user, w.balance) });
    return true;
  }
  return false;
}
module.exports = { handle };

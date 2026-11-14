// routes/orders.js → mounted at /api/orders
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { Order } = require('../models');
const { auth, publicUser } = require('../middleware/auth');
const { debit, credit, reserveTrx, releaseTrx } = require('../services/wallet');
const { resolvePackage } = require('../services/pricing');
const { verifyTrx } = require('../services/paymentVerify');

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const METHODS = ['bkash', 'nagad', 'rocket'];

router.post('/', auth, limiter, async (req, res) => {
  let trxReserved = null;
  try {
    const { packageId, packageName, price: clientPrice } = req.body || {};
    const uid = String(req.body.uid || '').trim();
    const payMethod = req.body.payMethod === 'instant' ? 'instant' : 'wallet';

    if (!/^\d{6,14}$/.test(uid)) return res.status(400).json({ error: 'Enter a valid Player UID (numbers only)' });
    const pkg = await resolvePackage({ packageId, packageName, clientPrice });
    if (!pkg) return res.status(400).json({ error: 'Package not found. Please refresh and try again.' });

    const base = { user: req.user._id, packageId: String(packageId || ''), packageName: pkg.name, uid, price: pkg.price, payMethod, status: 'Pending' };

    // ---------- Wallet Pay ----------
    if (payMethod === 'wallet') {
      const order = await Order.create(base);
      const u = await debit(req.user._id, pkg.price, `Order: ${pkg.name} (UID ${uid})`, order._id);
      if (!u) {
        await Order.deleteOne({ _id: order._id });
        return res.status(400).json({ error: 'Insufficient wallet balance. Please add money first.' });
      }
      order.paid = true;
      await order.save();
      return res.json({ ok: true, order, user: publicUser(u) });
    }

    // ---------- Instant Pay ----------
    const via = String(req.body.via || '').toLowerCase();
    const senderNumber = String(req.body.senderNumber || '').trim();
    const trxId = String(req.body.trxId || '').trim().toUpperCase();
    if (!METHODS.includes(via)) return res.status(400).json({ error: 'Choose bKash, Nagad or Rocket' });
    if (!/^01\d{9}$/.test(senderNumber)) return res.status(400).json({ error: 'Enter a valid 11-digit sender number' });
    if (!/^[A-Z0-9]{6,20}$/.test(trxId)) return res.status(400).json({ error: 'Enter a valid Transaction ID' });
    if (!(await reserveTrx(trxId, 'order'))) return res.status(409).json({ error: 'This Transaction ID was already used' });
    trxReserved = trxId;

    let autoVerified = false;
    try { autoVerified = !!(await verifyTrx({ trxId, amount: pkg.price, method: via, senderNumber })); } catch (e) { console.error('verifyTrx', e.message); }

    const order = await Order.create({ ...base, via, senderNumber, trxId, autoVerified });
    trxReserved = null;
    res.json({ ok: true, order });
  } catch (e) {
    if (trxReserved) await releaseTrx(trxReserved).catch(() => {});
    console.error('order', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/mine', auth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ orders });
});

module.exports = router;

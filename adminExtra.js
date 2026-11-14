// routes/adminExtra.js → mounted at /api/admin-x   (all routes require admin)
const router = require('express').Router();
const crypto = require('crypto');
const { Order, WalletRequest, Code, User } = require('../models');
const { adminAuth } = require('../middleware/auth');
const { credit, releaseTrx, approveWalletRequest, rejectWalletRequest } = require('../services/wallet');

router.use(adminAuth);

router.get('/ping', (req, res) => res.json({ ok: true }));

// ---------- Orders ----------
router.get('/orders', async (req, res) => {
  const q = ['Pending', 'Completed', 'Rejected'].includes(req.query.status) ? { status: req.query.status } : {};
  const orders = await Order.find(q).sort({ createdAt: -1 }).limit(300).populate('user', 'name email').lean();
  res.json({ orders });
});

router.patch('/orders/:id/complete', async (req, res) => {
  const o = await Order.findOneAndUpdate(
    { _id: req.params.id, status: 'Pending' },
    { status: 'Completed', deliveredCode: String(req.body.deliveredCode || '').slice(0, 200) || undefined, adminNote: req.body.note, updatedAt: new Date() },
    { new: true }
  );
  if (!o) return res.status(409).json({ error: 'Order is not pending (already handled?)' });
  res.json({ ok: true, order: o });
});

router.patch('/orders/:id/reject', async (req, res) => {
  const o = await Order.findOneAndUpdate(
    { _id: req.params.id, status: 'Pending' },
    { status: 'Rejected', adminNote: req.body.note, updatedAt: new Date() },
    { new: true }
  );
  if (!o) return res.status(409).json({ error: 'Order is not pending (already handled?)' });

  let refunded = false;
  // Wallet-paid orders are always refunded. Instant-paid orders only if admin chooses to refund to wallet.
  if ((o.payMethod === 'wallet' && o.paid) || (o.payMethod === 'instant' && req.body.refundToWallet)) {
    await credit(o.user, o.price, `Refund: ${o.packageName} (UID ${o.uid})`, o._id);
    refunded = true;
  }
  if (o.payMethod === 'instant' && !refunded) { /* keep TrxID locked: money was received */ }
  res.json({ ok: true, order: o, refunded });
});

// ---------- Add Money requests ----------
router.get('/wallet-requests', async (req, res) => {
  const q = ['pending', 'approved', 'rejected'].includes(req.query.status) ? { status: req.query.status } : {};
  const list = await WalletRequest.find(q).sort({ createdAt: -1 }).limit(300).populate('user', 'name email balance').lean();
  res.json({ requests: list });
});

router.patch('/wallet-requests/:id/approve', async (req, res) => {
  const r = await approveWalletRequest(req.params.id, req.body.note);
  if (!r) return res.status(409).json({ error: 'Request is not pending (already handled?)' });
  res.json({ ok: true, request: r });
});

router.patch('/wallet-requests/:id/reject', async (req, res) => {
  const r = await rejectWalletRequest(req.params.id, req.body.note);
  if (!r) return res.status(409).json({ error: 'Request is not pending (already handled?)' });
  res.json({ ok: true, request: r });
});

// ---------- Redeem codes ----------
router.get('/codes', async (req, res) => {
  const codes = await Code.find({}).sort({ createdAt: -1 }).limit(300).populate('usedBy', 'name email').lean();
  res.json({ codes });
});

router.post('/codes', async (req, res) => {
  const amount = Math.floor(Number(req.body.amount));
  const count = Math.min(Math.max(Math.floor(Number(req.body.count)) || 1, 1), 100);
  if (!(amount >= 1 && amount <= 100000)) return res.status(400).json({ error: 'Invalid amount' });
  const made = [];
  for (let i = 0; i < count; i++) {
    const code = 'FF-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    made.push(await Code.create({ code, amount }));
  }
  res.json({ ok: true, codes: made.map((c) => c.code) });
});

// ---------- Users (optional helper) ----------
router.get('/users', async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 }).limit(300).select('name email balance createdAt').lean();
  res.json({ users });
});

module.exports = router;

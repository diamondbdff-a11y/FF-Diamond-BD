// routes/wallet.js → mounted at /api/wallet
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { WalletRequest, Transaction, Code, Order } = require('../models');
const { auth, publicUser } = require('../middleware/auth');
const { credit, reserveTrx, releaseTrx, approveWalletRequest } = require('../services/wallet');
const { verifyTrx } = require('../services/paymentVerify');

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const METHODS = ['bkash', 'nagad', 'rocket'];

// Merchant numbers shown to the user (set in Render env vars)
router.get('/payment-info', (req, res) => res.json({
  bkash: process.env.BKASH_NUMBER || '',
  nagad: process.env.NAGAD_NUMBER || '',
  rocket: process.env.ROCKET_NUMBER || '',
  min: Number(process.env.MIN_ADD_MONEY || 10)
}));

router.get('/balance', auth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/add-money', auth, limiter, async (req, res) => {
  try {
    const method = String(req.body.method || '').toLowerCase();
    const mode = req.body.mode === 'instant' ? 'instant' : 'manual';
    const amount = Math.floor(Number(req.body.amount));
    const senderNumber = String(req.body.senderNumber || '').trim();
    const trxId = String(req.body.trxId || '').trim().toUpperCase();
    const min = Number(process.env.MIN_ADD_MONEY || 10);

    if (!METHODS.includes(method)) return res.status(400).json({ error: 'Choose bKash, Nagad or Rocket' });
    if (!(amount >= min && amount <= 50000)) return res.status(400).json({ error: `Amount must be between ${min} and 50000` });
    if (!/^01\d{9}$/.test(senderNumber)) return res.status(400).json({ error: 'Enter a valid 11-digit sender number (01XXXXXXXXX)' });
    if (!/^[A-Z0-9]{6,20}$/.test(trxId)) return res.status(400).json({ error: 'Enter a valid Transaction ID' });

    if (!(await reserveTrx(trxId, 'wallet'))) return res.status(409).json({ error: 'This Transaction ID was already submitted' });

    let reqDoc;
    try {
      reqDoc = await WalletRequest.create({ user: req.user._id, method, mode, amount, senderNumber, trxId });
    } catch (e) { await releaseTrx(trxId); throw e; }

    let approved = false;
    if (mode === 'instant') {
      let ok = false;
      try { ok = await verifyTrx({ trxId, amount, method, senderNumber }); } catch (e) { console.error('verifyTrx', e.message); }
      if (ok) {
        await WalletRequest.updateOne({ _id: reqDoc._id }, { autoVerified: true });
        approved = !!(await approveWalletRequest(reqDoc._id, 'Auto-verified'));
      }
    }
    res.json({
      ok: true,
      approved,
      message: approved ? 'Payment verified! Balance added.' : 'Request submitted. Your balance will be added after admin approval.'
    });
  } catch (e) {
    console.error('add-money', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/requests', auth, async (req, res) => {
  const list = await WalletRequest.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ requests: list });
});

router.get('/transactions', auth, async (req, res) => {
  const list = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ transactions: list });
});

router.post('/redeem', auth, limiter, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) return res.status(400).json({ error: 'Invalid code' });
    const c = await Code.findOneAndUpdate(
      { code, usedBy: null },
      { usedBy: req.user._id, usedAt: new Date() },
      { new: true }
    );
    if (!c) return res.status(400).json({ error: 'Code is invalid or already used' });
    const u = await credit(req.user._id, c.amount, `Redeem code ${c.code}`, c._id);
    res.json({ ok: true, amount: c.amount, user: publicUser(u) });
  } catch (e) {
    console.error('redeem', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// "My Codes": codes the user redeemed + codes delivered with their orders
router.get('/codes', auth, async (req, res) => {
  const [redeemed, delivered] = await Promise.all([
    Code.find({ usedBy: req.user._id }).sort({ usedAt: -1 }).limit(100).lean(),
    Order.find({ user: req.user._id, deliveredCode: { $nin: [null, ''] } }).sort({ updatedAt: -1 }).limit(100).lean()
  ]);
  res.json({ redeemed, delivered });
});

module.exports = router;

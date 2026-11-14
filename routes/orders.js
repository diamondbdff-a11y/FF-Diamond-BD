// routes/orders.js → /api/orders
const wallet = require('../services/wallet');
const { resolvePackage } = require('../services/pricing');
const { verifyTrx } = require('../services/paymentVerify');
const { publicUser } = require('../middleware/auth');
const { notifyOrder } = require('../services/telegram');

const METHODS = ['bkash', 'nagad', 'rocket'];

async function handle(c) {
  const { req, res, pathname, method, user, deps, HttpError, limit, models } = c;
  const { Order } = models;
  const cid = user.id;

  if (method === 'GET' && pathname === '/api/orders/mine') {
    const orders = await Order.find({ customerId: cid }).sort({ createdAt: -1 }).limit(100).lean();
    deps.sendJson(res, 200, { orders });
    return true;
  }

  if (method === 'POST' && pathname === '/api/orders') {
    limit('order:' + cid, 40, 10 * 60 * 1000);
    const b = await deps.readJson(req, 8192);
    const uid = String(b.uid || '').trim();
    const payMethod = b.payMethod === 'instant' ? 'instant' : 'wallet';
    if (!/^\d{6,14}$/.test(uid)) throw new HttpError(400, 'Enter a valid Player UID (numbers only)');
    const pkg = resolvePackage({ packageName: b.packageName, clientPrice: b.price }, deps.listPackages);
    if (!pkg) throw new HttpError(400, 'Package not found or price changed. Please refresh and try again.');

    const base = { customerId: cid, packageId: String(b.packageId || ''), packageName: pkg.name, uid, price: pkg.price, payMethod, status: 'Pending' };

    if (payMethod === 'wallet') {
      const order = await Order.create(base);
      const w = await wallet.debit(cid, pkg.price, 'Order: ' + pkg.name + ' (UID ' + uid + ')', order._id);
      if (!w) {
        await Order.deleteOne({ _id: order._id });
        throw new HttpError(400, 'Insufficient wallet balance. Please add money first.');
      }
      order.paid = true;
      await order.save();
      notifyOrder(order, user);
      deps.sendJson(res, 200, { ok: true, order, user: publicUser(user, w.balance) });
      return true;
    }

    const via = String(b.via || '').toLowerCase();
    const senderNumber = String(b.senderNumber || '').trim();
    const trxId = String(b.trxId || '').trim().toUpperCase();
    if (!METHODS.includes(via)) throw new HttpError(400, 'Choose bKash, Nagad or Rocket');
    if (!/^01\d{9}$/.test(senderNumber)) throw new HttpError(400, 'Enter a valid 11-digit sender number');
    if (!/^[A-Z0-9]{6,20}$/.test(trxId)) throw new HttpError(400, 'Enter a valid Transaction ID');
    if (!(await wallet.reserveTrx(trxId, 'order'))) throw new HttpError(409, 'This Transaction ID was already used');
    try {
      let autoVerified = false;
      try { autoVerified = !!(await verifyTrx({ trxId, amount: pkg.price, method: via, senderNumber })); } catch (e) { console.error('verifyTrx', e.message); }
      const order = await Order.create(Object.assign({}, base, { via, senderNumber, trxId, autoVerified, paid: autoVerified }));
      notifyOrder(order, user);
      deps.sendJson(res, 200, { ok: true, order });
    } catch (e) { await wallet.releaseTrx(trxId).catch(() => {}); throw e; }
    return true;
  }
  return false;
}
module.exports = { handle };
  

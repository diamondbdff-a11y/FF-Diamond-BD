// services/wallet.js — atomic balance changes (no double spend, no negative balance).
const { Wallet, Txn, UsedTrx } = require('../models');
const round = (n) => Math.round(Number(n) * 100) / 100;

async function balanceOf(customerId) {
  const w = await Wallet.findOne({ customerId }).lean();
  return w ? w.balance : 0;
}

async function credit(customerId, amount, title, ref) {
  amount = round(amount);
  if (!(amount > 0)) throw new Error('bad amount');
  const q = () => Wallet.findOneAndUpdate({ customerId }, { $inc: { balance: amount } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  let w;
  try { w = await q(); } catch (e) { if (e && e.code === 11000) w = await q(); else throw e; } // first-time upsert race
  await Txn.create({ customerId, type: 'credit', amount, title, balanceAfter: w.balance, ref: String(ref || '') });
  return w;
}

// Returns the updated wallet, or null when the balance is not enough.
async function debit(customerId, amount, title, ref) {
  amount = round(amount);
  if (!(amount > 0)) throw new Error('bad amount');
  const w = await Wallet.findOneAndUpdate({ customerId, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { new: true });
  if (!w) return null;
  await Txn.create({ customerId, type: 'debit', amount, title, balanceAfter: w.balance, ref: String(ref || '') });
  return w;
}

async function reserveTrx(trxId, kind) {
  try { await UsedTrx.create({ trxId, kind }); return true; }
  catch (e) { if (e && e.code === 11000) return false; throw e; }
}
async function releaseTrx(trxId) { await UsedTrx.deleteOne({ trxId }); }

module.exports = { balanceOf, credit, debit, reserveTrx, releaseTrx };

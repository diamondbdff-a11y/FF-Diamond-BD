// models.js  — all new MongoDB (mongoose) models.
// Safe to require multiple times (re-uses models if they already exist).
const mongoose = require('mongoose');
const { Schema } = mongoose;
const def = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const User = def('User', new Schema({
  name: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true, unique: true, index: true },
  passwordHash: String,
  googleId: { type: String, index: true, sparse: true },
  balance: { type: Number, default: 0, min: 0 },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
}));

// Every TrxID can only be used once (manual add-money AND instant orders).
const UsedTrx = def('UsedTrx', new Schema({
  trxId: { type: String, unique: true, required: true },
  kind: String,
  createdAt: { type: Date, default: Date.now }
}));

const WalletRequest = def('WalletRequest', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  method: { type: String, enum: ['bkash', 'nagad', 'rocket'], required: true },
  mode: { type: String, enum: ['manual', 'instant'], default: 'manual' },
  amount: { type: Number, required: true, min: 1 },
  senderNumber: String,
  trxId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  autoVerified: { type: Boolean, default: false },
  adminNote: String,
  createdAt: { type: Date, default: Date.now },
  reviewedAt: Date
}));

const Order = def('Order', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  packageId: String,
  packageName: { type: String, required: true },
  uid: { type: String, required: true },
  price: { type: Number, required: true },
  payMethod: { type: String, enum: ['wallet', 'instant'], required: true },
  via: String,                 // bkash / nagad / rocket (instant only)
  senderNumber: String,
  trxId: String,
  paid: { type: Boolean, default: false },       // true once wallet was debited
  autoVerified: { type: Boolean, default: false },
  status: { type: String, enum: ['Pending', 'Completed', 'Rejected'], default: 'Pending', index: true },
  deliveredCode: String,
  adminNote: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
}));

const Transaction = def('Transaction', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  title: String,
  ref: String,
  balanceAfter: Number,
  createdAt: { type: Date, default: Date.now }
}));

const Code = def('Code', new Schema({
  code: { type: String, unique: true, required: true },
  amount: { type: Number, required: true, min: 1 },
  usedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  usedAt: Date,
  createdAt: { type: Date, default: Date.now }
}));

module.exports = { User, UsedTrx, WalletRequest, Order, Transaction, Code };

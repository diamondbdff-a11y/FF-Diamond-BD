// models.js — MongoDB (mongoose) models for wallet, orders, add-money requests, codes and admin settings.
// Safe to require many times (re-uses a model if it already exists).
const mongoose = require('mongoose');
const { Schema } = mongoose;
const def = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

// One wallet per customer (customerId = the id used by server.js customer accounts)
const Wallet = def('Wallet', new Schema({
  customerId: { type: String, unique: true, required: true },
  balance: { type: Number, default: 0, min: 0 }
}, { timestamps: true }));

// Every balance change is logged here
const Txn = def('Txn', new Schema({
  customerId: { type: String, index: true, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  title: String,
  ref: String,
  balanceAfter: Number,
  createdAt: { type: Date, default: Date.now }
}));

// A TrxID can be used only once (add money and instant orders)
const UsedTrx = def('UsedTrx', new Schema({
  trxId: { type: String, unique: true, required: true },
  kind: String,
  createdAt: { type: Date, default: Date.now }
}));

const AddRequest = def('AddRequest', new Schema({
  customerId: { type: String, index: true, required: true },
  method: { type: String, required: true },
  mode: { type: String, default: 'manual' },
  amount: { type: Number, required: true, min: 1 },
  senderNumber: String,
  trxId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  autoVerified: { type: Boolean, default: false },
  adminNote: String
}, { timestamps: true }));

const Order = def('Order', new Schema({
  customerId: { type: String, index: true, required: true },
  packageId: String,
  packageName: { type: String, required: true },
  uid: { type: String, required: true },
  price: { type: Number, required: true },
  payMethod: { type: String, enum: ['wallet', 'instant'], required: true },
  via: String,
  senderNumber: String,
  trxId: String,
  paid: { type: Boolean, default: false },
  autoVerified: { type: Boolean, default: false },
  status: { type: String, enum: ['Pending', 'Completed', 'Rejected'], default: 'Pending', index: true },
  deliveredCode: { type: String, default: '' },
  adminNote: String
}, { timestamps: true }));

const Code = def('Code', new Schema({
  code: { type: String, unique: true, required: true },
  amount: { type: Number, required: true, min: 1 },
  usedBy: { type: String, default: null, index: true },
  usedAt: Date,
  createdAt: { type: Date, default: Date.now }
}));

// Admin settings (payment numbers etc.)
const Setting = def('Setting', new Schema({
  key: { type: String, unique: true, required: true },
  value: Schema.Types.Mixed
}));

module.exports = { Wallet, Txn, UsedTrx, AddRequest, Order, Code, Setting };

// models/index.js — MongoDB (mongoose) models for wallet, add-money requests, orders and redeem codes.
// Customer accounts themselves stay in customers.json (server.js); everything is linked by customerId.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const T = { timestamps: true };

const Wallet = mongoose.model('Wallet', new Schema({
  customerId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 }
}, T));

const Txn = mongoose.model('Txn', new Schema({
  customerId: { type: String, required: true, index: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  title: { type: String, default: '' },
  balanceAfter: { type: Number, default: 0 },
  ref: { type: String, default: '' }
}, T));

const AddRequest = mongoose.model('AddRequest', new Schema({
  customerId: { type: String, required: true, index: true },
  method: { type: String, enum: ['bkash', 'nagad', 'rocket'], required: true },
  amount: { type: Number, required: true },
  senderNumber: String,
  trxId: { type: String, required: true },
  mode: { type: String, enum: ['manual', 'instant'], default: 'manual' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  autoVerified: { type: Boolean, default: false },
  adminNote: { type: String, default: '' }
}, T));

const Order = mongoose.model('Order', new Schema({
  customerId: { type: String, required: true, index: true },
  packageId: { type: String, default: '' },
  packageName: { type: String, required: true },
  uid: { type: String, required: true },
  price: { type: Number, required: true },
  payMethod: { type: String, enum: ['wallet', 'instant'], required: true },
  via: String,
  senderNumber: String,
  trxId: String,
  autoVerified: { type: Boolean, default: false },
  paid: { type: Boolean, default: false },
  status: { type: String, enum: ['Pending', 'Completed', 'Rejected'], default: 'Pending', index: true },
  deliveredCode: { type: String, default: '' },
  adminNote: { type: String, default: '' }
}, T));

// Every TrxID can be used only once (unique index = race-safe).
const UsedTrx = mongoose.model('UsedTrx', new Schema({
  trxId: { type: String, required: true, unique: true },
  kind: String
}, T));

const Code = mongoose.model('Code', new Schema({
  code: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  usedBy: { type: String, default: null },
  usedAt: { type: Date, default: null }
}, T));

module.exports = { Wallet, Txn, AddRequest, Order, UsedTrx, Code };

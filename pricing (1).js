// services/pricing.js
// Looks up the real package price from YOUR existing products collection so users can't fake prices.
// It scans top-level documents ({id|_id|slug|sku|name, price}) and nested arrays
// (product.packages / items / options / variants) — adjust below if your schema differs.
const mongoose = require('mongoose');

const toPrice = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const ARRAY_KEYS = ['packages', 'items', 'options', 'variants', 'products'];

async function resolvePackage({ packageId, packageName, clientPrice }) {
  const id = String(packageId || '');
  const name = String(packageName || '');
  try {
    const col = mongoose.connection.db.collection(process.env.PRODUCTS_COLLECTION || 'products');
    const docs = await col.find({}).limit(1000).toArray();
    const matches = (o) =>
      (id && [o.id, o._id, o.slug, o.sku].some((x) => x !== undefined && String(x) === id)) ||
      (!id && name && o.name === name);

    for (const d of docs) {
      if (matches(d) && toPrice(d.price)) return { name: d.name || name, price: toPrice(d.price) };
      for (const k of ARRAY_KEYS) {
        for (const p of Array.isArray(d[k]) ? d[k] : []) {
          if (matches(p) && toPrice(p.price)) return { name: p.name || name || d.name, price: toPrice(p.price) };
        }
      }
    }
  } catch (e) { console.error('resolvePackage', e.message); }

  // Last resort (OFF by default): trust the price sent by the browser.
  if (process.env.ALLOW_CLIENT_PRICE === 'true' && toPrice(clientPrice) && name) {
    return { name, price: toPrice(clientPrice) };
  }
  return null;
}

module.exports = { resolvePackage };

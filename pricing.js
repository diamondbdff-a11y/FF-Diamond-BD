// services/pricing.js
// Looks up the REAL package price from the packages your site currently shows
// (the same list /admin edits), so a user can't fake a price from the browser.
// `listPackages()` is supplied by server.js and returns [{ name, price }].
function resolvePackage({ packageName, clientPrice }, listPackages) {
  const name = String(packageName || '').trim();
  if (!name) return null;
  const matches = listPackages().filter((p) => p.name === name && Number(p.price) > 0);
  if (!matches.length) return null;
  const cp = Number(clientPrice);
  if (Number.isFinite(cp) && cp > 0) {
    // Same name can exist in two products: use the one with the price the customer saw.
    const exact = matches.find((p) => Number(p.price) === cp);
    return exact ? { name: exact.name, price: Number(exact.price) } : null; // price changed → ask to refresh
  }
  return { name: matches[0].name, price: Number(matches[0].price) };
}

module.exports = { resolvePackage };

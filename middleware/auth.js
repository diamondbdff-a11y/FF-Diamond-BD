// middleware/auth.js
// Login itself is handled by server.js (/api/auth/*, cookie "ffx_customer").
// server.js passes getCustomer(req) / isAdmin(req) into routes/index.js; this file only shapes the user object.
const publicUser = (customer, balance) => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  balance: Number(balance) || 0,
  createdAt: customer.createdAt
});

module.exports = { publicUser };

/* public/js/admin-extra.js
 * Adds "Orders", "Add Money Requests", "Codes" and "Users" sections to your existing /admin page.
 * Add before </body> in your admin HTML:   <script src="/js/admin-extra.js"></script>
 * (Optional) put <div id="ffAdminMount"></div> where you want the sections; otherwise they go at the bottom.
 */
(function () {
  'use strict';
  if (window.__ffAdminX) return; window.__ffAdminX = true;

  const KEY = 'ffAdminKey';
  let key = sessionStorage.getItem(KEY) || '';
  let tab = 'orders';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const taka = (n) => (Number(n) || 0).toLocaleString('en-US') + '৳';
  const fdate = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  async function api(path, opts = {}) {
    const r = await fetch('/api/admin-x' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 403) { sessionStorage.removeItem(KEY); key = ''; render(); throw new Error('Invalid admin key'); }
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }

  const style = document.createElement('style');
  style.textContent = `
#ffAX{font:14px system-ui,sans-serif;background:#16181d;color:#eceef2;border:1px solid #2a2e37;border-radius:14px;padding:14px;margin:20px auto;max-width:1100px}
#ffAX h2{margin:0 0 10px;font-size:18px}
#ffAX .t{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
#ffAX .t button,#ffAX .b{border:0;border-radius:8px;padding:8px 12px;background:#262a33;color:#eceef2;cursor:pointer;font-weight:600}
#ffAX .t button.on{background:#f5a623;color:#1a1200}
#ffAX .ok{background:#14532d!important}#ffAX .no{background:#7a1f1f!important}
#ffAX table{width:100%;border-collapse:collapse;font-size:13px}
#ffAX th,#ffAX td{text-align:left;padding:8px 6px;border-bottom:1px solid #2a2e37;vertical-align:top}
#ffAX .w{overflow:auto}
#ffAX input,#ffAX select{padding:8px;border-radius:8px;border:1px solid #2a2e37;background:#0f1115;color:#fff}
#ffAX .bd{padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700}
#ffAX .Pending,#ffAX .pending{background:#4a3a0a;color:#ffd166}
#ffAX .Completed,#ffAX .approved{background:#0e3b22;color:#5be39a}
#ffAX .Rejected,#ffAX .rejected{background:#4a1515;color:#ff8b8b}
#ffAX .m{color:#8a91a0;font-size:12px}
`;
  document.head.appendChild(style);

  const root = document.createElement('section');
  root.id = 'ffAX';
  (document.getElementById('ffAdminMount') || document.body).appendChild(root);

  function render() {
    if (!key) {
      root.innerHTML = `<h2>Orders &amp; Wallet Management</h2>
        <form id="ffAK" style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="ffAKi" type="password" placeholder="Admin key (ADMIN_KEY)" style="flex:1;min-width:200px">
          <button class="b" style="background:#f5a623;color:#1a1200">Unlock</button></form>`;
      root.querySelector('#ffAK').onsubmit = async (e) => {
        e.preventDefault();
        key = root.querySelector('#ffAKi').value.trim();
        try { await api('/ping'); sessionStorage.setItem(KEY, key); render(); }
        catch (ex) { alert(ex.message); }
      };
      return;
    }
    root.innerHTML = `<h2>Orders &amp; Wallet Management</h2>
      <div class="t">
        ${[['orders', 'Orders'], ['wallet', 'Add Money Requests'], ['codes', 'Redeem Codes'], ['users', 'Users']].map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}
        <button data-r class="b">↻ Refresh</button><button data-lo class="b">Lock</button>
      </div><div id="ffAXB">Loading…</div>`;
    root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; render(); }));
    root.querySelector('[data-r]').onclick = render;
    root.querySelector('[data-lo]').onclick = () => { sessionStorage.removeItem(KEY); key = ''; render(); };
    ({ orders: viewOrders, wallet: viewWallet, codes: viewCodes, users: viewUsers })[tab]().catch((e) => { root.querySelector('#ffAXB').textContent = e.message; });
  }
  const body = () => root.querySelector('#ffAXB');

  async function viewOrders() {
    const f = window.__ffOF || 'Pending';
    const { orders } = await api('/orders?status=' + f);
    body().innerHTML = `<div style="margin-bottom:8px">Show: <select id="ffOF">${['Pending', 'Completed', 'Rejected', 'All'].map((s) => `<option ${s === f ? 'selected' : ''}>${s}</option>`).join('')}</select> <span class="m">${orders.length} order(s)</span></div>
      <div class="w"><table><tr><th>Date</th><th>User</th><th>Package</th><th>UID</th><th>Price</th><th>Payment</th><th>Status</th><th>Action</th></tr>
      ${orders.map((o) => `<tr>
        <td>${esc(fdate(o.createdAt))}</td>
        <td>${esc(o.user && o.user.name)}<div class="m">${esc(o.user && o.user.email)}</div></td>
        <td>${esc(o.packageName)}</td><td><b>${esc(o.uid)}</b></td><td>${taka(o.price)}</td>
        <td>${o.payMethod === 'wallet' ? 'Wallet (paid)' : 'Instant · ' + esc(o.via) + '<div class="m">' + esc(o.senderNumber) + '<br>TrxID: ' + esc(o.trxId) + '</div>'}</td>
        <td><span class="bd ${o.status}">${o.status}</span>${o.deliveredCode ? '<div class="m">Code: ' + esc(o.deliveredCode) + '</div>' : ''}${o.adminNote ? '<div class="m">' + esc(o.adminNote) + '</div>' : ''}</td>
        <td>${o.status === 'Pending' ? `<button class="b ok" data-c="${o._id}">Complete</button> <button class="b no" data-x="${o._id}" data-pm="${o.payMethod}">Reject</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="m">No orders</td></tr>'}
      </table></div>`;
    body().querySelector('#ffOF').onchange = (e) => { window.__ffOF = e.target.value === 'All' ? 'all' : e.target.value; render(); };
    body().querySelectorAll('[data-c]').forEach((b) => (b.onclick = async () => {
      const code = prompt('Delivery code / note for the user (optional):', '');
      if (code === null) return;
      try { await api(`/orders/${b.dataset.c}/complete`, { method: 'PATCH', body: { deliveredCode: code } }); render(); } catch (e) { alert(e.message); }
    }));
    body().querySelectorAll('[data-x]').forEach((b) => (b.onclick = async () => {
      const note = prompt('Reason for rejecting (shown to user):', '');
      if (note === null) return;
      let refundToWallet = false;
      if (b.dataset.pm === 'instant') refundToWallet = confirm('This was an Instant payment. Refund the amount to the user wallet?\nOK = refund, Cancel = no refund');
      try {
        const r = await api(`/orders/${b.dataset.x}/reject`, { method: 'PATCH', body: { note, refundToWallet } });
        if (r.refunded) alert('Rejected and refunded to wallet.');
        render();
      } catch (e) { alert(e.message); }
    }));
  }

  async function viewWallet() {
    const f = window.__ffWF || 'pending';
    const { requests } = await api('/wallet-requests?status=' + f);
    body().innerHTML = `<div style="margin-bottom:8px">Show: <select id="ffWF">${['pending', 'approved', 'rejected', 'all'].map((s) => `<option ${s === f ? 'selected' : ''}>${s}</option>`).join('')}</select> <span class="m">${requests.length} request(s)</span></div>
      <div class="w"><table><tr><th>Date</th><th>User</th><th>Method</th><th>Amount</th><th>Sender</th><th>TrxID</th><th>Status</th><th>Action</th></tr>
      ${requests.map((r) => `<tr>
        <td>${esc(fdate(r.createdAt))}</td>
        <td>${esc(r.user && r.user.name)}<div class="m">${esc(r.user && r.user.email)}<br>Balance: ${taka(r.user && r.user.balance)}</div></td>
        <td>${esc(r.method)}<div class="m">${esc(r.mode)}</div></td><td><b>${taka(r.amount)}</b></td>
        <td>${esc(r.senderNumber)}</td><td>${esc(r.trxId)}</td>
        <td><span class="bd ${r.status}">${r.status}</span>${r.adminNote ? '<div class="m">' + esc(r.adminNote) + '</div>' : ''}</td>
        <td>${r.status === 'pending' ? `<button class="b ok" data-a="${r._id}">Approve</button> <button class="b no" data-x="${r._id}">Reject</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="m">No requests</td></tr>'}
      </table></div>`;
    body().querySelector('#ffWF').onchange = (e) => { window.__ffWF = e.target.value; render(); };
    body().querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Approve and add this amount to the user wallet? Check your bKash/Nagad/Rocket account first.')) return;
      try { await api(`/wallet-requests/${b.dataset.a}/approve`, { method: 'PATCH', body: {} }); render(); } catch (e) { alert(e.message); }
    }));
    body().querySelectorAll('[data-x]').forEach((b) => (b.onclick = async () => {
      const note = prompt('Reason for rejecting (shown to user):', 'Payment not received');
      if (note === null) return;
      try { await api(`/wallet-requests/${b.dataset.x}/reject`, { method: 'PATCH', body: { note } }); render(); } catch (e) { alert(e.message); }
    }));
  }

  async function viewCodes() {
    const { codes } = await api('/codes');
    body().innerHTML = `<form id="ffCF" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <input id="ffCA" type="number" min="1" placeholder="Amount ৳" required>
        <input id="ffCN" type="number" min="1" max="100" value="1" style="width:80px" title="How many codes">
        <button class="b ok">Generate codes</button></form>
      <div id="ffCOut" class="m" style="margin-bottom:8px"></div>
      <div class="w"><table><tr><th>Code</th><th>Amount</th><th>Used by</th><th>Used at</th></tr>
      ${codes.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${taka(c.amount)}</td><td>${c.usedBy ? esc(c.usedBy.name) + '<div class="m">' + esc(c.usedBy.email) + '</div>' : '<span class="m">unused</span>'}</td><td>${esc(fdate(c.usedAt))}</td></tr>`).join('') || '<tr><td colspan="4" class="m">No codes</td></tr>'}</table></div>`;
    body().querySelector('#ffCF').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/codes', { method: 'POST', body: { amount: body().querySelector('#ffCA').value, count: body().querySelector('#ffCN').value } });
        await viewCodes();
        body().querySelector('#ffCOut').textContent = 'New codes: ' + r.codes.join(', ');
      } catch (ex) { alert(ex.message); }
    };
  }

  async function viewUsers() {
    const { users } = await api('/users');
    body().innerHTML = `<div class="w"><table><tr><th>Name</th><th>Email</th><th>Balance</th><th>Joined</th></tr>
      ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${taka(u.balance)}</td><td>${esc(fdate(u.createdAt))}</td></tr>`).join('') || '<tr><td colspan="4" class="m">No users</td></tr>'}</table></div>`;
  }

  render();
})();

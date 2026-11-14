/* public/js/user-system.js
 * Drop-in frontend for: login/register (email + Google), session, wallet, Add Money,
 * order placement, My Account / Orders / Codes / Transactions pages.
 * Add ONE line before </body> on every page:  <script src="/js/user-system.js"></script>
 *
 * It finds your existing buttons by their text (Login, Add Money, Home, My Account, My Orders,
 * My Codes, My Transaction, Wallet Pay, Instant Pay). For exact control you can also add
 * data-ff="login|addmoney|home|myaccount|myorders|mycodes|mytransaction|walletpay|instantpay" to any element.
 *
 * Optional: if auto-detecting the selected package / UID fails on your checkout page, define
 *   window.FFGetCheckout = () => ({ packageId, packageName, price, uid });
 * and this script will use it.
 */
(function () {
  'use strict';
  if (window.FFApp) return;

  const S = { user: null, payInfo: null, googleId: null, googleLoaded: false };
  const NAMES = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const taka = (n) => (Number(n) || 0).toLocaleString('en-US') + '৳';
  const fdate = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');

  // ---------------------------------------------------------------- API
  async function api(path, opts = {}) {
    const r = await fetch('/api' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Request failed'); e.status = r.status; throw e; }
    return d;
  }

  // ---------------------------------------------------------------- styles
  const css = `
.ff-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99998;display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}
.ff-box{position:relative;background:#16181d;color:#eceef2;border:1px solid #2a2e37;border-radius:16px;padding:22px 18px 18px;width:100%;max-width:420px;max-height:92vh;overflow:auto;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.ff-box h3{margin:0 0 12px;font-size:18px}
.ff-x{position:absolute;right:10px;top:8px;background:none;border:0;color:#9aa0ac;font-size:26px;cursor:pointer;line-height:1}
.ff-box label{display:block;margin:10px 0 0;font-size:12px;color:#9aa0ac}
.ff-box input{width:100%;box-sizing:border-box;margin-top:4px;padding:11px 12px;background:#0f1115;border:1px solid #2a2e37;border-radius:10px;color:#fff;font-size:15px;outline:none}
.ff-box input:focus{border-color:#f5a623}
.ff-btn{display:block;width:100%;margin-top:14px;padding:12px;border:0;border-radius:10px;background:#f5a623;color:#1a1200;font-weight:700;font-size:15px;cursor:pointer}
.ff-btn:disabled{opacity:.6;cursor:wait}
.ff-btn.alt{background:#262a33;color:#eceef2}
.ff-tabs{display:flex;gap:6px;margin-bottom:12px}
.ff-tabs button{flex:1;padding:9px;border:0;border-radius:9px;background:#0f1115;color:#9aa0ac;font-weight:600;cursor:pointer}
.ff-tabs button.on{background:#f5a623;color:#1a1200}
.ff-or{text-align:center;color:#6c7380;margin:14px 0 8px;font-size:12px}
.ff-err{color:#ff7b7b;font-size:13px;margin-top:10px;min-height:16px}
.ff-methods{display:flex;gap:6px;margin-bottom:8px}
.ff-methods button{flex:1;padding:10px 4px;border-radius:9px;border:1px solid #2a2e37;background:#0f1115;color:#eceef2;font-weight:600;cursor:pointer}
.ff-methods button.on{border-color:#f5a623;color:#f5a623}
.ff-send{background:#0f1115;border:1px dashed #2a2e37;border-radius:10px;padding:10px;margin-top:8px;font-size:13px}
.ff-copy{margin-left:6px;background:#262a33;color:#eceef2;border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px}
.ff-hint{font-size:12px;color:#7c8391;margin-top:6px}
.ff-page{position:fixed;inset:0;z-index:99997;background:#0f1115;color:#eceef2;overflow:auto;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.ff-ph{position:sticky;top:0;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#16181d;border-bottom:1px solid #2a2e37}
.ff-ph button{background:#262a33;color:#eceef2;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;font-weight:600}
.ff-ph h2{margin:0;font-size:17px}
.ff-pb{max-width:560px;margin:0 auto;padding:14px}
.ff-card{background:#16181d;border:1px solid #2a2e37;border-radius:12px;padding:12px;margin-bottom:10px}
.ff-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.ff-muted{color:#8a91a0;font-size:12px}
.ff-badge{padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap}
.ff-badge.Pending,.ff-badge.pending{background:#4a3a0a;color:#ffd166}
.ff-badge.Completed,.ff-badge.approved{background:#0e3b22;color:#5be39a}
.ff-badge.Rejected,.ff-badge.rejected{background:#4a1515;color:#ff8b8b}
.ff-plus{color:#5be39a;font-weight:700}.ff-minus{color:#ff8b8b;font-weight:700}
.ff-empty{text-align:center;color:#6c7380;padding:40px 10px}
.ff-bal{font-size:30px;font-weight:800;color:#f5a623;margin:4px 0 10px}
.ff-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#262a33;color:#fff;padding:11px 16px;border-radius:10px;z-index:99999;max-width:90vw;box-shadow:0 6px 24px rgba(0,0,0,.5);font:14px system-ui,sans-serif}
.ff-toast.err{background:#5a1c1c}.ff-toast.ok{background:#14532d}
.ff-code{font-family:ui-monospace,Menlo,monospace;letter-spacing:.5px;background:#0f1115;padding:2px 7px;border-radius:6px;user-select:all}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------------------------------------------------------------- UI helpers
  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'ff-toast ' + (type || ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  }
  function modal(html) {
    const o = document.createElement('div');
    o.className = 'ff-ov';
    o.innerHTML = `<div class="ff-box"><button class="ff-x" aria-label="Close">×</button>${html}</div>`;
    o.addEventListener('mousedown', (e) => { if (e.target === o) o.remove(); });
    $('.ff-x', o).onclick = () => o.remove();
    document.body.appendChild(o);
    return o;
  }
  function page(title, bodyHtml) {
    closePages();
    const p = document.createElement('div');
    p.className = 'ff-page';
    p.innerHTML = `<div class="ff-ph"><button data-back>← Home</button><h2>${esc(title)}</h2></div><div class="ff-pb">${bodyHtml}</div>`;
    $('[data-back]', p).onclick = () => closePages();
    document.body.appendChild(p);
    document.body.style.overflow = 'hidden';
    return p;
  }
  function closePages() {
    document.querySelectorAll('.ff-page').forEach((e) => e.remove());
    document.body.style.overflow = '';
  }
  const setBusy = (btn, busy, label) => { btn.disabled = busy; if (label) btn.textContent = label; };

  // ---------------------------------------------------------------- session
  async function loadSession() {
    try { S.user = (await api('/auth/me')).user; } catch { S.user = null; }
    paintUI();
  }
  async function refreshUser() {
    try { S.user = (await api('/auth/me')).user; } catch {}
    paintUI();
  }
  async function logout() {
    if (!confirm('Log out?')) return;
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    S.user = null; closePages(); paintUI(); toast('Logged out');
  }
  function requireLogin(fn) {
    if (S.user) return fn();
    openAuth('login', fn);
  }

  // Updates "Hi, Guest", wallet balance (0৳) and Login/Logout labels everywhere.
  // Tip: add data-user-name / data-wallet-balance attributes to your elements for exact control.
  function paintUI() {
    const u = S.user;
    document.querySelectorAll('[data-user-name]').forEach((e) => (e.textContent = u ? (u.name || u.email) : 'Guest'));
    document.querySelectorAll('[data-wallet-balance]').forEach((e) => (e.textContent = taka(u ? u.balance : 0)));
    document.querySelectorAll('[data-user-email]').forEach((e) => (e.textContent = u ? u.email : ''));

    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || p.closest('.ff-ov,.ff-page,script,style,textarea,[data-user-name],[data-wallet-balance]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => {
      const t = n.nodeValue;
      if (n.__ffGreet || /Hi,?\s*Guest/i.test(t)) {
        if (!n.__ffGreet) { n.__ffGreet = t.replace(/Guest/i, '\u0001'); }
        n.nodeValue = n.__ffGreet.replace('\u0001', u ? (u.name || u.email) : 'Guest');
      } else if (n.__ffBal || /^\s*0\s*৳\s*$/.test(t)) {
        if (!n.__ffBal) n.__ffBal = t.replace(/[\d,.]+/, '\u0001');
        n.nodeValue = n.__ffBal.replace('\u0001', (u ? u.balance : 0).toLocaleString('en-US'));
      } else if (n.__ffLogin || /^\s*(login|logout)\s*$/i.test(t)) {
        n.__ffLogin = true;
        n.nodeValue = t.replace(/login|logout/i, (m) => {
          const w2 = u ? 'Logout' : 'Login';
          return m[0] === m[0].toLowerCase() ? w2.toLowerCase() : w2;
        });
      }
    });
  }

  // ---------------------------------------------------------------- Login / Register
  function openAuth(tab, after) {
    const m = modal(`
      <h3 id="ffAT">Login</h3>
      <div class="ff-tabs"><button data-t="login" class="on">Login</button><button data-t="register">Register</button></div>
      <form id="ffAF" novalidate>
        <div id="ffNameW" style="display:none"><label>Full name<input id="ffName" autocomplete="name"></label></div>
        <label>Email<input id="ffEmail" type="email" autocomplete="email"></label>
        <label>Password<input id="ffPass" type="password" autocomplete="current-password"></label>
        <div class="ff-err" id="ffAE"></div>
        <button class="ff-btn" id="ffASub" type="submit">Login</button>
      </form>
      <div id="ffGW" style="display:none"><div class="ff-or">— or —</div><div id="ffGBtn" style="display:flex;justify-content:center"></div></div>`);
    let mode = 'login';
    const setMode = (t) => {
      mode = t;
      m.querySelectorAll('.ff-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      $('#ffNameW', m).style.display = t === 'register' ? 'block' : 'none';
      $('#ffASub', m).textContent = t === 'register' ? 'Create account' : 'Login';
      $('#ffAT', m).textContent = t === 'register' ? 'Create account' : 'Login';
      $('#ffPass', m).autocomplete = t === 'register' ? 'new-password' : 'current-password';
      $('#ffAE', m).textContent = '';
    };
    m.querySelectorAll('.ff-tabs button').forEach((b) => (b.onclick = () => setMode(b.dataset.t)));
    setMode(tab === 'register' ? 'register' : 'login');

    const done = (user) => {
      S.user = user; paintUI(); m.remove();
      toast('Welcome, ' + (user.name || user.email) + '!', 'ok');
      if (typeof after === 'function') after();
    };

    $('#ffAF', m).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#ffASub', m), err = $('#ffAE', m); err.textContent = '';
      setBusy(btn, true);
      try {
        const body = { email: $('#ffEmail', m).value, password: $('#ffPass', m).value };
        if (mode === 'register') body.name = $('#ffName', m).value;
        done((await api('/auth/' + mode, { method: 'POST', body })).user);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };

    initGoogle(m, done);
  }

  async function initGoogle(m, done) {
    try {
      if (S.googleId === null) S.googleId = (await api('/auth/config')).googleClientId || '';
      if (!S.googleId) return;
      if (!S.googleLoaded) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
        S.googleLoaded = true;
      }
      $('#ffGW', m).style.display = 'block';
      google.accounts.id.initialize({
        client_id: S.googleId,
        callback: async (resp) => {
          try { done((await api('/auth/google', { method: 'POST', body: { credential: resp.credential } })).user); }
          catch (ex) { $('#ffAE', m).textContent = ex.message; }
        }
      });
      google.accounts.id.renderButton($('#ffGBtn', m), { theme: 'filled_black', size: 'large', text: 'continue_with', width: 280 });
    } catch (e) { /* Google not available — email login still works */ }
  }

  // ---------------------------------------------------------------- Payment form (shared)
  async function ensurePayInfo() {
    if (!S.payInfo) { try { S.payInfo = await api('/wallet/payment-info'); } catch { S.payInfo = {}; } }
    return S.payInfo;
  }
  function payFields(fixedAmount) {
    return `
      <div class="ff-methods">${['bkash', 'nagad', 'rocket'].map((k, i) => `<button type="button" data-m="${k}" class="${i ? '' : 'on'}">${NAMES[k]}</button>`).join('')}</div>
      <div class="ff-send">Send money to: <b id="ffNum">—</b> <button type="button" class="ff-copy" id="ffCopy">Copy</button></div>
      ${fixedAmount
        ? `<div class="ff-send">Amount to send: <b>${taka(fixedAmount)}</b></div>`
        : `<label>Amount (৳)<input id="ffAmt" type="number" inputmode="numeric" min="1" placeholder="e.g. 100"></label>`}
      <label>Your sender number<input id="ffSender" inputmode="numeric" maxlength="11" placeholder="01XXXXXXXXX"></label>
      <label>Transaction ID (TrxID)<input id="ffTrx" autocapitalize="characters" placeholder="e.g. 9AB3CD45EF"></label>`;
  }
  function wirePay(m) {
    let method = 'bkash';
    const showNum = () => { $('#ffNum', m).textContent = (S.payInfo && S.payInfo[method]) || 'Not set (contact admin)'; };
    m.querySelectorAll('.ff-methods button').forEach((b) => (b.onclick = () => {
      method = b.dataset.m;
      m.querySelectorAll('.ff-methods button').forEach((x) => x.classList.toggle('on', x === b));
      showNum();
    }));
    $('#ffCopy', m).onclick = () => { const n = (S.payInfo && S.payInfo[method]) || ''; if (n && navigator.clipboard) navigator.clipboard.writeText(n).then(() => toast('Number copied')); };
    showNum();
    return () => ({
      method,
      senderNumber: $('#ffSender', m).value.trim(),
      trxId: $('#ffTrx', m).value.trim(),
      amount: $('#ffAmt', m) ? Number($('#ffAmt', m).value) : undefined
    });
  }

  // ---------------------------------------------------------------- Add Money
  async function openAddMoney() {
    await ensurePayInfo();
    const m = modal(`
      <h3>Add Money</h3>
      <div class="ff-muted" style="margin-bottom:8px">Current balance: <b>${taka(S.user.balance)}</b></div>
      <div class="ff-tabs"><button data-mode="manual" class="on">Manual</button><button data-mode="instant">Instant</button></div>
      <form id="ffPF" novalidate>
        ${payFields(null)}
        <div class="ff-hint" id="ffModeHint">Send the money first, then submit the TrxID. Your balance is added after admin approval.</div>
        <div class="ff-err" id="ffPE"></div>
        <button class="ff-btn" id="ffPS" type="submit">Submit request</button>
      </form>`);
    let mode = 'manual';
    m.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
      mode = b.dataset.mode;
      m.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
      $('#ffModeHint', m).textContent = mode === 'instant'
        ? 'Instant: we try to verify your payment automatically. If it can’t be verified right away, it goes to admin approval.'
        : 'Send the money first, then submit the TrxID. Your balance is added after admin approval.';
    }));
    const read = wirePay(m);
    $('#ffPF', m).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#ffPS', m), err = $('#ffPE', m); err.textContent = '';
      setBusy(btn, true);
      try {
        const r = await api('/wallet/add-money', { method: 'POST', body: { ...read(), mode } });
        m.remove(); toast(r.message, 'ok'); await refreshUser();
        if (r.approved === false) openTransactions();
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  }

  // ---------------------------------------------------------------- Checkout
  function readCheckout() {
    if (typeof window.FFGetCheckout === 'function') return window.FFGetCheckout() || {};
    const uidEl = document.querySelector('#uid,#playerUid,#player-uid,#playerId,input[name=uid],input[name=playerUid],input[placeholder*="UID" i],input[placeholder*="Player" i]');
    const sel = document.querySelector('[data-package-id].selected,[data-package-id].active,[data-package-id].is-selected,[data-id].selected,[data-id].active,.package.selected,.package.active,.package-card.selected,.package-card.active,.pkg.selected,.pkg.active,.pack.selected,.pack.active');
    const out = { uid: uidEl ? uidEl.value.trim() : '' };
    if (sel) {
      const d = sel.dataset;
      out.packageId = d.packageId || d.id || d.pid || '';
      out.packageName = d.packageName || d.name || (sel.querySelector('.name,.title,h3,h4,b,strong') || sel).textContent.trim().split('\n')[0].trim();
      out.price = Number(d.price || d.amount || ((sel.textContent.match(/(\d[\d,]*)\s*৳/) || [])[1] || '').replace(/,/g, '')) || undefined;
    }
    return out;
  }

  async function checkout(payMethod) {
    const c = readCheckout();
    if (!c.packageId && !c.packageName) return toast('Please select a package first', 'err');
    if (!/^\d{6,14}$/.test(String(c.uid || ''))) return toast('Enter a valid Player UID first', 'err');
    requireLogin(() => doCheckout(payMethod, c));
  }
  async function doCheckout(payMethod, c) {
    const label = `${c.packageName || 'Package'}${c.price ? ' — ' + taka(c.price) : ''}\nUID: ${c.uid}`;
    if (payMethod === 'wallet') {
      if (!confirm(`Pay from wallet?\n\n${label}\nWallet balance: ${taka(S.user.balance)}`)) return;
      try {
        const r = await api('/orders', { method: 'POST', body: { packageId: c.packageId, packageName: c.packageName, price: c.price, uid: c.uid, payMethod: 'wallet' } });
        S.user = r.user || S.user; paintUI();
        toast('Order placed! Status: Pending', 'ok'); openOrders();
      } catch (ex) {
        toast(ex.message, 'err');
        if (/insufficient/i.test(ex.message)) openAddMoney();
      }
      return;
    }
    await ensurePayInfo();
    const m = modal(`
      <h3>Instant Pay</h3>
      <div class="ff-card" style="margin:0 0 6px"><b>${esc(c.packageName || 'Package')}</b><div class="ff-muted">UID: ${esc(c.uid)}</div></div>
      <form id="ffPF" novalidate>
        ${payFields(c.price)}
        <div class="ff-hint">Send exactly the amount above, then enter your TrxID.</div>
        <div class="ff-err" id="ffPE"></div>
        <button class="ff-btn" id="ffPS" type="submit">Place order</button>
      </form>`);
    const read = wirePay(m);
    $('#ffPF', m).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#ffPS', m), err = $('#ffPE', m); err.textContent = ''; setBusy(btn, true);
      try {
        const p = read();
        await api('/orders', { method: 'POST', body: { packageId: c.packageId, packageName: c.packageName, price: c.price, uid: c.uid, payMethod: 'instant', via: p.method, senderNumber: p.senderNumber, trxId: p.trxId } });
        m.remove(); toast('Order placed! Status: Pending', 'ok'); openOrders();
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  }

  // ---------------------------------------------------------------- Pages
  const loading = '<div class="ff-empty">Loading…</div>';

  function openAccount() {
    requireLogin(async () => {
      await refreshUser();
      const u = S.user;
      const p = page('My Account', `
        <div class="ff-card">
          <div class="ff-muted">Wallet balance</div><div class="ff-bal">${taka(u.balance)}</div>
          <button class="ff-btn" id="ffAM">+ Add Money</button>
        </div>
        <div class="ff-card">
          <div class="ff-muted">Name</div><div>${esc(u.name)}</div>
          <div class="ff-muted" style="margin-top:8px">Email</div><div>${esc(u.email)}</div>
          <div class="ff-muted" style="margin-top:8px">Member since</div><div>${esc(fdate(u.createdAt))}</div>
        </div>
        <button class="ff-btn alt" id="ffLO">Logout</button>`);
      $('#ffAM', p).onclick = () => openAddMoney();
      $('#ffLO', p).onclick = logout;
    });
  }

  function openOrders() {
    requireLogin(async () => {
      const p = page('My Orders', loading);
      try {
        const { orders } = await api('/orders/mine');
        $('.ff-pb', p).innerHTML = orders.length ? orders.map((o) => `
          <div class="ff-card">
            <div class="ff-row"><b>${esc(o.packageName)}</b><span class="ff-badge ${o.status}">${o.status}</span></div>
            <div class="ff-muted">UID: ${esc(o.uid)} · ${taka(o.price)} · ${o.payMethod === 'wallet' ? 'Wallet' : 'Instant (' + esc(NAMES[o.via] || o.via) + ')'}</div>
            ${o.trxId ? `<div class="ff-muted">TrxID: ${esc(o.trxId)}</div>` : ''}
            ${o.deliveredCode ? `<div style="margin-top:6px">Code: <span class="ff-code">${esc(o.deliveredCode)}</span></div>` : ''}
            ${o.adminNote ? `<div class="ff-muted">Note: ${esc(o.adminNote)}</div>` : ''}
            <div class="ff-muted">${esc(fdate(o.createdAt))}</div>
          </div>`).join('') : '<div class="ff-empty">No orders yet</div>';
      } catch (ex) { $('.ff-pb', p).innerHTML = `<div class="ff-empty">${esc(ex.message)}</div>`; }
    });
  }

  function openCodes() {
    requireLogin(async () => {
      const p = page('My Codes', `
        <div class="ff-card">
          <b>Redeem code</b>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input id="ffRC" placeholder="Enter code" style="flex:1;padding:11px;border-radius:10px;border:1px solid #2a2e37;background:#0f1115;color:#fff;text-transform:uppercase">
            <button class="ff-btn" id="ffRB" style="width:auto;margin:0;padding:0 18px">Redeem</button>
          </div>
        </div>
        <div id="ffCL">${loading}</div>`);
      const load = async () => {
        try {
          const { redeemed, delivered } = await api('/wallet/codes');
          const parts = [];
          if (delivered.length) parts.push('<div class="ff-muted" style="margin:6px 2px">Codes from your orders</div>' + delivered.map((o) => `
            <div class="ff-card"><div class="ff-row"><span class="ff-code">${esc(o.deliveredCode)}</span><span class="ff-muted">${esc(o.packageName)}</span></div><div class="ff-muted">${esc(fdate(o.updatedAt || o.createdAt))}</div></div>`).join(''));
          if (redeemed.length) parts.push('<div class="ff-muted" style="margin:6px 2px">Redeemed codes</div>' + redeemed.map((c) => `
            <div class="ff-card"><div class="ff-row"><span class="ff-code">${esc(c.code)}</span><span class="ff-plus">+${taka(c.amount)}</span></div><div class="ff-muted">${esc(fdate(c.usedAt))}</div></div>`).join(''));
          $('#ffCL', p).innerHTML = parts.join('') || '<div class="ff-empty">No codes yet</div>';
        } catch (ex) { $('#ffCL', p).innerHTML = `<div class="ff-empty">${esc(ex.message)}</div>`; }
      };
      $('#ffRB', p).onclick = async () => {
        const code = $('#ffRC', p).value.trim();
        if (!code) return toast('Enter a code', 'err');
        const btn = $('#ffRB', p); setBusy(btn, true);
        try {
          const r = await api('/wallet/redeem', { method: 'POST', body: { code } });
          S.user = r.user; paintUI(); $('#ffRC', p).value = '';
          toast(`${taka(r.amount)} added to your wallet`, 'ok'); load();
        } catch (ex) { toast(ex.message, 'err'); }
        setBusy(btn, false);
      };
      load();
    });
  }

  function openTransactions() {
    requireLogin(async () => {
      const p = page('My Transaction', loading);
      try {
        const [{ transactions }, { requests }] = await Promise.all([api('/wallet/transactions'), api('/wallet/requests')]);
        const reqHtml = requests.length ? '<div class="ff-muted" style="margin:6px 2px">Add Money requests</div>' + requests.map((r) => `
          <div class="ff-card"><div class="ff-row"><b>${esc(NAMES[r.method] || r.method)} · ${taka(r.amount)}</b><span class="ff-badge ${r.status}">${r.status}</span></div>
          <div class="ff-muted">TrxID: ${esc(r.trxId)} · ${esc(fdate(r.createdAt))}</div>${r.adminNote ? `<div class="ff-muted">Note: ${esc(r.adminNote)}</div>` : ''}</div>`).join('') : '';
        const txHtml = transactions.length ? '<div class="ff-muted" style="margin:6px 2px">Wallet history</div>' + transactions.map((t) => `
          <div class="ff-card"><div class="ff-row"><span>${esc(t.title)}</span><span class="${t.type === 'credit' ? 'ff-plus' : 'ff-minus'}">${t.type === 'credit' ? '+' : '−'}${taka(t.amount)}</span></div>
          <div class="ff-muted">${esc(fdate(t.createdAt))} · Balance: ${taka(t.balanceAfter)}</div></div>`).join('') : '';
        $('.ff-pb', p).innerHTML = (reqHtml + txHtml) || '<div class="ff-empty">No transactions yet</div>';
      } catch (ex) { $('.ff-pb', p).innerHTML = `<div class="ff-empty">${esc(ex.message)}</div>`; }
    });
  }

  function goHome() {
    document.querySelectorAll('.ff-ov').forEach((e) => e.remove());
    closePages();
    if (location.pathname !== '/' && !location.pathname.endsWith('/index.html')) location.href = '/';
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- Button wiring
  const ACTIONS = {
    login: () => (S.user ? logout() : openAuth('login')),
    logout: () => (S.user ? logout() : openAuth('login')),
    register: () => openAuth('register'),
    addmoney: () => requireLogin(openAddMoney),
    home: goHome,
    myaccount: openAccount,
    myorders: openOrders,
    mycodes: openCodes,
    mytransaction: openTransactions,
    mytransactions: openTransactions,
    walletpay: () => checkout('wallet'),
    instantpay: () => checkout('instant')
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('.ff-ov,.ff-page,.ff-toast')) return;
    let el = e.target;
    for (let i = 0; i < 5 && el && el !== document.body && el !== document.documentElement; i++, el = el.parentElement) {
      const explicit = el.dataset && el.dataset.ff;
      const key = explicit || norm(el.textContent);
      if (ACTIONS[key] && (explicit || el.textContent.trim().length <= 40)) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        ACTIONS[key]();
        return;
      }
    }
  }, true);

  // Re-paint when your page renders new content (debounced)
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(paintUI, 250); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.FFApp = { openAuth, openAddMoney, openAccount, openOrders, openCodes, openTransactions, checkout, refreshUser, get user() { return S.user; } };
  loadSession();
})();

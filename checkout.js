/* public/js/checkout.js
 * অর্ডার করুন বাটন চাপলে: Wallet Pay (ব্যালেন্স থেকে) অথবা Instant Pay (bKash / Nagad / Rocket + TrxID)।
 * Add Money-ও এখান থেকেই। FFX.html এর শেষে লোড হয়: <script src="/js/checkout.js"></script>
 * API: /api/orders, /api/wallet/*  (server.js + MongoDB)
 */
(function () {
  'use strict';
  if (window.FFXOrder) return;

  var NAMES = { bkash: 'বিকাশ (bKash)', nagad: 'নগদ (Nagad)', rocket: 'রকেট (Rocket)' };
  var payInfo = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function taka(n) { return (Number(n) || 0).toLocaleString('en-US') + '৳'; }

  function api(path, method, body) {
    return fetch('/api' + path, {
      method: method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || 'সমস্যা হয়েছে, আবার চেষ্টা করুন'); e.status = r.status; throw e; }
        return d;
      });
    });
  }

  // ---------- styles ----------
  var st = document.createElement('style');
  st.textContent = [
    '.fo-ov{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}',
    '.fo-box{position:relative;width:100%;max-width:420px;max-height:92vh;overflow:auto;background:#14181f;color:#eef1f6;border:1px solid #29303c;border-radius:16px;padding:20px 16px 16px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
    '.fo-box h3{margin:0 0 10px;font-size:18px}',
    '.fo-x{position:absolute;right:10px;top:6px;background:none;border:0;color:#9aa3b2;font-size:26px;line-height:1;cursor:pointer}',
    '.fo-card{background:#0d1016;border:1px solid #29303c;border-radius:12px;padding:10px 12px;margin:8px 0}',
    '.fo-row{display:flex;justify-content:space-between;gap:10px}',
    '.fo-muted{color:#8f98a8;font-size:12px}',
    '.fo-methods{display:flex;gap:6px;margin:10px 0 4px}',
    '.fo-methods button{flex:1;padding:10px 4px;border-radius:10px;border:1px solid #29303c;background:#0d1016;color:#eef1f6;font-weight:700;cursor:pointer;font-size:13px}',
    '.fo-methods button.on{border-color:#28d7a0;color:#28d7a0}',
    '.fo-box label{display:block;margin-top:10px;font-size:12px;color:#9aa3b2}',
    '.fo-box input{width:100%;box-sizing:border-box;margin-top:4px;padding:11px 12px;background:#0d1016;border:1px solid #29303c;border-radius:10px;color:#fff;font-size:15px;outline:none}',
    '.fo-box input:focus{border-color:#28d7a0}',
    '.fo-btn{display:block;width:100%;margin-top:14px;padding:13px;border:0;border-radius:10px;background:#28d7a0;color:#062318;font-weight:800;font-size:15px;cursor:pointer}',
    '.fo-btn.alt{background:#262c38;color:#eef1f6}',
    '.fo-btn:disabled{opacity:.6;cursor:wait}',
    '.fo-err{color:#ff8b8b;font-size:13px;margin-top:10px;min-height:16px}',
    '.fo-ok{color:#5be39a;font-weight:700}',
    '.fo-copy{margin-left:6px;background:#262c38;color:#eef1f6;border:0;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:12px}'
  ].join('');
  document.head.appendChild(st);

  function modal(html) {
    var o = document.createElement('div');
    o.className = 'fo-ov';
    o.innerHTML = '<div class="fo-box"><button class="fo-x" type="button" aria-label="বন্ধ করুন">×</button>' + html + '</div>';
    o.addEventListener('mousedown', function (e) { if (e.target === o) o.remove(); });
    o.querySelector('.fo-x').onclick = function () { o.remove(); };
    document.body.appendChild(o);
    return o;
  }
  var q = function (m, s) { return m.querySelector(s); };

  function setWalletText(balance) {
    document.querySelectorAll('a.wallet').forEach(function (a) {
      for (var i = a.childNodes.length - 1; i >= 0; i--) {
        if (a.childNodes[i].nodeType === 3) { a.childNodes[i].nodeValue = taka(balance); return; }
      }
    });
    if (window.FFX_AUTH && window.FFX_AUTH.user) window.FFX_AUTH.user.balance = balance;
  }

  function me() {
    return api('/auth/me').then(function (d) {
      if (!d.loggedIn) return null;
      window.FFX_AUTH = { loggedIn: true, user: d.user };
      setWalletText(d.user.balance || 0);
      return d.user;
    });
  }
  function needLogin() { location.hash = '#auth'; }

  function loadPayInfo() {
    if (payInfo) return Promise.resolve(payInfo);
    return api('/wallet/payment-info').then(function (d) { payInfo = d; return d; }).catch(function () { payInfo = {}; return payInfo; });
  }

  // bKash / Nagad / Rocket form (shared by Instant Pay and Add Money)
  function payFields(fixedAmount) {
    return '<div class="fo-methods">' + ['bkash', 'nagad', 'rocket'].map(function (k, i) {
      return '<button type="button" data-m="' + k + '" class="' + (i ? '' : 'on') + '">' + NAMES[k] + '</button>';
    }).join('') + '</div>' +
      '<div class="fo-card">এই নম্বরে Send Money করুন: <b id="foNum">—</b><button type="button" class="fo-copy" id="foCopy">Copy</button></div>' +
      (fixedAmount
        ? '<div class="fo-card">পাঠানোর পরিমাণ: <b>' + taka(fixedAmount) + '</b></div>'
        : '<label>কত টাকা যোগ করবেন (৳)<input id="foAmt" type="number" inputmode="numeric" min="1" placeholder="যেমন: 100"></label>') +
      '<label>আপনার যে নম্বর থেকে পাঠিয়েছেন<input id="foSender" inputmode="numeric" maxlength="11" placeholder="01XXXXXXXXX"></label>' +
      '<label>Transaction ID (TrxID)<input id="foTrx" autocapitalize="characters" placeholder="যেমন: 9AB3CD45EF"></label>';
  }
  function wirePay(m) {
    var method = 'bkash';
    function showNum() { q(m, '#foNum').textContent = (payInfo && payInfo[method]) || 'সেট করা নেই (অ্যাডমিনকে জানান)'; }
    m.querySelectorAll('.fo-methods button').forEach(function (b) {
      b.onclick = function () {
        method = b.getAttribute('data-m');
        m.querySelectorAll('.fo-methods button').forEach(function (x) { x.classList.toggle('on', x === b); });
        showNum();
      };
    });
    q(m, '#foCopy').onclick = function () {
      var n = (payInfo && payInfo[method]) || '';
      if (n && navigator.clipboard) navigator.clipboard.writeText(n);
      this.textContent = 'Copied';
    };
    showNum();
    return function () {
      var amt = q(m, '#foAmt');
      return { method: method, senderNumber: q(m, '#foSender').value.trim(), trxId: q(m, '#foTrx').value.trim(), amount: amt ? Number(amt.value) : undefined };
    };
  }

  function success(title, lines) {
    var m = modal('<h3 class="fo-ok">' + esc(title) + '</h3>' + lines.map(function (l) { return '<div class="fo-muted" style="margin:6px 0">' + esc(l) + '</div>'; }).join('') +
      '<button class="fo-btn" type="button" id="foDone">ঠিক আছে</button>');
    q(m, '#foDone').onclick = function () { m.remove(); };
  }

  // ---------- Add Money ----------
  function addMoney() {
    me().then(function (u) {
      if (!u) return needLogin();
      return loadPayInfo().then(function () {
        var m = modal('<h3>Add Money</h3>' +
          '<div class="fo-muted">বর্তমান ব্যালেন্স: <b>' + taka(u.balance) + '</b></div>' +
          '<form id="foF" novalidate>' + payFields(null) +
          '<div class="fo-muted" style="margin-top:8px">আগে টাকা Send Money করুন, তারপর TrxID দিয়ে সাবমিট করুন। অ্যাডমিন অ্যাপ্রুভ করলে ব্যালেন্সে টাকা যোগ হবে।</div>' +
          '<div class="fo-err" id="foE"></div><button class="fo-btn" id="foS" type="submit">অনুরোধ পাঠান</button></form>');
        var read = wirePay(m);
        q(m, '#foF').onsubmit = function (e) {
          e.preventDefault();
          var btn = q(m, '#foS'), err = q(m, '#foE'); err.textContent = ''; btn.disabled = true;
          var p = read();
          api('/wallet/add-money', 'POST', { method: p.method, amount: p.amount, senderNumber: p.senderNumber, trxId: p.trxId, mode: 'manual' })
            .then(function (r) { m.remove(); success(r.approved ? 'টাকা যোগ হয়েছে' : 'অনুরোধ পাঠানো হয়েছে', [r.message]); return me(); })
            .catch(function (ex) { err.textContent = ex.message; btn.disabled = false; });
        };
      });
    }).catch(function (ex) { success('সমস্যা হয়েছে', [ex.message]); });
  }

  // ---------- Order ----------
  function placeOrder(c, extra, m) {
    var body = { packageName: c.name, price: c.price, uid: c.uid, payMethod: extra.payMethod };
    if (extra.payMethod === 'instant') { body.via = extra.via; body.senderNumber = extra.senderNumber; body.trxId = extra.trxId; }
    return api('/orders', 'POST', body).then(function (r) {
      if (m) m.remove();
      if (r.user) setWalletText(r.user.balance || 0);
      success('অর্ডার সফল হয়েছে ✅', [c.name + ' — ' + taka(c.price), 'Player UID: ' + c.uid, 'স্ট্যাটাস: Pending (অ্যাডমিন চেক করে ডেলিভারি দেবে)']);
    });
  }

  function start(c) {
    c = c || {};
    me().then(function (u) {
      if (!u) return needLogin();
      var summary = '<div class="fo-card"><div class="fo-row"><b>' + esc(c.name) + '</b><b>' + taka(c.price) + '</b></div><div class="fo-muted">Player UID: ' + esc(c.uid) + '</div></div>';

      if (c.pay !== 'Instant Pay') {
        var enough = (u.balance || 0) >= c.price;
        var m = modal('<h3>Wallet Pay</h3>' + summary +
          '<div class="fo-muted">আপনার ওয়ালেট ব্যালেন্স: <b>' + taka(u.balance) + '</b></div>' +
          (enough ? '' : '<div class="fo-err">ব্যালেন্স যথেষ্ট নেই। আগে Add Money করুন।</div>') +
          '<div class="fo-err" id="foE"></div>' +
          (enough ? '<button class="fo-btn" id="foGo" type="button">পেমেন্ট নিশ্চিত করুন</button>'
                  : '<button class="fo-btn" id="foAdd" type="button">+ Add Money</button>'));
        if (enough) {
          q(m, '#foGo').onclick = function () {
            var b = this; b.disabled = true;
            placeOrder(c, { payMethod: 'wallet' }, m).then(null, function (ex) { q(m, '#foE').textContent = ex.message; b.disabled = false; });
          };
        } else {
          q(m, '#foAdd').onclick = function () { m.remove(); addMoney(); };
        }
        return;
      }

      return loadPayInfo().then(function () {
        var m = modal('<h3>Instant Pay</h3>' + summary +
          '<form id="foF" novalidate>' + payFields(c.price) +
          '<div class="fo-muted" style="margin-top:8px">ঠিক ' + taka(c.price) + ' Send Money করুন, তারপর TrxID দিন।</div>' +
          '<div class="fo-err" id="foE"></div><button class="fo-btn" id="foS" type="submit">অর্ডার করুন</button></form>');
        var read = wirePay(m);
        q(m, '#foF').onsubmit = function (e) {
          e.preventDefault();
          var btn = q(m, '#foS'), err = q(m, '#foE'); err.textContent = ''; btn.disabled = true;
          var p = read();
          placeOrder(c, { payMethod: 'instant', via: p.method, senderNumber: p.senderNumber, trxId: p.trxId }, m)
            .then(null, function (ex) { err.textContent = ex.message; btn.disabled = false; });
        };
      });
    }).catch(function (ex) { success('সমস্যা হয়েছে', [ex.message]); });
  }

  window.FFXOrder = { start: start, addMoney: addMoney };
})();

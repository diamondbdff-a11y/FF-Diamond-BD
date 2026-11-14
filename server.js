const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const GH_TOKEN = process.env['FFX-G'] || process.env.FFX_G || '';
const GH_REPO = (process.env['FFX-REPO'] || process.env.FFX_REPO || process.env.RENDER_GIT_REPO_SLUG || '').trim();
const GH_BRANCH = (process.env['FFX-BRANCH'] || process.env.FFX_BRANCH || 'ffx-data').trim();
const GH_API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const GH_DIR = 'ffx-data';
const USE_GH = !!GH_TOKEN;

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const ADMIN_PASSWORD = process.env['FFX-PASS'] || process.env.FFX_PASS || '';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const BLOCKED_NAMES = new Set(['server.js', 'package.json', 'package-lock.json', 'admin.html']);
// সার্ভারের ভেতরের ফোল্ডার — এগুলোর সোর্স কোড ব্রাউজারে খোলা যাবে না
const BLOCKED_DIRS = new Set(['node_modules', 'middleware', 'routes', 'services', 'models']);

const DEFAULT_PACKAGES = [
  { label: '200 FF LIKE- প্রতিদিন ১ আইডিতে ১বার', name: '200 FF LIKE', price: 30 },
  { label: '3000 FF LIKE- 15 দিন এ পাবেন', name: '3000 FF LIKE', price: 450 },
  { label: '6000 FF LIKE- 30 দিন এ পাবেন', name: '6000 FF LIKE', price: 900 },
  { label: '12000 FF LIKE- 60 দিন এ পাবেন', name: '12000 FF LIKE', price: 1800 }
];

const DEFAULT_BANNERS = ['default:Banner 1.jpg', 'default:Banner 2.jpg', 'default:Banner 3.jpg'];
const DEFAULT_QUICK = [
  { label: 'Telegram', url: '' },
  { label: 'Join Group', url: '' },
  { label: 'YouTube', url: '' }
];
const MAX_BANNERS = 10;

const PRODUCTS = [
  { key: 'ff',  view: 'ffView',  hash: 'ff-likes',         grid: 'pkGrid',    img: 'ffBanner' },
  { key: 'uid', view: 'uidView', hash: 'uid-topup',        grid: 'uidPkGrid', img: 'uid' },
  { key: 'wm',  view: 'wmView',  hash: 'weekly-monthly',   grid: 'wmPkGrid',  img: 'wm' },
  { key: 'wl',  view: 'wlView',  hash: 'weekly-lite',      grid: 'wlPkGrid',  img: 'wl' },
  { key: 'lu',  view: 'luView',  hash: 'level-up-pass',    grid: 'luPkGrid',  img: 'lu' },
  { key: 'in',  view: 'inView',  hash: 'indonesia-server', grid: 'inPkGrid',  img: 'in' },
  { key: 'uc',  view: 'ucView',  hash: 'uid-checker',      grid: null,        img: 'uc' }
];

const IMAGES = {
  logo:     { file: 'Main logo.jpg',          prefix: 'logo' },
  ffBanner: { file: 'FF LIKES.jpg',           prefix: 'ff-banner' },
  uid:      { file: 'UID TOPUP (BD).jpg',     prefix: 'img-uid' },
  wm:       { file: 'WEEKLYMONTHLY.jpg',      prefix: 'img-wm' },
  wl:       { file: 'WEEKLY LITE.jpg',        prefix: 'img-wl' },
  lu:       { file: 'LEVEL UP PASS.jpg',      prefix: 'img-lu' },
  in:       { file: 'INDONESIA SERVER.jpg',   prefix: 'img-in' },
  uc:       { file: 'uid checker.jpg',        prefix: 'img-uc' },
  pop:      { file: 'Notification.jpg',       prefix: 'img-pop' }
};
const IMG_KEYS = Object.keys(IMAGES);

const TEXTS = [
  { id: 'siteName', label: 'Website name', def: 'Nickname', max: 40 },
  { id: 'sec1', label: 'Home section title (top)', def: 'FREE FIRE TOPUP', max: 60, wrap: ['<em>', '</em>'] },
  { id: 'sec2', label: 'Home section title (UID Checker)', def: 'UID CHECKER', max: 60, wrap: ['<em>', '</em>'] },
  { id: 'pop', label: 'Popup message', def: 'সবথেকে কম দামে টপ করার জন্য সেরা ওয়েবসাইট\n১০০% বিশ্বস্ত ও দ্রুত ডেলিভারিতে\nঅর্ডার করুন নিশ্চিন্তে 🥰', max: 400, multi: true },
  { id: 'hours', label: 'Support hours', def: 'সকাল ৮টা থেকে রাত ১২টা', max: 60 },
  { id: 'warn', label: 'Footer warning', def: '১৮ বছরের নিচে অভিভাবকের অনুমতি ছাড়া অর্ডার করা সম্পূর্ণ নিষিদ্ধ।', max: 300, multi: true },
  { id: 'dlTitle', label: 'App download title', def: 'DOWNLOAD OUR MOBILE APP', max: 60 },
  { id: 'playUrl', label: 'Google Play link', def: '', max: 300, url: true }
];

function emptyCfg() { return { logo: null, ffBanner: null, banners: null, quick: null, images: null, prod: null, texts: null }; }
let config = emptyCfg();
function imgGet(c, k) { return (k === 'logo' || k === 'ffBanner') ? c[k] : ((c.images && c.images[k]) || null); }
function imgSet(next, k, v) {
  if (k === 'logo' || k === 'ffBanner') { next[k] = v; return; }
  const m = Object.assign({}, next.images || {});
  if (v) m[k] = v; else delete m[k];
  next.images = Object.keys(m).length ? m : null;
}
function uploadedFiles(c) {
  const out = [c.logo, c.ffBanner].concat(Array.isArray(c.banners) ? c.banners : []);
  if (c.images && typeof c.images === 'object') Object.keys(c.images).forEach(function (k) { out.push(c.images[k]); });
  return out.filter(isUploaded);
}
let renderCache = null;
let cfgVersion = 0;

const SAFE_FILE = /^[a-z0-9._-]+$/i;

function sanitizePackages(list) {
  if (!Array.isArray(list)) throw new Error('প্যাকেজ লিস্ট ঠিক নেই');
  if (list.length < 1) throw new Error('কমপক্ষে ১টি প্যাকেজ রাখতে হবে');
  if (list.length > 40) throw new Error('সর্বোচ্চ ৪০টি প্যাকেজ রাখা যাবে');
  return list.map(function (p, i) {
    const label = String((p && p.label) || '').trim().slice(0, 140);
    let name = String((p && p.name) || '').trim().slice(0, 100);
    const price = Number(p && p.price);
    if (!label) throw new Error('প্যাকেজ ' + (i + 1) + ': নাম/বিবরণ ফাঁকা');
    if (!Number.isFinite(price) || price < 0 || price > 10000000) throw new Error('প্যাকেজ ' + (i + 1) + ': প্রাইস ঠিক নেই');
    if (!name) name = label;
    return { label: label, name: name, price: Math.round(price * 100) / 100 };
  });
}

function sanitizeProd(c) {
  const o = {};
  if (!c || typeof c !== 'object') return o;
  ['name', 'title', 'pill'].forEach(function (k) { if (typeof c[k] === 'string' && c[k].trim()) o[k] = c[k].trim().slice(0, 80); });
  if (c.packages) o.packages = sanitizePackages(c.packages);
  if (Array.isArray(c.rules)) o.rules = c.rules.map(function (x) { return String(x == null ? '' : x).trim().slice(0, 300); }).filter(Boolean).slice(0, 20);
  return o;
}

function sanitizeBanners(list) {
  if (!Array.isArray(list)) throw new Error('ব্যানার লিস্ট ঠিক নেই');
  if (list.length < 1) throw new Error('কমপক্ষে ১টি ব্যানার রাখতে হবে');
  if (list.length > MAX_BANNERS) throw new Error('সর্বোচ্চ ' + MAX_BANNERS + 'টি ব্যানার রাখা যাবে');
  return list.map(function (e) {
    e = String(e);
    if (DEFAULT_BANNERS.indexOf(e) !== -1 || SAFE_FILE.test(e)) return e;
    throw new Error('ব্যানারের নাম ঠিক নেই');
  });
}

function cleanUrl(u) {
  u = String(u == null ? '' : u).trim().slice(0, 300);
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (!/^https?:\/\/[^\s<>"']+$/i.test(u)) throw new Error('লিংক ঠিক নেই');
  return u;
}

function sanitizeQuick(list) {
  if (!Array.isArray(list) || list.length !== 3) throw new Error('বাটনের তথ্য ঠিক নেই');
  return list.map(function (q, i) {
    return {
      label: String((q && q.label) || '').trim().slice(0, 30) || DEFAULT_QUICK[i].label,
      url: cleanUrl(q && q.url)
    };
  });
}

function bannerSrc(e) {
  return e.indexOf('default:') === 0 ? '/' + encodeURI(e.slice(8)) : '/uploads/' + e;
}
function bannerList() { return config.banners || DEFAULT_BANNERS; }
function isUploaded(e) { return typeof e === 'string' && e.indexOf('default:') !== 0 && SAFE_FILE.test(e); }

function loadLocal() {
  config = emptyCfg();
  try {
    const j = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (typeof j.logo === 'string' && SAFE_FILE.test(j.logo) && fs.existsSync(path.join(UPLOAD_DIR, j.logo))) config.logo = j.logo;
    if (typeof j.ffBanner === 'string' && SAFE_FILE.test(j.ffBanner) && fs.existsSync(path.join(UPLOAD_DIR, j.ffBanner))) config.ffBanner = j.ffBanner;
    if (j.images && typeof j.images === 'object') {
      const im = {};
      IMG_KEYS.forEach(function (k) {
        const n = j.images[k];
        if (k !== 'logo' && k !== 'ffBanner' && typeof n === 'string' && SAFE_FILE.test(n) && fs.existsSync(path.join(UPLOAD_DIR, n))) im[k] = n;
      });
      if (Object.keys(im).length) config.images = im;
    }
    const pr = {};
    if (j.prod && typeof j.prod === 'object') {
      PRODUCTS.forEach(function (p) {
        if (!j.prod[p.key]) return;
        try { const c = sanitizeProd(j.prod[p.key]); if (Object.keys(c).length) pr[p.key] = c; } catch (e) {}
      });
    }
    if (j.ffPackages) { try { pr.ff = Object.assign({}, pr.ff, { packages: sanitizePackages(j.ffPackages) }); } catch (e) {} }
    if (Object.keys(pr).length) config.prod = pr;
    if (j.texts && typeof j.texts === 'object') {
      const tx = {};
      TEXTS.forEach(function (t) { if (typeof j.texts[t.id] === 'string' && j.texts[t.id].trim()) tx[t.id] = j.texts[t.id].trim().slice(0, t.max); });
      if (Object.keys(tx).length) config.texts = tx;
    }
    if (j.banners) {
      const b = sanitizeBanners(j.banners).filter(function (e) { return !isUploaded(e) || fs.existsSync(path.join(UPLOAD_DIR, e)); });
      config.banners = b.length ? b : null;
    }
    if (j.quick) config.quick = sanitizeQuick(j.quick);
  } catch (e) {}
  cfgVersion++;
  renderCache = null;
}

function writeLocalConfig(obj) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}

const storage = { mode: USE_GH ? 'github' : 'local', ok: !USE_GH, error: null, repo: GH_REPO, branch: GH_BRANCH };
const shas = {};
let chain = Promise.resolve();
function enqueue(fn) { const run = chain.then(fn); chain = run.catch(function () {}); return run; }

function encPath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
function contentsUrl(p) { return '/repos/' + GH_REPO + '/contents/' + encPath(p); }

async function gh(method, urlPath, body, accept) {
  const headers = {
    'Authorization': 'Bearer ' + GH_TOKEN,
    'Accept': accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ffx-admin'
  };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(GH_API + urlPath, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error('GitHub এর সাথে যোগাযোগ করা যাচ্ছে না, একটু পরে আবার চেষ্টা করুন');
  }
}

function ghErr(status) {
  if (status === 401) return new Error('GitHub টোকেন (FFX-G) ঠিক নেই বা মেয়াদ শেষ');
  if (status === 403) return new Error('GitHub: অনুমতি নেই বা রেট লিমিট। টোকেনে Contents → Read and write দিন');
  if (status === 404) return new Error('GitHub: repo (' + GH_REPO + ') পাওয়া যায়নি বা টোকেনের এই repo তে অ্যাক্সেস নেই');
  return new Error('GitHub সমস্যা (' + status + ')');
}

async function ensureBranch() {
  const b = await gh('GET', '/repos/' + GH_REPO + '/branches/' + encodeURIComponent(GH_BRANCH));
  if (b.ok) return;
  if (b.status !== 404) throw ghErr(b.status);

  const rp = await gh('GET', '/repos/' + GH_REPO);
  if (!rp.ok) throw ghErr(rp.status);
  const def = (await rp.json()).default_branch;
  const ref = await gh('GET', '/repos/' + GH_REPO + '/git/ref/heads/' + encodeURIComponent(def));
  if (!ref.ok) throw ghErr(ref.status);
  const sha = (await ref.json()).object.sha;
  const mk = await gh('POST', '/repos/' + GH_REPO + '/git/refs', { ref: 'refs/heads/' + GH_BRANCH, sha: sha });
  if (!mk.ok && mk.status !== 422) throw ghErr(mk.status);
}

async function ghPut(p, buf, msg) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = { message: msg, content: buf.toString('base64'), branch: GH_BRANCH };
    if (shas[p]) body.sha = shas[p];
    const r = await gh('PUT', contentsUrl(p), body);
    if (r.ok) { shas[p] = (await r.json()).content.sha; return; }
    if (attempt === 0 && (r.status === 409 || r.status === 422)) {
      const g = await gh('GET', contentsUrl(p) + '?ref=' + encodeURIComponent(GH_BRANCH));
      if (g.ok) shas[p] = (await g.json()).sha; else delete shas[p];
      continue;
    }
    throw ghErr(r.status);
  }
  throw new Error('GitHub এ সেভ করা যায়নি, আবার চেষ্টা করুন');
}

async function ghDelete(p, msg) {
  const g = await gh('GET', contentsUrl(p) + '?ref=' + encodeURIComponent(GH_BRANCH));
  if (g.status === 404) return;
  if (!g.ok) throw ghErr(g.status);
  const sha = (await g.json()).sha;
  const r = await gh('DELETE', contentsUrl(p), { message: msg, sha: sha, branch: GH_BRANCH });
  delete shas[p];
  if (!r.ok && r.status !== 404) throw ghErr(r.status);
}

async function ghDownload(p) {
  const r = await gh('GET', contentsUrl(p) + '?ref=' + encodeURIComponent(GH_BRANCH), null, 'application/vnd.github.raw+json');
  if (!r.ok) throw ghErr(r.status);
  return Buffer.from(await r.arrayBuffer());
}

let retryTimer = null;
async function initStorage() {
  loadLocal();
  if (!USE_GH) return;
  if (!GH_REPO) {
    storage.ok = false;
    storage.error = 'repo নাম পাওয়া যায়নি। Render Environment এ FFX-REPO = username/repo দিন';
    return;
  }
  try {
    await ensureBranch();
    const r = await gh('GET', contentsUrl(GH_DIR + '/config.json') + '?ref=' + encodeURIComponent(GH_BRANCH));
    if (r.ok) {
      const j = await r.json();
      shas[GH_DIR + '/config.json'] = j.sha;
      const remote = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const remoteFiles = uploadedFiles(remote);
      for (const n of remoteFiles) {
        if (typeof n === 'string' && SAFE_FILE.test(n) && !fs.existsSync(path.join(UPLOAD_DIR, n))) {
          fs.writeFileSync(path.join(UPLOAD_DIR, n), await ghDownload(GH_DIR + '/uploads/' + n));
        }
      }
      writeLocalConfig(remote);
      loadLocal();
    } else if (r.status === 404) {

      if (Object.keys(config).some(function (k) { return config[k]; })) {
        await enqueue(async function () {
          const localFiles = uploadedFiles(config);
          for (const n of localFiles) {
            await ghPut(GH_DIR + '/uploads/' + n, fs.readFileSync(path.join(UPLOAD_DIR, n)), 'Initial sync');
          }
          await ghPut(GH_DIR + '/config.json', Buffer.from(JSON.stringify(config, null, 2)), 'Initial sync');
        });
      }
    } else {
      throw ghErr(r.status);
    }
    storage.ok = true;
    storage.error = null;
  } catch (e) {
    storage.ok = false;
    storage.error = e.message || 'GitHub সংযোগ হয়নি';
    console.log('GitHub init error:', storage.error);
    if (!retryTimer) {
      retryTimer = setTimeout(function () { retryTimer = null; ready = initStorage(); }, 30000);
      retryTimer.unref();
    }
  }
}

async function commit(next, msg, add, del) {
  if (USE_GH && !storage.ok) throw new Error('GitHub এর সাথে এখনো সংযোগ হয়নি। উপরের "আবার চেষ্টা করুন" চাপুন।');
  if (USE_GH) {
    await enqueue(async function () {
      const done = [];
      try {
        for (const f of add) { await ghPut(GH_DIR + '/uploads/' + f.name, f.buf, msg); done.push(f.name); }
        await ghPut(GH_DIR + '/config.json', Buffer.from(JSON.stringify(next, null, 2)), msg);
      } catch (e) {
        for (const n of done) { try { await ghDelete(GH_DIR + '/uploads/' + n, 'Rollback'); } catch (_) {} }
        throw e;
      }
    });
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  add.forEach(function (f) { fs.writeFileSync(path.join(UPLOAD_DIR, f.name), f.buf); });
  writeLocalConfig(next);
  config = next;
  cfgVersion++;
  renderCache = null;
  del.forEach(function (n) {
    removeUpload(n);
    if (USE_GH) enqueue(function () { return ghDelete(GH_DIR + '/uploads/' + n, 'Remove old image'); }).catch(function () {});
  });
}

let ready = initStorage();

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function packagesHtml(list) {
  return list.map(function (p) {
    return '        <button type="button" class="pk" data-name="' + esc(p.name) + '" data-price="' + esc(p.price) +
      '"><span>' + esc(p.label) + '</span><b>BDT ' + esc(p.price) + '</b></button>';
  }).join('\n');
}

function unesc(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ''); }
function jsStr(s) { return JSON.stringify(String(s)).replace(/</g, '\\u003c'); }
function parseDefaults(html) {
  const out = {};
  PRODUCTS.forEach(function (p) {
    const d = { name: '', title: '', pill: '', packages: [], rules: [] };
    const cm = html.match(new RegExp('data-open="' + p.hash + '"[^>]*>[\\s\\S]*?<p>([\\s\\S]*?)</p>'));
    if (cm) d.name = unesc(stripTags(cm[1])).trim();
    const s = html.indexOf('<main class="wrap" id="' + p.view + '"');
    const e = s < 0 ? -1 : html.indexOf('</main>', s);
    if (s >= 0 && e > s) {
      const seg = html.slice(s, e);
      let m = seg.match(/<h1>([\s\S]*?)<\/h1>/); if (m) d.title = unesc(stripTags(m[1])).trim();
      m = seg.match(/<span class="pv-pill">(?:<svg[\s\S]*?<\/svg>)?([\s\S]*?)<\/span>/); if (m) d.pill = unesc(m[1]).trim();
      const gm = p.grid && seg.match(new RegExp('<div class="pk-grid" id="' + p.grid + '">([\\s\\S]*?)</div>'));
      if (gm) {
        const re = /<button[^>]*class="pk"[^>]*data-name="([^"]*)"[^>]*data-price="([^"]*)"[^>]*>\s*<span>([\s\S]*?)<\/span>/g; let b;
        while ((b = re.exec(gm[1]))) d.packages.push({ label: unesc(b[3]).trim(), name: unesc(b[1]), price: Number(b[2]) });
      }
      const rm = seg.match(/<ul class="rl">([\s\S]*?)<\/ul>/);
      if (rm) { const re = /<li>([\s\S]*?)<\/li>/g; let b; while ((b = re.exec(rm[1]))) d.rules.push(unesc(stripTags(b[1])).trim()); }
    }
    out[p.key] = d;
  });
  return out;
}
let defCache = { mtime: 0, v: null };
function getDefaults() {
  try {
    const f = path.join(ROOT_DIR, 'FFX.html');
    const st = fs.statSync(f);
    if (!defCache.v || defCache.mtime !== st.mtimeMs) defCache = { mtime: st.mtimeMs, v: parseDefaults(fs.readFileSync(f, 'utf8')) };
    return defCache.v;
  } catch (e) { return {}; }
}

function applyProducts(html) {
  const P = config.prod || {};
  PRODUCTS.forEach(function (p) {
    const c = P[p.key];
    if (!c) return;
    if (c.name) html = html.replace(new RegExp('(data-open="' + p.hash + '"[^>]*>[\\s\\S]*?<p>)[\\s\\S]*?(</p>)'), function (m, a, b) { return a + esc(c.name) + b; });
    const s = html.indexOf('<main class="wrap" id="' + p.view + '"');
    const e = s < 0 ? -1 : html.indexOf('</main>', s);
    if (s < 0 || e < 0) return;
    let seg = html.slice(s, e);
    if (c.title) seg = seg.replace(/(<h1>)[\s\S]*?(<\/h1>)/, function (m, a, b) { return a + esc(c.title) + b; });
    if (c.pill) seg = seg.replace(/(<span class="pv-pill">(?:<svg[\s\S]*?<\/svg>)?)[\s\S]*?(<\/span>)/, function (m, a, b) { return a + esc(c.pill) + b; });
    if (c.packages && p.grid) seg = seg.replace(new RegExp('(<div class="pk-grid" id="' + p.grid + '">)[\\s\\S]*?(</div>)'), function (m, a, b) { return a + '\n' + packagesHtml(c.packages) + '\n      ' + b; });
    if (c.rules) seg = seg.replace(/(<ul class="rl">)[\s\S]*?(<\/ul>)/, function (m, a, b) { return a + '\n' + c.rules.map(function (r) { return '        <li>' + esc(r) + '</li>'; }).join('\n') + '\n      ' + b; });
    html = html.slice(0, s) + seg + html.slice(e);
  });
  return html;
}

function applyTexts(html, inj) {
  const T = config.texts || {};
  if (T.siteName) {
    const v = esc(T.siteName);
    html = html.split('<title>Nickname</title>').join('<title>' + v + '</title>')
      .split('data-site-name>Nickname<').join('data-site-name>' + v + '<')
      .split('alt="Nickname"').join('alt="' + v + '"')
      .split("(typeof website_name !== 'undefined'").join("(window.__SITE ? window.__SITE : typeof website_name !== 'undefined'");
    inj.push('window.__SITE = ' + jsStr(T.siteName) + ';');
  }
  if (T.pop) {
    html = html.split("(typeof notification_text !== 'undefined'").join("(window.__POP ? window.__POP : typeof notification_text !== 'undefined'");
    inj.push('window.__POP = ' + jsStr(T.pop) + ';');
    html = html.replace(/(<p id="popText">)[\s\S]*?(<\/p>)/, function (m, a, b) { return a + esc(T.pop).split(/\r?\n/).join('<br>') + b; });
  }
  TEXTS.forEach(function (t) {
    if (!T[t.id] || t.id === 'siteName' || t.id === 'pop' || t.id === 'playUrl') return;
    const w = t.wrap || ['>', '<'];
    html = html.split(w[0] + t.def + w[1]).join(w[0] + esc(T[t.id]) + w[1]);
  });
  if (T.hours) html = html.split(TEXTS.filter(function (t) { return t.id === 'hours'; })[0].def).join(esc(T.hours));
  if (T.playUrl) html = html.replace('<a class="play" href="#">', '<a class="play" href="' + esc(T.playUrl) + '" target="_blank" rel="noopener noreferrer">');
  return html;
}

function applySiteConfig(html) {
  const inj = [];

  if (config.banners) {
    const slides = config.banners.map(function (e, i) {
      return '      <div class="slide"><img src="' + esc(bannerSrc(e)) + '" alt="Banner ' + (i + 1) + '" draggable="false" decoding="async"></div>';
    }).join('\n');
    const dots = config.banners.map(function (e, i) { return '<i' + (i === 0 ? ' class="on"' : '') + '></i>'; }).join('');
    html = html.replace(/(<div class="track" id="track">)[\s\S]*?(<\/div>\s*<div class="dots" id="dots">)[\s\S]*?(<\/div>)/, function (m, a, b, c) {
      return a + '\n' + slides + '\n    ' + b + dots + c;
    });
  }

  if (config.quick) {
    const icons = ['tg', 'grp', 'yt'], keys = ['telegram-channel', 'telegram-group', 'youtube-channel'], small = ['Support', 'Group', 'Channel'];
    const items = config.quick.map(function (x, i) {
      return '    <a class="q" href="#" data-link="' + keys[i] + '"><span class="ic"><svg class="f"><use href="#' + icons[i] + '"/></svg></span><span><small>' + small[i] + '</small><b>' + esc(x.label) + '</b></span></a>';
    }).join('\n');
    html = html.replace(/(<div class="quick">)[\s\S]*?(<\/div>)/, function (m, a, b) { return a + '\n' + items + '\n  ' + b; });
    const L = { tgCh: config.quick[0].url, tgGrp: config.quick[1].url, yt: config.quick[2].url };
    if (L.tgCh || L.tgGrp || L.yt) {
      inj.push('window.__LINKS = ' + JSON.stringify(L).replace(/</g, '\\u003c') + ';');
      html = html.split("bindLinks('[data-link=\"telegram-channel\"]', validTgCh);").join("bindLinks('[data-link=\"telegram-channel\"]', (window.__LINKS && window.__LINKS.tgCh) || validTgCh);");
      html = html.split("bindLinks('[data-link=\"telegram-group\"]', validTgGrp);").join("bindLinks('[data-link=\"telegram-group\"]', (window.__LINKS && window.__LINKS.tgGrp) || validTgGrp);");
      html = html.split("bindLinks('[data-link=\"youtube-channel\"]', validYtCh);").join("bindLinks('[data-link=\"youtube-channel\"]', (window.__LINKS && window.__LINKS.yt) || validYtCh);");
    }
  }
  html = applyProducts(html);
  html = applyTexts(html, inj);
  if (inj.length) html = html.replace('window.ACCOUNT_CONFIG = window.ACCOUNT_CONFIG || {};', function (m) { return m + '\n' + inj.join('\n'); });
  return html;
}

const FORGOT_HTML = "\n<!-- FFX: পাসওয়ার্ড ভুলে গেলে ইমেইল OTP দিয়ে রিসেট -->\n<style>\n.ffx-fp-link{width:100%;margin-top:8px;border:0;background:transparent;color:#d32f2f;font-weight:800;padding:8px;font-size:14px;cursor:pointer}\n#ffxFpMsg{min-height:20px;margin:10px 0 0;font-size:13px;font-weight:600}\n#ffxFpMsg.err{color:#c62828}#ffxFpMsg.ok{color:#1b873f}\n</style>\n<div id=\"ffxFpModal\" class=\"ffx-auth-modal\" aria-hidden=\"true\">\n  <div class=\"ffx-auth-card\" role=\"dialog\" aria-modal=\"true\">\n    <button type=\"button\" id=\"ffxFpClose\" class=\"ffx-auth-close\" aria-label=\"Close\">×</button>\n    <h2>পাসওয়ার্ড রিসেট</h2>\n    <p id=\"ffxFpSub\">আপনার ইমেইল দিন, আমরা ৬ সংখ্যার OTP পাঠাবো</p>\n    <form id=\"ffxFpForm\">\n      <label>ইমেইল</label>\n      <input id=\"ffxFpEmail\" type=\"email\" autocomplete=\"email\" placeholder=\"আপনার ইমেইল\" required>\n      <div id=\"ffxFpStep2\" hidden>\n        <label>OTP কোড</label>\n        <input id=\"ffxFpOtp\" inputmode=\"numeric\" maxlength=\"6\" autocomplete=\"one-time-code\" placeholder=\"৬ সংখ্যার কোড\">\n        <label>নতুন পাসওয়ার্ড</label>\n        <input id=\"ffxFpPass\" type=\"password\" autocomplete=\"new-password\" placeholder=\"কমপক্ষে ৮ অক্ষর\">\n      </div>\n      <p id=\"ffxFpMsg\" role=\"alert\"></p>\n      <button id=\"ffxFpSubmit\" type=\"submit\">OTP পাঠান</button>\n    </form>\n    <button type=\"button\" id=\"ffxFpResend\" class=\"ffx-auth-switch\" hidden>আবার OTP পাঠান</button>\n    <button type=\"button\" id=\"ffxFpBack\" class=\"ffx-auth-switch\">← Login-এ ফিরে যান</button>\n  </div>\n</div>\n<script>\n(function () {\n  var login = document.getElementById('ffxAuthModal'), fp = document.getElementById('ffxFpModal');\n  var sw = document.getElementById('ffxAuthSwitch'), title = document.getElementById('ffxAuthTitle');\n  if (!login || !fp || !sw || !title) return;\n  var link = document.createElement('button');\n  link.type = 'button'; link.className = 'ffx-fp-link'; link.textContent = 'পাসওয়ার্ড ভুলে গেছেন? OTP দিয়ে লগইন করুন';\n  sw.parentNode.insertBefore(link, sw);\n  function sync() { link.style.display = /login/i.test(title.textContent) ? 'block' : 'none'; }\n  new MutationObserver(sync).observe(title, { childList: true, characterData: true, subtree: true });\n  sync();\n\n  var form = document.getElementById('ffxFpForm'), emailEl = document.getElementById('ffxFpEmail');\n  var step2 = document.getElementById('ffxFpStep2'), otpEl = document.getElementById('ffxFpOtp'), passEl = document.getElementById('ffxFpPass');\n  var msg = document.getElementById('ffxFpMsg'), submit = document.getElementById('ffxFpSubmit');\n  var resend = document.getElementById('ffxFpResend'), sub = document.getElementById('ffxFpSub');\n  var step = 1, timer = null;\n\n  function say(t, ok) { msg.textContent = t || ''; msg.className = ok ? 'ok' : 'err'; }\n  function digits(v) { return String(v || '').replace(/[০-৯]/g, function (c) { return String('০১২৩৪৫৬৭৮৯'.indexOf(c)); }).replace(/\\D/g, ''); }\n  function setStep(n) {\n    step = n; step2.hidden = n !== 2; emailEl.readOnly = n === 2;\n    submit.textContent = n === 1 ? 'OTP পাঠান' : 'পাসওয়ার্ড বদলান ও Login';\n    sub.textContent = n === 1 ? 'আপনার ইমেইল দিন, আমরা ৬ সংখ্যার OTP পাঠাবো' : 'ইমেইলে আসা OTP আর নতুন পাসওয়ার্ড দিন';\n    resend.hidden = n !== 2;\n  }\n  function cooldown() {\n    var left = 60; resend.disabled = true; clearInterval(timer);\n    timer = setInterval(function () {\n      left--; resend.textContent = left > 0 ? ('আবার OTP পাঠান (' + left + ' সেকেন্ড)') : 'আবার OTP পাঠান';\n      if (left <= 0) { clearInterval(timer); resend.disabled = false; }\n    }, 1000);\n    resend.textContent = 'আবার OTP পাঠান (60 সেকেন্ড)';\n  }\n  function post(url, body) {\n    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })\n      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'সমস্যা হয়েছে, আবার চেষ্টা করুন'); return d; }); });\n  }\n  function openFp() {\n    var le = document.getElementById('ffxAuthEmail');\n    emailEl.value = (le && le.value) || emailEl.value; otpEl.value = ''; passEl.value = ''; say('');\n    setStep(1); login.classList.remove('show'); fp.classList.add('show'); fp.setAttribute('aria-hidden', 'false');\n  }\n  function closeFp() { fp.classList.remove('show'); fp.setAttribute('aria-hidden', 'true'); }\n  link.onclick = openFp;\n  document.getElementById('ffxFpClose').onclick = closeFp;\n  document.getElementById('ffxFpBack').onclick = function () { closeFp(); login.classList.add('show'); login.setAttribute('aria-hidden', 'false'); };\n  function sendOtp() {\n    say('OTP পাঠানো হচ্ছে…', true); submit.disabled = true; resend.disabled = true;\n    return post('/api/auth/forgot', { email: emailEl.value.trim() }).then(function () {\n      setStep(2); cooldown(); say('OTP পাঠানো হয়েছে। Inbox না পেলে Spam ফোল্ডার দেখুন।', true); otpEl.focus();\n    }).catch(function (e) { say(e.message); if (step === 2) resend.disabled = false; })\n      .then(function () { submit.disabled = false; });\n  }\n  resend.onclick = sendOtp;\n  form.addEventListener('submit', function (e) {\n    e.preventDefault();\n    if (step === 1) return sendOtp();\n    var otp = digits(otpEl.value), pw = passEl.value;\n    if (otp.length !== 6) return say('৬ সংখ্যার OTP দিন');\n    if (pw.length < 8) return say('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন');\n    submit.disabled = true; say('একটু অপেক্ষা করুন…', true);\n    post('/api/auth/reset', { email: emailEl.value.trim(), otp: otp, password: pw }).then(function (d) {\n      window.FFX_AUTH = { loggedIn: true, user: d.user };\n      closeFp();\n      if (window.FFX_SYNC_AUTH_UI) window.FFX_SYNC_AUTH_UI();\n      location.hash = window.__FFX_RETURN_HASH || '';\n    }).catch(function (er) { say(er.message); }).then(function () { submit.disabled = false; });\n  });\n})();\n</script>\n";
const EXTRA_HTML = "\n<script>\n(function () {\n  function syncProfile() {\n    var a = window.FFX_AUTH || {}, u = a.user || null;\n    if (typeof window.setProfile === 'function') {\n      window.setProfile(a.loggedIn && u ? { loggedIn: true, name: u.name, email: u.email, balance: Number(u.balance) || 0 } : {});\n    }\n  }\n  var orig = window.FFX_SYNC_AUTH_UI;\n  window.FFX_SYNC_AUTH_UI = function () {\n    if (typeof orig === 'function') orig.apply(this, arguments);\n    try { syncProfile(); } catch (e) {}\n  };\n  window.onRefreshBalance = function () {\n    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {\n      window.FFX_AUTH = { loggedIn: !!d.loggedIn, user: d.user || null };\n      window.FFX_SYNC_AUTH_UI();\n    }).catch(function () {});\n  };\n  document.addEventListener('click', function (e) {\n    var t = e.target && e.target.closest ? e.target.closest('#acAdd, nav.nav a.add, .acc-it[data-go=\"addmoney\"]') : null;\n    if (!t || !window.FFXOrder || !window.FFXOrder.addMoney) return;\n    e.preventDefault(); e.stopImmediatePropagation();\n    window.FFXOrder.addMoney();\n  }, true);\n  setTimeout(function () { try { syncProfile(); } catch (e) {} }, 600);\n})();\n</script>\n";
function injectForgot(html) {
  if (html.indexOf('ffxFpModal') !== -1) return html;
  const add = FORGOT_HTML + EXTRA_HTML;
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html + add : html.slice(0, i) + add + html.slice(i);
}

function getHomePage(cb) {
  const file = path.join(ROOT_DIR, 'FFX.html');
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) return cb(null);
    if (renderCache && renderCache.mtime === st.mtimeMs && renderCache.cfgVersion === cfgVersion) return cb(renderCache);
    fs.readFile(file, 'utf8', function (e2, html) {
      if (e2) return cb(null);
      IMG_KEYS.forEach(function (k) {
        const f = imgGet(config, k);
        if (f) html = html.split(IMAGES[k].file).join('/uploads/' + f);
      });
      html = applySiteConfig(html);
      html = injectForgot(html);
      const raw = Buffer.from(html, 'utf8');
      zlib.gzip(raw, function (e3, gz) {
        renderCache = { mtime: st.mtimeMs, cfgVersion: cfgVersion, raw: raw, gz: e3 ? null : gz };
        cb(renderCache);
      });
    });
  });
}

function sendHome(req, res) {
  getHomePage(function (page) {
    if (!page) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const headers = {
      'Content-Type': MIME_TYPES['.html'],
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept-Encoding'
    };
    const wantsGzip = page.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (wantsGzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(wantsGzip ? page.gz : page.raw);
  });
}

const SECRET = crypto.createHash('sha256').update('ffx-admin-secret:' + ADMIN_PASSWORD).digest();

function safeEq(a, b) {
  const A = crypto.createHash('sha256').update(String(a)).digest();
  const B = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(A, B);
}
function sign(exp) { return crypto.createHmac('sha256', SECRET).update(String(exp)).digest('hex'); }
function makeToken() { const exp = Date.now() + SESSION_MS; return { token: exp + '.' + sign(exp), expires: exp }; }
function checkToken(t) {
  if (!ADMIN_PASSWORD || typeof t !== 'string') return false;
  const parts = t.split('.');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;
  if (Number(parts[0]) < Date.now()) return false;
  return safeEq(parts[1], sign(parts[0]));
}

// Customer accounts (stored in DATA_DIR; DATA_DIR must be persistent on the host).
const CUSTOMER_FILE = path.join(DATA_DIR, 'customers.json');
// লগইন সেশনও MongoDB তে রাখা হয়, যাতে সার্ভার রিস্টার্ট হলেও কাস্টমার লগআউট না হয়।
class SessionStore {
  constructor() { this.m = new Map(); this.t = null; }
  _k(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
  get(t) { return this.m.get(this._k(t)); }
  set(t, v) { this.m.set(this._k(t), v); this._save(); return this; }
  delete(t) { const r = this.m.delete(this._k(t)); if (r) this._save(); return r; }
  deleteWhere(fn) { let ch = false; this.m.forEach((v, k) => { if (fn(v)) { this.m.delete(k); ch = true; } }); if (ch) this._save(); }
  load(arr) { const now = Date.now(); arr.forEach((e) => { if (Array.isArray(e) && e[1] && e[1].expires > now) this.m.set(e[0], e[1]); }); }
  _save() {
    if (!custColl) return;
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      const now = Date.now(), arr = [];
      this.m.forEach((v, k) => { if (v.expires > now) arr.push([k, v]); });
      custColl.updateOne({ _id: 'sessions' }, { $set: { data: arr } }, { upsert: true })
        .catch((e) => { console.error('Session MongoDB save error:', e && e.message); });
    }, 300);
  }
}
const customerSessions = new SessionStore();
function loadCustomers() {
  try {
    const data = JSON.parse(fs.readFileSync(CUSTOMER_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}
let customers = loadCustomers();
// অ্যাকাউন্টগুলো MongoDB তে রাখা হয়, যাতে Render রিস্টার্ট/ডিপ্লয় দিলেও হারিয়ে না যায়।
const MONGO_URI_CUST = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
let custColl = null;
function loadCustomersFromMongo() {
  if (!MONGO_URI_CUST) return Promise.resolve();
  return Promise.resolve().then(function () {
    const mongoose = require('mongoose');
    return mongoose.createConnection(MONGO_URI_CUST, { serverSelectionTimeoutMS: 8000 }).asPromise();
  }).then(function (conn) {
    custColl = conn.db.collection('ffx_kv');
    return custColl.findOne({ _id: 'customers' });
  }).then(function (doc) {
    if (doc && Array.isArray(doc.data)) {
      customers = doc.data;
      console.log('Customers loaded from MongoDB:', customers.length);
    } else if (customers.length) {
      return custColl.updateOne({ _id: 'customers' }, { $set: { data: customers } }, { upsert: true });
    }
  }).then(function () {
    return custColl ? custColl.findOne({ _id: 'sessions' }) : null;
  }).then(function (sd) {
    if (sd && Array.isArray(sd.data)) customerSessions.load(sd.data);
  }).catch(function (e) {
    custColl = null;
    console.error('Customer MongoDB load error:', e && e.message);
  });
}
const customersLoaded = loadCustomersFromMongo();
function saveCustomers() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = CUSTOMER_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(customers, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CUSTOMER_FILE);
  if (custColl) {
    custColl.updateOne({ _id: 'customers' }, { $set: { data: customers } }, { upsert: true })
      .catch(function (e) { console.error('Customer MongoDB save error:', e && e.message); });
  }
}
function customerCookieToken(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const item of cookies) {
    const p = item.trim().split('=');
    if (p[0] === 'ffx_customer') return decodeURIComponent(p.slice(1).join('='));
  }
  return '';
}
function customerFromRequest(req) {
  const token = customerCookieToken(req);
  const session = customerSessions.get(token);
  if (!session || session.expires < Date.now()) {
    if (token) customerSessions.delete(token);
    return null;
  }
  return customers.find(u => u.id === session.userId) || null;
}
function setCustomerCookie(res, token) {
  res.setHeader('Set-Cookie', 'ffx_customer=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
}
function customerPublic(u) { return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt }; }
function passwordHash(password, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString('hex'))));
}
function isAuthed(req) {
  const h = req.headers['authorization'] || '';
  return checkToken(h.startsWith('Bearer ') ? h.slice(7).trim() : '');
}

const LOCK_MS = 15 * 60 * 1000;
const fails = new Map();
let globalFails = { n: 0, first: Date.now() };
function clientIp(req) {
  return ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
}
function lockedFor(ip) {
  const now = Date.now();
  if (now - globalFails.first > LOCK_MS) globalFails = { n: 0, first: now };
  if (globalFails.n >= 40) return LOCK_MS - (now - globalFails.first);
  const f = fails.get(ip);
  if (!f) return 0;
  if (now - f.first > LOCK_MS) { fails.delete(ip); return 0; }
  return f.n >= 5 ? LOCK_MS - (now - f.first) : 0;
}
function recordFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.first > LOCK_MS) fails.set(ip, { n: 1, first: Date.now() });
  else f.n++;
  globalFails.n++;
}
setInterval(function () {
  const now = Date.now();
  fails.forEach(function (v, k) { if (now - v.first > LOCK_MS) fails.delete(k); });
}, 5 * 60 * 1000).unref();

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0; const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

async function readJson(req, limit) {
  const txt = await readBody(req, limit || 64 * 1024);
  try { return JSON.parse(txt || '{}'); } catch (e) { throw new Error('bad_json'); }
}

function currentView() {
  const defs = getDefaults();
  const images = {};
  IMG_KEYS.forEach(function (k) {
    const f = imgGet(config, k);
    images[k] = { src: f ? '/uploads/' + f : null, def: '/' + IMAGES[k].file, custom: !!f };
  });
  const P = config.prod || {}, T = config.texts || {};
  return {
    images: images,
    products: PRODUCTS.map(function (p) {
      const c = P[p.key] || {}, d = defs[p.key] || { name: '', title: '', pill: '', packages: [], rules: [] };
      return {
        key: p.key, img: p.img, hasGrid: !!p.grid, hasRules: d.rules.length > 0 || !!c.rules,
        name: c.name || d.name, title: c.title || d.title, pill: c.pill || d.pill,
        packages: c.packages || d.packages, rules: c.rules || d.rules,
        defaults: d, anyCustom: Object.keys(c).length > 0,
        custom: { packages: !!c.packages, rules: !!c.rules }
      };
    }),
    texts: TEXTS.map(function (t) {
      return { id: t.id, label: t.label, def: t.def, value: T[t.id] || t.def, custom: !!T[t.id], multi: !!t.multi, url: !!t.url, max: t.max };
    }),
    banners: bannerList().map(function (e) { return { id: e, src: bannerSrc(e), isDefault: !isUploaded(e) }; }),
    bannersCustom: !!config.banners,
    quick: config.quick || DEFAULT_QUICK,
    quickCustom: !!config.quick,
    maxBanners: MAX_BANNERS,
    storage: { mode: storage.mode, ok: storage.ok, error: storage.error, repo: storage.repo, branch: storage.branch },
    persistent: USE_GH || !!process.env.DATA_DIR
  };
}

function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function removeUpload(name) {
  if (name && SAFE_FILE.test(name)) fs.unlink(path.join(UPLOAD_DIR, name), function () {});
}

// Customer login protection: lock an email+IP pair after 4 failed attempts for 15 minutes.
const customerLoginFails = new Map();
function customerLoginKey(email, ip) { return String(email || '').toLowerCase() + '|' + String(ip || 'unknown'); }
function customerLoginLock(key) {
  const item = customerLoginFails.get(key);
  if (!item) return 0;
  const left = LOCK_MS - (Date.now() - item.first);
  if (left <= 0) { customerLoginFails.delete(key); return 0; }
  return item.count >= 4 ? left : 0;
}
function customerLoginFailed(key) {
  const now = Date.now();
  let item = customerLoginFails.get(key);
  if (!item || now - item.first > LOCK_MS) item = { count: 0, first: now };
  item.count += 1;
  customerLoginFails.set(key, item);
  return item.count;
}

// Wallet / orders / admin-approval API (MongoDB). Needs env MONGODB_URI; see routes/index.js
const api = require('./routes')({
  getCustomer: customerFromRequest,
  customerById: function (id) { return customers.find(function (u) { return u.id === id; }) || null; },
  isAdmin: isAuthed,
  readJson: readJson,
  sendJson: sendJson,
  listPackages: function () {
    const out = [];
    currentView().products.forEach(function (p) {
      if (p.hasGrid) p.packages.forEach(function (x) { out.push({ name: x.name, price: x.price }); });
    });
    return out;
  }
});
async function withBalance(pub) { pub.balance = await api.balanceOf(pub.id); return pub; }

// ---- পাসওয়ার্ড ভুলে গেলে: ইমেইলে OTP (Brevo API, Render Environment: BREVO_API_KEY, MAIL_FROM) ----
const resetOtps = new Map();
const otpIpHits = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_SECRET = crypto.randomBytes(16).toString('hex');
setInterval(function () {
  const now = Date.now();
  resetOtps.forEach(function (v, k) { if (v.expires < now) resetOtps.delete(k); });
  otpIpHits.forEach(function (v, k) { if (now - v.first > 15 * 60 * 1000) otpIpHits.delete(k); });
}, 5 * 60 * 1000).unref();
function otpHash(email, otp) { return crypto.createHash('sha256').update('ffx-otp:' + OTP_SECRET + ':' + email + ':' + otp).digest('hex'); }
function mailConfigured() { return !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM); }
async function sendOtpMail(to, otp) {
  const html = '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px;border:1px solid #e3e8f2;border-radius:12px">'
    + '<h2 style="margin:0 0 10px;color:#17233c">FF Diamond BD</h2>'
    + '<p style="color:#444">আপনার পাসওয়ার্ড রিসেট করার OTP কোড:</p>'
    + '<p style="font-size:32px;letter-spacing:6px;font-weight:bold;color:#1e63f0;margin:14px 0">' + otp + '</p>'
    + '<p style="color:#666;font-size:13px">এই কোড ১০ মিনিট পর্যন্ত কাজ করবে। আপনি না চাইলে এই ইমেইল উপেক্ষা করুন এবং কাউকে কোডটি দেবেন না।</p></div>';
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.MAIL_FROM_NAME || 'FF Diamond BD', email: process.env.MAIL_FROM },
      to: [{ email: to }],
      subject: 'আপনার OTP: ' + otp,
      htmlContent: html
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(function () { return ''; });
    throw new Error('Brevo ' + r.status + ' ' + t.slice(0, 200));
  }
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === 'GET' && pathname === '/api/wallet/payment-info') {
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, { bkash: (process.env.PAY_BKASH || '').trim(), nagad: (process.env.PAY_NAGAD || '').trim(), rocket: (process.env.PAY_ROCKET || '').trim() });
    }
    if (await api.handle(req, res, pathname)) return;

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const user = customerFromRequest(req);
      return sendJson(res, 200, { loggedIn: !!user, user: user ? await withBalance(customerPublic(user)) : null });
    }
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = await readJson(req, 8192);
      const name = String(body.name || '').trim().slice(0, 60);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      const password = String(body.password || '');
      if (name.length < 2) return sendJson(res, 400, { error: 'নাম কমপক্ষে ২ অক্ষরের হতে হবে' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'সঠিক ইমেইল দিন' });
      if (password.length < 8 || password.length > 128) return sendJson(res, 400, { error: 'পাসওয়ার্ড ৮–১২৮ অক্ষরের হতে হবে' });
      if (customers.some(u => u.email === email)) return sendJson(res, 409, { error: 'এই ইমেইলে অ্যাকাউন্ট আগে থেকেই আছে। Login করুন।' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await passwordHash(password, salt);
      const user = { id: crypto.randomUUID(), name, email, salt, passwordHash: hash, createdAt: new Date().toISOString() };
      customers.push(user);
      saveCustomers();
      const token = crypto.randomBytes(32).toString('hex');
      customerSessions.set(token, { userId: user.id, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      setCustomerCookie(res, token);
      return sendJson(res, 201, { loggedIn: true, user: await withBalance(customerPublic(user)) });
    }
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(req, 8192);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const key = customerLoginKey(email, clientIp(req));
      const wait = customerLoginLock(key);
      if (wait) return sendJson(res, 429, { error: 'পরপর ৪ বার ভুল পাসওয়ার্ড দেওয়ায় ১৫ মিনিটের জন্য লগইন বন্ধ আছে। Support-এর সঙ্গে যোগাযোগ করুন।', locked: true, retryAfter: Math.ceil(wait / 1000) });
      const user = customers.find(u => u.email === email);
      const candidate = user ? await passwordHash(password, user.salt) : await passwordHash(password || 'invalid-password', 'ffx-fixed-dummy-salt');
      if (!user || !safeEq(candidate, user.passwordHash)) {
        const count = customerLoginFailed(key);
        const locked = count >= 4;
        return sendJson(res, locked ? 429 : 401, {
          error: locked
            ? 'পরপর ৪ বার ভুল পাসওয়ার্ড দেওয়ায় ১৫ মিনিটের জন্য লগইন বন্ধ আছে। Support-এর সঙ্গে যোগাযোগ করুন।'
            : 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। ভুলের চেষ্টা ' + count + '/4',
          locked: locked, attempts: count,
          retryAfter: locked ? Math.ceil(LOCK_MS / 1000) : 0
        });
      }
      customerLoginFails.delete(key);
      const token = crypto.randomBytes(32).toString('hex');
      customerSessions.set(token, { userId: user.id, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      setCustomerCookie(res, token);
      return sendJson(res, 200, { loggedIn: true, user: await withBalance(customerPublic(user)) });
    }
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      const token = customerCookieToken(req);
      if (token) customerSessions.delete(token);
      res.setHeader('Set-Cookie', 'ffx_customer=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
      return sendJson(res, 200, { loggedIn: false });
    }

    if (req.method === 'POST' && pathname === '/api/auth/forgot') {
      const body = await readJson(req, 4096);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'সঠিক ইমেইল দিন' });
      if (!mailConfigured()) return sendJson(res, 503, { error: 'এই মুহূর্তে OTP পাঠানো যাচ্ছে না। Support-এর সঙ্গে যোগাযোগ করুন।' });
      const now = Date.now();
      const ip = clientIp(req);
      const h = otpIpHits.get(ip) || { n: 0, first: now };
      if (now - h.first > 15 * 60 * 1000) { h.n = 0; h.first = now; }
      if (++h.n > 6) return sendJson(res, 429, { error: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।' });
      otpIpHits.set(ip, h);
      const user = customers.find(u => u.email === email);
      const old = resetOtps.get(email);
      if (user && !(old && now - old.sentAt < 55000)) {
        const otp = String(crypto.randomInt(100000, 1000000));
        resetOtps.set(email, { hash: otpHash(email, otp), expires: now + OTP_TTL_MS, tries: 0, sentAt: now });
        try { await sendOtpMail(email, otp); }
        catch (e) {
          resetOtps.delete(email);
          console.error('OTP mail error:', e && e.message);
          return sendJson(res, 502, { error: 'ইমেইল পাঠানো যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।' });
        }
      }
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/auth/reset') {
      const body = await readJson(req, 4096);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      const otp = String(body.otp || '').trim();
      const password = String(body.password || '');
      if (!/^\d{6}$/.test(otp)) return sendJson(res, 400, { error: 'OTP ৬ সংখ্যার হতে হবে' });
      if (password.length < 8 || password.length > 128) return sendJson(res, 400, { error: 'পাসওয়ার্ড ৮–১২৮ অক্ষরের হতে হবে' });
      const rec = resetOtps.get(email);
      const user = customers.find(u => u.email === email);
      if (!rec || !user || rec.expires < Date.now()) {
        resetOtps.delete(email);
        return sendJson(res, 400, { error: 'OTP ভুল বা মেয়াদ শেষ। আবার OTP পাঠান।' });
      }
      if (++rec.tries > 5) {
        resetOtps.delete(email);
        return sendJson(res, 429, { error: 'অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন করে OTP পাঠান।' });
      }
      if (!safeEq(rec.hash, otpHash(email, otp))) return sendJson(res, 400, { error: 'OTP ঠিক নয় (' + rec.tries + '/5)' });
      resetOtps.delete(email);
      user.salt = crypto.randomBytes(16).toString('hex');
      user.passwordHash = await passwordHash(password, user.salt);
      saveCustomers();
      customerSessions.deleteWhere(function (v) { return v.userId === user.id; });
      Array.from(customerLoginFails.keys()).forEach(function (k) { if (String(k).indexOf(email + '|') === 0) customerLoginFails.delete(k); });
      const token = crypto.randomBytes(32).toString('hex');
      customerSessions.set(token, { userId: user.id, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      setCustomerCookie(res, token);
      return sendJson(res, 200, { loggedIn: true, user: await withBalance(customerPublic(user)) });
    }

    if (req.method === 'POST' && pathname === '/api/admin/login') {
      if (!ADMIN_PASSWORD) return sendJson(res, 503, { error: 'Render এ FFX-PASS সেট করা নেই। Environment এ FFX-PASS যোগ করে আবার Deploy করুন।' });
      const ip = clientIp(req);
      const wait = lockedFor(ip);
      if (wait > 0) return sendJson(res, 429, { error: 'অনেকবার ভুল হয়েছে। ' + Math.ceil(wait / 60000) + ' মিনিট পরে আবার চেষ্টা করুন।' });
      const body = await readJson(req, 4096);
      if (typeof body.password === 'string' && safeEq(body.password, ADMIN_PASSWORD)) {
        fails.delete(ip);
        const t = makeToken();
        return sendJson(res, 200, { token: t.token, expires: t.expires });
      }
      recordFail(ip);
      await new Promise(function (r) { setTimeout(r, 500); });
      return sendJson(res, 401, { error: 'পাসওয়ার্ড ঠিক নেই' });
    }

    if (!pathname.startsWith('/api/admin/')) return sendJson(res, 404, { error: 'Not found' });
    if (!isAuthed(req)) return sendJson(res, 401, { error: 'লগইন করুন' });

    if (req.method === 'GET' && pathname === '/api/admin/config') {
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/packages') {
      const body = await readJson(req, 128 * 1024);
      const cur = Object.assign({}, (config.prod || {}).ff, { packages: body.packages });
      const prod = Object.assign({}, config.prod, { ff: sanitizeProd(cur) });
      await commit(Object.assign({}, config, { prod: prod }), 'Update FF Like packages', [], []);
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/product') {
      const body = await readJson(req, 128 * 1024);
      const p = PRODUCTS.filter(function (x) { return x.key === body.key; })[0];
      if (!p) return sendJson(res, 400, { error: 'প্রোডাক্ট পাওয়া যায়নি' });
      const patch = (body.patch && typeof body.patch === 'object') ? body.patch : {};
      const cur = Object.assign({}, (config.prod || {})[p.key]);
      ['name', 'title', 'pill', 'packages', 'rules'].forEach(function (f) {
        if (!(f in patch)) return;
        if (patch[f] === null || patch[f] === '') delete cur[f]; else cur[f] = patch[f];
      });
      const clean = sanitizeProd(cur);
      const prod = Object.assign({}, config.prod);
      if (Object.keys(clean).length) prod[p.key] = clean; else delete prod[p.key];
      await commit(Object.assign({}, config, { prod: Object.keys(prod).length ? prod : null }), 'Update product ' + p.key, [], []);
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/texts') {
      const body = await readJson(req, 32 * 1024);
      const T = Object.assign({}, config.texts);
      Object.keys(body.texts || {}).forEach(function (id) {
        const t = TEXTS.filter(function (x) { return x.id === id; })[0];
        if (!t) throw new Error('ভুল ফিল্ড');
        let v = String(body.texts[id] == null ? '' : body.texts[id]).trim().slice(0, t.max);
        if (t.url) v = cleanUrl(v);
        if (v) T[id] = v; else delete T[id];
      });
      await commit(Object.assign({}, config, { texts: Object.keys(T).length ? T : null }), 'Update texts', [], []);
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/upload') {
      const body = await readJson(req, Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 1024);
      if (IMG_KEYS.indexOf(body.kind) === -1) return sendJson(res, 400, { error: 'ভুল ধরন' });
      const kind = IMAGES[body.kind];
      const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
      if (!m) return sendJson(res, 400, { error: 'শুধু PNG, JPG বা WEBP ছবি দিন' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_UPLOAD_BYTES) return sendJson(res, 413, { error: 'ছবি ৩MB এর বেশি বড়' });
      const ext = detectImage(buf);
      if (!ext) return sendJson(res, 400, { error: 'ছবিটা ঠিক নেই' });
      const fname = kind.prefix + '-' + Date.now() + '.' + ext;
      const old = imgGet(config, body.kind);
      const next = Object.assign({}, config);
      imgSet(next, body.kind, fname);
      await commit(next, 'Update ' + kind.prefix, [{ name: fname, buf: buf }], old ? [old] : []);
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/quick') {
      const body = await readJson(req, 8 * 1024);
      const next = Object.assign({}, config, { quick: sanitizeQuick(body.items) });
      await commit(next, 'Update quick buttons', [], []);
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/banner') {
      const body = await readJson(req, Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 1024);
      const act = body.action;
      const list = bannerList().slice();
      const add = [], del = [];
      const idx = Number(body.index);
      const readImg = function () {
        const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
        if (!m) throw new Error('শুধু PNG, JPG বা WEBP ছবি দিন');
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > MAX_UPLOAD_BYTES) throw new Error('ছবি ৩MB এর বেশি বড়');
        const ext = detectImage(buf);
        if (!ext) throw new Error('ছবিটা ঠিক নেই');
        return { name: 'banner-' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.' + ext, buf: buf };
      };
      const okIdx = function (i) { return Number.isInteger(i) && i >= 0 && i < list.length; };
      if (act === 'add') {
        if (list.length >= MAX_BANNERS) throw new Error('সর্বোচ্চ ' + MAX_BANNERS + 'টি ব্যানার রাখা যাবে');
        const f = readImg(); add.push(f); list.push(f.name);
      } else if (act === 'replace') {
        if (!okIdx(idx)) throw new Error('ব্যানার পাওয়া যায়নি');
        const f = readImg(); add.push(f);
        const old = list[idx]; list[idx] = f.name;
        if (isUploaded(old)) del.push(old);
      } else if (act === 'delete') {
        if (list.length <= 1) throw new Error('কমপক্ষে ১টি ব্যানার রাখতে হবে');
        if (!okIdx(idx)) throw new Error('ব্যানার পাওয়া যায়নি');
        const old = list.splice(idx, 1)[0];
        if (isUploaded(old)) del.push(old);
      } else if (act === 'move') {
        const to = idx + (body.dir === 'up' ? -1 : 1);
        if (!okIdx(idx) || to < 0 || to >= list.length) throw new Error('সরানো যাচ্ছে না');
        const t = list[idx]; list[idx] = list[to]; list[to] = t;
      } else {
        throw new Error('ভুল কাজ');
      }
      const next = Object.assign({}, config, { banners: list });
      await commit(next, 'Update banners', add, del);
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/reset') {
      const body = await readJson(req, 4096);
      const next = Object.assign({}, config);
      let del = [];
      if (body.kind === 'packages' || body.kind === 'product') {
        const key = body.kind === 'packages' ? 'ff' : body.key;
        const prod = Object.assign({}, config.prod);
        if (body.kind === 'packages') { const c = Object.assign({}, prod.ff); delete c.packages; if (Object.keys(c).length) prod.ff = c; else delete prod.ff; }
        else delete prod[key];
        next.prod = Object.keys(prod).length ? prod : null;
      } else if (body.kind === 'text') {
        const T = Object.assign({}, config.texts); delete T[body.id];
        next.texts = Object.keys(T).length ? T : null;
      } else if (body.kind === 'quick') {
        next.quick = null;
      } else if (body.kind === 'banners') {
        del = (config.banners || []).filter(isUploaded);
        next.banners = null;
      } else {
        if (IMG_KEYS.indexOf(body.kind) === -1) return sendJson(res, 400, { error: 'ভুল ধরন' });
        const old = imgGet(config, body.kind);
        if (old) del = [old];
        imgSet(next, body.kind, null);
      }
      await commit(next, 'Reset ' + String(body.kind), [], del);
      return sendJson(res, 200, currentView());
    }

    if (req.method === 'POST' && pathname === '/api/admin/resync') {
      ready = initStorage();
      await ready;
      return sendJson(res, 200, currentView());
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e && e.message === 'too_large') return sendJson(res, 413, { error: 'ডাটা অনেক বড়' });
    if (e && e.message === 'bad_json') return sendJson(res, 400, { error: 'ভুল ডাটা' });
    return sendJson(res, 400, { error: (e && e.message) || 'কিছু একটা সমস্যা হয়েছে' });
  }
}

const server = http.createServer((req, res) => {
  Promise.all([ready, customersLoaded]).then(function () { handle(req, res); }).catch(function () {
    try { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('500 Internal Server Error'); } catch (e) {}
  });
});

function handle(req, res) {
  let pathname;
  try {
    pathname = decodeURI(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 Bad Request');
  }

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    const f = path.join(ROOT_DIR, 'admin.html');
    return fs.readFile(f, function (err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('admin.html পাওয়া যায়নি');
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.html'],
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer'
      });
      res.end(data);
    });
  }

  if (pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    if (!SAFE_FILE.test(name)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    return serveFile(path.join(UPLOAD_DIR, name), res, 'public, max-age=31536000, immutable');
  }

  // লগইন পেজ: /login, /login/ ও /login.html সরাসরি login.html খুলবে (হোমপেজে যাবে না)
  if (pathname === '/login' || pathname === '/login/' || pathname === '/login.html') {
    return fs.readFile(path.join(ROOT_DIR, 'login.html'), function (err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('login.html পাওয়া যায়নি');
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.html'],
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer'
      });
      res.end(data);
    });
  }

  if (pathname === '/' || pathname === '' || pathname === '/index.html' || pathname === '/FFX.html') {
    return sendHome(req, res);
  }

  const filePath = path.normalize(path.join(ROOT_DIR, pathname));
  const rel = path.relative(ROOT_DIR, filePath);
  const base = path.basename(filePath).toLowerCase();
  const insideData = filePath === DATA_DIR || filePath.startsWith(DATA_DIR + path.sep);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }
  if (insideData || BLOCKED_NAMES.has(base) || base.startsWith('.') || rel.split(path.sep).some(function (p) { return BLOCKED_DIRS.has(p) || p.startsWith('.'); })) {
    return sendHome(req, res);
  }

  // আগে public/ ফোল্ডারে খোঁজা হবে (যেমন /js/user-system.js → public/js/user-system.js), তারপর মূল ফোল্ডারে
  const pubPath = path.normalize(path.join(PUBLIC_DIR, pathname));
  const candidates = pubPath.startsWith(PUBLIC_DIR + path.sep) ? [pubPath, filePath] : [filePath];
  (function tryNext(i) {
    if (i >= candidates.length) {
      // ফাইল না পেলে: .js/.css/ছবি ইত্যাদির জন্য সঠিক 404 (হোমপেজের HTML নয়), বাকি পাথে হোমপেজ
      const ext = path.extname(pathname).toLowerCase();
      if (ext && ext !== '.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }
      return sendHome(req, res);
    }
    fs.stat(candidates[i], (err, stats) => {
      if (err || !stats.isFile()) return tryNext(i + 1);
      serveFile(candidates[i], res, 'public, max-age=3600');
    });
  })(0);
}

function serveFile(filePath, res, cache) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', cache || 'public, max-age=3600');
    stream.pipe(res);
  });
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    } else {
      res.end();
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (!ADMIN_PASSWORD) console.log('⚠️  FFX-PASS সেট করা নেই — /admin লগইন বন্ধ থাকবে');
  console.log(USE_GH ? 'Storage: GitHub (' + (GH_REPO || '?') + ' @ ' + GH_BRANCH + ')' : 'Storage: লোকাল (FFX-G সেট করা নেই)');
});

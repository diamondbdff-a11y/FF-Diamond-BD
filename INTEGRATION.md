# Integration guide

I could not see your existing `server.js` / HTML, so these files are **add-on modules**. Copy them into your repo (same folder names) and make the small edits below.

## 1. Files to copy

```
models.js
middleware/auth.js
routes/auth.js
routes/wallet.js
routes/orders.js
routes/adminExtra.js
services/wallet.js
services/pricing.js
services/paymentVerify.js
public/js/user-system.js
public/js/admin-extra.js
```

## 2. Install packages

```
npm i mongoose jsonwebtoken bcryptjs cookie-parser express-rate-limit google-auth-library
```

## 3. Edit your `server.js`

Add near the top (after `const app = express();`):

```js
const cookieParser = require('cookie-parser');
app.set('trust proxy', 1);          // required on Render (HTTPS proxy)
app.use(express.json());            // skip if you already have it
app.use(cookieParser());
```

Add **after** your MongoDB connection and **before** `app.listen`:

```js
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/wallet',  require('./routes/wallet'));
app.use('/api/orders',  require('./routes/orders'));
app.use('/api/admin-x', require('./routes/adminExtra'));
```

Make sure `public/` is served (`app.use(express.static('public'))`), which you most likely already do.

## 4. Add the scripts to your HTML

- Every customer page (home, checkout, etc.), before `</body>`:
  `<script src="/js/user-system.js"></script>`
- Your admin page, before `</body>`:
  `<script src="/js/admin-extra.js"></script>`

## 5. Environment variables (Render → Environment)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | you already have this (models use your existing mongoose connection) |
| `JWT_SECRET` | **required**, long random string |
| `ADMIN_KEY` | **required**, password for the new admin sections |
| `NODE_ENV` | `production` |
| `BKASH_NUMBER`, `NAGAD_NUMBER`, `ROCKET_NUMBER` | your merchant/personal numbers shown on Add Money |
| `GOOGLE_CLIENT_ID` | for Google login (see below). Leave empty to hide the Google button |
| `PRODUCTS_COLLECTION` | name of your products collection if not `products` |
| `MIN_ADD_MONEY` | optional, default 10 |
| `ALLOW_CLIENT_PRICE` | optional, `true` only if price lookup below doesn't match your schema (less secure) |

**Google login:** Google Cloud Console → APIs & Services → Credentials → Create *OAuth client ID* → Web application → add your Render URL (e.g. `https://yoursite.onrender.com`) under *Authorized JavaScript origins* → copy the Client ID into `GOOGLE_CLIENT_ID`.

## 6. Things you must check

1. **Existing `User` model.** If you already have a mongoose `User` model, `models.js` reuses it, so make sure it has `email`, `name`, `passwordHash`, `googleId`, `balance`, `role`. Otherwise add those fields.
2. **Price lookup (`services/pricing.js`).** Orders take the price from your database, not from the browser, so nobody can edit a price in dev tools. It scans your `products` collection for the package by `id/_id/slug/sku/name` (top-level or inside `packages/items/options/variants`). If your admin stores prices elsewhere, adjust that file.
3. **Package / UID detection.** `user-system.js` guesses the selected package (an element with class `selected`/`active` plus `data-id`, `data-name`, `data-price`) and the UID input. If your markup differs, add this to your checkout page and it will be used instead:
   ```js
   window.FFGetCheckout = () => ({ packageId: '...', packageName: '...', price: 120, uid: document.querySelector('#uid').value });
   ```
4. **Button detection.** Buttons are matched by their text (Login, Add Money, Home, My Account, My Orders, My Codes, My Transaction, Wallet Pay, Instant Pay). Or add `data-ff="addmoney"` etc. to any element. To show the name/balance exactly, add `data-user-name` / `data-wallet-balance` to those elements.
5. **Admin protection.** The new admin API uses `ADMIN_KEY`. If your `/admin` already has a login, you can replace `adminAuth` in `middleware/auth.js` with your own middleware.
6. **"Instant" payment.** There is no payment-gateway integration in your project, so Instant orders/top-ups are saved as **Pending** and approved by you. `services/paymentVerify.js` is the single place to plug in a gateway (UddoktaPay, RupantorPay, bKash API, etc.); when it returns `true`, add-money requests are approved automatically. Until then, please don't advertise it as automatic.
7. **Supabase.** The code uses MongoDB (mongoose). If you actually store data in Supabase/Postgres, tell me and I'll port the models.

## 7. How the flows work

- **Add Money:** user submits method + sender number + TrxID → `WalletRequest` (pending). Admin approves in `/admin` → balance increases atomically once and a transaction is logged. Reject → user sees the note. Each TrxID can be used only once.
- **Wallet Pay:** balance is debited atomically (never negative), order saved as `Pending`. If admin rejects, the amount is refunded automatically.
- **Instant Pay:** order saved with via/sender/TrxID as `Pending`. On reject, admin can choose to refund to wallet.
- **Admin Complete:** marks the order Completed and can attach a code/note, which appears in the user's My Orders and My Codes.
- **Redeem codes:** admin generates codes in the Codes tab; users redeem them in My Codes to get wallet balance.

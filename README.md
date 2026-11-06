# YorLedger

Ledger and billing for saree and silk shops: sales, purchases, job work, returns,
dues, cash / cheque / NEFT payments, GST reports. In plain words, in English,
Telugu, Tamil, Kannada and Hindi.

Ships as a **website**, an **Android APK** and a **desktop app**, with releases on GitHub.

## Architecture (free Firebase Spark plan)

| Part | What |
| --- | --- |
| `web/` | React + Vite + Tailwind app. The same build runs on the web, in the APK (Capacitor) and on desktop (Electron). |
| `shared/` | Pure TypeScript: GST split, rounding, returns, GSTIN / phone / invoice validation, with unit tests. |
| `firestore.rules` | **This is the backend.** Tenant isolation, the admin approval gate, SALE invoice uniqueness, UTR uniqueness, payment ≤ due, immutable tax snapshots, append-only payments / returns / audit log. |
| `scripts/set-admin.mjs` | One-time admin provisioning via a Firebase custom claim. There is no admin signup. |

There is no server and no Postgres. Money is stored as integer paise and GST as basis points.
Every bill keeps its own GST rate and tax mode snapshot, and `grand_total` never changes.
Returns and payments move `returned_total` / `paid_total`, and `amount_due` is always
`grand_total − paid_total − returned_total`. Firestore's offline cache lets the app keep
working on a weak connection.

### Firestore layout

```
users/{uid}                        shop_id, role
users/{uid}/notifications/{id}     in-app inbox
shops/{shopId}                     profile, status PENDING | APPROVED | REJECTED, default_gst_bp
shops/{shopId}/private/document    verification JPEG (owner + admin only)
shops/{shopId}/verifications/{id}  admin review rounds
shops/{shopId}/parties/{id}
shops/{shopId}/bills/{id}          kind, invoice_no, items, tax snapshot, totals
shops/{shopId}/saleInvoices/{no}   SALE invoice number lock
shops/{shopId}/payments/{id}       CASH | CHEQUE | NEFT
shops/{shopId}/utrs/{utr}          UTR lock
shops/{shopId}/returns/{id}
shops/{shopId}/audit/{id}
shops/{shopId}/settings/{doc}
```

## Run locally

```bash
npm install
npm test        # shared domain tests
npm run dev     # http://localhost:5173
```

`web/.env.production` holds the Firebase web config. It identifies the project and is not a secret;
access is controlled by `firestore.rules`.

## One-time setup (project owner)

1. Firebase console → **Firestore Database** → create a database (production mode).
2. Authentication → enable **Email/Password** (and Google for the website).
3. Deploy the rules and indexes: `npx firebase-tools deploy --only firestore`
4. Make the first admin. The account must exist in Firebase Auth:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-admin.mjs you@example.com
   ```
   Keep `service-account.json` out of git. It is ignored.

## Apps and releases

| Platform | How it is built | Where |
| --- | --- | --- |
| Website | `npm run build` → Firebase Hosting | `deploy-web.yml` on every push to `main` (needs secret `FIREBASE_SERVICE_ACCOUNT`) |
| Android APK | Capacitor (`web/android`) | `release.yml` |
| Windows / macOS / Linux | Electron (`desktop/`) | `release.yml` |

**Make a release:** `git tag v1.0.0 && git push origin v1.0.0`. GitHub Actions builds the APK, installers and a web zip,
then publishes them as a GitHub Release. Tags starting with `v0.` are marked as pre-releases.

- APK signing: add secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  Without them the APK is signed with a debug key: it installs fine, but you cannot later switch to a real key
  without users reinstalling. Create the real key before sharing the APK widely.
- Desktop builds are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper show a warning on first launch.

Local runs: `npm run dev` (website) · `cd desktop && npm start` (desktop, after `npm run build`) ·
`cd web && npx cap sync android && npx cap open android` (Android Studio).

### Reminders
Bills with a reminder date notify at **08:00 IST** on *remind date − lead days* while money is due, once per bill and date.
On Android they are scheduled on the phone and fire even when the app is closed. On desktop and the website they appear while the app is open.

## Translations

The Telugu, Tamil, Kannada and Hindi strings in `web/src/i18n/strings.ts` were drafted
by machine and **must be checked by a native speaker** before release. A missing key falls back to English.

## GST disclaimer

Reports are accounting summaries, not a filed GST return. Have an accountant check them before filing.

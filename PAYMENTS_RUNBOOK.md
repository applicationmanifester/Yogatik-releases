# Payments — from here to first rupee

Written 30 Aug 2026, after the four code blockers were fixed. Everything below is
account setup and configuration; **no more application code is required**.

---

## The thing to understand first

**The long pole is provider approval, not engineering.** Razorpay KYC is 1–7 days
and rejects on trivial name mismatches; Paddle is 3–7 days and reviewers report it
often wants ~3 months of prior payment-processing history — which a new product does
not have.

That points at an obvious sequencing decision: **launch India-only on Razorpay first.**
It is the market you priced for (₹99/₹999), the market you can actually get approved in
without trading history, and it lets you prove the whole pipeline end to end before
Paddle's review becomes a blocker. Ship international when Paddle clears — the code
already handles both and `suggestedRegion()` already routes by timezone.

Do not wait for both. Waiting for both means shipping neither.

---

## Step 0 — the licence keypair (blocking, 2 minutes, do it now)

Nothing else works until this is right, and the key currently baked into the app is
almost certainly orphaned — its private half was never saved anywhere.

```bash
node -e "const{generateKeyPairSync}=require('crypto');\
const{publicKey,privateKey}=generateKeyPairSync('ed25519');\
console.log(publicKey.export({type:'spki',format:'pem'}));\
console.log(privateKey.export({type:'pkcs8',format:'pem'}))"
```

- **Public half** → replace `LICENSE_PUBLIC_KEY` in
  `frontend/electron/entitlementCore.cjs`. It ships inside the app; that is fine.
- **Private half** → `firebase functions:secrets:set LICENSE_PRIVATE_KEY`
  (paste when prompted). It must never be committed, and never leave the function.

If these two do not match, every licence verifies-false and **every paying customer
stays locked** — with, now, `licenseError` in the response saying exactly that.

---

## Step 1 — Razorpay account (start today, it is the slowest thing)

1. Sign up at dashboard.razorpay.com and start KYC.
2. Documents: business PAN, authorised signatory PAN + Aadhaar, bank proof, business
   address proof, and your website/app details.
3. **The name must match character-for-character** across PAN, bank account, GST and
   the registration certificate. "Pvt. Ltd." vs "Private Limited" is a rejection.
   This is the single most common cause of a week-long delay.
4. eKYC / video verification puts most merchants through in 1–3 days rather than 3–7.
5. Ask support to enable **Subscriptions** and **UPI Autopay** — recurring is not
   always on by default, and UPI Autopay e-mandate is what makes ₹99/month viable in
   India. Cards alone will underperform badly at that price.

While KYC is pending you get **test-mode keys immediately**. Use them for Step 3 — do
not sit idle waiting for activation.

---

## Step 2 — create the two plans ✅ DONE (test mode)

| Plan | Amount | Interval | Test-mode id |
|---|---|---|---|
| Yogatik_Monthly_IN | ₹99 | Every month | `plan_TWGrFGVIXd9oBh` |
| Yogatik_yearly_IN | ₹999 | Every year | `plan_TWGsYqOonGdBCv` |

Both are wired into `functions/.secret.local`.

⚠️ **These ids were transcribed from a screenshot.** Copy them from the dashboard and
diff before the first real attempt — `O`/`0` and `I`/`l`/`1` are indistinguishable in
most fonts, and a single wrong character fails as a generic Razorpay error that tells
you nothing about which field was wrong.

⚠️ **Live mode will issue different ids for the same two plans.** Create them again
after activation and set the live values in Secret Manager. A test plan id in
production is a silent failure.

---

## Step 2a — credentials are already in place for the emulator

`functions/.secret.local` holds the Razorpay **test** keys and is gitignored, so
`firebase emulators:start` picks them up with no further setup. `functions/.env.example`
is the committed template listing every secret the deployment needs.

Production does **not** read that file — deployed functions read Secret Manager, so each
name still has to be set with `firebase functions:secrets:set` (Step 3).

> Rotate the test key secret when convenient. It was pasted into a chat, and while a
> `rzp_test_` secret cannot move real money, the habit is what matters — the same
> paste with a `rzp_live_` key would be a genuine incident.

## Step 3 — configure the backend

```bash
cd functions
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_PLAN_MONTHLY     # plan_...
firebase functions:secrets:set RAZORPAY_PLAN_YEARLY      # plan_...
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET   # you invent this; paste the same string into the dashboard
firebase deploy --only functions
```

Requires the **Blaze** plan — Cloud Functions v2 will not deploy on Spark. At your
volume the bill is pennies, but it needs a card on the Firebase project.

Then Razorpay Dashboard → Settings → Webhooks → add:

- **URL** `https://asia-south1-yogatik.cloudfunctions.net/razorpayWebhook`
- **Secret** the `RAZORPAY_WEBHOOK_SECRET` you just set
- **Events** `subscription.charged`, `subscription.activated`,
  `subscription.authenticated`, `subscription.resumed`, `subscription.halted`,
  `subscription.cancelled`

`halted` matters as much as `cancelled`: a failing e-mandate halts rather than cancels,
and treating only `cancelled` as the end leaves a non-paying user licensed forever.

---

## Step 4 — configure the checkout page

```bash
cd frontend/public
cp checkout-config.example.json checkout-config.json
```

For India-only launch, `razorpay.createSubscriptionUrl` is the only field that matters:

```json
{ "razorpay": { "createSubscriptionUrl": "https://asia-south1-yogatik.cloudfunctions.net/createSubscription" } }
```

Leave the `paddle` block out until Paddle is approved — the page reports
"not configured on this deployment yet" and charges nothing, which is the correct
behaviour for a provider you cannot yet accept money through.

Then `deploy.bat` (build + hosting + rules). Verify the rewrite landed:
`https://yogatik.web.app/checkout` must show the checkout card, **not the chat app**.
If you see the chat app, the rewrite is below the `**` catch-all.

---

## Step 4a — local end-to-end, without deploying

```bash
cd functions && firebase emulators:start --only functions
```

Point `frontend/public/checkout-config.json` at the emulator
(`http://127.0.0.1:5001/yogatik/asia-south1`), then `npm run dev` in `frontend/` and open
`/checkout?plan=in_monthly&provider=razorpay&uid=<any>#t=<a real ID token>`.

The ID token has to be real — `createSubscription` verifies it. Get one from the app's
devtools console: `await (await import('/src/firebaseAuth.js')).getIdToken()`.

Razorpay's own test credentials (from the dashboard's setup wizard — use these rather
than the generic ones, they are the pair tied to your account):

| Method | Value |
|---|---|
| Card | `4100 2800 0000 1007` · CVV `123` · Expiry `12/26` |
| UPI | `test@razorpay` |

Prefer the **card** for the first run. UPI Autopay is an e-mandate flow with an extra
authorisation step, so if something is wrong you learn less about where.

### What the dashboard's "Do a test transaction" step actually needs

Only a successful payment through your own integration. It does **not** need the webhook
secret or the licence keypair — those decide whether the *app unlocks*, which is a later
and separate problem. So this order works:

1. `firebase emulators:start --only functions`
2. Point `checkout-config.json` at `http://127.0.0.1:5001/yogatik/asia-south1`
3. `npm run dev` in `frontend/`, open the checkout URL above, pay with the test card
4. Confirm the subscription appears under Dashboard → Subscriptions
5. Click **I have done the transaction** in the wizard

Then come back for the webhook secret and the keypair, which is what turns a successful
payment into an unlocked app.

## Step 4b — build and host

```bash
npm install -g firebase-tools          # once
firebase login                          # once, opens a browser

cd frontend && npm run build            # → frontend/dist
cd .. && firebase deploy --only hosting,functions,firestore:rules
```

`deploy.bat` at the repo root does the same three in order.

### Verify the build BEFORE deploying

The checkout page is new, and Vite copies `public/` wholesale — so the failure mode is
that it silently isn't there.

```bash
ls frontend/dist/checkout.html frontend/dist/checkout-config.json
```

Both must exist. `checkout-config.json` is gitignored, which is correct for git and
irrelevant to the build — Vite copies it from `public/` regardless. But it means **CI
will not have it**: a GitHub-Actions build produces a checkout page that reports "not
configured on this deployment yet". Deploy from your machine, or add the file as a CI
secret, until you decide which.

### Verify hosting AFTER deploying

| Check | Expected |
|---|---|
| `https://yogatik.web.app/checkout` | the checkout card — **not** the chat app |
| `…/checkout-config.json` | the JSON, not a 404 and not index.html |
| `…/checkout?plan=in_monthly&provider=razorpay&uid=x` | "This checkout link is missing its sign-in token" |

That third one passing is the proof the page is live and its guards work: it means the
page loaded, parsed its query, found no token in the fragment, and refused — rather than
the SPA catch-all quietly serving the app.

### CSP

`firebase.json` now allows `checkout.razorpay.com` and `cdn.paddle.com` in `script-src`
and the Razorpay/Paddle frames in `frame-src`. The policy is still **Report-Only**, so
nothing is blocked today either way — but the repo's stated plan is to promote it to an
enforced CSP once clean, and doing that without these entries would break payments with
an error the app cannot catch or report. Defused in advance.

## Step 5 — test in test mode, before activation

1. Build the desktop app, sign in, let the trial expire (or set
   `trialStartedAt` back in the `accounts/{uid}` doc via the Firebase console).
2. Click Upgrade → Continue to checkout. The browser must open the **checkout page**.
3. Pay with a Razorpay test card. Watch `firebase functions:log` — you should see the
   webhook arrive and *not* say `no uid`.
4. Confirm `accounts/{uid}` flips to `plan: "pro"`.
5. Return to the desktop app. It polls every 3s for 2 minutes; Pro should unlock
   without a restart.

**If it does not unlock, look at `licenseError` in the refresh response first.** That
field exists specifically to tell you whether the failure is the keypair, the server,
or the sign-in — the three used to be indistinguishable.

---

## Step 6 — go live

1. Swap to live keys and live plan ids, redeploy the functions.
2. Point the live webhook at the same URL.
3. **Make one real ₹1 purchase from a plan you create for the purpose, on a machine
   that is not your dev box.** Cancel and refund it afterwards.

Nothing before this proves the pipeline. The gap between "the code is correct" and
"the money arrives" is exactly the sort of configuration that looks fine and isn't.

---

## Step 7 — Paddle, when you get to it

Apply early even though you will ship without it; the review is the wait.

- Have live legal pages first: Terms, Privacy, Refund policy, and a DPA. Reviewers
  check them, and your `/terms` and `/privacy` routes already exist.
- Your **legal entity name must match your website exactly.**
- Expect 3–7 business days, and expect questions if you have no processing history.
  Having a few months of Razorpay volume behind you makes this materially easier —
  another reason India goes first.

Once approved: create the two prices at **$9/mo, $99/yr** — NOT the $2/$12 this
runbook originally proposed (see the note below; the code has already moved past that
draft number and this file hadn't caught up). Creating the live prices at any other
amount means a customer sees "$9/month · Save $9" in the app, clicks buy, and lands on
a Paddle checkout charging a different number — a mismatch a reviewer or a customer
will notice immediately. Add the `paddle` block to `checkout-config.json`, set
`PADDLE_WEBHOOK_SECRET`, point the webhook at `.../paddleWebhook`, redeploy hosting.
No code changes.

---

## What is already handled, so you do not re-litigate it

- Entitlement is granted **only** by the webhook. The post-payment redirect is a
  browser navigation and can be forged; nothing in the app trusts it.
- Webhook signatures are verified over `req.rawBody` with `timingSafeEqual`.
  (`JSON.stringify(req.body)` re-orders keys and the HMAC never matches — a bug that
  looks exactly like the provider sending nothing.)
- Razorpay timestamps are seconds; they are multiplied to ms before storage.
- `accounts/{uid}` is `allow write: if false`. Only the Admin SDK writes it.
- Licence tokens are Ed25519, capped at `min(period end, now + 14 days)`, with a
  monotonic high-water mark that survives sign-out so clock rollback does not reset it.
- The keychain is `FREE_ALWAYS`: a lapsed customer can still read their own API keys.
  Do not gate it — it would look like the app deleted them.
- Checkout opens in the **real browser** via `shell.openExternal`, never a webview.
- The ID token reaches the checkout page in the URL **fragment**, so it never appears
  in a server log or a Referer header.

---

## The international price decision — already made, and already shipped

This used to be an open decision to make before Step 6: $2/month needs ~50,000 paying
users for $1.2M ARR versus ~8,000 at a higher price, and Paddle's fixed $0.50 per
transaction eats a quarter of a $2 charge before anything else. It is resolved now —
`frontend/src/entitlement.js`'s `PLANS.intl` and `checkout.html`'s `LABELS` both hardcode
**$9/month, $99/year** (with the same reasoning inline in `entitlement.js`), and that is
what the live UI already shows every visitor, sandbox or not. India at ₹99/₹999 needed
no change.

Nothing left to decide here — only to make sure the live Paddle catalog is created to
match ($9/mo, $99/yr), per Step 7 above, rather than at an earlier draft number.

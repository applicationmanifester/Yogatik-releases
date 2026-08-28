# Yogatik Pro — freemium design (2026-08-25)

Status: **IMPLEMENTED.** The client half is built, tested and building clean. The
server half is written but **not deployed** — it needs a Firebase Blaze plan, a
generated keypair, and provider accounts. See §11 for what is left to you.

The two open questions from the draft were resolved by taking the recommendation,
because both are one-line reversals and neither was worth blocking on:

- **§2.4 file picker: ALLOWED in the free tier.** Otherwise the free desktop build
  is worse than the website, which contradicts the rule it implements.
- **§7 pricing: option A.** ₹99/₹999 India, **$2/month and $12/year** international.
  Change `PLANS` in `src/entitlement.js` to move it.

Still open: **read-only git in the free tier** (§10.3) is currently gated, per your
"no file access at all". Flip the `git_*` rows in the matrix to `F` to change it.

## Where the code is

| Piece | File |
|---|---|
| Capability matrix, token, state machine (PURE) | `frontend/electron/entitlementCore.cjs` |
| Gate, disk cache, refresh, IPC | `frontend/electron/entitlement.cjs` |
| Renderer client + pricing | `frontend/src/entitlement.js` |
| Paywall | `frontend/src/components/UpgradeModal.jsx` |
| Locked dock state | `frontend/src/components/WorkspacePanel.jsx` |
| Licence server + webhooks | `functions/index.js` |
| Rules | `firestore.rules` |
| Tests (20) | `frontend/src/entitlement.test.js` |
| Personal build | `frontend/scripts/build-personal.mjs`, `electron-builder.personal.json` |

## 0. Decisions locked

- Free/expired desktop == web app. **No file access at all.** (One carve-out proposed in §2.4 — read it before agreeing.)
- 30-day trial from signup, per account.
- Razorpay for India, Paddle (merchant of record) for the rest of the world. Annual-first.
- Lapsed payment → straight back to free tier, no data loss, no destructive action.

---

## 1. Threat model — read this first

The desktop app is Electron. `app.asar` is a zip; IndexedDB is a text file; the
renderer is inspectable. **A client-side licence is a speed bump, not enforcement.**
Anyone who wants to bypass this can, in under an hour.

That is the correct trade at ₹99/month — the effort to crack exceeds the price — but
it dictates where effort goes:

- DO put the gate at ONE main-process choke point. Cheap, auditable, cannot silently regress.
- DO sign the licence server-side so a forged token needs the private key, not a text edit.
- DO NOT obfuscate the bundle, ship native anti-tamper, or phone home per action. Weeks of work, days of resistance, and it makes the app slower and creepier for the paying 99%.
- DO NOT let the payment path degrade the offline story. The product's pitch is local and private; a licence check that requires network on every launch destroys that.

Explicitly out of scope: asar repacking, DevTools patching, a rebuilt binary,
one person running many free accounts. Accepted losses.

---

## 2. Capability matrix

This is the heart of the design. Gating `fs_*` alone is a hole: `terminal_run` with
`cat`/`echo` **is** file access, `proc_start` is file access with extra steps, and
`mcp_stdio_start` spawns arbitrary local processes. The unit of gating is a
**capability set**, enumerated exhaustively against `preload.cjs` (23 exposed bridges).

### 2.1 PRO — gated when trial expires or subscription lapses

| Surface | Why |
|---|---|
| `__TAURI__.invoke` → all `fs_*` | the file operations themselves |
| → `roots_*` | granting a working folder is the door |
| → `journal_*` | reads snapshotted file bytes |
| → `git_*` (incl. reads) | reads and writes the repository |
| → `proc_*` | long-running local processes |
| → `hooks_*` | executes project scripts |
| → `watch_*`, `mcp_stdio_*` | filesystem + local process spawn |
| `__YOGATIK_TERMINAL__` | shell == everything above |
| `__YOGATIK_PTY__` | interactive shell |
| `__YOGATIK_PROCESS__` | list/kill OS processes |
| `__YOGATIK_WATCHER__` | filesystem events |
| `__YOGATIK_SEARCH__` | sidecar indexes the granted folder |
| `__YOGATIK_BROWSER__` | real browsing context, not fetchable from web |
| `__YOGATIK_COMPANION_INPUT__` | cross-app mouse/keyboard |
| `__YOGATIK_COMPANION__.captureScreen` / `.executeAction` | native capture + OS actions |
| `__YOGATIK_CLIPBOARD__` | reads what other apps copied |
| `__YOGATIK_SCHEDULER__`, `__YOGATIK_SUBAGENT__` | run unattended work that touches the above |
| `__YOGATIK_DND__.getPathForFile` | turns a dropped file into a real OS path |

### 2.2 FREE — everything the web build can already do

Chat, all 65 browser tools, Pyodide, Tesseract, vision, live mode, image/video/audio
generation, retrieval over uploaded documents, IndexedDB history, key sync, projects,
skills, agents, workflows, MCP over **HTTP** (not stdio).

Companion screen-watching stays free **via `getDisplayMedia`** — the web build already
has it, and `companion/capture.js` already tiers `native` → `display-media` → `null`.
Only the native path is gated, so the toggle keeps working and says which it is using.

### 2.3 FREE ALWAYS — even when expired (do not gate these)

- **`__YOGATIK_KEYCHAIN__`.** This is a trap. `db.js` transparently seals `apikey_*`
  values with a `kc.v1:` prefix via DPAPI/safeStorage. Gate the keychain and a paying
  user who lapses **cannot read their own API keys** — the app looks like it deleted
  them. Never gate it.
- `__YOGATIK_DESKTOP__` window controls, `openExternal`, `getSystemInfo`, `showItemInFolder`.
- `__YOGATIK_NOTIFY__`, `__YOGATIK_MENU__`, tray, updater, `__YOGATIK_COMPANION_WIN__` toggle.
- The whole renderer. Nothing in `src/` is gated directly (see §3).

### 2.4 The one carve-out I recommend against "no file access at all"

`__YOGATIK_DIALOG__` open + read-picked (2 MB cap). This is the user explicitly
handing the app one file through the OS picker — functionally identical to
`<input type=file>`, which **the web build already has**. Gating it makes the free
desktop build strictly *worse* than the web app, which contradicts the rule it is
meant to implement ("expired == web app").

Proposal: allow `dialog:open` + `dialog:read-picked`; gate `dialog:save` and
`dialog:pickFolder` (a folder is a grant, not a file). Costs nothing, removes a
"why is your desktop app worse than your website" review.

**Decide this before build.**

---

## 3. Enforcement architecture

### 3.1 One choke point, in main

```
electron/entitlement.cjs      (impure: disk, network, clock)
electron/entitlementCore.cjs  (PURE: capability map, token verify, state machine)
```

Same split as `rootsCore.cjs` / `roots.cjs` and `browserTree.cjs` — the pure half is
the only reason any of this is testable under vitest, which cannot load a module that
`require('electron')`.

Every gated `ipcMain.handle` is registered through a wrapper:

```
registerGated('fs_write', CAP.FILES, handler)
```

which returns `{ success:false, error:..., locked:true, capability:'files' }` before
the handler runs. Not a per-handler `if` — that is how one of the next handlers ships
ungated. The preload `FS_COMMANDS` whitelist is the precedent: a name missing from it
is unreachable, and that property is what this reuses.

### 3.2 Why not in the renderer or the tool registry

- The renderer is the *least* defended surface and the one most likely to drift.
- `tools/index.js` gating would leave the IPC reachable from DevTools directly.
- A tool-by-tool list goes stale the moment a capability is added. The matrix in §2 is
  asserted **exhaustively** by a test (§8), so an unclassified new channel fails CI.

### 3.3 The model must be told

`agent.js buildSystemPrompt` → `platformBlock()` already states the runtime, and
CLAUDE.md records the bug where it claimed desktop powers the build did not have and
the model believed it. Same failure applies inverted: an expired install whose prompt
still says "you have a real shell and filesystem" will confidently promise to edit a
file and then emit a refusal.

`platformBlock()` gains a third state: `desktop-locked` — "file, shell and browser
tools are present but locked; say so plainly and offer the upgrade, do not claim the
task is impossible." Mirrors the existing web wording.

`diagnoseError` gains an `entitlement` bucket, checked **before** `workspace` — otherwise
"locked" surfaces as "No working folder for this chat" and sends the user to grant a
folder that will not help.

---

## 4. Licence token

Ed25519 detached signature. Public key baked into `entitlementCore.cjs`; private key
lives only in the Cloud Function. Verified with node `crypto.verify(null, …)` — no
network, no dependency.

```jsonc
{
  "v": 1,
  "sub": "<firebase uid>",
  "plan": "pro" | "trial" | "free",
  "iat": 1756..., // issued  (server clock)
  "exp": 1757..., // token expiry, NOT subscription expiry
  "per": 1759...  // current period end (informational, for the UI)
}
```

**`exp` is short on purpose: `min(periodEnd, iat + 14d)`.** The client refreshes daily
when online.

- Long-lived token → one purchase, cancel, use forever.
- Network-required token → the offline promise is dead.
- 14-day offline grace → a plane, a bad week of wifi, or a Firebase outage do not lock a paying customer out. A cancelled user keeps access ≤14 days. Acceptable.

Storage: `userData/license.json` (plaintext — the signature is the integrity, not secrecy).

**Clock rollback:** `exp` is compared to the system clock, which the user owns.
Mitigation is one line: persist `highWaterMark` = the greatest `iat` ever seen; if
`Date.now() < highWaterMark`, treat as offline-expired and force a refresh. Defeats
naive date rollback, does not pretend to defeat a determined one.

---

## 5. Trial and state machine

`entitlementCore.resolveState({ token, now, highWaterMark, online })` is pure and
returns exactly one of:

| State | Meaning | Capabilities |
|---|---|---|
| `trial` | within 30 days of `trialStartedAt` | PRO |
| `pro` | active subscription | PRO |
| `grace` | token valid, `per` passed, refresh not yet succeeded | PRO (≤14d) |
| `locked` | expired trial, lapsed sub, or no token | FREE |
| `anonymous` | not signed in | FREE |

Rules:

- **`trialStartedAt` is a server timestamp written once by a Cloud Function**, never by
  the client. Client clock = user-controlled; a client-written trial start resets with
  the system date.
- Trial is **per account**, not per device. Reinstall does not reset it. One person with
  five Google accounts gets five trials — accepted (see §1). Hardware-id binding is
  possible but is a privacy cost for a loss we already accepted.
- The app currently boots **with no signup at all** (zero-key boot, anonymous local
  storage). That stays. Signing in is required only to start the trial / hold a licence.
  Do not put an auth wall on first run; it would tank activation for a free tier that is
  genuinely useful without an account.
- Lapse is **never destructive**: granted roots, journal, conversations and keys are all
  retained. Re-subscribing restores access with no re-grant. A billing failure that
  looked like data loss is unrecoverable as a support problem.

---

## 6. Payments

### 6.1 Routing

Two providers, split by billing country of the **payment method** — not by IP. IP is
one VPN away; the instrument is not. The pricing page shows both, labelled; the choice
of checkout *is* the geo enforcement, so no geolocation code exists.

### 6.2 India — Razorpay

- Razorpay **Subscriptions** on top of the gateway. ~2% gateway + ~0.99% subscription fee, + 18% GST on the fees.
- **UPI Autopay / e-mandate is the path, not cards.** Recurring cards in India are painful; UPI Autopay is what people actually complete.
- RBI e-mandate framework: ₹15,000 ceiling without additional-factor auth per debit (₹99 is far below), and a **mandatory 24-hour pre-debit notification** — Razorpay Subscriptions handles the notification.
- Webhooks → Cloud Function → Firestore: `subscription.charged`, `subscription.halted`, `subscription.cancelled`, `subscription.pending`.
- Prerequisite: a registered Indian entity and GST registration for payouts.

### 6.3 Rest of world — Paddle (merchant of record)

- 5% + $0.50. Paddle is the seller of record: it handles US sales tax, EU VAT, chargebacks and invoicing. That is the actual reason to use it — not the payment rails.
- Webhooks → Cloud Function: `subscription.created|updated|canceled`, `transaction.completed`.
- Prerequisite: Paddle seller approval (a review, not instant).

### 6.4 Checkout from a desktop app

Never host a card form inside Electron. Flow:

1. Renderer asks the Function for a checkout URL, carrying a short-lived signed `state`.
2. `shell.openExternal(url)` → the user's real browser.
3. Provider redirects to a hosted success page.
4. Return by **both** paths, because either alone breaks: a `yogatik://` custom protocol deep link (instant, needs single-instance handling — already implemented for the second-launch focus), and a poll of the Function every 3s for 2 min as the fallback when the protocol handler is not registered.
5. Entitlement is granted by the **webhook**, never by the redirect. A redirect is a browser navigation and can be forged; the webhook is the money.

---

## 7. Pricing

Fee math on the plan as stated:

| SKU | Gross | Fees | Net | Margin |
|---|---|---|---|---|
| ₹99 / month (Razorpay) | ₹99 | ~₹3.5 | ~₹95.5 | 96% |
| ₹999 / year (Razorpay) | ₹999 | ~₹35 | ~₹964 | 96% |
| $1 / month (Paddle) | $1.00 | $0.55 | **$0.45** | **45%** |
| $10 / year (Paddle) | $10.00 | $1.00 | $9.00 | 90% |

The fixed $0.50 is what breaks international monthly. Three ways out, pick one:

- **(A) Recommended.** International annual **$12** as the headline, international monthly **$2**. India stays ₹99/₹999. Net ≈ $1.45/mo and $10.40/yr. Still trivially cheap; nobody churns over $1.
- (B) Keep $1/$10 exactly and eat 45% on international monthly as customer acquisition.
- (C) Annual-only internationally. Best margin, biggest ask from a first-time buyer.

On "a payment method that charges the user, not me": Razorpay does support a
**Customer Fee Bearer** convenience fee, but a visible ₹2 surcharge on a ₹99
subscription reads as nickel-and-diming, and card-network rules restrict surcharging in
India regardless. MoRs deduct from payout with no customer-facing option at all. The
working version of "the user pays the fee" is **price it in and lead with annual** —
identical economics, no surcharge line, no compliance question.

*Not legal or tax advice. GST registration, the e-mandate framework and MoR tax
treatment are worth an hour with a CA before taking money.*

---

## 8. Tests

`entitlement.test.js` (pure, node env):

1. **Exhaustive matrix.** Every channel in `preload.cjs`'s `FS_COMMANDS` and every `exposeInMainWorld` bridge is classified `PRO` | `FREE` | `FREE_ALWAYS`. An unclassified name **fails**. This is the `schemaContract.test.js` pattern and is the only thing that stops the next capability shipping ungated.
2. **`terminal_run` is PRO.** Named explicitly, because it is the hole that makes a files-only gate meaningless.
3. **`__YOGATIK_KEYCHAIN__` is FREE_ALWAYS.** Named explicitly, because gating it locks users out of their own API keys.
4. Token: valid, expired, wrong-uid, tampered payload, tampered signature, wrong key → each returns the right state, never a throw.
5. Clock rollback: `now < highWaterMark` → `locked`, not `pro`.
6. State machine: trial boundary at exactly 30d, grace at exactly 14d, lapse mid-grace, resubscribe from `locked`.
7. **Mutation check** — flipping one entry in the matrix must fail the suite. A green contract test that cannot fail is worse than none (CLAUDE.md, `dbContract.test.js`).

Plus: `platformBlock()` emits `desktop-locked` wording; `diagnoseError` puts entitlement before workspace.

---

## 9. Build order

1. `entitlementCore.cjs` + `entitlement.test.js` — matrix and state machine, no network, no UI. Nothing else is safe to build first.
2. `registerGated()` wrapper + wire every handler in §2.1. Ship behind a dev flag defaulting to PRO, so nothing changes for anyone yet.
3. Prompt + error plumbing (§3.3). Without this the locked build lies to its own model.
4. Paywall UI: locked-state affordances in the workspace dock, upgrade modal, account/billing panel. Wired to a fake toggle.
5. Firebase: Firestore schema, rules denying client writes to `plan`/`trialStartedAt`/`currentPeriodEnd`, `startTrial` + `issueLicense` + `refreshLicense` callables, Ed25519 keypair (Functions require the Blaze plan for outbound network).
6. Paddle first — sandbox is self-serve and instant, and it validates the whole webhook→Firestore→token→gate loop.
7. Razorpay second — needs the entity, GST and e-mandate setup, and blocks on paperwork rather than code.
8. Flip the dev flag.

---

## 11. Your build — the personal edition

```
cd frontend
npm run electron:build:personal     →  release-personal/Yogatik-Personal-Setup.exe
npm run electron:dev:personal       →  run it unpackaged, everything on
```

`YOGATIK_EDITION=personal` makes `installGate` a **no-op** — the wrapper is never
applied, so there is no licence check, no sign-in requirement, no network call and
no state to expire. Every capability is on.

It is a **build variant of the same source, not a second copy of the repo.** A fork
of a 2,500-module app is a fork of every future fix and diverges within a week; the
personal build would quietly stop receiving the work done on the real one.

- Different `appId`, so it installs **beside** the store build rather than upgrading
  over it. Two apps, two userData folders, two independent chat histories and key
  vaults — importing between them is a backup file, not automatic.
- The title bar shows a **PERSONAL** badge. Both installed at once is exactly when
  you need to tell them apart at a glance.
- `publish: null` and three tests assert CI never builds or uploads it. If that
  artifact ever reached a Release the product would be free for everyone, silently,
  and the only symptom would be revenue that never arrives.

## 12. Before this can take money

Nothing below is code, and none of it is done:

1. **Generate the licence keypair.** The command is at the top of `functions/index.js`.
   Public half → `LICENSE_PUBLIC_KEY` in `entitlementCore.cjs` (currently a working
   dev key — **replace it**). Private half → `firebase functions:secrets:set
   LICENSE_PRIVATE_KEY`. It must never be committed; `.gitignore` covers `*.pem`.
2. **Firebase Blaze plan.** Functions need outbound network. `cd functions && npm i`,
   then `firebase deploy --only functions,firestore:rules`.
3. **`VITE_LICENSE_API`** → your deployed function base URL, and `VITE_CHECKOUT_BASE`
   → the hosted checkout page (which does not exist yet — it is one static page that
   takes `?plan&provider&uid` and opens the provider's checkout with `uid` in
   `custom_data` / `notes`, which is what the webhook reads back).
4. **Paddle** seller approval (a review, not instant), products for `intl_monthly` and
   `intl_yearly`, webhook → `paddleWebhook`, secret → `PADDLE_WEBHOOK_SECRET`.
5. **Razorpay**: an Indian entity and GST registration, Subscriptions enabled, UPI
   Autopay plans for `in_monthly`/`in_yearly`, webhook → `razorpayWebhook`, secret →
   `RAZORPAY_WEBHOOK_SECRET`.
6. **An hour with a CA** on GST, the RBI e-mandate framework and MoR tax treatment.

Until step 3 the store build behaves as designed with no licence server reachable:
the trial cannot start, so a signed-in desktop user sits in `locked` and sees the
paywall. Your personal build is unaffected by all of it.

## 10. Open, needs your answer

1. **§2.4** — allow `dialog:open` + read one picked file in the free tier? (Recommend yes; otherwise free desktop is worse than the website.)
2. **§7** — pricing option A, B or C?
3. Does an expired install keep **read-only git status/diff** so the user can still *see* what the agent proposed before paying? Currently gated by the "no file access at all" rule, and it is the single strongest conversion moment in the product.
4. Do you have an Indian entity + GST already, or is Paddle-only the realistic v1?

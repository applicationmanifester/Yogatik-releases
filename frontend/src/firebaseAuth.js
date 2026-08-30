// Lazy-loaded Firebase — SDK is only fetched when auth/key-vault is actually used.

import { encryptSecret, decryptSecret, isEncrypted } from './crypto'

/**
 * authDomain — first-party is better, but only if Google agrees.
 *
 * A same-origin handler (yogatik.web.app/__/auth/handler) is what makes
 * signInWithRedirect survive Safari 16.1 / Chrome storage partitioning; with a
 * cross-origin handler the credential is dropped and getRedirectResult returns
 * null. BUT the handler URL must be listed as an Authorized redirect URI on the
 * project's OAuth client, and only the firebaseapp.com one is there by default —
 * using .web.app without adding it gives Error 400: redirect_uri_mismatch.
 *
 * So: default to the domain Google already trusts, and switch by setting
 * VITE_AUTH_DOMAIN=yogatik.web.app once
 * https://yogatik.web.app/__/auth/handler is added in
 * Google Cloud console -> Credentials -> Web client -> Authorized redirect URIs.
 * Popup sign-in (the default path, phones included) works either way.
 */
const authDomain = import.meta.env.VITE_AUTH_DOMAIN || 'yogatik.firebaseapp.com'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEaU6MKLAGNnWtexPj3GMcqRFKEeqI-D4",
  authDomain,
  projectId: "yogatik",
  storageBucket: "yogatik.firebasestorage.app",
  messagingSenderId: "1024966461660",
  appId: "1:1024966461660:web:3d87c9ac725132418ccc19"
}

let _fb = null
/** Single-flight lazy loader: returns { auth, dbFirestore, provider, ...fns } */
function fb() {
  if (!_fb) _fb = (async () => {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])
    const app = initializeApp(firebaseConfig)
    return {
      auth: authMod.getAuth(app),
      db: fsMod.getFirestore(app),
      provider: new authMod.GoogleAuthProvider(),
      ...authMod, ...fsMod,
    }
  })()
  return _fb
}

export const getFirebase = fb

/**
 * A fresh Firebase ID token for the signed-in user, or null.
 *
 * The licence server authenticates with this and NOTHING PRODUCED IT. App.jsx
 * called `refreshEntitlement({ idToken: userData?.idToken })`, but the user
 * object here is `profileOf()` — uid, displayName, email, photoURL — and has
 * never carried an idToken. So the field was always undefined, main's
 * `store.idToken` stayed null, and `refresh()` returned at its guard every
 * time: no user could ever be licensed, however much they paid. The same
 * reader/writer field drift as `is_dir`/`isDir` and `doc.text`/`doc.chunks`,
 * except this one is the revenue path.
 *
 * Deliberately fetched fresh on demand rather than stored on the profile: an ID
 * token expires in an hour, so a copy taken at sign-in is stale by the time
 * anyone checks a licence, and a stale token means a 401 the caller reads as
 * "not entitled".
 */
export async function getIdToken({ forceRefresh = false } = {}) {
  try {
    const f = await fb()
    const user = f.auth?.currentUser
    if (!user?.getIdToken) return null
    return await user.getIdToken(forceRefresh)
  } catch {
    // Signed out, offline, or Firebase unavailable — all of which mean "no
    // token", not "crash the caller".
    return null
  }
}

const PENDING = 'yogatik.authRedirect'
/** A redirect is in flight (survives the round trip to Google and back). */
export function authRedirectPending() {
  try { return localStorage.getItem(PENDING) === '1' } catch { return false }
}
function setPending(v) {
  try { v ? localStorage.setItem(PENDING, '1') : localStorage.removeItem(PENDING) } catch { /* private mode */ }
}

const profileOf = (user) => ({
  uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL,
})

async function saveProfile(f, user) {
  const userData = profileOf(user)
  try {
    await f.setDoc(f.doc(f.db, 'users', user.uid), { profile: userData }, { merge: true })
  } catch { /* Firestore rules or offline: the session is still valid */ }
  return userData
}

/**
 * Redirect on phones, popup on desktop.
 *
 * A popup on Android Chrome opens as a *tab*: the opener link is fragile, and
 * when it breaks signInWithPopup neither resolves nor rejects — the button sits
 * on "Signing in…" forever. Redirect has no opener to lose. On desktop the popup
 * is better (app state survives), but it still gets a deadline, because a hung
 * promise with no error is the worst of both worlds.
 */
const POPUP_DEADLINE_MS = 90_000

function prefersRedirect() {
  if (typeof navigator === 'undefined') return false
  const standalone = typeof matchMedia !== 'undefined' &&
    (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)
  const phone = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent) ||
    (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
  return standalone || phone
}

let _desktopUser = null
try {
  const cached = typeof localStorage !== 'undefined' && localStorage.getItem('yogatik.desktop_user')
  if (cached) _desktopUser = JSON.parse(cached)
} catch {}

function setDesktopUser(u) {
  _desktopUser = u
  try {
    if (u) localStorage.setItem('yogatik.desktop_user', JSON.stringify(u))
    else localStorage.removeItem('yogatik.desktop_user')
  } catch {}
}

function getActiveAuthUser(f) {
  return f?.auth?.currentUser || _desktopUser || null
}

export async function signInWithGoogle() {
  // ─── Electron Desktop Native OAuth Bridge ─────────────────────────────────
  if (typeof window !== 'undefined' && window.__YOGATIK_DESKTOP__?.loginWithGoogle) {
    const res = await window.__YOGATIK_DESKTOP__.loginWithGoogle()
    if (!res || !res.success || !res.user) {
      throw new Error(res?.error || 'Desktop Google Sign-In was cancelled or failed.')
    }
    const f = await fb()
    const user = {
      uid: res.user.uid,
      displayName: res.user.displayName,
      email: res.user.email,
      photoURL: res.user.photoURL,
    }
    setDesktopUser(user)
    return await saveProfile(f, user)
  }

  // ─── Standard Web Browser OAuth Flow ──────────────────────────────────────
  const f = await fb()
  f.provider.setCustomParameters({ prompt: 'select_account' })

  const goRedirect = async () => {
    setPending(true)
    try {
      await f.signInWithRedirect(f.auth, f.provider)
    } catch (err) {
      setPending(false)
      throw err
    }
    return null            // the page is leaving; the answer arrives on return
  }

  if (prefersRedirect()) return goRedirect()

  let timer
  try {
    const stalled = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('popup-stalled'), { code: 'yogatik/popup-stalled' })), POPUP_DEADLINE_MS)
    })
    const { user } = await Promise.race([f.signInWithPopup(f.auth, f.provider), stalled])
    return await saveProfile(f, user)
  } catch (err) {
    const fallback = ['auth/popup-blocked', 'auth/popup-closed-by-user',
      'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported', 'yogatik/popup-stalled']
    if (fallback.includes(err.code)) return goRedirect()
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Finish a redirect sign-in. getRedirectResult alone is not enough: when the
 * browser hands the session back through persistence rather than the result
 * object it resolves null while the user IS signed in, which read as failure.
 */
export async function checkRedirectResult() {
  const f = await fb()
  try {
    const result = await f.getRedirectResult(f.auth)
    if (result?.user) return await saveProfile(f, result.user)

    const user = f.auth.currentUser || await new Promise(resolve => {
      const stop = f.onAuthStateChanged(f.auth, u => { stop(); resolve(u) })
      setTimeout(() => { stop(); resolve(null) }, 8000)
    })
    return user ? await saveProfile(f, user) : null
  } finally {
    setPending(false)
  }
}

export async function logOutGoogle() {
  setDesktopUser(null)
  const f = await fb()
  try { await f.signOut(f.auth) } catch {}
}

/**
 * Sync a provider key to Firestore, always encrypted (AES-GCM).
 * `secret` is derived from the account (see api.js) — plaintext is never
 * written, and the ciphertext is scoped to the owner's document by rules.
 */
export async function saveUserApiKey(provider, apiKey, secret) {
  if (!secret) return { synced: false, reason: 'no-secret' }
  try {
    const f = await fb()
    const user = getActiveAuthUser(f)
    if (!user) return { synced: false, reason: 'signed-out' }
    const sealed = await encryptSecret(apiKey, secret)
    await f.setDoc(f.doc(f.db, 'users', user.uid), { apiKeys: { [provider]: sealed } }, { merge: true })
    return { synced: true }
  } catch (err) {
    // Firestore rules or desktop offline: keep local key intact
    return { synced: false, reason: err?.message || 'firestore-restricted' }
  }
}

/**
 * Returns decrypted keys. Accepts several secrets so a value written under an
 * older scheme still opens; anything no secret can open is skipped rather than
 * surfaced as garbage. A skipped entry heals itself on the next push.
 */
export async function getUserApiKeys(...secrets) {
  const candidates = secrets.flat().filter(Boolean)
  try {
    const f = await fb()
    const user = getActiveAuthUser(f)
    if (!user || !candidates.length) return {}
    const snap = await f.getDoc(f.doc(f.db, 'users', user.uid))
    const stored = (snap.exists() && snap.data().apiKeys) || {}

    const out = {}
    for (const [provider, value] of Object.entries(stored)) {
      if (!isEncrypted(value)) continue // legacy plaintext — ignored, see purgePlaintextKeys
      for (const secret of candidates) {
        const plain = await decryptSecret(value, secret)
        if (plain) { out[provider] = plain; break }
      }
    }
    return out
  } catch {
    return {}
  }
}

// ─── Encrypted data vault (conversations + documents snapshot) ───
// A snapshot can exceed Firestore's 1 MB/doc limit, so the ciphertext is split
// into ~700 KB chunks across a subcollection users/{uid}/vault/{n}. Only
// ciphertext is stored; the account-derived secret never leaves the device.
const VAULT_CHUNK = 700_000

/** Write the encrypted snapshot string as ordered chunks; returns chunk count. */
export async function saveVault(cipher, meta = {}) {
  try {
    const f = await fb()
    const user = getActiveAuthUser(f)
    if (!user) return { synced: false, reason: 'signed-out' }
    const col = f.collection(f.db, 'users', user.uid, 'vault')
    // Clear any previous, possibly longer, snapshot first so no stale tail remains.
    const old = await f.getDocs(col)
    const batch = f.writeBatch(f.db)
    old.forEach(d => batch.delete(d.ref))
    const chunks = []
    for (let i = 0; i < cipher.length; i += VAULT_CHUNK) chunks.push(cipher.slice(i, i + VAULT_CHUNK))
    chunks.forEach((c, i) => batch.set(f.doc(col, String(i).padStart(4, '0')), { i, c }))
    batch.set(f.doc(f.db, 'users', user.uid), { vaultMeta: { ...meta, chunks: chunks.length, at: Date.now() } }, { merge: true })
    await batch.commit()
    return { synced: true, chunks: chunks.length }
  } catch (err) {
    return { synced: false, reason: err?.message || 'vault-write-restricted' }
  }
}

/** Read and reassemble the encrypted snapshot string, or null if none. */
export async function loadVault() {
  try {
    const f = await fb()
    const user = getActiveAuthUser(f)
    if (!user) return null
    const snap = await f.getDocs(f.query(f.collection(f.db, 'users', user.uid, 'vault'), f.orderBy('i')))
    if (snap.empty) return null
    let cipher = ''
    snap.forEach(d => { cipher += d.data().c || '' })
    return cipher || null
  } catch {
    return null
  }
}

export async function getVaultMeta() {
  try {
    const f = await fb()
    const user = getActiveAuthUser(f)
    if (!user) return null
    const snap = await f.getDoc(f.doc(f.db, 'users', user.uid))
    return (snap.exists() && snap.data().vaultMeta) || null
  } catch {
    return null
  }
}

/** One-shot cleanup of pre-encryption plaintext keys left in Firestore. */
export async function purgePlaintextKeys() {
  try {
    const f = await fb()
    const user = getActiveAuthUser(f)
    if (!user) return 0
    const ref = f.doc(f.db, 'users', user.uid)
    const snap = await f.getDoc(ref)
    const stored = (snap.exists() && snap.data().apiKeys) || {}
    const cleaned = {}
    let removed = 0
    for (const [provider, value] of Object.entries(stored)) {
      if (isEncrypted(value)) cleaned[provider] = value
      else removed++
    }
    if (removed) await f.setDoc(ref, { apiKeys: cleaned }, { merge: false })
    return removed
  } catch {
    return 0
  }
}

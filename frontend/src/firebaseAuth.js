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

export async function signInWithGoogle() {
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
  const f = await fb()
  await f.signOut(f.auth)
}

/**
 * Sync a provider key to Firestore, always encrypted (AES-GCM).
 * `secret` is derived from the account (see api.js) — plaintext is never
 * written, and the ciphertext is scoped to the owner's document by rules.
 */
export async function saveUserApiKey(provider, apiKey, secret) {
  if (!secret) return { synced: false, reason: 'no-secret' }
  const f = await fb()
  const user = f.auth.currentUser
  if (!user) return { synced: false, reason: 'signed-out' }
  const sealed = await encryptSecret(apiKey, secret)
  await f.setDoc(f.doc(f.db, 'users', user.uid), { apiKeys: { [provider]: sealed } }, { merge: true })
  return { synced: true }
}

/**
 * Returns decrypted keys. Accepts several secrets so a value written under an
 * older scheme still opens; anything no secret can open is skipped rather than
 * surfaced as garbage. A skipped entry heals itself on the next push.
 */
export async function getUserApiKeys(...secrets) {
  const candidates = secrets.flat().filter(Boolean)
  const f = await fb()
  const user = f.auth.currentUser
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
}

/** One-shot cleanup of pre-encryption plaintext keys left in Firestore. */
export async function purgePlaintextKeys() {
  const f = await fb()
  const user = f.auth.currentUser
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
}

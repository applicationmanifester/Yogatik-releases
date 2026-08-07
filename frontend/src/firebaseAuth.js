// Lazy-loaded Firebase — SDK is only fetched when auth/key-vault is actually used.

import { encryptSecret, decryptSecret, isEncrypted } from './crypto'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEaU6MKLAGNnWtexPj3GMcqRFKEeqI-D4",
  authDomain: "yogatik.firebaseapp.com",
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

export async function signInWithGoogle() {
  const f = await fb()
  const { user } = await f.signInWithPopup(f.auth, f.provider)
  const userData = { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL }
  await f.setDoc(f.doc(f.db, 'users', user.uid), { profile: userData }, { merge: true })
  return userData
}

export async function logOutGoogle() {
  const f = await fb()
  await f.signOut(f.auth)
}

/**
 * Sync a provider key to Firestore — encrypted with the user's passphrase.
 * Without a passphrase nothing is uploaded: a plaintext key in Firestore is
 * readable by anyone with the account session or console access.
 */
export async function saveUserApiKey(provider, apiKey, passphrase) {
  if (!passphrase) return { synced: false, reason: 'no-passphrase' }
  const f = await fb()
  const user = f.auth.currentUser
  if (!user) return { synced: false, reason: 'signed-out' }
  const sealed = await encryptSecret(apiKey, passphrase)
  await f.setDoc(f.doc(f.db, 'users', user.uid), { apiKeys: { [provider]: sealed } }, { merge: true })
  return { synced: true }
}

/** Returns decrypted keys; entries that fail to decrypt are skipped. */
export async function getUserApiKeys(passphrase) {
  const f = await fb()
  const user = f.auth.currentUser
  if (!user) return {}
  const snap = await f.getDoc(f.doc(f.db, 'users', user.uid))
  const stored = (snap.exists() && snap.data().apiKeys) || {}
  if (!passphrase) return {}
  const out = {}
  for (const [provider, value] of Object.entries(stored)) {
    if (!isEncrypted(value)) continue // legacy plaintext — ignored, see purgePlaintextKeys
    const plain = await decryptSecret(value, passphrase)
    if (plain) out[provider] = plain
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

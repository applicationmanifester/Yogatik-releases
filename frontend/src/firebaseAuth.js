// Lazy-loaded Firebase — SDK is only fetched when auth/key-vault is actually used.

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

export async function saveUserApiKey(provider, apiKey) {
  const f = await fb()
  const user = f.auth.currentUser
  if (!user) return
  await f.setDoc(f.doc(f.db, 'users', user.uid), { apiKeys: { [provider]: apiKey } }, { merge: true })
}

export async function getUserApiKeys() {
  const f = await fb()
  const user = f.auth.currentUser
  if (!user) return {}
  const snap = await f.getDoc(f.doc(f.db, 'users', user.uid))
  return (snap.exists() && snap.data().apiKeys) || {}
}

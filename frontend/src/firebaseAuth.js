import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEaU6MKLAGNnWtexPj3GMcqRFKEeqI-D4",
  authDomain: "yogatik.firebaseapp.com",
  projectId: "yogatik",
  storageBucket: "yogatik.firebasestorage.app",
  messagingSenderId: "1024966461660",
  appId: "1:1024966461660:web:3d87c9ac725132418ccc19"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const dbFirestore = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    const userData = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL
    }
    // Sync user profile & load saved provider API keys from Firestore
    await setDoc(doc(dbFirestore, 'users', user.uid), { profile: userData }, { merge: true })
    return userData
  } catch (error) {
    console.error("Google Auth error:", error)
    throw error
  }
}

/**
 * Sign out of Google
 */
export async function logOutGoogle() {
  await signOut(auth)
}

/**
 * Save provider API Key securely per-user in Firestore
 */
export async function saveUserApiKey(provider, apiKey) {
  const user = auth.currentUser
  if (!user) return
  await setDoc(doc(dbFirestore, 'users', user.uid), {
    apiKeys: { [provider]: apiKey }
  }, { merge: true })
}

/**
 * Load user's saved API Keys from Firestore
 */
export async function getUserApiKeys() {
  const user = auth.currentUser
  if (!user) return {}
  const snap = await getDoc(doc(dbFirestore, 'users', user.uid))
  if (snap.exists() && snap.data().apiKeys) {
    return snap.data().apiKeys
  }
  return {}
}

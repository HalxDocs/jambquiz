import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  writeBatch,
  increment,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential, signInWithCustomToken, getIdTokenResult, sendPasswordResetEmail } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: "AIzaSyBQA8XnuGt6ANrMe4zYvBzbHWnK-58Sf8U",
  authDomain: "fitness-gym-fc040.firebaseapp.com",
  projectId: "fitness-gym-fc040",
  storageBucket: "fitness-gym-fc040.firebasestorage.app",
  messagingSenderId: "818614046525",
  appId: "1:818614046525:web:d94d915dd55ac925e2bf54",
  measurementId: "G-FJPTYQ8G8G"
}

const app = initializeApp(firebaseConfig)

function makeDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
    })
  } catch {
    try {
      return initializeFirestore(app, { localCache: memoryLocalCache() })
    } catch {
      return getFirestore(app)
    }
  }
}
const db = makeDb()

const functions = getFunctions(app)

const auth = getAuth(app)

// App Check protects callable functions (and, once enforced in the console,
// Firestore) from abuse by proving the request comes from a genuine client.
// Configure a reCAPTCHA v3 site key in the Firebase console (App Check) and set
// it as VITE_RECAPTCHA_SITE_KEY in the web env. If it is not set, App Check is
// skipped locally — but the deployed callables use enforceAppCheck and will
// reject requests, so the key MUST be set for production builds.
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
let appCheck = null
if (appCheckSiteKey) {
  if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  }
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export {
  db,
  auth,
  appCheck,
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  writeBatch,
  increment,
  serverTimestamp,
  deleteField,
  functions,
  httpsCallable,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithCustomToken,
  getIdTokenResult,
  sendPasswordResetEmail,
}
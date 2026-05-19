import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
  collection,
  addDoc,
  getDocs,
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
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

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
    return initializeFirestore(app, { localCache: memoryLocalCache() })
  }
}
const db = makeDb()

const functions = getFunctions(app)

export { db, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, updateDoc, setDoc, getDoc, query, where, orderBy, limit, startAfter, functions, httpsCallable }
import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'

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

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
})

export { db, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, updateDoc }
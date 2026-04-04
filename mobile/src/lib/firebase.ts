import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  getFirestore,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC_5zqKY90TF9Qd9YlztnUCV09toCCHuog",
  authDomain: "sis-kis.firebaseapp.com",
  projectId: "sis-kis",
  storageBucket: "sis-kis.firebasestorage.app",
  messagingSenderId: "587113059865",
  appId: "1:587113059865:web:c6bcc4756b695ba040bc88",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Enable persistent IndexedDB cache for offline support and reduced reads
let db;
try {
  db = getFirestore(app);
} catch {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({}),
  });
}

export { app, auth, db };

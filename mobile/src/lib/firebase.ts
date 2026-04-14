import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyC_5zqKY90TF9Qd9YlztnUCV09toCCHuog",
  authDomain: "sis-kis.firebaseapp.com",
  projectId: "sis-kis",
  storageBucket: "sis-kis.firebasestorage.app",
  messagingSenderId: "587113059865",
  appId: "1:587113059865:web:c6bcc4756b695ba040bc88",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use AsyncStorage for auth persistence so sessions survive app restarts
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // If already initialized (hot reload), fall back to getAuth
  auth = getAuth(app);
}

const storage = getStorage(app);

// Enable persistent IndexedDB cache for offline support and reduced reads
let db: Firestore;
try {
  db = getFirestore(app);
} catch {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({}),
  });
}

export { app, auth, db, storage };

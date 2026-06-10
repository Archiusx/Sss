import { initializeApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey:            "AIzaSyCjPu3W9L0rSXXf3aVCzmx9fJ9n9HP9K3s",
  authDomain:        "cyintel-cb4c9.firebaseapp.com",
  databaseURL:       "https://cyintel-cb4c9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "cyintel-cb4c9",
  storageBucket:     "cyintel-cb4c9.firebasestorage.app",
  messagingSenderId: "1067686818980",
  appId:             "1:1067686818980:web:fc491062474f1010b12231",
  measurementId:     "G-W6E553YQGN",
};

const app = initializeApp(firebaseConfig);

// Use initializeAuth with explicit persistence — avoids the race condition
// where setPersistence fires AFTER onAuthStateChanged is already listening
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});
export const db   = getFirestore(app);
export const rtdb = getDatabase(app);

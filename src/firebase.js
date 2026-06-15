import { initializeApp } from "firebase/app";
import { getAuth, browserLocalPersistence, indexedDBLocalPersistence, setPersistence } from "firebase/auth";
import { initializeFirestore, setLogLevel } from "firebase/firestore";
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

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const rtdb = getDatabase(app);
export const firebaseProjectId = firebaseConfig.projectId;

export function enableFirestoreDebugLogging() {
  setLogLevel("debug");
  console.info(`[CyIntel] Firestore debug logging enabled for project ${firebaseConfig.projectId}.`);
}

function shouldEnableFirestoreDebugLogging() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("CYINTEL_FIRESTORE_DEBUG") === "true";
  } catch (_) {
    return false;
  }
}

if (shouldEnableFirestoreDebugLogging()) {
  enableFirestoreDebugLogging();
}

// Persistence setup
export const authReady = setPersistence(auth, indexedDBLocalPersistence)
  .catch(() => setPersistence(auth, browserLocalPersistence))
  .catch(() => {});

// Auth is intentionally not auto-created here. Creating an anonymous session on
// page load can surface provider/domain errors (including auth/error-code:-40)
// before the user chooses a login method and can bypass the login screen.
async function ensureAuth() {
  await authReady;
  return auth.currentUser;
}

export { ensureAuth };

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import Dashboard from "./dashboard";
import LoginPage from "./LoginPage";
import { auth, db } from "./firebase";
import { onAuthStateChanged, getRedirectResult } from "firebase/auth";
import { doc, getDoc, getDocFromCache } from "firebase/firestore";

// Max time to wait for Firestore profile before falling back to Auth-only user
const FIRESTORE_TIMEOUT_MS = 4000;

async function fetchUserProfile(u) {
  const docRef = doc(db, "users", u.uid);
  
  // Try cache first (instant, works offline)
  try {
    const cached = await getDocFromCache(docRef);
    if (cached.exists()) {
      const d = cached.data();
      return { ...u, ...d, photoURL: d.photoURL || u.photoURL, displayName: d.fullName || d.displayName || u.displayName };
    }
  } catch (_) { /* cache miss is normal */ }

  // Network fetch with timeout — never hang forever on slow connections
  try {
    const snap = await Promise.race([
      getDoc(docRef),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), FIRESTORE_TIMEOUT_MS)),
    ]);
    if (snap.exists()) {
      const d = snap.data();
      return { ...u, ...d, photoURL: d.photoURL || u.photoURL, displayName: d.fullName || d.displayName || u.displayName };
    }
  } catch (e) {
    console.warn("[CyIntel] Firestore fetch failed/timed out, using Auth user:", e.message);
  }

  // Fallback: Auth user only (dashboard still works, profile just has less data)
  return u;
}

function Root() {
  const [user, setUser]       = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Handle Google redirect result FIRST (for mobile redirect flow)
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          // Will be picked up by onAuthStateChanged below — no duplicate handling needed
          console.log("[CyIntel] Redirect sign-in completed:", result.user.email);
        }
      })
      .catch((e) => console.warn("[CyIntel] Redirect result error:", e.code));

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const profile = await fetchUserProfile(u);
        setUser(profile);
      } else {
        setUser(null);
      }
      setChecking(false);
    });

    // Hard safety net — if Firebase never fires (e.g. blocked network), unblock UI after 6s
    const safetyTimer = setTimeout(() => setChecking(false), 6000);

    return () => { unsub(); clearTimeout(safetyTimer); };
  }, []);

  if (checking) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at top,#0D1835 0%,#050810 60%,#000 100%)",
        flexDirection: "column", gap: "1rem",
      }}>
        <img
          src="https://i.ibb.co/XrMWBwQT/IMG-20260609-WA0033.jpg"
          alt="CyIntel"
          style={{ width: 64, height: 64, borderRadius: 12, opacity: 0.9 }}
        />
        <div style={{
          width: 36, height: 36, border: "3px solid #1E3A6E",
          borderTopColor: "#2563EB", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return user ? <Dashboard user={user} /> : <LoginPage />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

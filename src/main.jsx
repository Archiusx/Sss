import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import Dashboard from "./dashboard";
import LoginPage from "./LoginPage";
import { auth, db, rtdb, authReady } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, set, onDisconnect, serverTimestamp as rtdbTimestamp } from "firebase/database";

const FIRESTORE_TIMEOUT_MS = 5000;

async function fetchUserProfile(u) {
  const docRef = doc(db, "users", u.uid);
  try {
    const snap = await Promise.race([
      getDoc(docRef),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), FIRESTORE_TIMEOUT_MS)),
    ]);
    if (snap.exists()) {
      const d = snap.data();
      return {
        ...u,
        ...d,
        photoURL:     d.photoURL     || u.photoURL,
        displayName:  d.fullName     || d.displayName || u.displayName,
      };
    }
  } catch (e) {
    console.warn("[CyIntel] Firestore fetch failed, using Auth user:", e.message);
  }
  return u;
}

function Root() {
  const [user,     setUser]     = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Wait for persistence to be configured BEFORE subscribing to auth state.
    // This prevents the brief "signed-out" flash that caused the login loop.
    authReady.then(() => {
      if (cancelled) return;

      const unsub = onAuthStateChanged(auth, async (u) => {
        if (cancelled) return;
        if (u) {
          const profile = await fetchUserProfile(u);
          if (!cancelled) {
            setUser(profile);
            setChecking(false);
          }
        } else {
          setUser(null);
          setChecking(false);
        }
      });

      // Safety net — never spin forever
      const timer = setTimeout(() => {
        if (!cancelled) setChecking(false);
      }, 8000);

      // Store cleanup refs on the outer cancel flag closure
      cancelled = false; // re-use flag to carry unsub ref — use a real ref below
      return () => { unsub(); clearTimeout(timer); };
    });

    return () => { cancelled = true; };
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

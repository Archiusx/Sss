import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import Dashboard from "./dashboard";
import LoginPage from "./LoginPage";
import { auth, db, rtdb } from "./firebase";
import { onAuthStateChanged, getRedirectResult } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, set, onDisconnect, serverTimestamp as rtdbTimestamp } from "firebase/database";

const FIRESTORE_TIMEOUT_MS = 5000;

// Try cache first, then network with timeout
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
        photoURL: d.photoURL || u.photoURL,
        displayName: d.fullName || d.displayName || u.displayName,
      };
    }
  } catch (e) {
    console.warn("[CyIntel] Firestore fetch failed, using Auth user:", e.message);
  }
  return u;
}

// Handle saving Google redirect user to Firestore (mirrors LoginPage logic)
async function saveGoogleRedirectUser(u, isNew) {
  try {
    const payload = {
      authProvider: "google",
      email: u.email,
      fullName: u.displayName || "CyIntel Operative",
      phone: u.phoneNumber || "",
      photoURL: u.photoURL || "",
      lastLogin: serverTimestamp(),
    };
    if (isNew) {
      Object.assign(payload, {
        uid: u.uid,
        badgeID: "",
        designation: "",
        department: "",
        role: "investigator",
        status: "active",
        verified: true,
        createdAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, "users", u.uid), payload, { merge: true });
  } catch (e) {
    console.warn("[CyIntel] Redirect user save failed (non-fatal):", e.message);
    // Non-fatal — user still proceeds to dashboard
  }

  // Presence (fire-and-forget)
  try {
    const pRef = ref(rtdb, `presence/${u.uid}`);
    const data = { uid: u.uid, displayName: u.displayName || "Operative", online: true, lastSeen: rtdbTimestamp() };
    await set(pRef, data);
    onDisconnect(pRef).set({ uid: u.uid, online: false, lastSeen: rtdbTimestamp() });
  } catch (_) {}
}

function Root() {
  const [user, setUser]         = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let settled = false;

    function done(u) {
      if (settled) return;
      settled = true;
      setUser(u);
      setChecking(false);
    }

    // Hard safety net — never spin forever, even if Firebase is completely dead
    const safetyTimer = setTimeout(() => done(null), 7000);

    // Step 1: Check if we're returning from a Google redirect
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          const u = result.user;
          const isNew = result._tokenResponse?.isNewUser ?? false;
          // Save to Firestore (was skipped because page redirected away from LoginPage)
          await saveGoogleRedirectUser(u, isNew);
          const profile = await fetchUserProfile(u);
          done(profile);
        }
        // If no redirect result, onAuthStateChanged below handles it
      })
      .catch((e) => {
        console.warn("[CyIntel] getRedirectResult error:", e.code);
        // Don't call done() here — let onAuthStateChanged handle it
      });

    // Step 2: Normal auth state listener (email/phone login, already logged in)
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (settled) return; // redirect result already handled it
      if (u) {
        const profile = await fetchUserProfile(u);
        done(profile);
      } else {
        done(null);
      }
    });

    return () => {
      unsub();
      clearTimeout(safetyTimer);
    };
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

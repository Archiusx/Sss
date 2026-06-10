import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import Dashboard from "./dashboard";
import LoginPage from "./LoginPage";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

function Root() {
  // holds the combined auth + profiling data object
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          // Pull full profile fields from Firestore matching this account UID
          const docRef = doc(db, "users", u.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            // Merge: Firestore fields first, then Auth fields for photoURL/displayName guarantee
            setUser({ ...u, ...docSnap.data(), photoURL: docSnap.data().photoURL || u.photoURL, displayName: docSnap.data().fullName || docSnap.data().displayName || u.displayName });
          } else {
            // Fallback object if document is still writing or missing
            setUser(u);
          }
        } catch (error) {
          console.error("Error loading profile from Firestore:", error);
          setUser(u);
        }
      } else {
        setUser(null);
      }
      setChecking(false);
    });
    return unsub;
  }, []);

  // Secure Animated Splash Loading Screen
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

  // Pass user profile straight into the application
  return user ? <Dashboard user={user} /> : <LoginPage />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

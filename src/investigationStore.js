import {
  collection, doc, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, getDoc, deleteDoc, updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const INVESTIGATION_LIMIT = 25;

function jsonClean(value) {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, val) => {
        if (val === undefined) return null;
        if (typeof val === "function") return null;
        if (typeof val === "symbol") return null;
        if (typeof val === "bigint") return Number(val);
        if (!isFinite(val) && typeof val === "number") return 0;
        if (val && typeof val === "object" && typeof val._methodName === "string") return null;
        if (Array.isArray(val) && val.every(item => Array.isArray(item))) {
          return val.map(item => ({ key: String(item[0] ?? ""), value: String(item[1] ?? "") }));
        }
        return val;
      })
    );
  } catch {
    return {};
  }
}

function titleCase(v = "") {
  return v.replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskFromConfidence(c = 0) {
  return c >= 80 ? "critical" : c >= 60 ? "high" : c >= 35 ? "medium" : "low";
}

function getPlatforms(inv) {
  const s = new Set();
  for (const f of inv.findings || []) if (f?.platform) s.add(String(f.platform).slice(0, 50));
  for (const p of inv.crawledPages || []) if (p?.extractor) s.add(String(p.extractor).slice(0, 50));
  return [...s].slice(0, 8);
}

function str(v, max = 2000) { return String(v ?? "").slice(0, max); }
function num(v) { return Number(v) || 0; }

export async function saveInvestigation(user, investigation) {
  const safeUser = user?.uid ? user : null;
  if (!safeUser?.uid) throw new Error("Sign in before saving.");
  if (!investigation?.id) throw new Error("Investigation has no ID.");

  const confidence = num(investigation?.stats?.confidence);

  const raw = {
    id: str(investigation.id, 40),
    target: str(investigation.target, 500),
    type: str(investigation.type, 40),
    status: "Completed",
    startedAt: str(investigation.startedAt || new Date().toISOString(), 40),
    stats: investigation.stats || {},
    metadata: investigation.metadata || [],
    findings: (investigation.findings || []).slice(0, 15),
    crawledPages: (investigation.crawledPages || []).slice(0, 6),
    crawlErrors: (investigation.crawlErrors || []).slice(0, 8),
    searchLinks: (investigation.searchLinks || []).slice(0, 10),
    logs: (investigation.logs || []).slice(0, 20),
    tools: (investigation.tools || []).slice(0, 10),
    gemini: {
      enabled: Boolean(investigation.gemini?.enabled),
      summary: str(investigation.gemini?.summary, 6000),
      sources: (investigation.gemini?.sources || []).slice(0, 8),
      queries: (investigation.gemini?.queries || []).slice(0, 5),
    },
  };

  const cleanData = jsonClean(raw);

  const docData = {
    ownerId: safeUser.uid,
    caseId: investigation.id,
    target: raw.target,
    type: raw.type,
    status: "Completed",
    risk: riskFromConfidence(confidence),
    platforms: getPlatforms(investigation),
    summary: str(investigation.gemini?.summary || "OSINT completed", 20000),
    sourceCounts: {
      findings: num(investigation.findings?.length),
      searchLinks: num(investigation.searchLinks?.length),
      crawledPages: num(investigation.crawledPages?.length),
      confidence,
    },
    data: cleanData,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  const ref = doc(db, "users", safeUser.uid, "investigations", investigation.id);

  await setDoc(ref, docData, { merge: true });

  console.log("[CyIntel] Firestore WRITE SUCCESS:", ref.path);
  return investigation.id;
}

function toMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "string") return Date.parse(v) || 0;
  if (v instanceof Date) return v.getTime();
  return 0;
}

export function subscribeRecentInvestigations(user, onNext, onError) {
  if (!user?.uid) { onNext([]); return () => {}; }

  const q = query(
    collection(db, "users", user.uid, "investigations"),
    orderBy("createdAt", "desc"),
    limit(INVESTIGATION_LIMIT)
  );

  return onSnapshot(q,
    (snap) => {
      onNext(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => { console.error("[CyIntel] listener:", err); onError(err); }
  );
}

export async function getInvestigation(user, firestoreId) {
  if (!user?.uid) throw new Error("Sign in before reading.");
  if (!firestoreId) throw new Error("firestoreId is required.");

  const ref = doc(db, "users", user.uid, "investigations", firestoreId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  return snap.data();
}

export async function updateInvestigation(user, firestoreId, fields = {}) {
  if (!user?.uid) throw new Error("Sign in before updating.");

  const ref = doc(db, "users", user.uid, "investigations", firestoreId);
  await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() });
  return firestoreId;
}

export async function deleteInvestigation(user, firestoreId) {
  if (!user?.uid) throw new Error("Sign in before deleting.");

  const ref = doc(db, "users", user.uid, "investigations", firestoreId);
  await deleteDoc(ref);
  return firestoreId;
}
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

// save functional

const ref = doc(db, "users", user.uid);

try {
  console.log("[CyIntel] Saving investigation...");
  console.log("[CyIntel] User UID:", user.uid);

  await setDoc(
    ref,
    {
      uid: user.uid,
      lastLogin: serverTimestamp(),

      lastInvestigation: {
        ownerId: user.uid,
        caseId: investigation.id,
        target: raw.target,
        type: raw.type,
        typeLabel: titleCase(raw.type),

        sourceCounts: {
          findings: (raw.findings || []).length,
          pages: (raw.crawledPages || []).length
        },

        status: "Completed",
        risk: riskFromConfidence(confidence),
        platforms: getPlatforms(investigation),

        summary: str(
          investigation?.gemini?.summary || "OSINT completed",
          20000
        ),

        data: cleanData,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    },
    { merge: true }
  );

  console.log("[CyIntel] Firestore save SUCCESS");

  return investigation.id;

} catch (err) {
  console.error("[CyIntel] Firestore save FAILED:", err);

  alert(
    "Firestore Error:\n" +
    (err?.code || "") +
    "\n" +
    (err?.message || JSON.stringify(err))
  );

  throw err;
}

// =============================
// SOCMINT GRAPH ENGINE
// =============================

export function buildEntityGraph(investigation) {
  const nodes = new Map();
  const edges = [];

  const addNode = (id, type, data) => {
    if (!nodes.has(id)) nodes.set(id, { id, type, ...data });
  };

  const connect = (a, b, type) => {
    edges.push({ from: a, to: b, type });
  };

  for (const f of investigation.findings || []) {
    if (f?.value) {
      addNode(f.value, "entity", f);
      addNode(investigation.id, "case", {});
      connect(investigation.id, f.value, "found");
    }
  }

  for (const p of investigation.crawledPages || []) {
    if (p?.url) {
      addNode(p.url, "source", p);
      connect(investigation.id, p.url, "crawled");
    }
  }

  return {
    nodes: [...nodes.values()],
    edges
  };
}

// =============================
// TIMELINE ENGINE
// =============================

export function buildTimeline(investigation) {
  const events = [];

  for (const log of investigation.logs || []) {
    events.push({
      time: log.time || Date.now(),
      type: log.type || "log",
      message: log.message || "event"
    });
  }

  for (const p of investigation.crawledPages || []) {
    events.push({
      time: p.time || Date.now(),
      type: "crawl",
      message: p.url || "page"
    });
  }

  return events.sort((a, b) => new Date(a.time) - new Date(b.time));
}

// =============================
// AI CORRELATION ENGINE (SAFE STUB)
// =============================

export function correlateEntities(investigation) {
  const freq = {};

  for (const f of investigation.findings || []) {
    const k = f?.value;
    if (!k) continue;
    freq[k] = (freq[k] || 0) + 1;
  }

  const ranked = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([entity, score]) => ({ entity, score }));

  return {
    clusters: ranked.slice(0, 20),
    confidence: ranked.length > 0 ? Math.min(100, ranked[0][1] * 10) : 0
  };
}

// =============================
// SAFE CRAWLER PIPELINE (NO BYPASS)
// =============================

export async function runSafeCrawler(seedUrls = []) {
  return seedUrls.map(url => ({
    url,
    status: "queued",
    note: "public-source crawl simulation only"
  }));
}

// =============================
// PDF REPORT GENERATOR (STUB)
// =============================

export async function generatePdfReport(investigation) {
  const graph = buildEntityGraph(investigation);
  const timeline = buildTimeline(investigation);
  const correlation = correlateEntities(investigation);

  const report = {
    title: `Investigation Report - ${investigation.id}`,
    summary: investigation.gemini?.summary || "No AI summary",
    graph,
    timeline,
    correlation,
    generatedAt: new Date().toISOString()
  };

  return report;
}

// =============================
// FIRESTORE READ HELPERS
// =============================

export async function getInvestigation(user, firestoreId) {
  if (!user?.uid) throw new Error("Sign in before reading.");

  const ref = doc(db, "users", user.uid, "investigations", firestoreId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

export function subscribeRecentInvestigations(user, onNext, onError) {
  if (!user?.uid) { onNext([]); return () => {}; }

  const q = query(
    collection(db, "users", user.uid, "investigations"),
    orderBy("createdAt", "desc"),
    limit(INVESTIGATION_LIMIT)
  );

  return onSnapshot(q,
    (snap) => onNext(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => onError(err)
  );
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

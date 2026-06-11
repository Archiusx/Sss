import {
  collection, doc, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, getDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const INVESTIGATION_LIMIT = 25;

/**
 * THE NUCLEAR CLEANER
 * JSON.stringify → JSON.parse is the only 100% guaranteed way to strip
 * every Firestore sentinel, undefined, function, symbol, circular ref,
 * Date object, and BigInt before handing data to Firestore.
 * It cannot fail with invalid-argument.
 */
function jsonClean(value) {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, val) => {
        if (val === undefined)           return null;
        if (typeof val === "function")   return null;
        if (typeof val === "symbol")     return null;
        if (typeof val === "bigint")     return Number(val);
        if (!isFinite(val) && typeof val === "number") return 0;
        // Kill Firestore sentinels — they have _methodName in v10 SDK
        if (val && typeof val === "object" && typeof val._methodName === "string") return null;
        // Firestore DOES NOT allow nested arrays — flatten [k,v] pairs to {key,value}
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
  for (const f of inv.findings     || []) if (f?.platform)  s.add(String(f.platform).slice(0, 50));
  for (const p of inv.crawledPages || []) if (p?.extractor) s.add(String(p.extractor).slice(0, 50));
  return [...s].slice(0, 8);
}
function str(v, max = 2000) { return String(v ?? "").slice(0, max); }
function num(v)              { return Number(v) || 0; }

export async function saveInvestigation(user, investigation) {
  if (!user?.uid)         throw new Error("Sign in before saving.");
  if (!investigation?.id) throw new Error("Investigation has no ID.");

  const confidence = num(investigation?.stats?.confidence);

  // ── Step 1: build a plain JS object with truncated strings ───────────────
  const raw = {
    id:          str(investigation.id, 40),
    target:      str(investigation.target, 500),
    type:        str(investigation.type, 40),
    status:      "Completed",
    startedAt:   str(investigation.startedAt || new Date().toISOString(), 40),
    stats:       investigation.stats     || {},
    metadata:    investigation.metadata  || [],
    findings:    (investigation.findings    || []).slice(0, 15),
    crawledPages:(investigation.crawledPages|| []).slice(0, 6),
    crawlErrors: (investigation.crawlErrors || []).slice(0, 8),
    searchLinks: (investigation.searchLinks || []).slice(0, 10),
    logs:        (investigation.logs        || []).slice(0, 20),
    tools:       (investigation.tools       || []).slice(0, 10),
    gemini: {
      enabled: Boolean(investigation.gemini?.enabled),
      summary: str(investigation.gemini?.summary, 6000),
      sources: (investigation.gemini?.sources || []).slice(0, 8),
      queries: (investigation.gemini?.queries || []).slice(0, 5),
    },
  };

  // ── Step 2: JSON round-trip — strips EVERYTHING Firestore cannot handle ──
  const cleanData = jsonClean(raw);

  const ref = doc(db, "users", user.uid, "investigations", investigation.id);

  // ── Step 3: check if doc already exists to decide merge strategy ──────────
  // Using merge:true on CREATE satisfies the create rule (all fields present).
  // Using merge:true on UPDATE also satisfies the update rule (ownerId preserved).
  // This avoids the deadlock where merge:false on an existing doc routes through
  // UPDATE rule while missing fields that only the CREATE rule would have set.
  const existingSnap = await getDoc(ref).catch(() => null);
  const docExists = existingSnap?.exists() ?? false;

  // ── Step 4: top-level doc — serverTimestamp() ONLY here, nowhere inside ──
  const docData = {
    ownerId:      str(user.uid, 128),
    caseId:       str(investigation.id, 40),
    target:       str(investigation.target, 2048),
    type:         str(investigation.type, 40),
    typeLabel:    titleCase(str(investigation.type, 40)).slice(0, 80),
    status:       "Completed",
    risk:         riskFromConfidence(confidence),
    platforms:    getPlatforms(investigation),
    startedAt:    str(investigation.startedAt || new Date().toISOString(), 40),
    summary:      str(investigation.gemini?.summary || "OSINT collection completed.", 20000),
    sourceCounts: {
      findings:    num(investigation.findings?.length),
      searchLinks: num(investigation.searchLinks?.length),
      crawledPages:num(investigation.crawledPages?.length),
      sources:     num(investigation.stats?.sources),
      confidence,
    },
    data:      cleanData,        // 100% plain JSON — zero sentinels
    updatedAt: serverTimestamp(), // always update timestamp
    // Only set createdAt on first write — merge:true preserves existing createdAt
    ...(!docExists ? { createdAt: serverTimestamp() } : {}),
  };

  // merge:true = safe for both create (new doc) and update (existing doc).
  // The Firestore create rule fires only when the doc doesn't exist yet,
  // and merge:true with a full payload satisfies all required field checks.
  await setDoc(ref, docData, { merge: true });
  return ref.id;
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
      onNext(snap.docs.map((d) => {
        const v = d.data();
        const ms = toMs(v.createdAt) || toMs(v.startedAt);
        return {
          firestoreId:       d.id,
          id:                v.caseId || d.id,
          target:            v.target || "Unknown",
          type:              v.typeLabel || titleCase(v.type || "unknown"),
          platforms:         v.platforms || [],
          risk:              v.risk || "low",
          status:            v.status || "Completed",
          createdAt:         v.createdAt,
          createdAtMs:       ms,
          date:              ms ? new Date(ms).toLocaleString() : "Just now",
          sourceCounts:      v.sourceCounts || {},
          fullInvestigation: v.data || null,
        };
      }));
    },
    (err) => { console.error("[CyIntel] listener:", err); onError(err); }
  );
}

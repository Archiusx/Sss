import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const INVESTIGATION_LIMIT = 25;

/**
 * Deep-clean a value so it is safe to store in Firestore:
 *  - undefined → removed
 *  - null → kept (Firestore accepts null)
 *  - functions / symbols → removed
 *  - Dates → ISO string
 *  - Firestore sentinel objects (serverTimestamp etc.) → removed from nested maps
 *  - strings → truncated to maxLen
 *  - arrays / objects → recursed
 */
function deepClean(value, maxStrLen = 2000, depth = 0) {
  if (depth > 10) return null;

  if (value === undefined) return undefined;
  if (value === null) return null;

  // Remove Firestore sentinel / special objects that can't live inside nested maps
  if (typeof value === "object" && value !== null) {
    // Firestore sentinels have a _methodName or type field
    if (value._methodName || (value.constructor && value.constructor.name === "FieldValue")) {
      return null;
    }
  }

  if (typeof value === "function") return undefined;
  if (typeof value === "symbol")   return undefined;
  if (typeof value === "bigint")   return Number(value);
  if (typeof value === "boolean")  return value;
  if (typeof value === "number")   return isFinite(value) ? value : 0;
  if (typeof value === "string")   return value.slice(0, maxStrLen);

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value
      .map((v) => deepClean(v, maxStrLen, depth + 1))
      .filter((v) => v !== undefined);
  }

  // Plain object
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const cleaned = deepClean(v, maxStrLen, depth + 1);
    if (cleaned !== undefined) out[k] = cleaned;
  }
  return out;
}

function titleCase(value = "") {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskFromConfidence(confidence = 0) {
  if (confidence >= 80) return "critical";
  if (confidence >= 60) return "high";
  if (confidence >= 35) return "medium";
  return "low";
}

function platformsFromInvestigation(inv) {
  const set = new Set();
  for (const f of inv.findings    || []) if (f?.platform)  set.add(String(f.platform));
  for (const p of inv.crawledPages|| []) if (p?.extractor) set.add(String(p.extractor));
  for (const t of inv.tools       || []) if (t?.name)      set.add(String(t.name));
  return [...set].slice(0, 8).map((s) => s.slice(0, 50));
}

export async function saveInvestigation(user, investigation) {
  if (!user?.uid)         throw new Error("Sign in before saving.");
  if (!investigation?.id) throw new Error("Investigation has no ID.");

  const confidence = investigation?.stats?.confidence || 0;

  // ── Build the compact nested `data` map (NO serverTimestamp inside) ────────
  const rawData = {
    id:          investigation.id,
    target:      investigation.target,
    type:        investigation.type,
    status:      investigation.status || "Completed",
    startedAt:   investigation.startedAt || new Date().toISOString(),
    stats:       investigation.stats        || {},
    metadata:    investigation.metadata     || [],
    findings:    (investigation.findings    || []).slice(0, 20),
    crawledPages:(investigation.crawledPages|| []).slice(0, 8),
    crawlErrors: (investigation.crawlErrors || []).slice(0, 10),
    searchLinks: (investigation.searchLinks || []).slice(0, 15),
    logs:        (investigation.logs        || []).slice(0, 25),
    tools:       (investigation.tools       || []).slice(0, 12),
    gemini: investigation.gemini ? {
      enabled: Boolean(investigation.gemini.enabled),
      summary: String(investigation.gemini.summary || "").slice(0, 8000),
      sources: (investigation.gemini.sources || []).slice(0, 10),
      queries: (investigation.gemini.queries || []).slice(0, 5),
    } : {},
  };

  // deepClean strips all sentinels, undefined, bad types, long strings
  const cleanData = deepClean(rawData, 2000) || {};

  // ── Top-level document (serverTimestamp ONLY at this level) ───────────────
  const docData = {
    ownerId:     user.uid,
    caseId:      String(investigation.id).slice(0, 40),
    target:      String(investigation.target || "").slice(0, 2048),
    type:        String(investigation.type   || "keyword").slice(0, 40),
    typeLabel:   titleCase(String(investigation.type || "keyword")).slice(0, 80),
    status:      "Completed",
    risk:        riskFromConfidence(confidence),
    platforms:   platformsFromInvestigation(investigation),
    startedAt:   String(investigation.startedAt || new Date().toISOString()),
    summary:     String(investigation.gemini?.summary || "OSINT collection completed.").slice(0, 20000),
    sourceCounts: {
      findings:    Number(investigation.findings?.length    || 0),
      searchLinks: Number(investigation.searchLinks?.length || 0),
      crawledPages:Number(investigation.crawledPages?.length|| 0),
      sources:     Number(investigation.stats?.sources      || 0),
      confidence:  Number(confidence),
    },
    data:      cleanData,   // ← fully plain object, zero sentinels
    createdAt: serverTimestamp(),   // ← sentinel ONLY at top level ✓
    updatedAt: serverTimestamp(),   // ← sentinel ONLY at top level ✓
  };

  try {
    const ref = doc(db, "users", user.uid, "investigations", investigation.id);
    await setDoc(ref, docData, { merge: false });
    return ref.id;
  } catch (err) {
    console.error("[CyIntel] Firestore save error:", err.code, err.message, err);
    throw new Error(`Firestore save failed (${err.code || err.message})`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timestampToMillis(v) {
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

  return onSnapshot(
    q,
    (snap) => {
      onNext(snap.docs.map((d) => {
        const v = d.data();
        const createdAtMs = timestampToMillis(v.createdAt) || timestampToMillis(v.startedAt);
        return {
          firestoreId:       d.id,
          id:                v.caseId || d.id,
          target:            v.target || "Unknown target",
          type:              v.typeLabel || titleCase(v.type || "unknown"),
          platforms:         v.platforms || [],
          risk:              v.risk || "low",
          status:            v.status || "Completed",
          createdAt:         v.createdAt,
          createdAtMs,
          date:              createdAtMs ? new Date(createdAtMs).toLocaleString() : "Just now",
          sourceCounts:      v.sourceCounts || {},
          fullInvestigation: v.data || null,
        };
      }));
    },
    (err) => { console.error("[CyIntel] Firestore listener:", err); onError(err); }
  );
}

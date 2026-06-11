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

// Strip undefined/null/function values so Firestore never throws
function sanitize(value, depth = 0) {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return null;
  if (typeof value === "function") return null;
  if (typeof value === "symbol") return String(value);
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => sanitize(v, depth + 1))
      .filter((v) => v !== null && v !== undefined);
  }
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      const cv = sanitize(v, depth + 1);
      if (cv !== null && cv !== undefined) cleaned[k] = cv;
    }
    return cleaned;
  }
  return value;
}

// Truncate strings to avoid hitting Firestore 1MB doc limit
function truncateStrings(value, maxLen = 3000, depth = 0) {
  if (depth > 8) return value;
  if (typeof value === "string") return value.slice(0, maxLen);
  if (Array.isArray(value)) return value.map((v) => truncateStrings(v, maxLen, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncateStrings(v, maxLen, depth + 1);
    return out;
  }
  return value;
}

function titleCase(value = "") {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function riskFromConfidence(confidence = 0) {
  if (confidence >= 80) return "critical";
  if (confidence >= 60) return "high";
  if (confidence >= 35) return "medium";
  return "low";
}

function platformsFromInvestigation(investigation) {
  const platforms = new Set();
  for (const finding of investigation.findings || []) {
    if (finding?.platform) platforms.add(finding.platform);
  }
  for (const page of investigation.crawledPages || []) {
    if (page?.extractor) platforms.add(page.extractor);
  }
  for (const tool of investigation.tools || []) {
    if (tool?.name) platforms.add(tool.name);
  }
  return [...platforms].slice(0, 8);
}

export function investigationToFirestoreDocument(investigation, user) {
  const confidence = investigation?.stats?.confidence || 0;
  const platforms  = platformsFromInvestigation(investigation);

  // Compact the heavy nested `data` field — store only essential sub-fields
  // so we stay comfortably under Firestore's 1 MB document limit.
  const compactData = sanitize(
    truncateStrings({
      id:          investigation.id,
      target:      investigation.target,
      type:        investigation.type,
      status:      investigation.status,
      startedAt:   investigation.startedAt,
      stats:       investigation.stats,
      metadata:    investigation.metadata,
      // Trim arrays to reasonable sizes
      findings:    (investigation.findings || []).slice(0, 20),
      crawledPages:(investigation.crawledPages || []).slice(0, 10),
      crawlErrors: (investigation.crawlErrors || []).slice(0, 10),
      searchLinks: (investigation.searchLinks || []).slice(0, 15),
      logs:        (investigation.logs || []).slice(0, 30),
      tools:       (investigation.tools || []).slice(0, 12),
      gemini: investigation.gemini
        ? {
            enabled: investigation.gemini.enabled,
            summary: (investigation.gemini.summary || "").slice(0, 10000),
            sources: (investigation.gemini.sources || []).slice(0, 10),
            queries: (investigation.gemini.queries || []).slice(0, 5),
          }
        : null,
    }, 2000)
  );

  return {
    ownerId:    user.uid,
    caseId:     investigation.id,
    target:     (investigation.target || "").slice(0, 2048),
    type:       (investigation.type   || "keyword").slice(0, 40),
    typeLabel:  titleCase((investigation.type || "keyword")).slice(0, 80),
    status:     "Completed",
    risk:       riskFromConfidence(confidence),
    platforms:  platforms.map((p) => String(p).slice(0, 50)),
    startedAt:  investigation.startedAt || new Date().toISOString(),
    summary:    ((investigation.gemini?.summary || "Public-source OSINT collection completed.").slice(0, 20000)),
    sourceCounts: sanitize({
      findings:    investigation.findings?.length     || 0,
      searchLinks: investigation.searchLinks?.length  || 0,
      crawledPages:investigation.crawledPages?.length || 0,
      sources:     investigation.stats?.sources       || 0,
      confidence,
    }),
    data:       compactData || {},
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  };
}

export async function saveInvestigation(user, investigation) {
  if (!user?.uid)           throw new Error("Sign in before saving investigations to Cloud Firestore.");
  if (!investigation?.id)   throw new Error("Cannot save an investigation without a case ID.");

  try {
    const investigationRef = doc(db, "users", user.uid, "investigations", investigation.id);
    const docData = investigationToFirestoreDocument(investigation, user);
    await setDoc(investigationRef, docData, { merge: false });
    return investigationRef.id;
  } catch (error) {
    // Surface Firestore errors clearly for debugging
    console.error("[CyIntel] Firestore save error:", error.code, error.message, error);
    throw new Error(`Firestore save failed (${error.code || error.message}). Check Firestore rules and console for details.`);
  }
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function subscribeRecentInvestigations(user, onNext, onError) {
  if (!user?.uid) {
    onNext([]);
    return () => {};
  }

  const investigationsQuery = query(
    collection(db, "users", user.uid, "investigations"),
    orderBy("createdAt", "desc"),
    limit(INVESTIGATION_LIMIT)
  );

  return onSnapshot(
    investigationsQuery,
    (snapshot) => {
      onNext(
        snapshot.docs.map((docSnapshot) => {
          const value         = docSnapshot.data();
          const createdAtMs   = timestampToMillis(value.createdAt) || timestampToMillis(value.startedAt);
          return {
            firestoreId:      docSnapshot.id,
            id:               value.caseId || docSnapshot.id,
            target:           value.target || "Unknown target",
            type:             value.typeLabel || titleCase(value.type || "unknown"),
            platforms:        value.platforms || [],
            risk:             value.risk || "low",
            status:           value.status || "Completed",
            createdAt:        value.createdAt,
            createdAtMs,
            date:             createdAtMs ? new Date(createdAtMs).toLocaleString() : "Just now",
            sourceCounts:     value.sourceCounts || {},
            fullInvestigation:value.data || null,
          };
        })
      );
    },
    (error) => {
      console.error("[CyIntel] Firestore listener error:", error);
      onError(error);
    }
  );
}

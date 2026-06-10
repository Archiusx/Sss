import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const INVESTIGATION_LIMIT = 25;

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, removeUndefined(nestedValue)])
    );
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
  const platforms = platformsFromInvestigation(investigation);

  const documentData = removeUndefined({
    ownerId: user.uid,
    caseId: investigation.id,
    target: investigation.target,
    type: investigation.type,
    typeLabel: titleCase(investigation.type),
    status: investigation.status || "Completed",
    risk: riskFromConfidence(confidence),
    platforms,
    startedAt: investigation.startedAt,
    summary: (investigation.gemini?.summary || "Public-source OSINT collection completed.").slice(0, 20000),
    sourceCounts: {
      findings: investigation.findings?.length || 0,
      searchLinks: investigation.searchLinks?.length || 0,
      crawledPages: investigation.crawledPages?.length || 0,
      sources: investigation.stats?.sources || 0,
      confidence,
    },
    data: investigation,
  });

  return {
    ...documentData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function saveInvestigation(user, investigation) {
  if (!user?.uid) throw new Error("Sign in before saving investigations to Cloud Firestore.");
  if (!investigation?.id) throw new Error("Cannot save an investigation without a case ID.");

  const investigationRef = doc(db, "users", user.uid, "investigations", investigation.id);
  await setDoc(investigationRef, investigationToFirestoreDocument(investigation, user), { merge: false });
  return investigationRef.id;
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
      onNext(snapshot.docs.map((docSnapshot) => {
        const value = docSnapshot.data();
        const createdAtMs = timestampToMillis(value.createdAt) || timestampToMillis(value.startedAt);
        return {
          firestoreId: docSnapshot.id,
          id: value.caseId || docSnapshot.id,
          target: value.target || "Unknown target",
          type: value.typeLabel || titleCase(value.type || "unknown"),
          platforms: value.platforms || [],
          risk: value.risk || "low",
          status: value.status || "Completed",
          createdAt: value.createdAt,
          createdAtMs,
          date: createdAtMs ? new Date(createdAtMs).toLocaleString() : "Just now",
          sourceCounts: value.sourceCounts || {},
          fullInvestigation: value.data || null,
        };
      }));
    },
    onError
  );
}

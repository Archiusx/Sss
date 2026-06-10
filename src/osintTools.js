const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GEMINI_KEY || "";

const PUBLIC_SEARCH_ENGINES = [
  { name: "Google", url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { name: "Bing", url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { name: "DuckDuckGo", url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
];

const PLATFORM_TEMPLATES = [
  { id: "github", name: "GitHub", abbr: "GH", color: "#24292e", url: (u) => `https://github.com/${u}` },
  { id: "x", name: "Twitter / X", abbr: "X", color: "#111827", url: (u) => `https://x.com/${u}` },
  { id: "instagram", name: "Instagram", abbr: "IG", color: "#e1306c", url: (u) => `https://www.instagram.com/${u}/` },
  { id: "reddit", name: "Reddit", abbr: "RD", color: "#ff4500", url: (u) => `https://www.reddit.com/user/${u}/` },
  { id: "telegram", name: "Telegram", abbr: "TG", color: "#0088cc", url: (u) => `https://t.me/${u}` },
  { id: "youtube", name: "YouTube", abbr: "YT", color: "#ff0000", url: (u) => `https://www.youtube.com/@${u}` },
  { id: "tiktok", name: "TikTok", abbr: "TT", color: "#111827", url: (u) => `https://www.tiktok.com/@${u}` },
  { id: "medium", name: "Medium", abbr: "MD", color: "#111827", url: (u) => `https://medium.com/@${u}` },
];

const OPEN_SOURCE_TOOLS = [
  { name: "WhatsMyName", category: "Username", url: "https://whatsmyname.app/", note: "Checks username presence across many public services." },
  { name: "Sherlock", category: "Username", url: "https://github.com/sherlock-project/sherlock", note: "Open-source username enumeration CLI." },
  { name: "Maigret", category: "Username", url: "https://github.com/soxoj/maigret", note: "Open-source account discovery and report generator." },
  { name: "holehe", category: "Email", url: "https://github.com/megadose/holehe", note: "Open-source email registration checker; run only where lawful." },
  { name: "GHunt", category: "Email", url: "https://github.com/mxrch/GHunt", note: "Open-source Google account OSINT helper." },
  { name: "Epieos", category: "Email/Phone", url: "https://epieos.com/", note: "Public email and phone OSINT portal." },
  { name: "Have I Been Pwned", category: "Email", url: "https://haveibeenpwned.com/", note: "Breach exposure check; use API according to HIBP terms." },
  { name: "ExifTool", category: "Image", url: "https://exiftool.org/", note: "Extracts metadata from local image files." },
  { name: "Google Lens", category: "Image", url: "https://lens.google/", note: "Reverse image search entry point." },
  { name: "TinEye", category: "Image", url: "https://tineye.com/", note: "Reverse image search engine." },
  { name: "urlscan.io", category: "URL", url: "https://urlscan.io/", note: "Public URL reputation and scan data." },
  { name: "crt.sh", category: "Domain", url: "https://crt.sh/", note: "Certificate transparency search." },
];

function nowTime() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

export function detectTargetType(rawTarget, selectedType = "keyword") {
  const target = rawTarget.trim();
  if (!target) return selectedType === "url" ? "profile" : selectedType;
  if (selectedType === "url") return "profile";
  if (selectedType === "image") return "image";
  if (/^https?:\/\//i.test(target)) return "profile";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return "email";
  if (/^[+()\d\s.-]{7,}$/.test(target) && /\d{7,}/.test(target.replace(/\D/g, ""))) return "phone";
  if (target.startsWith("@")) return "username";
  return selectedType;
}

export function cleanUsername(target) {
  return target.trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?/i, "").split(/[/?#]/)[0].split("/").pop();
}

function searchQueries(target, type) {
  const quoted = `"${target}"`;
  const base = [quoted, `${quoted} social profile`, `${quoted} GitHub OR Reddit OR LinkedIn OR Instagram OR Telegram`];
  if (type === "email") return [quoted, `${quoted} breach`, `${quoted} site:github.com OR site:pastebin.com`, `${quoted} profile`];
  if (type === "phone") return [quoted, `${quoted} scam`, `${quoted} business OR profile`];
  if (type === "profile") return [target, `cache:${target}`, `"${target}"`];
  if (type === "image") return [quoted, `${quoted} reverse image search`, `${quoted} metadata`];
  return base;
}

function buildSearchLinks(target, type) {
  return searchQueries(target, type).flatMap((query) =>
    PUBLIC_SEARCH_ENGINES.map((engine) => ({ engine: engine.name, query, url: engine.url(query) }))
  );
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function githubLookup(username) {
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) return null;
  try {
    const data = await fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`);
    return {
      platform: "GitHub",
      status: "found",
      title: data.login,
      url: data.html_url,
      snippet: `${data.public_repos || 0} public repos · ${data.followers || 0} followers${data.created_at ? ` · created ${data.created_at.slice(0, 10)}` : ""}`,
      metadata: {
        name: data.name || "Not public",
        company: data.company || "Not public",
        blog: data.blog || "Not public",
        location: data.location || "Not public",
      },
    };
  } catch (error) {
    return {
      platform: "GitHub",
      status: "not_found",
      title: username,
      url: `https://github.com/${username}`,
      snippet: `GitHub API lookup did not confirm this username (${error.message}).`,
    };
  }
}

function candidateProfiles(target, type) {
  if (type !== "username") return [];
  const username = cleanUsername(target);
  return PLATFORM_TEMPLATES.map((platform) => ({
    ...platform,
    status: "open_link",
    title: `Check ${platform.name}`,
    url: platform.url(username),
    snippet: "Open this public profile candidate to manually verify whether it belongs to the target.",
  }));
}

function parseGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
}

function extractGrounding(data) {
  const metadata = data?.candidates?.[0]?.groundingMetadata || data?.candidates?.[0]?.grounding_metadata || {};
  const chunks = metadata.groundingChunks || metadata.grounding_chunks || [];
  return chunks
    .map((chunk) => chunk.web || chunk.retrievedContext || chunk)
    .filter((web) => web?.uri)
    .map((web) => ({ title: web.title || web.uri, url: web.uri }));
}

async function runGeminiGroundedSearch(target, type) {
  if (!GEMINI_API_KEY) {
    return { enabled: false, summary: "Add VITE_GEMINI_API_KEY to your environment to enable grounded Gemini web search." };
  }

  const prompt = `You are an OSINT assistant for lawful, public-source investigation only. Target type: ${type}. Target: ${target}.
Return concise findings from public web search. Do not reveal private data, do not infer a real-world identity without strong public evidence, and mark uncertainty clearly.
Structure the answer with: Summary, Public matches, Risks/flags, Next manual checks.`;

  const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
    }),
  });

  return {
    enabled: true,
    summary: parseGeminiText(data) || "Gemini returned no text.",
    sources: extractGrounding(data),
    queries: data?.candidates?.[0]?.groundingMetadata?.webSearchQueries || [],
  };
}

function baseMetadata(target, type) {
  const safeTarget = target.trim();
  const metadata = [
    ["Target Type", type.charAt(0).toUpperCase() + type.slice(1)],
    ["Collection Mode", "Public web / open-source only"],
    ["Gemini Search", GEMINI_API_KEY ? `Enabled (${GEMINI_MODEL})` : "Waiting for VITE_GEMINI_API_KEY"],
    ["Started", new Date().toLocaleString()],
  ];
  if (type === "email") metadata.push(["Domain", safeTarget.split("@")[1] || "Unknown"]);
  if (type === "phone") metadata.push(["Digits", safeTarget.replace(/\D/g, "").replace(/.(?=.{4})/g, "•")]);
  if (type === "profile") metadata.push(["URL Host", (() => { try { return new URL(safeTarget).hostname; } catch { return "Invalid URL"; } })()]);
  return metadata;
}

function buildToolRecommendations(type) {
  const category = type === "profile" ? "URL" : type.charAt(0).toUpperCase() + type.slice(1);
  return OPEN_SOURCE_TOOLS.filter((tool) => tool.category.includes(category) || ["WhatsMyName", "Sherlock", "Maigret"].includes(tool.name)).slice(0, 8);
}

export async function runPublicOsintInvestigation({ target, type }) {
  const normalizedTarget = target.trim();
  const detectedType = detectTargetType(normalizedTarget, type);
  if (!normalizedTarget) throw new Error("Enter a username, email, phone, profile URL, keyword, or image URL.");

  const logs = [
    { time: nowTime(), level: "info", msg: `Created public-source case for ${detectedType}: ${normalizedTarget}` },
    { time: nowTime(), level: "info", msg: "Generated search operators and public tool checklist." },
  ];

  const username = detectedType === "username" ? cleanUsername(normalizedTarget) : "";
  const github = username ? await githubLookup(username) : null;
  if (github?.status === "found") logs.unshift({ time: nowTime(), level: "success", msg: "GitHub API confirmed a public profile candidate." });
  if (github?.status === "not_found") logs.unshift({ time: nowTime(), level: "warn", msg: "GitHub API did not confirm the exact username." });

  let gemini = null;
  try {
    gemini = await runGeminiGroundedSearch(normalizedTarget, detectedType);
    logs.unshift({ time: nowTime(), level: gemini.enabled ? "success" : "warn", msg: gemini.enabled ? "Gemini grounded web search completed." : gemini.summary });
  } catch (error) {
    gemini = { enabled: true, summary: `Gemini search failed: ${error.message}`, sources: [] };
    logs.unshift({ time: nowTime(), level: "warn", msg: `Gemini search failed: ${error.message}` });
  }

  const profiles = candidateProfiles(normalizedTarget, detectedType);
  const apiFindings = [github].filter(Boolean);
  const findings = [...apiFindings, ...profiles];
  const foundCount = apiFindings.filter((finding) => finding.status === "found").length;
  const sourceCount = gemini?.sources?.length || 0;
  const confidence = Math.min(92, 35 + foundCount * 20 + sourceCount * 5);

  return {
    id: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    target: normalizedTarget,
    type: detectedType,
    status: "Completed",
    startedAt: new Date().toISOString(),
    metadata: baseMetadata(normalizedTarget, detectedType),
    searchLinks: buildSearchLinks(normalizedTarget, detectedType),
    findings,
    gemini,
    logs,
    tools: buildToolRecommendations(detectedType),
    stats: {
      foundProfiles: foundCount,
      candidateProfiles: profiles.length,
      searchLinks: buildSearchLinks(normalizedTarget, detectedType).length,
      sources: sourceCount,
      confidence,
    },
  };
}

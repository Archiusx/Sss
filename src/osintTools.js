const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const BUILD_TIME_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GEMINI_KEY || "";
const RUNTIME_GEMINI_STORAGE_KEY = "ssf.geminiApiKey";

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
  { name: "Jina Reader", category: "URL/Search", url: "https://jina.ai/reader/", note: "Fetches public pages/search results as clean Markdown for review." },
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

export function getGeminiApiKey() {
  if (BUILD_TIME_GEMINI_API_KEY) return BUILD_TIME_GEMINI_API_KEY;
  if (typeof window === "undefined") return "";
  return window.__GEMINI_API_KEY__ || window.localStorage?.getItem(RUNTIME_GEMINI_STORAGE_KEY) || "";
}

export function hasGeminiApiKey() {
  return Boolean(getGeminiApiKey());
}

export function saveRuntimeGeminiApiKey(apiKey) {
  if (typeof window === "undefined") return false;
  const trimmed = apiKey.trim();
  if (trimmed) window.localStorage?.setItem(RUNTIME_GEMINI_STORAGE_KEY, trimmed);
  else window.localStorage?.removeItem(RUNTIME_GEMINI_STORAGE_KEY);
  return true;
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
  if (type === "profile") return [target, `site:${safeUrlHost(target) || target}`, `"${target}"`];
  if (type === "image") return [quoted, `${quoted} reverse image search`, `${quoted} metadata`];
  return base;
}

function buildSearchLinks(target, type) {
  return searchQueries(target, type).flatMap((query) =>
    PUBLIC_SEARCH_ENGINES.map((engine) => ({ engine: engine.name, query, url: engine.url(query) }))
  );
}

async function fetchJson(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function safeUrlHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function isPublicHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function readerUrlFor(rawUrl) {
  return `https://r.jina.ai/${rawUrl}`;
}

function searchReaderUrlFor(query) {
  return `https://s.jina.ai/${encodeURIComponent(query)}`;
}

function cleanSnippet(text, max = 1200) {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, max);
}

function parseReaderDocument(text, fallbackUrl = "") {
  const title = text.match(/^Title:\s*(.+)$/im)?.[1]?.trim() || safeUrlHost(fallbackUrl) || "Public page";
  const url = text.match(/^URL Source:\s*(.+)$/im)?.[1]?.trim() || fallbackUrl;
  const published = text.match(/^Published Time:\s*(.+)$/im)?.[1]?.trim() || "";
  const body = text.replace(/^Title:.*$/gim, "").replace(/^URL Source:.*$/gim, "").replace(/^Published Time:.*$/gim, "");
  return { title, url, published, snippet: cleanSnippet(body) };
}

function extractUrlsFromText(text) {
  const urls = new Set();
  for (const match of text.matchAll(/^URL Source:\s*(https?:\/\/\S+)/gim)) urls.add(match[1].trim());
  for (const match of text.matchAll(/https?:\/\/[^\s)\]}>"']+/gim)) urls.add(match[0].replace(/[.,;:]+$/, ""));
  return [...urls].filter(isPublicHttpUrl);
}

async function scrapePublicUrl(rawUrl) {
  if (!isPublicHttpUrl(rawUrl)) throw new Error("Only public http(s) URLs can be crawled.");
  const text = await fetchText(readerUrlFor(rawUrl), {
    headers: {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
      "X-Timeout": "10",
    },
  });
  return { ...parseReaderDocument(text, rawUrl), extractor: "Jina Reader" };
}

async function runPublicReaderSearch(target, type) {
  const queries = searchQueries(target, type).slice(0, 2);
  const results = [];
  const errors = [];

  for (const query of queries) {
    try {
      const text = await fetchText(searchReaderUrlFor(query), {
        headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "10" },
      });
      const urls = extractUrlsFromText(text).slice(0, 5);
      results.push({ query, title: `Search: ${query}`, url: searchReaderUrlFor(query), snippet: cleanSnippet(text, 900), extractor: "Jina Search" });
      for (const url of urls) {
        if (!results.some((item) => item.url === url)) results.push({ title: safeUrlHost(url), url, snippet: "Discovered by public web search; content crawler queued below.", extractor: "Search result" });
      }
    } catch (error) {
      errors.push(`${query}: ${error.message}`);
    }
  }

  return { results, errors };
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
    snippet: "Public profile candidate generated from the username; crawler/search results below provide fetched content when accessible.",
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

async function askGemini(prompt, maxOutputTokens = 1400) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { enabled: false, summary: "Gemini API key is not configured. Add VITE_GEMINI_API_KEY before building, or paste a runtime key in the Gemini key field above." };
  }

  const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens },
    }),
  }, 20000);

  return {
    enabled: true,
    summary: parseGeminiText(data) || "Gemini returned no text.",
    sources: extractGrounding(data),
    queries: data?.candidates?.[0]?.groundingMetadata?.webSearchQueries || [],
  };
}

async function runGeminiGroundedSearch(target, type, crawledPages = []) {
  const crawlContext = crawledPages.length
    ? `\n\nFetched page/search content to use as evidence:\n${crawledPages.slice(0, 6).map((page, i) => `[${i + 1}] ${page.title}\nURL: ${page.url}\nExtractor: ${page.extractor}\nSnippet:\n${page.snippet}`).join("\n\n")}`
    : "";

  const prompt = `You are an OSINT assistant for lawful, public-source investigation only. Target type: ${type}. Target: ${target}.
Search public web sources, then combine them with any fetched page content below. Do not reveal private data, do not infer a real-world identity without strong public evidence, and mark uncertainty clearly.
Return concise findings with: Summary, Public matches, Fetched content evidence, Risks/flags, Next checks.${crawlContext}`;

  return askGemini(prompt);
}

async function summarizeWithGemini(target, type, crawledPages) {
  if (!crawledPages.length) return null;
  const prompt = `Summarize only this public web content for a lawful OSINT workflow. Target type: ${type}. Target: ${target}.
Do not infer identity beyond the supplied public content. Cite URLs inline by number.

${crawledPages.slice(0, 8).map((page, i) => `[${i + 1}] ${page.title}\nURL: ${page.url}\n${page.snippet}`).join("\n\n")}`;
  return askGemini(prompt, 900);
}

function baseMetadata(target, type) {
  const safeTarget = target.trim();
  const metadata = [
    ["Target Type", type.charAt(0).toUpperCase() + type.slice(1)],
    ["Collection Mode", "Public web search + crawler + open-source APIs"],
    ["Gemini Search", getGeminiApiKey() ? `Enabled (${GEMINI_MODEL})` : "No key detected at runtime"],
    ["Started", new Date().toLocaleString()],
  ];
  if (type === "email") metadata.push(["Domain", safeTarget.split("@")[1] || "Unknown"]);
  if (type === "phone") metadata.push(["Digits", safeTarget.replace(/\D/g, "").replace(/.(?=.{4})/g, "•")]);
  if (type === "profile") metadata.push(["URL Host", safeUrlHost(safeTarget) || "Invalid URL"]);
  return metadata;
}

function buildToolRecommendations(type) {
  const category = type === "profile" ? "URL" : type.charAt(0).toUpperCase() + type.slice(1);
  return OPEN_SOURCE_TOOLS.filter((tool) => tool.category.includes(category) || tool.category.includes("Search") || ["WhatsMyName", "Sherlock", "Maigret"].includes(tool.name)).slice(0, 8);
}

export async function runPublicOsintInvestigation({ target, type }) {
  const normalizedTarget = target.trim();
  const detectedType = detectTargetType(normalizedTarget, type);
  if (!normalizedTarget) throw new Error("Enter a username, email, phone, profile URL, keyword, or image URL.");

  const logs = [
    { time: nowTime(), level: "info", msg: `Created public-source case for ${detectedType}: ${normalizedTarget}` },
    { time: nowTime(), level: "info", msg: "Generated search operators, public crawler queue, and OSINT tool checklist." },
  ];

  const username = detectedType === "username" ? cleanUsername(normalizedTarget) : "";
  const github = username ? await githubLookup(username) : null;
  if (github?.status === "found") logs.unshift({ time: nowTime(), level: "success", msg: "GitHub API confirmed a public profile candidate." });
  if (github?.status === "not_found") logs.unshift({ time: nowTime(), level: "warn", msg: "GitHub API did not confirm the exact username." });

  const crawledPages = [];
  const crawlErrors = [];

  if ((detectedType === "profile" || detectedType === "image") && isPublicHttpUrl(normalizedTarget)) {
    try {
      crawledPages.push(await scrapePublicUrl(normalizedTarget));
      logs.unshift({ time: nowTime(), level: "success", msg: "Fetched the submitted public URL with the page reader." });
    } catch (error) {
      crawlErrors.push(`${normalizedTarget}: ${error.message}`);
      logs.unshift({ time: nowTime(), level: "warn", msg: `Submitted URL crawler failed: ${error.message}` });
    }
  }

  try {
    const webSearch = await runPublicReaderSearch(normalizedTarget, detectedType);
    crawledPages.push(...webSearch.results);
    crawlErrors.push(...webSearch.errors);
    if (webSearch.results.length) logs.unshift({ time: nowTime(), level: "success", msg: `Public web search/crawler collected ${webSearch.results.length} readable result(s).` });
  } catch (error) {
    crawlErrors.push(error.message);
    logs.unshift({ time: nowTime(), level: "warn", msg: `Public web search/crawler failed: ${error.message}` });
  }

  const uniqueUrls = [...new Set(crawledPages.map((page) => page.url).filter(isPublicHttpUrl))].slice(0, 4);
  for (const url of uniqueUrls) {
    if (crawledPages.some((page) => page.url === url && page.extractor === "Jina Reader")) continue;
    try {
      crawledPages.push(await scrapePublicUrl(url));
    } catch (error) {
      crawlErrors.push(`${url}: ${error.message}`);
    }
  }

  let gemini = null;
  try {
    gemini = await runGeminiGroundedSearch(normalizedTarget, detectedType, crawledPages);
    logs.unshift({ time: nowTime(), level: gemini.enabled ? "success" : "warn", msg: gemini.enabled ? "Gemini grounded web search analyzed crawler output." : gemini.summary });
  } catch (error) {
    gemini = { enabled: true, summary: `Gemini search failed: ${error.message}`, sources: [], queries: [] };
    logs.unshift({ time: nowTime(), level: "warn", msg: `Gemini search failed: ${error.message}` });
  }

  if (gemini?.sources?.length) {
    const geminiUrls = [...new Set(gemini.sources.map((source) => source.url).filter(isPublicHttpUrl))].slice(0, 5);
    for (const url of geminiUrls) {
      if (crawledPages.some((page) => page.url === url)) continue;
      try {
        crawledPages.push(await scrapePublicUrl(url));
      } catch (error) {
        crawlErrors.push(`${url}: ${error.message}`);
      }
    }
  }

  if (getGeminiApiKey() && crawledPages.length) {
    try {
      const crawlSummary = await summarizeWithGemini(normalizedTarget, detectedType, crawledPages);
      if (crawlSummary?.summary) {
        gemini = {
          ...gemini,
          summary: `${gemini?.summary || ""}\n\n---\nCrawler synthesis:\n${crawlSummary.summary}`.trim(),
          sources: [...(gemini?.sources || []), ...(crawlSummary.sources || [])],
        };
      }
    } catch (error) {
      logs.unshift({ time: nowTime(), level: "warn", msg: `Gemini crawler synthesis failed: ${error.message}` });
    }
  }

  if (crawlErrors.length) logs.push({ time: nowTime(), level: "warn", msg: `Crawler skipped ${crawlErrors.length} page(s) because they blocked public reading or timed out.` });

  const profiles = candidateProfiles(normalizedTarget, detectedType);
  const apiFindings = [github].filter(Boolean);
  const findings = [...apiFindings, ...profiles];
  const foundCount = apiFindings.filter((finding) => finding.status === "found").length;
  const sourceCount = new Set([...(gemini?.sources || []).map((s) => s.url), ...crawledPages.map((p) => p.url)]).size;
  const confidence = Math.min(92, 35 + foundCount * 20 + Math.min(sourceCount, 8) * 5);

  const searchLinks = buildSearchLinks(normalizedTarget, detectedType);

  return {
    id: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    target: normalizedTarget,
    type: detectedType,
    status: "Completed",
    startedAt: new Date().toISOString(),
    metadata: baseMetadata(normalizedTarget, detectedType),
    searchLinks,
    findings,
    crawledPages,
    crawlErrors,
    gemini,
    logs,
    tools: buildToolRecommendations(detectedType),
    stats: {
      foundProfiles: foundCount,
      candidateProfiles: profiles.length,
      searchLinks: searchLinks.length,
      sources: sourceCount,
      crawledPages: crawledPages.length,
      confidence,
    },
  };
}

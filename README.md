<div align="center">

# 🛡️ Smart Suspect Finder — CyIntel Dashboard

**Production-ready React intelligence dashboard for lawful public-source OSINT investigations.**

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore-FFCA28?logo=firebase&logoColor=111827)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwindcss&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-Analytics-2563EB)
![AI](https://img.shields.io/badge/AI%20Layer-Gemini%20Ready-10B981)
![License](https://img.shields.io/badge/Use-Lawful%20OSINT-important)

</div>

---

## 📌 Overview

Smart Suspect Finder is a browser-based cyber-intelligence workspace built with **React**, **Vite**, **Firebase Authentication**, and **Cloud Firestore**. It enables structured, lawful **public-source intelligence collection (OSINT)** with AI-assisted analysis, investigation tracking, and real-time analytics.

The system is designed for analyst workflows: authentication, structured case storage, investigation graphing, and AI-enhanced summarization.

---

## ✨ Features

- 🔐 Firebase Authentication with session persistence
- ☁️ Firestore investigation storage per user
- 🧠 AI-assisted analysis layer (Gemini/OpenAI compatible adapter)
- 📊 Analytics dashboard (risk scoring, confidence trends)
- 🧭 Investigation graph builder (entities + sources + links)
- 🔎 OSINT collection pipeline (public-source only)
- ⚡ Real-time recent investigations via Firestore listeners
- 🧪 Debug mode (auth state, write status, Firestore health)

---

## 🧰 OSINT Tooling Layer

The system includes modular OSINT utilities for lawful public-source intelligence gathering:

### Supported Tool Categories

- 🔎 Username footprinting (public profile discovery)
- 📧 Email pattern analysis (format inference only)
- 📱 Phone metadata enrichment (region-level only)
- 🌐 Public web search aggregation
- 🧠 AI summarization of collected artifacts
- 📊 Risk scoring engine (heuristic-based)

### Optional Integrations

- Google Gemini API (server-proxy recommended)
- OpenAI-compatible endpoints (self-hosted proxy layer recommended)
- Public search APIs (DuckDuckGo / Serp-style providers)

> ⚠️ Note: This system does NOT include or support bypass proxies, scraping restricted services, or unauthorized access mechanisms.

---

## 🧠 AI Analytics Layer

AI capabilities are integrated through a safe abstraction layer:

- Summarization of investigation data
- Entity clustering (platforms, usernames, sources)
- Confidence scoring refinement
- Report generation (executive + technical views)

### Recommended Architecture

```text
Frontend (React)
   ↓
OSINT Engine (client-safe processing)
   ↓
Backend Proxy (server-side only)
   ↓
AI Provider (Gemini / OpenAI / local LLM)
```

> 🔐 API keys must NEVER be exposed in frontend code. Use server-side proxy or environment secrets.

---

## 📊 Debug & Observability Dashboard

Built-in diagnostic tools include:

- Auth state inspector (`auth.currentUser` tracking)
- Firestore write success/failure logs
- Investigation lifecycle tracing
- Queue status monitor (when enabled)
- Real-time error logging panel

---

## 🗂️ Project Structure

```text
src/
├── dashboard.jsx
├── firebase.js
├── investigationStore.js
├── osintTools.js
├── ai/
│   ├── aiClient.js
│   ├── promptEngine.js
│   └── riskModel.js
└── debug/
    └── debugPanel.jsx
```

---

## 🚀 Production Enhancements

### ✔ Stability Layer
- Write queue system (offline-safe)
- Retry engine with exponential backoff
- Atomic Firestore writes

### ✔ AI Layer
- Server-side API proxy for Gemini/OpenAI
- Cached AI responses per investigation
- Rate-limited request handling

### ✔ Security Model
- Auth-scoped Firestore access
- No client-side secret exposure
- Public-source only OSINT constraints

---

## 🔐 Security Notes

- Firestore access is scoped per authenticated user
- No private database scraping or credential harvesting
- AI API keys must be stored server-side only
- Proxy layer is for routing requests, NOT bypassing restrictions

---

## ⚖️ Responsible Use

This system is strictly intended for **lawful public-source intelligence analysis**. It must not be used for unauthorized surveillance, credential harvesting, or bypassing platform protections.

---

## 📈 Future Extensions

- Multi-tenant investigation graph database
- Distributed OSINT workers (server-side)
- Evidence timeline reconstruction engine
- Advanced AI correlation engine (entity linking)

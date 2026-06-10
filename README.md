<div align="center">

# 🛡️ Smart Suspect Finder — CyIntel Dashboard

**Production-ready React intelligence dashboard for lawful public-source OSINT investigations.**

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore-FFCA28?logo=firebase&logoColor=111827)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwindcss&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-Analytics-2563EB)
![License](https://img.shields.io/badge/Use-Lawful%20OSINT-important)

</div>

---

## 📌 Overview

Smart Suspect Finder is a browser-based cyber-intelligence workspace built with **React**, **Vite**, **Firebase Authentication**, and **Cloud Firestore**. Analysts can run lawful public-source investigations against usernames, emails, phone numbers, public profile URLs, keywords, or public image URLs, then persist the complete case package in Firestore for recent-case review and continuity.

The dashboard is designed for production-style workflows: authenticated users, scoped Firestore data, real-time recent investigations, relative timestamps such as `2 Min ago`, public-source collection guardrails, and optional Gemini-assisted synthesis.

---

## ✨ Features

- 🔐 **Firebase Authentication** session support with persistent browser auth.
- ☁️ **Cloud Firestore case storage** under each authenticated user's investigation collection.
- 🕒 **Recent Investigations** table with live Firestore sync and human-readable relative time.
- 🔎 **Multi-target OSINT workflow** for usernames, emails, phone numbers, URLs, keywords, and public image URLs.
- 🌐 **Public web collection** using search operators, public crawler output, and open-source profile/tool shortcuts.
- 🤖 **Optional Gemini analysis** through `VITE_GEMINI_API_KEY` or runtime key entry.
- 📊 **Executive dashboard visuals** powered by Recharts.
- 🧭 **Analyst navigation** across dashboard, OSINT collection, AI analysis, graph, and report pages.
- 🛡️ **Firestore security rules** that scope users and investigations to the signed-in owner.

---

## 🧰 Tech Stack

| Layer | Technology |
| --- | --- |
| UI | ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827) |
| Build Tool | ![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white) |
| Styling | ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwindcss&logoColor=white) |
| Backend | ![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=111827) |
| Charts | Recharts |
| AI Assist | Optional Google Gemini API |

---

## 🗂️ Project Structure

```text
.
├── firestore.rules          # Firestore owner-scoped user + investigation rules
├── firebase.json            # Firebase hosting / project config
├── src/
│   ├── dashboard.jsx        # Main dashboard, OSINT pages, and recent investigations UI
│   ├── firebase.js          # Firebase app, auth, Firestore, and database initialization
│   ├── investigationStore.js# Firestore save/listen helpers for investigation records
│   ├── osintTools.js        # Public-source OSINT collection and Gemini synthesis helpers
│   ├── LoginPage.jsx        # Authentication UI
│   └── main.jsx             # React entrypoint
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **npm 9+**
- Firebase project with Authentication and Cloud Firestore enabled
- Optional Gemini API key for grounded AI summaries

### Installation

```bash
npm install
```

### Environment Configuration

Create a local `.env` file if you want Gemini analysis enabled at build time:

```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

> ⚠️ Never commit real API keys or secrets. Use local `.env` files or your hosting provider's secret management.

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

### Preview Production Bundle

```bash
npm run preview
```

---

## ☁️ Firestore Data Model

Investigation documents are stored per authenticated user:

```text
users/{uid}/investigations/{caseId}
```

Each document contains searchable summary fields plus the complete investigation payload:

```js
{
  ownerId: "firebase-auth-uid",
  caseId: "INV-2026-123456",
  target: "@example_user",
  type: "username",
  typeLabel: "Username",
  status: "Completed",
  risk: "medium",
  platforms: ["GitHub", "Jina Search", "WhatsMyName"],
  startedAt: "2026-06-10T12:00:00.000Z",
  summary: "Public-source OSINT collection completed.",
  sourceCounts: {
    findings: 4,
    searchLinks: 12,
    crawledPages: 8,
    sources: 6,
    confidence: 70
  },
  data: { /* complete OSINT investigation result */ },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

---

## 🔐 Security Notes

- Firestore reads and writes are scoped to the signed-in owner.
- User profile documents have strict field validation.
- Investigation documents require owner identity, valid status/risk values, timestamp enforcement, and bounded summary metadata.
- The OSINT workflow uses public-source collection only and avoids private databases or intrusive enrichment.

Deploy Firestore rules after review:

```bash
firebase deploy --only firestore:rules
```

---

## 🧪 Quality Checks

Run the production build before deploying:

```bash
npm run build
```

Recommended deployment checklist:

- ✅ Firebase Authentication providers configured.
- ✅ Cloud Firestore enabled.
- ✅ Firestore rules deployed.
- ✅ `.env` or hosting secrets configured for optional Gemini usage.
- ✅ Production build passes locally or in CI.

---

## ⚖️ Responsible Use

This project is intended for **lawful, ethical, public-source intelligence work**. Only investigate targets when you have proper authority, consent, or a legitimate investigative basis. Respect platform terms of service, privacy laws, and organizational policies.

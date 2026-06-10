# Smart Suspect Finder / CyIntel Dashboard

React + Vite intelligence dashboard with a public-source OSINT investigation workflow.

## Setup

```bash
npm install
cp .env.example .env
# Add your Gemini key to .env as VITE_GEMINI_API_KEY=...
npm run dev
```

## OSINT workflow

The **New Investigation** and **OSINT Collection** screens can investigate a username, email, phone number, profile URL, keyword, or public image URL. The app uses:

- public search operator links for Google, Bing, and DuckDuckGo;
- open-source OSINT tool shortcuts such as WhatsMyName, Sherlock, Maigret, GHunt, ExifTool, TinEye, and urlscan.io;
- GitHub's public users API for exact username checks;
- optional Gemini grounded web search when `VITE_GEMINI_API_KEY` is present.

> Keep API keys in local environment variables. Never commit real keys to the repository.

# OpenReverse AI

**Analyze Anything. Understand Everything.**

An open-source AI-powered reverse engineering, software analysis, and defensive security intelligence platform.

## Features

- **Unified Workspace Dashboard**: Project overview, analyses, open findings, reports, AI usage tracking, search, notifications, and dark/light themes.
- **Website Analyzer**: SSRF-protected HTML, CSS, JavaScript, technology stack, metadata, SEO, performance, and HTTP security header inspection.
- **APK Analyzer**: Strictly static in-memory inspection of Android `.apk` archives, `AndroidManifest.xml` string pools, permissions, DEX files, native `.so` ABIs, components, and signing certificates.
- **EXE / PE Analyzer**: Strictly static Windows PE32/PE32+ header parser inspecting COFF architecture, ASLR/DEP/CFG mitigations, section Shannon entropy, Authenticode signature table, and imported DLLs.
- **Source Code Analyzer**: Static inspection across 12 languages (Python, JavaScript, TypeScript, Java, C, C++, PHP, Go, HTML, CSS, JSON, XML) and `.zip` archives with function/class extraction, cyclomatic complexity, secret detection, and OWASP checks.
- **AI Code Intelligence**: Server-side Google Gemini integration (`@google/genai`) with optional external Ollama connector, supporting code explanation, documentation generation, bug review, and English / Bengali (`বাংলা`) output.
- **REST & OpenAPI Inspector**: Parse OpenAPI 3.x / Swagger YAML/JSON specs and probe authorized endpoints behind SSRF protections.
- **Architecture Mapper**: Interactive SVG module dependency graph, API map, database ER view, and project file tree.
- **Automation Engine**: Scheduled re-analysis monitors with SHA-256 change detection.
- **Report Center**: Export downloadable PDF, HTML, JSON, and Markdown reports with evidence, timestamps, and limitations.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, jsPDF
- **Backend**: Node.js 22, Express, Multer (in-memory), Cheerio, JSZip, js-yaml
- **Database & Auth**: Firebase Authentication (Google Sign-In) & Cloud Firestore
- **AI**: Google Gemini API (`@google/genai`) + optional external Ollama connector

## Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables (copy `.env.example` to `.env`):
   - `GEMINI_API_KEY`: Your Google Gemini API key (configured via Secrets in AI Studio or `.env` locally).
   - `APP_URL`: Public URL of your deployment for CORS allowlisting.
3. Configure Firebase:
   - Ensure `firebase-applet-config.json` contains your Firebase Web App config and `firestoreDatabaseId`.
   - Deploy `firestore.rules` to your Firebase project (`firebase deploy --only firestore:rules`).
4. Start the development server on port 3000:
   ```bash
   npm run dev
   ```

## Testing & Verification

```bash
npm run lint        # TypeScript type-checking
npm run lint:rules  # ESLint @firebase/eslint-plugin-security-rules audit
npm test            # Unit tests for SSRF guard and static analyzers
npm run build       # Production Vite bundle
```

## Deployment

- **Google Cloud Run / Node.js**:
  ```bash
  npm run build
  NODE_ENV=production npm start
  ```
- Ensure `GEMINI_API_KEY` and `APP_URL` are provided as runtime environment secrets. Never commit `.env` or production credentials.

## Ethical & Defensive Scope

OpenReverse AI is strictly for analyzing systems, binaries, APIs, and source repositories you own or have explicit authorization to inspect. Uploaded executables and APKs are never executed on the server.

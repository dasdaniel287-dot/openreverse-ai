# OpenReverse AI — Architecture Documentation

## System Overview

OpenReverse AI uses a unified full-stack architecture served on a single origin (port `3000`):

1. **React + TypeScript Client (`src/`)**:
   - Connects directly to Firebase Auth (Google Sign-In) and Cloud Firestore (`firebase-applet-config.json`).
   - Renders 13 integrated views: Dashboard, Projects & File Vault, Website Analyzer, APK Analyzer, EXE/PE Analyzer, Source Code Analyzer, API Inspector, Security & OWASP Analyzer, AI Code Assistant, Architecture Mapper, Automation Engine, Report Center, and Settings.
2. **Express API Server (`server.ts`, `server/`)**:
   - Authenticates requests by verifying Firebase RS256 ID tokens against Google's public X.509 certificates (`server/middleware/auth.ts`).
   - Enforces rate limiting (`server/middleware/rateLimit.ts`) and strict SSRF protections (`server/middleware/ssrfGuard.ts`).
   - Executes all static analyzers in memory (`server/analyzers/*`) and proxies AI requests through `@google/genai` (`server/ai/aiService.ts`) so `GEMINI_API_KEY` never leaves the server.
3. **Cloud Firestore Collections (`firebase-blueprint.json` & `firestore.rules`)**:
   - `users`, `projects`, `uploadedFiles`, `analysisJobs`, `analysisResults`, `securityFindings`, `aiConversations`, `reports`, `notifications`, `auditLogs`, `userSettings`.

# Contributing to OpenReverse AI

Thank you for helping improve OpenReverse AI.

## Guidelines

1. **Defensive & Ethical Scope**: All analyzers and AI prompts must remain strictly static, non-destructive, and defensive. Pull requests introducing exploit automation, DRM bypass, malware delivery, or arbitrary binary execution will be rejected.
2. **Code Quality**:
   - Write strict TypeScript (`npm run lint` must pass with 0 errors).
   - Keep server-side Gemini calls exclusively inside `server/ai/` and never expose API keys to `src/`.
   - Update `firebase-blueprint.json`, `firestore.rules`, and run `npm run lint:rules` whenever changing Firestore schemas.
3. **Testing**:
   - Add unit tests in `tests/` for any new parser or security guard.
   - Ensure `npm test` and `npm run build` pass before submitting a pull request.

# Security Policy

## Supported Usage & Defensive Boundaries

OpenReverse AI is designed exclusively for authorized software analysis, architecture understanding, and defensive security auditing.

- **Non-Execution Guarantee**: Uploaded `.apk`, `.exe`, `.dll`, and `.zip` archives are parsed strictly as read-only buffers in memory and are never executed on the host.
- **SSRF & DNS Rebinding Protection**: All network requests made by the Website Analyzer and API Inspector validate resolved DNS IP addresses against private, loopback, link-local, and cloud metadata CIDR blocks (`server/middleware/ssrfGuard.ts`) and re-validate every HTTP redirect hop.
- **Authentication & Tenant Isolation**: Express endpoints verify Firebase RS256 ID tokens (`server/middleware/auth.ts`), and Firestore Security Rules (`firestore.rules`) enforce strict per-user ownership and volumetric input validation across all 11 collections.

## Reporting a Vulnerability

If you discover a security issue in OpenReverse AI, please report it privately to the repository maintainers with reproduction details rather than opening a public issue with exploit payloads.

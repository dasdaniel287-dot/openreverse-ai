# OpenReverse AI — Firestore Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Strict Ownership**: Every document in `projects`, `uploadedFiles`, `analysisJobs`, `analysisResults`, `securityFindings`, `aiConversations`, `reports`, `notifications`, and `auditLogs` must contain `ownerId == request.auth.uid` matching the authenticated verified user.
2. **PII Isolation**: `/users/{userId}` and `/userSettings/{userId}` contain private user profile/email/preference data and are strictly readable and writable only by `userId == request.auth.uid` (or verified bootstrapped admin). Blanket `isSignedIn()` reads are forbidden.
3. **Referential Consistency**: Documents in `uploadedFiles`, `analysisJobs`, `analysisResults`, `securityFindings`, and `reports` must reference an existing `/projects/{projectId}` owned by `request.auth.uid`.
4. **Immutable Audit Trail**: `/auditLogs/{logId}` documents are append-only (`create` allowed for owner; `update` and `delete` strictly denied).
5. **Privilege Escalation Guard**: Users cannot self-assign `role: 'admin'` on `/users/{userId}` during creation or update.
6. **Temporal Integrity**: `createdAt` and `updatedAt` timestamps must equal `request.time` on creation/update and `createdAt`/`ownerId`/`id` remain immutable on updates.
7. **Volumetric Bounds & ID Hardening**: All document path IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars) and every string/list field has explicit `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Project Read**: `get /projects/proj_1` with `auth = null`.
2. **Cross-Tenant Project List**: `list /projects` without `where('ownerId', '==', auth.uid)`.
3. **Spoofed Owner Create**: `create /projects/proj_2` with `ownerId: "other_uid"` when `auth.uid == "alice"`.
4. **Self-Assigned Admin Role**: `create /users/alice` with `role: "admin"`.
5. **Ghost Field Shadow Update**: `update /projects/proj_1` adding `{ isEnterprise: true }` not in allowlist.
6. **Unverified Email Write**: `create /projects/proj_3` when `auth.token.email_verified == false`.
7. **Orphaned Analysis Result**: `create /analysisResults/res_1` referencing nonexistent `projectId: "missing_proj"`.
8. **Cross-Tenant File Injection**: `create /uploadedFiles/file_1` referencing `projectId` owned by `"bob"` while signed in as `"alice"`.
9. **Audit Log Tampering**: `update /auditLogs/log_1` or `delete /auditLogs/log_1` by the owner.
10. **Terminal Job State Tampering**: `update /analysisJobs/job_1` after `status == "completed"` trying to change `analyzerType` or `ownerId`.
11. **Oversized ID Poisoning**: `get /projects/${'a'.repeat(300)}` violating `isValidId()`.
12. **PII Cross-User Read**: `get /users/bob` while signed in as `"alice"`.

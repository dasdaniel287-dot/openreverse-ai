import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  AiChatMessage,
  AiConversationRecord,
  AnalysisJobRecord,
  AnalysisResultRecord,
  AnalyzerType,
  AuditLogRecord,
  FindingStatus,
  NotificationRecord,
  ProjectRecord,
  ReportFormat,
  ReportRecord,
  ScheduleInterval,
  SecurityFindingRecord,
  StaticFindingInput,
  TargetType,
  UploadedFileRecord,
  UserProfile,
  UserSettingsRecord,
} from '../types';

export function generateId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampStr(value: string | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

// Keep Firestore analysisResult.data safely below 1MB document ceiling
function sanitizeResultPayload(data: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(data);
  if (serialized.length <= 400_000) {
    return JSON.parse(serialized) as Record<string, unknown>;
  }
  return {
    truncated: true,
    originalBytes: serialized.length,
    summary: typeof data.summary === 'string' ? data.summary.slice(0, 2000) : 'Large inspection payload compacted for storage.',
  };
}

export async function ensureUserProfileAndSettings(params: {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
}): Promise<{ profile: UserProfile; settings: UserSettingsRecord }> {
  const userRef = doc(db, 'users', params.uid);
  const settingsRef = doc(db, 'userSettings', params.uid);

  let profile: UserProfile;
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const payload = {
        uid: params.uid,
        displayName: clampStr(params.displayName || params.email.split('@')[0] || 'Analyst', 120),
        email: clampStr(params.email, 254),
        ...(params.photoURL ? { photoURL: clampStr(params.photoURL, 512) } : {}),
        role: 'analyst' as const,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, payload);
      profile = { ...payload, createdAt: undefined, updatedAt: undefined };
    } else {
      profile = snap.data() as UserProfile;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${params.uid}`);
  }

  let settings: UserSettingsRecord;
  try {
    const sSnap = await getDoc(settingsRef);
    if (!sSnap.exists()) {
      const defaultSettings = {
        ownerId: params.uid,
        theme: 'dark' as const,
        aiProvider: 'gemini' as const,
        geminiModel: 'gemini-4-hydrogen' as const,
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'qwen2.5-coder:7b',
        preferredLanguage: 'en' as const,
        emailNotifications: true,
        totalAiRequests: 0,
        updatedAt: serverTimestamp(),
      };
      await setDoc(settingsRef, defaultSettings);
      settings = { ...defaultSettings, updatedAt: undefined };
    } else {
      settings = sSnap.data() as UserSettingsRecord;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `userSettings/${params.uid}`);
  }

  return { profile, settings };
}

export async function updateUserProfileName(uid: string, displayName: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: clampStr(displayName, 120) || 'Analyst',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateUserSettings(
  uid: string,
  patch: Partial<Omit<UserSettingsRecord, 'ownerId' | 'updatedAt'>>
): Promise<void> {
  const path = `userSettings/${uid}`;
  try {
    await updateDoc(doc(db, 'userSettings', uid), {
      ...patch,
      ...(patch.ollamaBaseUrl !== undefined ? { ollamaBaseUrl: clampStr(patch.ollamaBaseUrl, 256) } : {}),
      ...(patch.ollamaModel !== undefined ? { ollamaModel: clampStr(patch.ollamaModel, 100) } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function recordAuditLog(params: {
  ownerId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: string;
}): Promise<void> {
  const id = generateId('log');
  try {
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      ownerId: params.ownerId,
      action: clampStr(params.action, 120),
      resourceType: clampStr(params.resourceType, 80),
      resourceId: clampStr(params.resourceId, 128),
      ...(params.details ? { details: clampStr(params.details, 600) } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `auditLogs/${id}`);
  }
}

export async function createNotification(params: {
  ownerId: string;
  title: string;
  message: string;
  category: NotificationRecord['category'];
}): Promise<void> {
  const id = generateId('ntf');
  try {
    await setDoc(doc(db, 'notifications', id), {
      id,
      ownerId: params.ownerId,
      title: clampStr(params.title, 160),
      message: clampStr(params.message, 600),
      category: params.category,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${id}`);
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
  }
}

export async function createProject(params: {
  ownerId: string;
  name: string;
  description?: string;
  targetType: TargetType;
  targetUrl?: string;
  authorizationAttested: boolean;
}): Promise<string> {
  const id = generateId('proj');
  try {
    await setDoc(doc(db, 'projects', id), {
      id,
      ownerId: params.ownerId,
      name: clampStr(params.name, 120),
      ...(params.description ? { description: clampStr(params.description, 1000) } : {}),
      targetType: params.targetType,
      ...(params.targetUrl ? { targetUrl: clampStr(params.targetUrl, 512) } : {}),
      authorizationAttested: Boolean(params.authorizationAttested),
      status: 'active',
      analysisCount: 0,
      findingCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      ownerId: params.ownerId,
      action: 'project.created',
      resourceType: 'project',
      resourceId: id,
      details: `Created project "${clampStr(params.name, 120)}"`,
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projects/${id}`);
  }
}

export async function updateProjectStatus(projectId: string, status: 'active' | 'archived'): Promise<void> {
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}`);
  }
}

export async function deleteProjectCascade(ownerId: string, projectId: string): Promise<void> {
  try {
    const relatedCollections = [
      'uploadedFiles',
      'analysisJobs',
      'analysisResults',
      'securityFindings',
      'reports',
    ];
    for (const colName of relatedCollections) {
      const q = query(
        collection(db, colName),
        where('ownerId', '==', ownerId),
        where('projectId', '==', projectId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, 'projects', projectId));
    await recordAuditLog({
      ownerId,
      action: 'project.deleted',
      resourceType: 'project',
      resourceId: projectId,
      details: 'Deleted project and associated workspace records.',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}`);
  }
}

export async function saveUploadedFileMetadata(params: {
  ownerId: string;
  projectId: string;
  fileName: string;
  fileCategory: UploadedFileRecord['fileCategory'];
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  previewText?: string;
}): Promise<string> {
  const id = generateId('file');
  try {
    await setDoc(doc(db, 'uploadedFiles', id), {
      id,
      ownerId: params.ownerId,
      projectId: params.projectId,
      fileName: clampStr(params.fileName, 255),
      fileCategory: params.fileCategory,
      mimeType: clampStr(params.mimeType || 'application/octet-stream', 128),
      sizeBytes: Math.max(0, Math.min(52428800, Math.round(params.sizeBytes))),
      sha256: params.sha256.toLowerCase().slice(0, 64),
      ...(params.previewText ? { previewText: clampStr(params.previewText, 16000) } : {}),
      createdAt: serverTimestamp(),
    });
    await recordAuditLog({
      ownerId: params.ownerId,
      action: 'file.uploaded',
      resourceType: 'uploadedFile',
      resourceId: id,
      details: `Indexed ${params.fileName} (${params.sizeBytes} bytes)`,
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `uploadedFiles/${id}`);
  }
}

export async function deleteUploadedFile(ownerId: string, fileId: string, fileName: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'uploadedFiles', fileId));
    await recordAuditLog({
      ownerId,
      action: 'file.deleted',
      resourceType: 'uploadedFile',
      resourceId: fileId,
      details: `Removed file metadata ${fileName}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `uploadedFiles/${fileId}`);
  }
}

export async function persistCompletedAnalysis(params: {
  ownerId: string;
  project: ProjectRecord;
  analyzerType: AnalyzerType;
  targetLabel: string;
  summary: string;
  riskScore: number;
  data: Record<string, unknown>;
  limitations?: string;
  findings: StaticFindingInput[];
  contentHash?: string;
  scheduleInterval?: ScheduleInterval;
  automationEnabled?: boolean;
}): Promise<{ jobId: string; resultId: string }> {
  const jobId = generateId('job');
  const resultId = generateId('res');
  const cleanSummary = clampStr(params.summary, 4000) || 'Analysis complete.';
  const cleanLabel = clampStr(params.targetLabel, 512) || 'Target';

  try {
    // Create job record
    await setDoc(doc(db, 'analysisJobs', jobId), {
      id: jobId,
      ownerId: params.ownerId,
      projectId: params.project.id,
      analyzerType: params.analyzerType,
      targetLabel: cleanLabel,
      status: 'completed',
      scheduleInterval: params.scheduleInterval ?? 'once',
      automationEnabled: Boolean(params.automationEnabled),
      ...(params.contentHash ? { lastRunHash: clampStr(params.contentHash, 128) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Create result record
    await setDoc(doc(db, 'analysisResults', resultId), {
      id: resultId,
      ownerId: params.ownerId,
      projectId: params.project.id,
      jobId,
      analyzerType: params.analyzerType,
      targetLabel: cleanLabel,
      summary: cleanSummary,
      riskScore: Math.max(0, Math.min(100, Math.round(params.riskScore))),
      findingCount: params.findings.length,
      data: sanitizeResultPayload(params.data),
      ...(params.limitations ? { limitations: clampStr(params.limitations, 1500) } : {}),
      createdAt: serverTimestamp(),
    });

    // Batch write security findings (capped at 40 per analysis for performance)
    const findingsSlice = params.findings.slice(0, 40);
    if (findingsSlice.length > 0) {
      const batch = writeBatch(db);
      for (const f of findingsSlice) {
        const fid = generateId('fnd');
        batch.set(doc(db, 'securityFindings', fid), {
          id: fid,
          ownerId: params.ownerId,
          projectId: params.project.id,
          resultId,
          title: clampStr(f.title, 200),
          severity: f.severity,
          category: clampStr(f.category, 120),
          ...(f.owaspRef ? { owaspRef: clampStr(f.owaspRef, 80) } : {}),
          ...(f.evidence ? { evidence: clampStr(f.evidence, 2000) } : {}),
          remediation: clampStr(f.remediation, 2000) || 'Review and harden affected configuration.',
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    // Update project counters
    await updateDoc(doc(db, 'projects', params.project.id), {
      analysisCount: (params.project.analysisCount ?? 0) + 1,
      findingCount: (params.project.findingCount ?? 0) + findingsSlice.length,
      updatedAt: serverTimestamp(),
    });

    await createNotification({
      ownerId: params.ownerId,
      title: `${params.analyzerType.toUpperCase()} inspection finished`,
      message: `${cleanLabel} completed with ${findingsSlice.length} finding(s) (Risk ${Math.round(params.riskScore)}/100).`,
      category: findingsSlice.some((f) => f.severity === 'critical' || f.severity === 'high') ? 'security' : 'analysis',
    });

    await recordAuditLog({
      ownerId: params.ownerId,
      action: `analysis.${params.analyzerType}`,
      resourceType: 'analysisResult',
      resourceId: resultId,
      details: `${cleanLabel} (${findingsSlice.length} findings)`,
    });

    return { jobId, resultId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `analysisResults/${resultId}`);
  }
}

export async function updateSecurityFindingStatus(findingId: string, status: FindingStatus): Promise<void> {
  try {
    await updateDoc(doc(db, 'securityFindings', findingId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `securityFindings/${findingId}`);
  }
}

export async function updateAnalysisJobSchedule(
  jobId: string,
  patch: {
    scheduleInterval?: ScheduleInterval;
    automationEnabled?: boolean;
    status?: AnalysisJobRecord['status'];
    lastRunHash?: string;
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'analysisJobs', jobId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `analysisJobs/${jobId}`);
  }
}

export async function saveAiConversation(params: {
  id?: string;
  ownerId: string;
  projectId?: string;
  title: string;
  language: 'en' | 'bn';
  provider: 'gemini' | 'ollama';
  model: string;
  messages: AiChatMessage[];
}): Promise<string> {
  const id = params.id ?? generateId('ai');
  const trimmedMessages = params.messages.slice(-40);
  try {
    if (params.id) {
      await updateDoc(doc(db, 'aiConversations', id), {
        title: clampStr(params.title, 200),
        language: params.language,
        provider: params.provider,
        model: clampStr(params.model, 100),
        messages: trimmedMessages,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'aiConversations', id), {
        id,
        ownerId: params.ownerId,
        ...(params.projectId ? { projectId: params.projectId } : {}),
        title: clampStr(params.title, 200),
        language: params.language,
        provider: params.provider,
        model: clampStr(params.model, 100),
        messages: trimmedMessages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `aiConversations/${id}`);
  }
}

export async function saveReportRecord(params: {
  ownerId: string;
  projectId: string;
  title: string;
  format: ReportFormat;
  summary: string;
  findingCount: number;
}): Promise<string> {
  const id = generateId('rpt');
  try {
    await setDoc(doc(db, 'reports', id), {
      id,
      ownerId: params.ownerId,
      projectId: params.projectId,
      title: clampStr(params.title, 200),
      format: params.format,
      summary: clampStr(params.summary, 3000),
      findingCount: Math.max(0, Math.round(params.findingCount)),
      createdAt: serverTimestamp(),
    });
    await recordAuditLog({
      ownerId: params.ownerId,
      action: 'report.generated',
      resourceType: 'report',
      resourceId: id,
      details: `Exported ${params.format.toUpperCase()} report: ${params.title}`,
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reports/${id}`);
  }
}

export async function deleteAllUserWorkspaceData(uid: string): Promise<void> {
  try {
    const collections = [
      'projects',
      'uploadedFiles',
      'analysisJobs',
      'analysisResults',
      'securityFindings',
      'aiConversations',
      'reports',
      'notifications',
    ];
    for (const colName of collections) {
      const q = query(collection(db, colName), where('ownerId', '==', uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
  }
}

export function subscribeOwnerCollection<T>(
  collectionName: string,
  ownerId: string,
  onData: (items: T[]) => void,
  orderField: string = 'createdAt'
): Unsubscribe {
  const q = query(
    collection(db, collectionName),
    where('ownerId', '==', ownerId),
    orderBy(orderField, 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as T));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

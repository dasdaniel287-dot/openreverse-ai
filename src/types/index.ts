import type { Timestamp } from 'firebase/firestore';

export type WorkspaceView =
  | 'dashboard'
  | 'projects'
  | 'website'
  | 'apk'
  | 'exe'
  | 'code'
  | 'api'
  | 'security'
  | 'ai'
  | 'architecture'
  | 'automation'
  | 'reports'
  | 'settings';

export type TargetType = 'website' | 'apk' | 'exe' | 'source' | 'api' | 'mixed';
export type AnalyzerType = 'website' | 'apk' | 'exe' | 'source' | 'api' | 'security';
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'open' | 'acknowledged' | 'resolved';
export type ReportFormat = 'pdf' | 'html' | 'json' | 'markdown';
export type ScheduleInterval = 'once' | 'hourly' | 'daily' | 'weekly';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: 'analyst' | 'admin';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  targetType: TargetType;
  targetUrl?: string;
  authorizationAttested: boolean;
  status: 'active' | 'archived';
  analysisCount: number;
  findingCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UploadedFileRecord {
  id: string;
  ownerId: string;
  projectId: string;
  fileName: string;
  fileCategory: 'apk' | 'exe' | 'source' | 'openapi' | 'archive';
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  previewText?: string;
  createdAt?: Timestamp;
}

export interface AnalysisJobRecord {
  id: string;
  ownerId: string;
  projectId: string;
  analyzerType: AnalyzerType;
  targetLabel: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  scheduleInterval: ScheduleInterval;
  automationEnabled: boolean;
  lastRunHash?: string;
  errorMessage?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AnalysisResultRecord {
  id: string;
  ownerId: string;
  projectId: string;
  jobId: string;
  analyzerType: AnalyzerType;
  targetLabel: string;
  summary: string;
  riskScore: number;
  findingCount: number;
  data: Record<string, unknown>;
  limitations?: string;
  createdAt?: Timestamp;
}

export interface SecurityFindingRecord {
  id: string;
  ownerId: string;
  projectId: string;
  resultId: string;
  title: string;
  severity: SeverityLevel;
  category: string;
  owaspRef?: string;
  evidence?: string;
  remediation: string;
  status: FindingStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  taskType?: string;
  timestamp: string;
}

export interface AiConversationRecord {
  id: string;
  ownerId: string;
  projectId?: string;
  title: string;
  language: 'en' | 'bn';
  provider: 'gemini' | 'ollama';
  model: string;
  messages: AiChatMessage[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReportRecord {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  format: ReportFormat;
  summary: string;
  findingCount: number;
  createdAt?: Timestamp;
}

export interface NotificationRecord {
  id: string;
  ownerId: string;
  title: string;
  message: string;
  category: 'analysis' | 'security' | 'automation' | 'system';
  read: boolean;
  createdAt?: Timestamp;
}

export interface AuditLogRecord {
  id: string;
  ownerId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: string;
  createdAt?: Timestamp;
}

export interface UserSettingsRecord {
  ownerId: string;
  theme: 'dark' | 'light';
  aiProvider: 'gemini' | 'ollama';
  geminiModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  preferredLanguage: 'en' | 'bn';
  emailNotifications: boolean;
  totalAiRequests: number;
  updatedAt?: Timestamp;
}

export interface StaticFindingInput {
  title: string;
  severity: SeverityLevel;
  category: string;
  owaspRef: string;
  evidence: string;
  remediation: string;
}

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthLanding } from './components/AuthLanding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AiAssistantView } from './features/ai-intelligence/AiAssistantView';
import { ApkAnalyzerView } from './features/apk-analyzer/ApkAnalyzerView';
import { ApiAnalyzerView } from './features/api-analyzer/ApiAnalyzerView';
import { ArchitectureView } from './features/architecture-mapper/ArchitectureView';
import { AutomationView } from './features/automation/AutomationView';
import { CodeAnalyzerView } from './features/code-analyzer/CodeAnalyzerView';
import { DashboardView } from './features/dashboard/DashboardView';
import { ExeAnalyzerView } from './features/exe-analyzer/ExeAnalyzerView';
import { ProjectsView } from './features/projects/ProjectsView';
import { ReportCenterView } from './features/reports/ReportCenterView';
import { SecurityAnalyzerView } from './features/security-analyzer/SecurityAnalyzerView';
import { SettingsView } from './features/settings/SettingsView';
import { WebsiteAnalyzerView } from './features/website-analyzer/WebsiteAnalyzerView';
import { subscribeOwnerCollection } from './services/firestoreService';
import type {
  AiConversationRecord,
  AnalysisJobRecord,
  AnalysisResultRecord,
  AuditLogRecord,
  NotificationRecord,
  ProjectRecord,
  ReportRecord,
  SecurityFindingRecord,
  UploadedFileRecord,
  WorkspaceView,
} from './types';

function WorkspaceShell() {
  const { user, settings, loading } = useAuth();
  const [activeView, setActiveView] = useState<WorkspaceView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileRecord[]>([]);
  const [jobs, setJobs] = useState<AnalysisJobRecord[]>([]);
  const [results, setResults] = useState<AnalysisResultRecord[]>([]);
  const [findings, setFindings] = useState<SecurityFindingRecord[]>([]);
  const [conversations, setConversations] = useState<AiConversationRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);

  const [aiPrefillCode, setAiPrefillCode] = useState<string | undefined>(undefined);
  const [aiPrefillTask, setAiPrefillTask] = useState<'explain' | 'bugs' | 'docs' | undefined>(undefined);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setUploadedFiles([]);
      setJobs([]);
      setResults([]);
      setFindings([]);
      setConversations([]);
      setReports([]);
      setNotifications([]);
      setAuditLogs([]);
      return;
    }

    const unsubs = [
      subscribeOwnerCollection<ProjectRecord>('projects', user.uid, (items) => {
        setProjects(items);
        setSelectedProjectId((curr) => (curr && items.some((p) => p.id === curr) ? curr : items[0]?.id ?? ''));
      }),
      subscribeOwnerCollection<UploadedFileRecord>('uploadedFiles', user.uid, setUploadedFiles),
      subscribeOwnerCollection<AnalysisJobRecord>('analysisJobs', user.uid, setJobs),
      subscribeOwnerCollection<AnalysisResultRecord>('analysisResults', user.uid, setResults),
      subscribeOwnerCollection<SecurityFindingRecord>('securityFindings', user.uid, setFindings),
      subscribeOwnerCollection<AiConversationRecord>('aiConversations', user.uid, setConversations, 'updatedAt'),
      subscribeOwnerCollection<ReportRecord>('reports', user.uid, setReports),
      subscribeOwnerCollection<NotificationRecord>('notifications', user.uid, setNotifications),
      subscribeOwnerCollection<AuditLogRecord>('auditLogs', user.uid, setAuditLogs),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070B14] text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-cyan-400" />
          Initializing OpenReverse AI Workspace...
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthLanding />;
  }

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;
  const openFindingsCount = findings.filter((f) => f.status === 'open').length;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        openFindingsCount={openFindingsCount}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeView={activeView}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          projects={projects}
          selectedProjectId={activeProject?.id ?? ''}
          onSelectProject={setSelectedProjectId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          notifications={notifications}
          onNavigate={setActiveView}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeView === 'dashboard' && (
            <DashboardView
              projects={projects}
              jobs={jobs}
              results={results}
              findings={findings}
              reports={reports}
              auditLogs={auditLogs}
              settings={settings}
              searchQuery={searchQuery}
              onNavigate={setActiveView}
              onSelectProject={setSelectedProjectId}
            />
          )}
          {activeView === 'projects' && (
            <ProjectsView
              projects={projects}
              selectedProjectId={activeProject?.id ?? ''}
              onSelectProject={setSelectedProjectId}
              uploadedFiles={uploadedFiles}
            />
          )}
          {activeView === 'website' && (
            <WebsiteAnalyzerView project={activeProject} onNeedProject={() => setActiveView('projects')} />
          )}
          {activeView === 'apk' && (
            <ApkAnalyzerView project={activeProject} onNeedProject={() => setActiveView('projects')} />
          )}
          {activeView === 'exe' && (
            <ExeAnalyzerView project={activeProject} onNeedProject={() => setActiveView('projects')} />
          )}
          {activeView === 'code' && (
            <CodeAnalyzerView
              project={activeProject}
              onNeedProject={() => setActiveView('projects')}
              onSendToAi={(code, task) => {
                setAiPrefillCode(code);
                setAiPrefillTask(task);
                setActiveView('ai');
              }}
            />
          )}
          {activeView === 'api' && (
            <ApiAnalyzerView project={activeProject} onNeedProject={() => setActiveView('projects')} />
          )}
          {activeView === 'security' && (
            <SecurityAnalyzerView
              project={activeProject}
              findings={findings}
              searchQuery={searchQuery}
              onNeedProject={() => setActiveView('projects')}
            />
          )}
          {activeView === 'ai' && (
            <AiAssistantView
              project={activeProject}
              settings={settings}
              conversations={conversations}
              prefillCode={aiPrefillCode}
              prefillTask={aiPrefillTask}
              onClearPrefill={() => {
                setAiPrefillCode(undefined);
                setAiPrefillTask(undefined);
              }}
            />
          )}
          {activeView === 'architecture' && (
            <ArchitectureView project={activeProject} results={results} />
          )}
          {activeView === 'automation' && (
            <AutomationView project={activeProject} jobs={jobs} onNeedProject={() => setActiveView('projects')} />
          )}
          {activeView === 'reports' && (
            <ReportCenterView
              project={activeProject}
              results={results}
              findings={findings}
              reports={reports}
              onNeedProject={() => setActiveView('projects')}
            />
          )}
          {activeView === 'settings' && <SettingsView settings={settings} />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <WorkspaceShell />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

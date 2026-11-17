import React from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  Code2,
  Cpu,
  FileText,
  FolderKanban,
  Globe,
  ShieldAlert,
  Smartphone,
  Webhook,
} from 'lucide-react';
import type {
  AnalysisJobRecord,
  AnalysisResultRecord,
  AuditLogRecord,
  ProjectRecord,
  ReportRecord,
  SecurityFindingRecord,
  UserSettingsRecord,
  WorkspaceView,
} from '../../types';

interface DashboardViewProps {
  projects: ProjectRecord[];
  jobs: AnalysisJobRecord[];
  results: AnalysisResultRecord[];
  findings: SecurityFindingRecord[];
  reports: ReportRecord[];
  auditLogs: AuditLogRecord[];
  settings: UserSettingsRecord | null;
  searchQuery: string;
  onNavigate: (view: WorkspaceView) => void;
  onSelectProject: (id: string) => void;
}

export function DashboardView({
  projects,
  jobs,
  results,
  findings,
  reports,
  auditLogs,
  settings,
  searchQuery,
  onNavigate,
  onSelectProject,
}: DashboardViewProps) {
  const q = searchQuery.trim().toLowerCase();
  const filteredResults = q
    ? results.filter(
        (r) =>
          r.targetLabel.toLowerCase().includes(q) ||
          r.analyzerType.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q)
      )
    : results;

  const openFindings = findings.filter((f) => f.status === 'open');
  const criticalOrHigh = openFindings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  const activeJobsCount = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;

  const quickModules: Array<{
    id: WorkspaceView;
    label: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'website', label: 'Website Analyzer', detail: 'HTML, CSS, JS, headers & SEO', icon: Globe },
    { id: 'apk', label: 'APK Analyzer', detail: 'Manifest, permissions & DEX', icon: Smartphone },
    { id: 'exe', label: 'EXE / PE Analyzer', detail: 'PE headers, sections & DLL imports', icon: Cpu },
    { id: 'code', label: 'Source Code', detail: '12 languages & complexity map', icon: Code2 },
    { id: 'api', label: 'API Inspector', detail: 'OpenAPI specs & REST probe', icon: Webhook },
    { id: 'ai', label: 'AI Code Assistant', detail: 'Gemini & Ollama in EN / বাংলা', icon: Bot },
  ];

  return (
    <div className="space-y-8">
      {/* Header & Quick Launch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Workspace Overview
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Unified static reverse engineering, security inspection, and software intelligence.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <FolderKanban className="w-4 h-4" />
            Manage Projects
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Projects</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {projects.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {projects.filter((p) => p.status === 'active').length} active workspaces
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Analyses</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {results.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {activeJobsCount > 0 ? `${activeJobsCount} running` : `${jobs.filter((j) => j.automationEnabled).length} scheduled`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Findings</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {openFindings.length}
          </p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 tabular-nums">
            {criticalOrHigh} critical or high
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Generated Reports</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {reports.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            PDF · HTML · JSON · Markdown
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Usage Overview</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {settings?.totalAiRequests ?? 0}
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-cyan-400">
            Provider: {settings?.aiProvider === 'ollama' ? 'Ollama' : 'Gemini'}
          </p>
        </div>
      </div>

      {/* Analyzer Launch Grid */}
      <div>
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-3">
          Analysis Modules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onNavigate(mod.id)}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] hover:border-blue-500/60 dark:hover:border-cyan-500/50 p-4 transition-colors flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 text-blue-600 dark:text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{mod.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{mod.detail}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Analyses + Recent Activity & Reports */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Recent Analyses
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('security')}
              className="text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              Review Findings
            </button>
          </div>
          {filteredResults.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No completed analyses yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Create a project and run a Website, APK, EXE, Source Code, or API inspection.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('website')}
                className="mt-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-medium cursor-pointer"
              >
                Run First Website Scan
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">Target</th>
                    <th className="py-2.5 px-3 font-medium">Engine</th>
                    <th className="py-2.5 px-3 font-medium text-right">Findings</th>
                    <th className="py-2.5 px-5 font-medium text-right">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredResults.slice(0, 8).map((res) => (
                    <tr
                      key={res.id}
                      onClick={() => onSelectProject(res.projectId)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-5 max-w-[260px]">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{res.targetLabel}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{res.summary}</p>
                      </td>
                      <td className="py-3 px-3 text-xs font-mono uppercase text-slate-600 dark:text-slate-300">
                        {res.analyzerType}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {res.findingCount}
                      </td>
                      <td className="py-3 px-5 text-right font-mono tabular-nums">
                        <span
                          className={
                            res.riskScore >= 60
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : res.riskScore >= 25
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          }
                        >
                          {res.riskScore}/100
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="xl:col-span-5 space-y-6">
          {/* Recent Reports */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                Recent Reports
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                Open Center
              </button>
            </div>
            {reports.length === 0 ? (
              <p className="p-5 text-xs text-slate-500 dark:text-slate-400">
                No reports exported yet. Visit Report Center to generate PDF, HTML, JSON, or Markdown reports.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {reports.slice(0, 4).map((rpt) => (
                  <li key={rpt.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{rpt.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {rpt.format.toUpperCase()} · {rpt.findingCount} findings
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                Recent Activity
              </h2>
              <ShieldAlert className="w-4 h-4 text-slate-400" />
            </div>
            {auditLogs.length === 0 ? (
              <p className="p-5 text-xs text-slate-500 dark:text-slate-400">
                Activity audit logs will appear as you create projects and run inspections.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {auditLogs.slice(0, 5).map((log) => (
                  <li key={log.id} className="px-5 py-3 text-xs">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{log.action}</p>
                    {log.details && <p className="text-slate-500 dark:text-slate-400 mt-0.5 truncate">{log.details}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

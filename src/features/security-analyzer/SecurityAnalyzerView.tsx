import React, { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import type { FindingStatus, ProjectRecord, SecurityFindingRecord, StaticFindingInput } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import { persistCompletedAnalysis, updateSecurityFindingStatus } from '../../services/firestoreService';

export function SecurityAnalyzerView({
  project,
  findings,
  searchQuery,
  onNeedProject,
}: {
  project: ProjectRecord | null;
  findings: SecurityFindingRecord[];
  searchQuery: string;
  onNeedProject: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [manifestContent, setManifestContent] = useState(
    `{\n  "name": "sample-service",\n  "dependencies": {\n    "express": "^4.17.1",\n    "lodash": "4.17.19"\n  }\n}`
  );
  const [configContent, setConfigContent] = useState('');
  const [scanning, setScanning] = useState(false);

  const q = searchQuery.trim().toLowerCase();
  const filtered = findings.filter((f) => {
    if (project && f.projectId !== project.id) return false;
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (q && !f.title.toLowerCase().includes(q) && !f.category.toLowerCase().includes(q)) return false;
    return true;
  });

  const handleRunSecurityScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!project) {
      notify('Select or create a project', 'Create a project to store security & dependency findings.', 'info');
      onNeedProject();
      return;
    }

    setScanning(true);
    try {
      const res = await authorizedFetch('/api/analyze/security', {
        method: 'POST',
        body: JSON.stringify({
          targetLabel: `${project.name} Security & Dependency Audit`,
          manifestContent,
          configOrCodeContent: configContent,
        }),
      });
      const data = (await res.json()) as {
        targetLabel: string;
        contentHash: string;
        summary: string;
        riskScore: number;
        limitations: string;
        findings: StaticFindingInput[];
      };

      await persistCompletedAnalysis({
        ownerId: user.uid,
        project,
        analyzerType: 'security',
        targetLabel: data.targetLabel,
        summary: data.summary,
        riskScore: data.riskScore,
        data: data as unknown as Record<string, unknown>,
        limitations: data.limitations,
        findings: data.findings,
        contentHash: data.contentHash,
      });

      notify('Security audit complete', `Logged ${data.findings.length} defensive findings.`, 'success');
    } catch (err) {
      notify('Security audit failed', err instanceof Error ? err.message : 'Audit error', 'error');
    } finally {
      setScanning(false);
    }
  };

  const severityColor = (sev: SecurityFindingRecord['severity']) => {
    if (sev === 'critical') return 'text-rose-600 dark:text-rose-400';
    if (sev === 'high') return 'text-orange-600 dark:text-orange-400';
    if (sev === 'medium') return 'text-amber-600 dark:text-amber-400';
    return 'text-blue-600 dark:text-cyan-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Security &amp; OWASP Analyzer
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Dependency baseline auditing, secret detection, OWASP configuration checks, and project finding triage.
        </p>
      </div>

      <form
        onSubmit={handleRunSecurityScan}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-4"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Dependency Manifest (package.json or requirements.txt)
            </label>
            <textarea
              rows={6}
              value={manifestContent}
              onChange={(e) => setManifestContent(e.target.value)}
              spellCheck={false}
              className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Configuration / Rules / Env Snippet to Scan for Secrets &amp; Access Rules
            </label>
            <textarea
              rows={6}
              value={configContent}
              onChange={(e) => setConfigContent(e.target.value)}
              spellCheck={false}
              placeholder="Paste config files, rules, or scripts to check for exposed keys or weak cryptography..."
              className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-medium cursor-pointer"
          >
            {scanning && <Loader2 className="w-4 h-4 animate-spin" />}
            <ShieldAlert className="w-4 h-4" />
            {scanning ? 'Auditing...' : 'Run Security & Dependency Audit'}
          </button>
        </div>
      </form>

      {/* Findings Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold">
            Security Findings ({filtered.length})
          </h2>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                  severityFilter === sev
                    ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No matching security findings in the selected project.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filtered.map((f) => (
              <div key={f.id} className="p-5 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`font-semibold uppercase ${severityColor(f.severity)}`}>{f.severity}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-500 dark:text-slate-400">{f.category}</span>
                      {f.owaspRef && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">{f.owaspRef}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-1">{f.title}</h3>
                  </div>

                  <select
                    aria-label="Finding status"
                    value={f.status}
                    onChange={(e) => void updateSecurityFindingStatus(f.id, e.target.value as FindingStatus)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14]"
                  >
                    <option value="open">Open</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>

                {f.evidence && (
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#070B14] p-2.5 rounded border border-slate-200 dark:border-slate-800 break-all">
                    Evidence: {f.evidence}
                  </p>
                )}
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">Remediation:</span> {f.remediation}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

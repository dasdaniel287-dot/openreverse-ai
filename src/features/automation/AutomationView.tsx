import React, { useEffect, useState } from 'react';
import { Clock, Loader2, Play, RefreshCw } from 'lucide-react';
import type { AnalysisJobRecord, ProjectRecord, ScheduleInterval } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import {
  createNotification,
  persistCompletedAnalysis,
  updateAnalysisJobSchedule,
} from '../../services/firestoreService';

export function AutomationView({
  project,
  jobs,
  onNeedProject,
}: {
  project: ProjectRecord | null;
  jobs: AnalysisJobRecord[];
  onNeedProject: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [engineActive, setEngineActive] = useState(false);
  const [targetUrl, setTargetUrl] = useState(project?.targetUrl || 'https://example.com');
  const [analyzerType, setAnalyzerType] = useState<'website' | 'api'>('website');
  const [interval, setInterval] = useState<ScheduleInterval>('daily');
  const [submitting, setSubmitting] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/health')
      .then((r) => r.json())
      .then((d: { automationEngineActive?: boolean }) => {
        setEngineActive(Boolean(d.automationEngineActive));
      })
      .catch(() => setEngineActive(false));
  }, []);

  const handleScheduleNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!project) {
      notify('Select or create a project', 'Create a project to schedule automated inspections.', 'info');
      onNeedProject();
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = analyzerType === 'website' ? '/api/analyze/website' : '/api/analyze/api';
      const body =
        analyzerType === 'website'
          ? { url: targetUrl.trim(), authorizationAttested: true }
          : { mode: 'live-probe', url: targetUrl.trim(), method: 'GET', authorizationAttested: true };

      const res = await authorizedFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      const { jobId } = await persistCompletedAnalysis({
        ownerId: user.uid,
        project,
        analyzerType,
        targetLabel: targetUrl.trim(),
        summary: data.summary,
        riskScore: data.riskScore,
        data,
        limitations: data.limitations,
        findings: data.findings ?? [],
        contentHash: data.contentHash,
        scheduleInterval: interval,
        automationEnabled: true,
      });

      await authorizedFetch('/api/automation/register', {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          analyzerType,
          targetUrl: targetUrl.trim(),
          interval: interval === 'once' ? 'daily' : interval,
        }),
      });

      notify('Automated monitor active', `Baseline hash ${String(data.contentHash).slice(0, 12)} registered.`, 'success');
    } catch (err) {
      notify('Automation setup failed', err instanceof Error ? err.message : 'Unable to register job', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRerunJob = async (job: AnalysisJobRecord) => {
    if (!user || !project) return;
    if (job.analyzerType !== 'website' && job.analyzerType !== 'api') {
      notify('Manual re-upload required', 'Local binary/source files must be re-uploaded inside their analyzer.', 'info');
      return;
    }
    setRunningJobId(job.id);
    try {
      const endpoint = job.analyzerType === 'website' ? '/api/analyze/website' : '/api/analyze/api';
      const body =
        job.analyzerType === 'website'
          ? { url: job.targetLabel, authorizationAttested: true }
          : { mode: 'live-probe', url: job.targetLabel, method: 'GET', authorizationAttested: true };

      const res = await authorizedFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const changed = Boolean(job.lastRunHash && data.contentHash && job.lastRunHash !== data.contentHash);

      await updateAnalysisJobSchedule(job.id, {
        status: 'completed',
        lastRunHash: data.contentHash,
      });

      if (changed) {
        await createNotification({
          ownerId: user.uid,
          title: 'Change detected on monitored target',
          message: `${job.targetLabel} hash changed (${job.lastRunHash?.slice(0, 8)} → ${String(data.contentHash).slice(0, 8)}).`,
          category: 'automation',
        });
      }

      notify(
        changed ? 'Change detected!' : 'No changes detected',
        changed ? 'Content SHA-256 changed since previous run.' : 'Target matches previous baseline hash.',
        changed ? 'info' : 'success'
      );
    } catch (err) {
      notify('Re-analysis failed', err instanceof Error ? err.message : 'Job execution error', 'error');
    } finally {
      setRunningJobId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Automation Engine
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Scheduled re-analysis, SHA-256 change detection, and background job tracking.
          </p>
        </div>
        <div className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120]">
          Backend Scheduler:{' '}
          <span className={engineActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {engineActive ? 'Active' : 'Unavailable'}
          </span>
        </div>
      </div>

      <form
        onSubmit={handleScheduleNew}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        <div className="md:col-span-5">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Authorized Target URL
          </label>
          <input
            type="url"
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Analyzer
          </label>
          <select
            value={analyzerType}
            onChange={(e) => setAnalyzerType(e.target.value as 'website' | 'api')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
          >
            <option value="website">Website</option>
            <option value="api">REST API</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Schedule
          </label>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as ScheduleInterval)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <button
            type="submit"
            disabled={submitting || !engineActive}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium cursor-pointer"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Schedule Monitor
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold">Analysis Jobs &amp; Monitors ({jobs.length})</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No scheduled jobs or completed runs yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-5 font-medium">Target</th>
                  <th className="py-2.5 px-3 font-medium">Engine</th>
                  <th className="py-2.5 px-3 font-medium">Interval</th>
                  <th className="py-2.5 px-3 font-medium">Baseline Hash</th>
                  <th className="py-2.5 px-5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="py-3 px-5 font-mono max-w-[260px] truncate">{job.targetLabel}</td>
                    <td className="py-3 px-3 uppercase font-mono">{job.analyzerType}</td>
                    <td className="py-3 px-3">
                      <span className={job.automationEnabled ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-500'}>
                        {job.automationEnabled ? job.scheduleInterval : 'once'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">
                      {job.lastRunHash ? job.lastRunHash.slice(0, 12) : '—'}
                    </td>
                    <td className="py-3 px-5 text-right space-x-2">
                      {(job.analyzerType === 'website' || job.analyzerType === 'api') && (
                        <button
                          type="button"
                          onClick={() => void handleRerunJob(job)}
                          disabled={runningJobId === job.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {runningJobId === job.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          Re-check
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void updateAnalysisJobSchedule(job.id, {
                            automationEnabled: !job.automationEnabled,
                          })
                        }
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {job.automationEnabled ? 'Pause' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

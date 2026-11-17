import React, { useState } from 'react';
import { Loader2, Webhook } from 'lucide-react';
import type { ProjectRecord, StaticFindingInput } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import { persistCompletedAnalysis } from '../../services/firestoreService';

interface ApiResult {
  mode: 'openapi' | 'live-probe';
  targetLabel: string;
  contentHash: string;
  specInfo?: {
    title: string;
    version: string;
    openApiVersion: string;
    servers: string[];
    securitySchemes: string[];
  };
  endpoints: Array<{
    method: string;
    path: string;
    summary: string;
    authRequired: boolean;
    parametersCount: number;
    responses: string[];
  }>;
  probeResult?: {
    finalUrl: string;
    status: number;
    responseTimeMs: number;
    contentType: string;
    corsAllowOrigin: string;
    headers: Record<string, string>;
    bodyPreview: string;
    inferredJsonKeys: string[];
  };
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

const SAMPLE_OPENAPI = `openapi: 3.0.3
info:
  title: Sample Inventory API
  version: 1.2.0
servers:
  - url: https://api.example.com/v1
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /items:
    get:
      summary: List authorized items
      security:
        - bearerAuth: []
      responses:
        '200':
          description: OK
  /items/{id}:
    delete:
      summary: Remove item
      responses:
        '204':
          description: Deleted
`;

export function ApiAnalyzerView({
  project,
  onNeedProject,
}: {
  project: ProjectRecord | null;
  onNeedProject: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [mode, setMode] = useState<'openapi' | 'live-probe'>('openapi');
  const [specContent, setSpecContent] = useState(SAMPLE_OPENAPI);
  const [url, setUrl] = useState('https://httpbin.org/get');
  const [method, setMethod] = useState('GET');
  const [authHeader, setAuthHeader] = useState('');
  const [attested, setAttested] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!project) {
      notify('Select or create a project', 'Create an authorized project to record API inspections.', 'info');
      onNeedProject();
      return;
    }

    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authHeader.trim()) headers.Authorization = authHeader.trim();

      const res = await authorizedFetch('/api/analyze/api', {
        method: 'POST',
        body: JSON.stringify(
          mode === 'openapi'
            ? { mode: 'openapi', specContent, label: project.name }
            : { mode: 'live-probe', url: url.trim(), method, headers, authorizationAttested: attested }
        ),
      });
      const data = (await res.json()) as ApiResult;
      setResult(data);

      await persistCompletedAnalysis({
        ownerId: user.uid,
        project,
        analyzerType: 'api',
        targetLabel: data.targetLabel,
        summary: data.summary,
        riskScore: data.riskScore,
        data: data as unknown as Record<string, unknown>,
        limitations: data.limitations,
        findings: data.findings,
        contentHash: data.contentHash,
      });
      notify('API inspection complete', data.summary, 'success');
    } catch (err) {
      notify('API inspection failed', err instanceof Error ? err.message : 'API check error', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            REST &amp; OpenAPI Inspector
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Inspect OpenAPI 3.x / Swagger YAML/JSON contracts or probe authorized REST endpoints with SSRF protection.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setMode('openapi')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === 'openapi' ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            OpenAPI Spec
          </button>
          <button
            type="button"
            onClick={() => setMode('live-probe')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === 'live-probe' ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Authorized Endpoint
          </button>
        </div>
      </div>

      <form
        onSubmit={handleInspect}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-4"
      >
        {mode === 'openapi' ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              OpenAPI JSON or YAML Definition
            </label>
            <textarea
              rows={10}
              value={specContent}
              onChange={(e) => setSpecContent(e.target.value)}
              spellCheck={false}
              className="w-full p-3.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
              >
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
                <option value="OPTIONS">OPTIONS</option>
                <option value="POST">POST</option>
              </select>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.your-domain.com/v1/health"
                className="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
              />
            </div>
            <input
              type="text"
              value={authHeader}
              onChange={(e) => setAuthHeader(e.target.value)}
              placeholder="Optional Authorization header (e.g. Bearer eyJ...)"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
            />
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
              <span>I confirm explicit authorization to inspect this REST API endpoint.</span>
            </label>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-medium cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Webhook className="w-4 h-4" />
            {loading ? 'Inspecting...' : mode === 'openapi' ? 'Parse OpenAPI Spec' : 'Inspect Endpoint'}
          </button>
        </div>
      </form>

      {result && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">
                {result.specInfo ? `${result.specInfo.title} (OpenAPI ${result.specInfo.openApiVersion})` : 'Endpoint Inspection'}
              </h2>
              <span className="font-mono text-xs text-blue-600 dark:text-cyan-400 tabular-nums">
                Risk {result.riskScore}/100
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">Method</th>
                    <th className="py-2.5 px-3 font-medium">Path</th>
                    <th className="py-2.5 px-3 font-medium">Auth</th>
                    <th className="py-2.5 px-5 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {result.endpoints.map((ep, i) => (
                    <tr key={`${ep.method}_${ep.path}_${i}`}>
                      <td className="py-2.5 px-5 font-mono font-semibold text-blue-600 dark:text-cyan-400">{ep.method}</td>
                      <td className="py-2.5 px-3 font-mono">{ep.path}</td>
                      <td className="py-2.5 px-3">
                        <span className={ep.authRequired ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                          {ep.authRequired ? 'Declared' : 'None declared'}
                        </span>
                      </td>
                      <td className="py-2.5 px-5 text-slate-600 dark:text-slate-400">{ep.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.probeResult && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold">
                Response ({result.probeResult.status} · {result.probeResult.responseTimeMs} ms · CORS: {result.probeResult.corsAllowOrigin})
              </h3>
              <pre className="p-3 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800 text-xs font-mono overflow-x-auto max-h-64">
                {result.probeResult.bodyPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

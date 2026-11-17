import React, { useState } from 'react';
import { Globe, Loader2, ShieldCheck } from 'lucide-react';
import type { ProjectRecord, StaticFindingInput } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import { persistCompletedAnalysis } from '../../services/firestoreService';

interface WebsiteResult {
  url: string;
  finalUrl: string;
  status: number;
  responseTimeMs: number;
  contentHash: string;
  redirectChain: string[];
  metadata: {
    title: string;
    description: string;
    canonical: string;
    lang: string;
    viewport: string;
    generator: string;
  };
  structure: {
    domElements: number;
    headings: { h1: number; h2: number; h3: number };
    linksTotal: number;
    externalLinks: number;
    formsCount: number;
    imagesTotal: number;
    imagesMissingAlt: number;
  };
  resources: {
    stylesheets: string[];
    scripts: string[];
    inlineScriptsCount: number;
    inlineStylesCount: number;
  };
  technologies: string[];
  securityHeaders: Array<{ header: string; present: boolean; value: string; recommendation: string }>;
  seoObservations: string[];
  performanceObservations: string[];
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

export function WebsiteAnalyzerView({
  project,
  onNeedProject,
}: {
  project: ProjectRecord | null;
  onNeedProject: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [url, setUrl] = useState(project?.targetUrl || 'https://example.com');
  const [attested, setAttested] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WebsiteResult | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!project) {
      notify('Select or create a project', 'Create an authorized project first so results can be saved.', 'info');
      onNeedProject();
      return;
    }
    setLoading(true);
    try {
      const res = await authorizedFetch('/api/analyze/website', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), authorizationAttested: attested }),
      });
      const data = (await res.json()) as WebsiteResult;
      setResult(data);

      await persistCompletedAnalysis({
        ownerId: user.uid,
        project,
        analyzerType: 'website',
        targetLabel: data.finalUrl,
        summary: data.summary,
        riskScore: data.riskScore,
        data: data as unknown as Record<string, unknown>,
        limitations: data.limitations,
        findings: data.findings,
        contentHash: data.contentHash,
      });

      notify('Website inspection complete', `Saved ${data.findings.length} observations to ${project.name}.`, 'success');
    } catch (err) {
      notify('Inspection failed', err instanceof Error ? err.message : 'Website inspection error', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Website Analyzer
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          SSRF-protected inspection of HTML structure, CSS/JS assets, tech stack, metadata, SEO, performance, and security headers.
        </p>
      </div>

      <form
        onSubmit={handleAnalyze}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-authorized-domain.com"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Inspecting...' : 'Inspect Website'}
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
          />
          <span>I confirm authorization to inspect this public URL. Private networks &amp; metadata IPs are blocked.</span>
        </label>
      </form>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">HTTP Status &amp; Latency</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {result.status} · {result.responseTimeMs} ms
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">DOM Elements</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {result.structure.domElements}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">External Scripts / CSS</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {result.resources.scripts.length} / {result.resources.stylesheets.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Risk Score</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-600 dark:text-cyan-400">
                {result.riskScore}/100
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Metadata &amp; Detected Technologies
              </h2>
              <dl className="text-xs space-y-2">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Page Title</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{result.metadata.title || 'None'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Description</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{result.metadata.description || 'Missing meta description'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Technologies</dt>
                  <dd className="text-slate-800 dark:text-slate-200 font-mono">
                    {result.technologies.length > 0 ? result.technologies.join(' · ') : 'No common frontend signatures matched'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                SEO &amp; Performance Observations
              </h2>
              <ul className="text-xs space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                {result.seoObservations.map((obs, idx) => (
                  <li key={`seo_${idx}`}>{obs}</li>
                ))}
                {result.performanceObservations.map((obs, idx) => (
                  <li key={`perf_${idx}`}>{obs}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                HTTP Security Headers Audit
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">Header</th>
                    <th className="py-2.5 px-3 font-medium">State</th>
                    <th className="py-2.5 px-5 font-medium">Value / Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {result.securityHeaders.map((sh) => (
                    <tr key={sh.header}>
                      <td className="py-2.5 px-5 font-mono text-slate-900 dark:text-slate-100">{sh.header}</td>
                      <td className="py-2.5 px-3 font-medium">
                        <span className={sh.present ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                          {sh.present ? 'Present' : 'Missing'}
                        </span>
                      </td>
                      <td className="py-2.5 px-5 text-slate-600 dark:text-slate-400 break-all">
                        {sh.present ? sh.value : sh.recommendation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

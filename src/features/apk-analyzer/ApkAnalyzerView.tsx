import React, { useState } from 'react';
import { Loader2, ShieldAlert, Smartphone, Upload } from 'lucide-react';
import type { ProjectRecord, StaticFindingInput } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import { persistCompletedAnalysis, saveUploadedFileMetadata } from '../../services/firestoreService';

interface ApkResult {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  packageInfo: {
    packageCandidates: string[];
    dexFiles: string[];
    nativeAbis: string[];
    nativeLibraries: string[];
    signingCertificates: string[];
    totalEntries: number;
    hasKotlinMetadata: boolean;
    hasFlutter: boolean;
    hasReactNative: boolean;
  };
  permissions: Array<{ name: string; protectionLevel: string; description: string }>;
  components: {
    activities: string[];
    services: string[];
    receivers: string[];
    providers: string[];
  };
  sdkInfo: {
    detectedSdkHints: string[];
    embeddedUrls: string[];
    flags: {
      usesCleartextTraffic: boolean;
      debuggableFlagSeen: boolean;
      allowBackupSeen: boolean;
    };
  };
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

export function ApkAnalyzerView({
  project,
  onNeedProject,
}: {
  project: ProjectRecord | null;
  onNeedProject: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApkResult | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!project) {
      notify('Select or create a project', 'Create an authorized project first to store APK findings.', 'info');
      onNeedProject();
      e.target.value = '';
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await authorizedFetch('/api/analyze/apk', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as ApkResult;
      setResult(data);

      await saveUploadedFileMetadata({
        ownerId: user.uid,
        projectId: project.id,
        fileName: data.fileName,
        fileCategory: 'apk',
        mimeType: file.type || 'application/vnd.android.package-archive',
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
      });

      await persistCompletedAnalysis({
        ownerId: user.uid,
        project,
        analyzerType: 'apk',
        targetLabel: data.fileName,
        summary: data.summary,
        riskScore: data.riskScore,
        data: data as unknown as Record<string, unknown>,
        limitations: data.limitations,
        findings: data.findings,
        contentHash: data.sha256,
      });

      notify('APK inspection complete', `Analyzed ${data.fileName} statically.`, 'success');
    } catch (err) {
      notify('APK analysis failed', err instanceof Error ? err.message : 'Unable to parse APK', 'error');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Android APK Analyzer
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Purely static archive, AndroidManifest.xml string-pool, permission, DEX, native ABI, and signing inspection. Never executed.
        </p>
      </div>

      <label className="block rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1120] p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
        <div className="flex flex-col items-center gap-2">
          {loading ? (
            <Loader2 className="w-8 h-8 text-blue-600 dark:text-cyan-400 animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-blue-600 dark:text-cyan-400" />
          )}
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {loading ? 'Inspecting APK archive in memory...' : 'Upload Android .apk file (max 50 MB)'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Extracts package metadata, permissions, exported components, DEX counts, native .so libraries, and security observations.
          </p>
        </div>
        <input type="file" accept=".apk" onChange={handleUpload} disabled={loading} className="sr-only" />
      </label>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Archive Entries / DEX</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums">
                {result.packageInfo.totalEntries} / {result.packageInfo.dexFiles.length} DEX
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Permissions</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums">{result.permissions.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Native ABIs</p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {result.packageInfo.nativeAbis.length > 0 ? result.packageInfo.nativeAbis.join(', ') : 'Pure Dalvik / No .so'}
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
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                <h2 className="font-display text-base font-semibold">Package &amp; SDK Intelligence</h2>
              </div>
              <dl className="text-xs space-y-2">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">SHA-256</dt>
                  <dd className="font-mono break-all text-slate-800 dark:text-slate-200">{result.sha256}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Frameworks / Tooling</dt>
                  <dd className="font-mono text-slate-800 dark:text-slate-200">
                    {[
                      result.packageInfo.hasKotlinMetadata && 'Kotlin',
                      result.packageInfo.hasFlutter && 'Flutter',
                      result.packageInfo.hasReactNative && 'React Native',
                      ...result.sdkInfo.detectedSdkHints.slice(0, 6),
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Standard Android SDK'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Signing Certificates (META-INF)</dt>
                  <dd className="font-mono text-slate-700 dark:text-slate-300">
                    {result.packageInfo.signingCertificates.join(', ') || 'None (v2/v3 block or unsigned)'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-3">
              <h2 className="font-display text-base font-semibold">Extracted Components &amp; URLs</h2>
              <div className="text-xs space-y-2">
                <p className="text-slate-600 dark:text-slate-300">
                  Activities ({result.components.activities.length}):{' '}
                  <span className="font-mono">{result.components.activities.slice(0, 5).join(', ') || 'None detected'}</span>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Services ({result.components.services.length}) · Receivers ({result.components.receivers.length}) · Providers ({result.components.providers.length})
                </p>
                <div>
                  <p className="text-slate-500 dark:text-slate-400 mb-1">Embedded URLs (sample):</p>
                  <div className="max-h-28 overflow-y-auto font-mono text-[11px] space-y-0.5 text-slate-700 dark:text-slate-300">
                    {result.sdkInfo.embeddedUrls.slice(0, 10).map((u) => (
                      <div key={u} className="truncate">{u}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h2 className="font-display text-base font-semibold">Declared Permissions ({result.permissions.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">Permission</th>
                    <th className="py-2.5 px-3 font-medium">Level</th>
                    <th className="py-2.5 px-5 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {result.permissions.map((perm) => (
                    <tr key={perm.name}>
                      <td className="py-2.5 px-5 font-mono text-slate-900 dark:text-slate-100">{perm.name}</td>
                      <td className="py-2.5 px-3 font-medium">
                        <span
                          className={
                            perm.protectionLevel === 'dangerous'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {perm.protectionLevel}
                        </span>
                      </td>
                      <td className="py-2.5 px-5 text-slate-600 dark:text-slate-400">{perm.description}</td>
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

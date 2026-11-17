import React, { useState } from 'react';
import { Cpu, Loader2, ShieldCheck, Upload } from 'lucide-react';
import type { ProjectRecord, StaticFindingInput } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import { persistCompletedAnalysis, saveUploadedFileMetadata } from '../../services/firestoreService';

interface ExeResult {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  peFormat: {
    format: string;
    machine: string;
    subsystem: string;
    compileTimestamp: string;
    entryPointRva: string;
    imageBase: string;
    numberOfSections: number;
    isDll: boolean;
  };
  securityMitigations: {
    aslr: boolean;
    highEntropyVa: boolean;
    depNx: boolean;
    controlFlowGuard: boolean;
    noSeh: boolean;
    authenticodeSigned: boolean;
    signatureSizeBytes: number;
  };
  sections: Array<{
    name: string;
    virtualSize: number;
    virtualAddress: string;
    rawSize: number;
    rawOffset: number;
    entropy: number;
    characteristics: string[];
  }>;
  importedDlls: string[];
  notableStrings: string[];
  suspiciousIndicators: string[];
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
}

export function ExeAnalyzerView({
  project,
  onNeedProject,
}: {
  project: ProjectRecord | null;
  onNeedProject: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExeResult | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!project) {
      notify('Select or create a project', 'Create an authorized project first to save PE binary findings.', 'info');
      onNeedProject();
      e.target.value = '';
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await authorizedFetch('/api/analyze/exe', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as ExeResult;
      setResult(data);

      await saveUploadedFileMetadata({
        ownerId: user.uid,
        projectId: project.id,
        fileName: data.fileName,
        fileCategory: 'exe',
        mimeType: file.type || 'application/vnd.microsoft.portable-executable',
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
      });

      await persistCompletedAnalysis({
        ownerId: user.uid,
        project,
        analyzerType: 'exe',
        targetLabel: data.fileName,
        summary: data.summary,
        riskScore: data.riskScore,
        data: data as unknown as Record<string, unknown>,
        limitations: data.limitations,
        findings: data.findings,
        contentHash: data.sha256,
      });

      notify('PE/EXE inspection complete', `Parsed ${data.sections.length} sections & ${data.importedDlls.length} imports.`, 'success');
    } catch (err) {
      notify('EXE inspection failed', err instanceof Error ? err.message : 'Invalid PE file', 'error');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Windows EXE / PE Analyzer
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Static PE32/PE32+ header parsing, mitigation flags (ASLR/DEP/CFG), section entropy, Authenticode signature table, and DLL import inspection. Binaries are never executed.
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
            {loading ? 'Parsing PE headers & import tables...' : 'Upload Windows .exe or .dll file (max 50 MB)'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reads COFF/Optional headers, section Shannon entropy, security directory, and imported libraries strictly from memory.
          </p>
        </div>
        <input type="file" accept=".exe,.dll" onChange={handleUpload} disabled={loading} className="sr-only" />
      </label>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">PE Format &amp; Architecture</p>
              <p className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                {result.peFormat.format}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{result.peFormat.machine}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Subsystem</p>
              <p className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                {result.peFormat.subsystem}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{result.peFormat.isDll ? 'DLL Library' : 'Executable'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Imported DLLs</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums">{result.importedDlls.length}</p>
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
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                <h2 className="font-display text-base font-semibold">Binary Mitigations &amp; Signature</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label: 'ASLR (DYNAMIC_BASE)', ok: result.securityMitigations.aslr },
                  { label: 'DEP / NX_COMPAT', ok: result.securityMitigations.depNx },
                  { label: 'Control Flow Guard', ok: result.securityMitigations.controlFlowGuard },
                  { label: 'Authenticode Signed', ok: result.securityMitigations.authenticodeSigned },
                ].map((m) => (
                  <div key={m.label} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-500 dark:text-slate-400">{m.label}</p>
                    <p className={`mt-1 font-semibold ${m.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {m.ok ? 'Enabled' : 'Disabled / Absent'}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                SHA-256: {result.sha256}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                <h2 className="font-display text-base font-semibold">Imported Libraries &amp; Indicators</h2>
              </div>
              <p className="text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed">
                {result.importedDlls.length > 0 ? result.importedDlls.join(' · ') : 'No standard IAT imports parsed'}
              </p>
              {result.suspiciousIndicators.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">Static Indicators:</p>
                  <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-300 list-disc pl-4">
                    {result.suspiciousIndicators.map((ind) => (
                      <li key={ind}>{ind}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-semibold">PE Sections &amp; Shannon Entropy</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">Section</th>
                    <th className="py-2.5 px-3 font-medium">Virtual Addr</th>
                    <th className="py-2.5 px-3 font-medium text-right">Raw Size</th>
                    <th className="py-2.5 px-3 font-medium text-right">Entropy</th>
                    <th className="py-2.5 px-5 font-medium">Characteristics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {result.sections.map((sec) => (
                    <tr key={`${sec.name}_${sec.virtualAddress}`}>
                      <td className="py-2.5 px-5 font-mono font-semibold text-slate-900 dark:text-slate-100">{sec.name}</td>
                      <td className="py-2.5 px-3 font-mono">{sec.virtualAddress}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{sec.rawSize.toLocaleString()} B</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <span className={sec.entropy >= 7.2 ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                          {sec.entropy.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-5 font-mono text-slate-600 dark:text-slate-400">
                        {sec.characteristics.join(', ')}
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

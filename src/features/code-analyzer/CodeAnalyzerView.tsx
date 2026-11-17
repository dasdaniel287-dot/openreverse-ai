import React, { useState } from 'react';
import { Bot, Code2, Loader2, Upload } from 'lucide-react';
import type { ProjectRecord, StaticFindingInput } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import { persistCompletedAnalysis, saveUploadedFileMetadata } from '../../services/firestoreService';

interface CodeResult {
  targetName: string;
  contentHash: string;
  totalFiles: number;
  totalLines: number;
  languagesDetected: string[];
  files: Array<{
    path: string;
    language: string;
    linesOfCode: number;
    commentLines: number;
    cyclomaticComplexity: number;
    functions: string[];
    classes: string[];
    imports: string[];
  }>;
  dependencies: string[];
  architecture: {
    nodes: Array<{ id: string; label: string; type: 'module' | 'external' | 'entry'; lines?: number }>;
    edges: Array<{ from: string; to: string; relation: string }>;
    tree: Array<{ path: string; type: 'file' | 'folder' }>;
  };
  qualityObservations: string[];
  findings: StaticFindingInput[];
  riskScore: number;
  summary: string;
  limitations: string;
  uploadedSha256?: string;
  sizeBytes?: number;
  previewText?: string;
}

const LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'java',
  'c',
  'cpp',
  'php',
  'go',
  'html',
  'css',
  'json',
  'xml',
];

export function CodeAnalyzerView({
  project,
  onNeedProject,
  onSendToAi,
}: {
  project: ProjectRecord | null;
  onNeedProject: () => void;
  onSendToAi: (code: string, task: 'explain' | 'bugs' | 'docs') => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [fileName, setFileName] = useState('authService.ts');
  const [language, setLanguage] = useState('typescript');
  const [code, setCode] = useState(
    `import crypto from 'node:crypto';\n\nexport class TokenVerifier {\n  verifyHash(payload: string, expectedHex: string): boolean {\n    const digest = crypto.createHash('sha256').update(payload).digest('hex');\n    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expectedHex));\n  }\n}\n`
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CodeResult | null>(null);

  const persistResult = async (data: CodeResult) => {
    if (!user || !project) return;
    await persistCompletedAnalysis({
      ownerId: user.uid,
      project,
      analyzerType: 'source',
      targetLabel: data.targetName,
      summary: data.summary,
      riskScore: data.riskScore,
      data: data as unknown as Record<string, unknown>,
      limitations: data.limitations,
      findings: data.findings,
      contentHash: data.contentHash,
    });
  };

  const handleAnalyzeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!project) {
      notify('Select or create a project', 'Create a project to save code inspection results.', 'info');
      onNeedProject();
      return;
    }
    if (!code.trim()) {
      notify('Source code required', 'Paste code or upload a file/ZIP archive.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await authorizedFetch('/api/analyze/code', {
        method: 'POST',
        body: JSON.stringify({
          targetName: fileName.trim() || 'snippet',
          files: [{ path: fileName.trim() || 'snippet', content: code, explicitLanguage: language }],
        }),
      });
      const data = (await res.json()) as CodeResult;
      setResult(data);
      await persistResult(data);
      notify('Source analysis complete', `Extracted ${data.files[0]?.functions.length ?? 0} functions & ${data.findings.length} findings.`, 'success');
    } catch (err) {
      notify('Analysis failed', err instanceof Error ? err.message : 'Unable to analyze source', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!project) {
      notify('Select or create a project', 'Create a project before uploading source bundles.', 'info');
      onNeedProject();
      e.target.value = '';
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await authorizedFetch('/api/analyze/code', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as CodeResult;
      setResult(data);
      if (data.previewText) {
        setFileName(file.name);
        setCode(data.previewText);
      }

      if (data.uploadedSha256) {
        await saveUploadedFileMetadata({
          ownerId: user.uid,
          projectId: project.id,
          fileName: file.name,
          fileCategory: file.name.toLowerCase().endsWith('.zip') ? 'archive' : 'source',
          mimeType: file.type || 'text/plain',
          sizeBytes: data.sizeBytes ?? file.size,
          sha256: data.uploadedSha256,
          previewText: data.previewText,
        });
      }

      await persistResult(data);
      notify('Project source analyzed', `Inspected ${data.totalFiles} file(s) across ${data.totalLines} LOC.`, 'success');
    } catch (err) {
      notify('Upload analysis failed', err instanceof Error ? err.message : 'Unable to inspect archive', 'error');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Source Code Analyzer
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Supports Python, JavaScript, TypeScript, Java, C, C++, PHP, Go, HTML, CSS, JSON, XML, and multi-file .zip source archives.
        </p>
      </div>

      <form
        onSubmit={handleAnalyzeCode}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="File path (e.g. main.py)"
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] font-mono"
            />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Upload File or .ZIP Archive
            <input
              type="file"
              accept=".zip,.py,.js,.ts,.tsx,.jsx,.java,.c,.cpp,.h,.hpp,.php,.go,.html,.css,.json,.xml"
              onChange={handleFileUpload}
              disabled={loading}
              className="sr-only"
            />
          </label>
        </div>

        <textarea
          rows={11}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="w-full p-4 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSendToAi(code, 'explain')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              Explain with AI
            </button>
            <button
              type="button"
              onClick={() => onSendToAi(code, 'bugs')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              AI Bug Review
            </button>
            <button
              type="button"
              onClick={() => onSendToAi(code, 'docs')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Generate Docs
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-medium cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Code2 className="w-4 h-4" />
            {loading ? 'Analyzing...' : 'Run Static Code Analysis'}
          </button>
        </div>
      </form>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Files / Lines of Code</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums">
                {result.totalFiles} / {result.totalLines} LOC
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Languages</p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {result.languagesDetected.join(', ') || 'Generic'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Dependencies</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums">{result.dependencies.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Risk Score</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-600 dark:text-cyan-400">
                {result.riskScore}/100
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-semibold">File Breakdown &amp; Complexity</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">File</th>
                    <th className="py-2.5 px-3 font-medium">Language</th>
                    <th className="py-2.5 px-3 font-medium text-right">LOC</th>
                    <th className="py-2.5 px-3 font-medium text-right">Complexity</th>
                    <th className="py-2.5 px-5 font-medium">Functions &amp; Classes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {result.files.map((f) => (
                    <tr key={f.path}>
                      <td className="py-2.5 px-5 font-mono text-slate-900 dark:text-slate-100">{f.path}</td>
                      <td className="py-2.5 px-3 font-mono uppercase">{f.language}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{f.linesOfCode}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{f.cyclomaticComplexity}</td>
                      <td className="py-2.5 px-5 font-mono text-slate-600 dark:text-slate-400">
                        {[...f.classes.map((c) => `class ${c}`), ...f.functions.map((fn) => `${fn}()`)].join(', ') || 'No top-level symbols'}
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

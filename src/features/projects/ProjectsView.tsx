import React, { useState } from 'react';
import { Archive, CheckCircle2, FileCode, FolderPlus, Trash2, Upload } from 'lucide-react';
import type { ProjectRecord, TargetType, UploadedFileRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  createProject,
  deleteProjectCascade,
  deleteUploadedFile,
  saveUploadedFileMetadata,
  updateProjectStatus,
} from '../../services/firestoreService';

interface ProjectsViewProps {
  projects: ProjectRecord[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  uploadedFiles: UploadedFileRecord[];
}

export function ProjectsView({
  projects,
  selectedProjectId,
  onSelectProject,
  uploadedFiles,
}: ProjectsViewProps) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('mixed');
  const [targetUrl, setTargetUrl] = useState('');
  const [attested, setAttested] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;
  const projectFiles = uploadedFiles.filter((f) => f.projectId === selectedProject?.id);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      notify('Project name required', 'Enter a project name.', 'error');
      return;
    }
    if (!attested) {
      notify('Authorization required', 'Confirm you own or have explicit permission to inspect this target.', 'error');
      return;
    }
    setCreating(true);
    try {
      const id = await createProject({
        ownerId: user.uid,
        name: name.trim(),
        description: description.trim() || undefined,
        targetType,
        targetUrl: targetUrl.trim() || undefined,
        authorizationAttested: attested,
      });
      onSelectProject(id);
      setName('');
      setDescription('');
      setTargetUrl('');
      setAttested(false);
      notify('Project created', 'Workspace initialized in Firestore.', 'success');
    } catch (err) {
      notify('Failed to create project', err instanceof Error ? err.message : 'Unknown error', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleVaultUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedProject) return;
    if (file.size > 50 * 1024 * 1024) {
      notify('File too large', 'Maximum allowed artifact size is 50 MB.', 'error');
      return;
    }
    setUploadingFile(true);
    try {
      const buf = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
      const sha256 = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const lower = file.name.toLowerCase();
      const fileCategory: UploadedFileRecord['fileCategory'] = lower.endsWith('.apk')
        ? 'apk'
        : lower.endsWith('.exe') || lower.endsWith('.dll')
        ? 'exe'
        : lower.endsWith('.zip')
        ? 'archive'
        : lower.endsWith('.yaml') || lower.endsWith('.yml')
        ? 'openapi'
        : 'source';

      const isText =
        fileCategory === 'source' ||
        fileCategory === 'openapi' ||
        lower.endsWith('.json') ||
        lower.endsWith('.xml');
      const previewText = isText ? new TextDecoder().decode(buf.slice(0, 12000)) : undefined;

      await saveUploadedFileMetadata({
        ownerId: user.uid,
        projectId: selectedProject.id,
        fileName: file.name,
        fileCategory,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        sha256,
        previewText,
      });
      notify('Artifact indexed', `${file.name} SHA-256 recorded in File Vault.`, 'success');
    } catch (err) {
      notify('Upload failed', err instanceof Error ? err.message : 'Unable to index file', 'error');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleDownloadPreview = (f: UploadedFileRecord) => {
    const content = f.previewText ?? `File: ${f.fileName}\nSHA-256: ${f.sha256}\nSize: ${f.sizeBytes} bytes\nMIME: ${f.mimeType}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.previewText ? f.fileName : `${f.fileName}.metadata.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Projects &amp; File Vault
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Organize authorized inspection targets, SHA-256 artifact fingerprints, and source files.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Create Project Form */}
        <form
          onSubmit={handleCreate}
          className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Create New Project
            </h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Portal Audit"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary Target Type
              </label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as TargetType)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
              >
                <option value="mixed">Mixed Software Suite</option>
                <option value="website">Website / Web App</option>
                <option value="apk">Android APK</option>
                <option value="exe">Windows PE / EXE</option>
                <option value="source">Source Repository</option>
                <option value="api">REST / OpenAPI</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target URL (optional)
              </label>
              <input
                type="url"
                maxLength={512}
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Scope &amp; Notes
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief scope notes for this assessment..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 dark:border-slate-700"
            />
            <span>
              I confirm I own or hold explicit written authorization to inspect all targets and files added to this project.
            </span>
          </label>

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 px-4 text-sm font-medium transition-colors cursor-pointer"
          >
            {creating ? 'Creating Project...' : 'Create Authorized Project'}
          </button>
        </form>

        {/* Project List & File Vault */}
        <div className="xl:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Your Projects ({projects.length})
              </h2>
            </div>
            {projects.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
                No projects created yet. Use the form on the left to create your first authorized project.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {projects.map((p) => {
                  const isSelected = selectedProject?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => onSelectProject(p.id)}
                      className={`p-4 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/70 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {p.targetType.toUpperCase()} · {p.analysisCount} analyses · {p.findingCount} findings · {p.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() =>
                            void updateProjectStatus(p.id, p.status === 'active' ? 'archived' : 'active')
                          }
                          title={p.status === 'active' ? 'Archive project' : 'Restore project'}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => user && void deleteProjectCascade(user.uid, p.id)}
                          title="Delete project and all records"
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* File Vault for Selected Project */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Project File Vault
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedProject ? `Files indexed under ${selectedProject.name}` : 'Select a project first'}
                </p>
              </div>
              {selectedProject && (
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingFile ? 'Hashing...' : 'Index File'}
                  <input type="file" onChange={handleVaultUpload} className="sr-only" disabled={uploadingFile} />
                </label>
              )}
            </div>

            {projectFiles.length === 0 ? (
              <p className="p-5 text-xs text-slate-500 dark:text-slate-400">
                No files indexed in this project yet. Upload APKs, EXEs, source files, or OpenAPI specs here or directly inside an analyzer.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {projectFiles.map((f) => (
                  <div key={f.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileCode className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{f.fileName}</p>
                        <p className="text-slate-500 dark:text-slate-400 font-mono truncate">
                          {f.fileCategory.toUpperCase()} · {Math.max(1, Math.round(f.sizeBytes / 1024))} KB · SHA256:{f.sha256.slice(0, 14)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadPreview(f)}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => user && void deleteUploadedFile(user.uid, f.id, f.fileName)}
                        className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded cursor-pointer"
                        aria-label="Delete file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

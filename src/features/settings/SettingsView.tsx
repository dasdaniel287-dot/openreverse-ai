import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Save, Trash2 } from 'lucide-react';
import type { UserSettingsRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import {
  deleteAllUserWorkspaceData,
  updateUserProfileName,
  updateUserSettings,
} from '../../services/firestoreService';

export function SettingsView({ settings }: { settings: UserSettingsRecord | null }) {
  const { user, profile, refreshProfileSettings } = useAuth();
  const { theme, setTheme } = useTheme();
  const { notify } = useToast();

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama'>(settings?.aiProvider ?? 'gemini');
  const [geminiModel, setGeminiModel] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>(
    settings?.geminiModel ?? 'gemini-4-hydrogen'
  );
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(settings?.ollamaBaseUrl ?? 'http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState(settings?.ollamaModel ?? 'qwen2.5-coder:7b');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'bn'>(settings?.preferredLanguage ?? 'en');
  const [saving, setSaving] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      if (displayName.trim() && displayName.trim() !== profile?.displayName) {
        await updateUserProfileName(user.uid, displayName.trim());
      }
      await updateUserSettings(user.uid, {
        theme,
        aiProvider,
        geminiModel,
        ollamaBaseUrl: ollamaBaseUrl.trim(),
        ollamaModel: ollamaModel.trim(),
        preferredLanguage,
      });
      await refreshProfileSettings();
      notify('Settings saved', 'Profile and AI provider preferences updated.', 'success');
    } catch (err) {
      notify('Save failed', err instanceof Error ? err.message : 'Unable to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestOllama = async () => {
    setOllamaStatus('Testing connection...');
    try {
      const res = await authorizedFetch('/api/ai/ollama-status', {
        method: 'POST',
        body: JSON.stringify({ ollamaBaseUrl }),
      });
      const data = (await res.json()) as { ok: boolean; models?: string[]; error?: string };
      if (data.ok) {
        setOllamaStatus(`Connected. Available models: ${(data.models ?? []).join(', ') || 'none pulled yet'}`);
      } else {
        setOllamaStatus(`Not reachable: ${data.error ?? 'Connection refused'}`);
      }
    } catch (err) {
      setOllamaStatus(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!user) return;
    try {
      await deleteAllUserWorkspaceData(user.uid);
      setConfirmDelete(false);
      notify('Workspace cleared', 'All projects, files, findings, and reports deleted.', 'info');
    } catch (err) {
      notify('Delete failed', err instanceof Error ? err.message : 'Unable to delete workspace data', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Account &amp; AI Provider Settings
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure your profile, theme, Google Gemini model, optional external Ollama connector, and data privacy controls.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-6 space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Verified Email
            </label>
            <input
              type="text"
              disabled
              value={user?.email ?? ''}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Theme Preference
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
            >
              <option value="dark">Futuristic Dark</option>
              <option value="light">Clean Light</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Default AI Response Language
            </label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value as 'en' | 'bn')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
            >
              <option value="en">English</option>
              <option value="bn">Bengali (বাংলা)</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">AI Provider Configuration</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Server-side Gemini Proxy Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary AI Provider
              </label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'ollama')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
              >
                <option value="gemini">Google Gemini (Primary Server Integration)</option>
                <option value="ollama">Ollama (External Self-Hosted Endpoint)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Gemini Model
              </label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value as 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced Reasoning)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Low-Latency)</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/60 dark:bg-[#070B14]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Optional External Ollama Connector
              </p>
              <button
                type="button"
                onClick={() => void handleTestOllama()}
                className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Test Connector
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ollama is treated as an external local/remote service and does not run inside Google AI Studio.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="url"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120]"
              />
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5-coder:7b"
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120]"
              />
            </div>
            {ollamaStatus && <p className="text-xs font-mono text-slate-600 dark:text-slate-300">{ollamaStatus}</p>}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Gemini API credentials are managed securely via server environment secrets.</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-medium cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Privacy & Data Deletion */}
      <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-[#0B1120] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-rose-700 dark:text-rose-400">
            Privacy &amp; Data Deletion
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Permanently delete your projects, uploaded artifact metadata, analyses, findings, AI threads, and reports.
          </p>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-800 px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete All Workspace Data
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteWorkspace()}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              Confirm Permanent Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

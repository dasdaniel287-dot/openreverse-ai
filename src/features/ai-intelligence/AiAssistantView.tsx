import React, { useEffect, useState } from 'react';
import { Bot, Loader2, Send } from 'lucide-react';
import type { AiChatMessage, AiConversationRecord, ProjectRecord, UserSettingsRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authorizedFetch } from '../../services/apiClient';
import { saveAiConversation, updateUserSettings } from '../../services/firestoreService';

const TASK_MODES = [
  { id: 'explain', label: 'Code Explanation' },
  { id: 'function', label: 'Function Breakdown' },
  { id: 'algorithm', label: 'Algorithm Analysis' },
  { id: 'docs', label: 'Documentation Gen' },
  { id: 'bugs', label: 'Bug & Security Review' },
  { id: 'improve', label: 'Code Improvement' },
  { id: 'architecture', label: 'Architecture Insight' },
  { id: 'qa', label: 'Technical Q&A' },
] as const;

export function AiAssistantView({
  project,
  settings,
  conversations,
  prefillCode,
  prefillTask,
  onClearPrefill,
}: {
  project: ProjectRecord | null;
  settings: UserSettingsRecord | null;
  conversations: AiConversationRecord[];
  prefillCode?: string;
  prefillTask?: 'explain' | 'bugs' | 'docs';
  onClearPrefill: () => void;
}) {
  const { user, refreshProfileSettings } = useAuth();
  const { notify } = useToast();

  const [taskType, setTaskType] = useState<(typeof TASK_MODES)[number]['id']>('explain');
  const [language, setLanguage] = useState<'en' | 'bn'>(settings?.preferredLanguage ?? 'en');
  const [codeContext, setCodeContext] = useState('');
  const [prompt, setPrompt] = useState('');
  const [activeConvId, setActiveConvId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefillCode) {
      setCodeContext(prefillCode);
      if (prefillTask) setTaskType(prefillTask);
      setPrompt(
        prefillTask === 'bugs'
          ? 'Review this code for subtle bugs, boundary issues, and defensive hardening improvements.'
          : prefillTask === 'docs'
          ? 'Generate clean technical documentation for this module.'
          : 'Explain how this code works step by step.'
      );
      onClearPrefill();
    }
  }, [prefillCode, prefillTask]);

  const loadConversation = (conv: AiConversationRecord) => {
    setActiveConvId(conv.id);
    setLanguage(conv.language);
    setMessages(conv.messages);
  };

  const startNewThread = () => {
    setActiveConvId(undefined);
    setMessages([]);
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !prompt.trim()) return;

    const provider = settings?.aiProvider ?? 'gemini';
    const userMsg: AiChatMessage = {
      role: 'user',
      content: prompt.trim(),
      taskType,
      timestamp: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const res = await authorizedFetch('/api/ai/query', {
        method: 'POST',
        body: JSON.stringify({
          prompt: prompt.trim(),
          codeOrContext: codeContext.trim() || undefined,
          taskType,
          language,
          provider,
          geminiModel: settings?.geminiModel ?? 'gemini-4-hydrogen',
          ollamaBaseUrl: settings?.ollamaBaseUrl,
          ollamaModel: settings?.ollamaModel,
        }),
      });
      const data = (await res.json()) as {
        answer: string;
        providerUsed: 'gemini' | 'ollama';
        modelUsed: string;
      };

      const assistantMsg: AiChatMessage = {
        role: 'assistant',
        content: data.answer,
        taskType,
        timestamp: new Date().toISOString(),
      };
      const updated = [...nextMessages, assistantMsg];
      setMessages(updated);
      setPrompt('');

      const savedId = await saveAiConversation({
        id: activeConvId,
        ownerId: user.uid,
        projectId: project?.id,
        title: userMsg.content.slice(0, 80),
        language,
        provider: data.providerUsed,
        model: data.modelUsed,
        messages: updated,
      });
      setActiveConvId(savedId);

      await updateUserSettings(user.uid, {
        totalAiRequests: (settings?.totalAiRequests ?? 0) + 1,
      });
      await refreshProfileSettings();
    } catch (err) {
      notify('AI request failed', err instanceof Error ? err.message : 'Unable to reach AI provider', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            AI Code Intelligence
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Powered by {settings?.aiProvider === 'ollama' ? `External Ollama (${settings.ollamaModel || 'local'})` : `Google Gemini (${settings?.geminiModel || 'gemini-4-hydrogen'})`} · English &amp; বাংলা support.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              language === 'en' ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage('bn')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              language === 'bn' ? 'bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            বাংলা (Bengali)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Saved Conversations */}
        <div className="xl:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-4 space-y-3 h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              History
            </h2>
            <button
              type="button"
              onClick={startNewThread}
              className="text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              New Thread
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No saved threads yet.</p>
          ) : (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {conversations.slice(0, 15).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => loadConversation(c)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate cursor-pointer ${
                      activeConvId === c.id
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-cyan-300 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Workspace Chat & Code Context */}
        <div className="xl:col-span-9 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {TASK_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTaskType(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    taskType === m.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Optional Source Code / Manifest / Binary Summary Context
              </label>
              <textarea
                rows={5}
                value={codeContext}
                onChange={(e) => setCodeContext(e.target.value)}
                spellCheck={false}
                placeholder="Paste source code, stack trace, or analysis output to inspect..."
                className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
              />
            </div>

            {/* Messages */}
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  <Bot className="w-7 h-7 mx-auto mb-2 text-blue-600 dark:text-cyan-400" />
                  Ask a technical question, paste code above, or switch to বাংলা for bilingual explanations.
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={`${msg.timestamp}_${idx}`}
                    className={`rounded-xl p-4 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200/70 dark:border-blue-500/20'
                        : 'bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      {msg.role === 'user' ? 'You' : 'OpenReverse AI'}
                    </p>
                    <div className="whitespace-pre-wrap text-slate-800 dark:text-slate-200 leading-relaxed text-xs sm:text-sm font-sans">
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAsk} className="flex gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  language === 'bn'
                    ? 'কোড বা আর্কিটেকচার সম্পর্কে আপনার প্রশ্ন লিখুন...'
                    : 'Ask about this function, algorithm, bug, or architecture...'
                }
                className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2.5 text-sm font-medium cursor-pointer shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Ask AI
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

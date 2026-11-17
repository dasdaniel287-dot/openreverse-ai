import React from 'react';
import {
  Bot,
  Clock,
  Code2,
  Cpu,
  FileText,
  FolderKanban,
  Globe,
  LayoutDashboard,
  Network,
  Settings,
  ShieldAlert,
  Smartphone,
  Webhook,
  X,
} from 'lucide-react';
import type { WorkspaceView } from '../types';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  openFindingsCount: number;
}

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: WorkspaceView; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'projects', label: 'Projects & Files', icon: FolderKanban },
    ],
  },
  {
    label: 'Analyzers',
    items: [
      { id: 'website', label: 'Website Analyzer', icon: Globe },
      { id: 'apk', label: 'APK Analyzer', icon: Smartphone },
      { id: 'exe', label: 'EXE / PE Analyzer', icon: Cpu },
      { id: 'code', label: 'Source Code', icon: Code2 },
      { id: 'api', label: 'API Inspector', icon: Webhook },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { id: 'ai', label: 'AI Code Assistant', icon: Bot },
      { id: 'security', label: 'Security & OWASP', icon: ShieldAlert },
      { id: 'architecture', label: 'Architecture Map', icon: Network },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'automation', label: 'Automation Engine', icon: Clock },
      { id: 'reports', label: 'Report Center', icon: FileText },
      { id: 'settings', label: 'Settings & Providers', icon: Settings },
    ],
  },
];

export function Sidebar({
  activeView,
  onSelectView,
  mobileOpen,
  onCloseMobile,
  openFindingsCount,
}: SidebarProps) {
  const handleNav = (id: WorkspaceView) => {
    onSelectView(id);
    onCloseMobile();
  };

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-[#0B1120] border-r border-slate-200 dark:border-slate-800/90 w-64">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/90 shrink-0">
        <BrandLogo />
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNav(item.id)}
                      className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-cyan-300'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === 'security' && openFindingsCount > 0 && (
                        <span className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {openFindingsCount}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800/90 text-xs text-slate-500 dark:text-slate-400">
        <p className="font-medium text-slate-700 dark:text-slate-300">Authorized Scope Only</p>
        <p className="mt-0.5">Static inspection · Zero execution</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative z-50 h-full">{content}</div>
        </div>
      )}
    </>
  );
}

import React, { useState } from 'react';
import { Bell, Check, LogOut, Menu, Moon, Search, Sun, User as UserIcon } from 'lucide-react';
import type { NotificationRecord, ProjectRecord, WorkspaceView } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { markNotificationRead } from '../services/firestoreService';

interface TopBarProps {
  activeView: WorkspaceView;
  onOpenMobileMenu: () => void;
  projects: ProjectRecord[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  notifications: NotificationRecord[];
  onNavigate: (view: WorkspaceView) => void;
}

const VIEW_TITLES: Record<WorkspaceView, string> = {
  dashboard: 'Overview Dashboard',
  projects: 'Projects & File Vault',
  website: 'Website Analyzer',
  apk: 'Android APK Analyzer',
  exe: 'Windows EXE / PE Analyzer',
  code: 'Source Code Analyzer',
  api: 'REST & OpenAPI Inspector',
  security: 'Security & OWASP Analyzer',
  ai: 'AI Code Intelligence',
  architecture: 'Architecture Mapper',
  automation: 'Automation Engine',
  reports: 'Report Center',
  settings: 'Account & AI Provider Settings',
};

export function TopBar({
  activeView,
  onOpenMobileMenu,
  projects,
  selectedProjectId,
  onSelectProject,
  searchQuery,
  onSearchChange,
  notifications,
  onNavigate,
}: TopBarProps) {
  const { user, profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800/90 bg-white/90 dark:bg-[#0B1120]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>OpenReverse AI</span>
            <span aria-hidden="true">/</span>
            <span className="truncate font-medium text-slate-800 dark:text-slate-200">{VIEW_TITLES[activeView]}</span>
          </div>
        </div>
      </div>

      {/* Global search & active project selector */}
      <div className="hidden md:flex items-center gap-3 flex-1 max-w-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search projects, analyses, findings, reports..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <select
          aria-label="Active workspace project"
          value={selectedProjectId}
          onChange={(e) => onSelectProject(e.target.value)}
          className="max-w-[200px] px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          {projects.length === 0 ? (
            <option value="">No projects yet</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v);
              setUserMenuOpen(false);
            }}
            aria-label="Workspace notifications"
            className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] shadow-xl z-40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-semibold">Notifications</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{unreadCount} unread</span>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {notifications.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">No notifications yet.</p>
                ) : (
                  notifications.slice(0, 12).map((n) => (
                    <div key={n.id} className={`p-3.5 text-xs ${n.read ? 'opacity-65' : 'bg-blue-50/40 dark:bg-blue-500/5'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</p>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => void markNotificationRead(n.id)}
                            title="Mark as read"
                            className="text-blue-600 dark:text-cyan-400 hover:underline shrink-0 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User profile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setUserMenuOpen((v) => !v);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={profile?.displayName ?? 'User avatar'}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-md object-cover"
              />
            ) : (
              <UserIcon className="w-4 h-4 text-slate-500" />
            )}
            <span className="hidden sm:inline text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[120px] truncate">
              {profile?.displayName ?? user?.email ?? 'Account'}
            </span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1424] shadow-xl z-40 p-2">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold truncate">{profile?.displayName ?? 'Analyst'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onNavigate('settings');
                  setUserMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 mt-1 cursor-pointer"
              >
                Profile &amp; AI Settings
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  Activity,
  Layers,
  GitPullRequest,
  FileText,
  Settings as SettingsIcon,
  LogOut,
  Radio,
  PauseCircle,
  PlayCircle,
  Send,
} from 'lucide-react';
import { Settings } from '../types';

export type TabKey = 'overview' | 'events' | 'pipeline' | 'prs' | 'audit' | 'settings' | 'simulator';

interface HeaderProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  openIncidentsCount: number;
  inReviewCount: number;
  settings: Settings | null;
  onTogglePause: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  openIncidentsCount,
  inReviewCount,
  settings,
  onTogglePause,
}) => {
  const { currentUser, logOut } = useAuth();

  const navItems: { key: TabKey; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'events', label: 'Incidents', icon: Layers, badge: openIncidentsCount },
    { key: 'pipeline', label: 'Fix Pipeline', icon: Shield, badge: inReviewCount },
    { key: 'prs', label: 'Pull Requests', icon: GitPullRequest },
    { key: 'audit', label: 'Audit Trail', icon: FileText },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
    { key: 'simulator', label: 'Test Webhooks', icon: Send },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">AutoFix Ops</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">
                  <Radio className="w-2.5 h-2.5 mr-1 text-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Autonomous Reliability Engine</p>
            </div>
          </div>

          {/* Pause / Resume Guardrail Button */}
          <div className="hidden md:flex items-center space-x-3">
            {settings?.isPaused ? (
              <button
                id="header-resume-pipeline-btn"
                onClick={onTogglePause}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold hover:bg-amber-500/30 transition-colors cursor-pointer"
              >
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Pipeline Paused (Click to Resume)</span>
              </button>
            ) : (
              <button
                id="header-pause-pipeline-btn"
                onClick={onTogglePause}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-colors cursor-pointer"
              >
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pipeline Active (Click to Pause)</span>
              </button>
            )}
          </div>

          {/* User profile & Sign Out */}
          <div className="flex items-center space-x-4">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-medium text-slate-200">{currentUser?.displayName || 'Authorized Operator'}</div>
              <div className="text-[11px] font-mono text-slate-400">{currentUser?.email}</div>
            </div>
            <button
              id="header-logout-btn"
              onClick={logOut}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 overflow-x-auto no-scrollbar pb-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                id={`tab-${item.key}`}
                onClick={() => onSelectTab(item.key)}
                className={`inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-indigo-400 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      item.key === 'pipeline'
                        ? 'bg-amber-500 text-slate-950 animate-pulse'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

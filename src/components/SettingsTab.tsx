import React, { useState, useEffect } from 'react';
import { Settings } from '../types';
import {
  Save,
  Shield,
  Clock,
  Lock,
  Bot,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';

interface SettingsTabProps {
  settings: Settings | null;
  onSaveSettings: (updated: Partial<Settings>) => Promise<void>;
  isSaving: boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onSaveSettings,
  isSaving,
}) => {
  const [budgetCap, setBudgetCap] = useState<number>(settings?.budgetCap ?? 10);
  const [budgetWindowMinutes, setBudgetWindowMinutes] = useState<number>(settings?.budgetWindowMinutes ?? 60);
  const [denylistPatterns, setDenylistPatterns] = useState<string[]>(
    settings?.denylistPatterns || [
      '**/.env*',
      '**/secrets/**',
      '**/credentials/**',
      '**/auth/keys/**',
      '**/*.pem',
      '**/*.key',
    ]
  );
  const [newPattern, setNewPattern] = useState('');
  const [telegramWhitelistStr, setTelegramWhitelistStr] = useState<string>(
    (settings?.telegramSenderWhitelist || [123456789]).join(', ')
  );
  const [authAllowlistStr, setAuthAllowlistStr] = useState<string>(
    (settings?.authAllowlist || ['allampallyravikiran2007@gmail.com']).join(', ')
  );
  const [isPaused, setIsPaused] = useState<boolean>(settings?.isPaused ?? false);
  const [sandboxModeLabel, setSandboxModeLabel] = useState<string>(
    settings?.sandboxModeLabel || 'Host Runtime Sandbox (Container-level isolation limitation active)'
  );

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setBudgetCap(settings.budgetCap);
      setBudgetWindowMinutes(settings.budgetWindowMinutes);
      setDenylistPatterns(settings.denylistPatterns || []);
      setTelegramWhitelistStr((settings.telegramSenderWhitelist || []).join(', '));
      setAuthAllowlistStr((settings.authAllowlist || []).join(', '));
      setIsPaused(settings.isPaused);
      setSandboxModeLabel(settings.sandboxModeLabel);
    }
  }, [settings]);

  const handleAddPattern = () => {
    if (newPattern.trim() && !denylistPatterns.includes(newPattern.trim())) {
      setDenylistPatterns([...denylistPatterns, newPattern.trim()]);
      setNewPattern('');
    }
  };

  const handleRemovePattern = (idx: number) => {
    setDenylistPatterns(denylistPatterns.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(false);
    setErrorMsg(null);

    try {
      const telegramIds = telegramWhitelistStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n));

      const authEmails = authAllowlistStr
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const payload: Partial<Settings> = {
        budgetCap: Number(budgetCap),
        budgetWindowMinutes: Number(budgetWindowMinutes),
        denylistPatterns,
        telegramSenderWhitelist: telegramIds,
        authAllowlist: authEmails,
        isPaused,
        sandboxModeLabel,
      };

      await onSaveSettings(payload);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">System Guardrails & Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational parameters persisted to the global Firestore configuration document.
          </p>
        </div>
        <button
          type="submit"
          id="save-settings-btn"
          disabled={isSaving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs flex items-center space-x-2 shadow cursor-pointer disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving to Firestore...' : 'Save Settings'}</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Settings saved and applied to Firestore successfully.</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-lg text-xs text-red-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Global Pipeline Pause */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Global Auto-Fix Circuit Breaker</h3>
              <p className="text-xs text-slate-400">
                Immediately freeze the autonomous fix engine. New incidents will be ingested and deduplicated, but halted before diagnosis.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              id="settings-pause-toggle"
              type="checkbox"
              checked={isPaused}
              onChange={(e) => setIsPaused(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
          </label>
        </div>
      </div>

      {/* Rate Limits / Sliding Window Budget */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Sliding Window Budget Cap</h3>
        </div>
        <p className="text-xs text-slate-400">
          Prevents runaway loop invocations by capping the number of automated remediation attempts in a rolling time window.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Budget Cap (Max Auto-Fix Runs)
            </label>
            <input
              id="budget-cap-input"
              type="number"
              min="1"
              max="500"
              value={budgetCap}
              onChange={(e) => setBudgetCap(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Window Duration (Minutes)
            </label>
            <input
              id="budget-window-input"
              type="number"
              min="1"
              max="1440"
              value={budgetWindowMinutes}
              onChange={(e) => setBudgetWindowMinutes(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Protected Files Denylist */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold text-white">Protected Files Denylist (Glob Patterns)</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">picomatch engine</span>
        </div>
        <p className="text-xs text-slate-400">
          Any incident affecting files matching these patterns is immediately halted and labeled "gated_notify_only" to protect sensitive code, secrets, and infrastructure.
        </p>

        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="e.g. **/.env*, **/auth/**, **/infra/**"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          />
          <button
            type="button"
            onClick={handleAddPattern}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg inline-flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Pattern</span>
          </button>
        </div>

        <div className="space-y-1.5">
          {denylistPatterns.map((pat, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-rose-300"
            >
              <span>{pat}</span>
              <button
                type="button"
                onClick={() => handleRemovePattern(idx)}
                className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Operator Auth Allowlist */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Operator Google Sign-in Allowlist</h3>
        </div>
        <p className="text-xs text-slate-400">
          Comma-separated list of Google account emails authorized to sign in to this console.
        </p>
        <textarea
          rows={2}
          value={authAllowlistStr}
          onChange={(e) => setAuthAllowlistStr(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Telegram Bot Whitelist */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center space-x-2">
          <Bot className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white">Telegram Sender ID Whitelist</h3>
        </div>
        <p className="text-xs text-slate-400">
          Comma-separated numeric Telegram user IDs allowed to execute /approve, /reject, /pause, and /resume.
        </p>
        <input
          type="text"
          value={telegramWhitelistStr}
          onChange={(e) => setTelegramWhitelistStr(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
        />
      </div>

      {/* Sandbox Mode Description */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-white">Sandbox Mode Label</h3>
        </div>
        <p className="text-xs text-slate-400">
          Documents the current isolation tier for patch test execution.
        </p>
        <input
          type="text"
          value={sandboxModeLabel}
          onChange={(e) => setSandboxModeLabel(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
        />
      </div>
    </form>
  );
};

import React, { useEffect, useState } from 'react';
import {
  ErrorEvent,
  Settings,
  StageTransition,
} from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Flame,
  Key,
  Server,
  Terminal,
  ArrowRight,
  ExternalLink,
  Cpu,
  Bot,
} from 'lucide-react';

interface OverviewTabProps {
  events: ErrorEvent[];
  transitions: StageTransition[];
  settings: Settings | null;
  onNavigate: (tab: any) => void;
  onSelectEvent: (event: ErrorEvent) => void;
}

interface SystemSecretsStatus {
  hasGeminiApiKey: boolean;
  hasGithubToken: boolean;
  hasSentrySecret: boolean;
  hasGithubWebhookSecret: boolean;
  hasLogShipperToken: boolean;
  hasTelegramToken: boolean;
  hasTelegramWebhookSecret: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  events,
  transitions,
  settings,
  onNavigate,
  onSelectEvent,
}) => {
  const [secretsStatus, setSecretsStatus] = useState<SystemSecretsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    fetch('/api/system/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.secrets) {
          setSecretsStatus(data.secrets);
        }
      })
      .catch((err) => console.warn('Could not load system status:', err))
      .finally(() => setLoadingStatus(false));
  }, []);

  // Compute metrics
  const activeStatuses = ['ingested', 'diagnosing', 'diagnosed', 'patching', 'sandboxing', 'review'];
  const activeIncidents = events.filter((e) => activeStatuses.includes(e.status));
  const prsCreated = events.filter((e) => e.status === 'pr_created').length;
  const gatedCount = events.filter((e) => e.status === 'gated_notify_only').length;
  const regressionsCount = events.filter((e) => e.isRegression).length;

  const totalClosedOrActive = events.length;
  const successRate = totalClosedOrActive > 0 ? Math.round((prsCreated / totalClosedOrActive) * 100) : 0;

  // Window usage calculation
  const windowMinutes = settings?.budgetWindowMinutes || 60;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const recentAttemptsInWindow = new Set(
    transitions
      .filter((t) => (t.toStage === 'diagnosing' || t.toStage === 'diagnosed') && t.timestamp >= windowStart)
      .map((t) => t.eventId)
  ).size;

  const budgetCap = settings?.budgetCap || 10;
  const budgetPercent = Math.min(100, Math.round((recentAttemptsInWindow / budgetCap) * 100));

  const recentIncidents = [...events]
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner if Pipeline is Paused */}
      {settings?.isPaused && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 flex items-center justify-between text-amber-200">
          <div className="flex items-center space-x-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Autonomous Fix Pipeline is Paused</p>
              <p className="text-xs text-amber-300/80">
                Gatekeeper is currently parking incoming incidents in "gated_notify_only" status. Resuming will permit automatic diagnosis.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold rounded-lg transition-colors border border-amber-500/40 cursor-pointer"
          >
            Adjust Guardrails
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Active Incidents */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Incidents</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">{activeIncidents.length}</div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              {events.filter((e) => e.status === 'review').length} awaiting human review
            </p>
          </div>
        </div>

        {/* PR Success Rate */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Auto-Fix Remediations</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">{prsCreated}</div>
            <p className="text-[11px] text-emerald-400 mt-1 font-mono">{successRate}% automated resolution rate</p>
          </div>
        </div>

        {/* Sliding Window Budget */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Window Budget ({windowMinutes}m)</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-bold text-white tracking-tight">{recentAttemptsInWindow}</span>
              <span className="text-sm font-medium text-slate-400">/ {budgetCap} cap</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  budgetPercent > 80 ? 'bg-red-500' : budgetPercent > 50 ? 'bg-amber-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Gated Protected Items */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Gatekeeper Blocked</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">{gatedCount}</div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">Protected files or budget cap</p>
          </div>
        </div>

        {/* Regressions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Reopened Regressions</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">{regressionsCount}</div>
            <p className="text-[11px] text-orange-400 mt-1 font-mono">Recurring after resolution</p>
          </div>
        </div>
      </div>

      {/* Two Columns: Integration Status & Live Ingest Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Integrations Health Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-white text-sm">System & Ingestion Status</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Node Cloud Run</span>
          </div>

          <div className="space-y-3 text-xs flex-1">
            {/* Gemini Thinking Engine */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Cpu className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="font-semibold text-slate-200">Gemini 3.1 Pro (Thinking Level: High)</div>
                  <div className="text-[11px] text-slate-400">Diagnosis & Unified Diff Generation</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                secretsStatus?.hasGeminiApiKey
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-950 text-red-300 border border-red-500/30'
              }`}>
                {secretsStatus?.hasGeminiApiKey ? 'CONFIGURED' : 'MISSING KEY'}
              </span>
            </div>

            {/* Sentry Webhook */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-200">Sentry Webhook</div>
                <div className="text-[11px] font-mono text-slate-400">POST /api/webhooks/sentry</div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold font-mono bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                ACTIVE
              </span>
            </div>

            {/* GitHub Actions Webhook */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-200">GitHub Actions Webhook</div>
                <div className="text-[11px] font-mono text-slate-400">POST /api/webhooks/github</div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold font-mono bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                ACTIVE
              </span>
            </div>

            {/* Log Shipper */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-200">Generic Log-Shipper</div>
                <div className="text-[11px] font-mono text-slate-400">POST /api/ingest/logs (Bearer)</div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold font-mono bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                ACTIVE
              </span>
            </div>

            {/* Telegram Bot */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Bot className="w-4 h-4 text-sky-400" />
                <div>
                  <div className="font-semibold text-slate-200">Telegram Bot Webhook</div>
                  <div className="text-[11px] font-mono text-slate-400">POST /api/webhooks/telegram</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                secretsStatus?.hasTelegramToken
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {secretsStatus?.hasTelegramToken ? 'ONLINE' : 'UNSET (OPTIONAL)'}
              </span>
            </div>

            {/* GitHub PR Integration */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-200">GitHub PR Staging</div>
                <div className="text-[11px] font-mono text-slate-400">REST API (Branch + PR)</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                secretsStatus?.hasGithubToken
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-950 text-amber-300 border border-amber-500/30'
              }`}>
                {secretsStatus?.hasGithubToken ? 'CONFIGURED' : 'TOKEN UNSET'}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">To configure keys, open Settings menu.</span>
            <button
              id="goto-simulator-btn"
              onClick={() => onNavigate('simulator')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center space-x-1 cursor-pointer"
            >
              <span>Test Endpoints</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Recent Incidents Feed */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white text-sm">Recent Incidents Feed</h3>
            <button
              onClick={() => onNavigate('events')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center space-x-1 cursor-pointer"
            >
              <span>View All ({events.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentIncidents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 border border-dashed border-slate-800 rounded-lg">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/80 mb-2" />
              <p className="text-sm font-medium text-slate-300">No Incidents Recorded</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Firestore error_events collection is clean. Use the Webhook Simulator tab to emit sample Sentry or GitHub Actions errors.
              </p>
              <button
                onClick={() => onNavigate('simulator')}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Send Test Incident
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentIncidents.map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent(evt)}
                  className="p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 rounded-lg transition-all cursor-pointer flex items-start justify-between"
                >
                  <div className="space-y-1 min-w-0 pr-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-semibold text-rose-400 truncate">
                        {evt.errorType}
                      </span>
                      {evt.isRegression && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-950 text-orange-400 border border-orange-500/30">
                          REGRESSION
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                        via {evt.source}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 truncate font-mono">{evt.message}</p>

                    <div className="text-[11px] text-slate-400 font-mono flex items-center space-x-3">
                      <span>{evt.normalizedFilePath}:{evt.lineNumber ?? 'N/A'}</span>
                      <span>•</span>
                      <span>{evt.occurrenceCount} occurrences</span>
                      <span>•</span>
                      <span>{new Date(evt.lastSeen).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end space-y-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase font-mono ${
                        evt.status === 'review'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          : evt.status === 'pr_created'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : evt.status === 'gated_notify_only'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : evt.status === 'failed'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      }`}
                    >
                      {evt.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">ID: {evt.id.substring(0, 10)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

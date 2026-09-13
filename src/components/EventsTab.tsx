import React, { useState } from 'react';
import { ErrorEvent, PipelineStage } from '../types';
import {
  Search,
  Filter,
  Flame,
  ArrowRight,
  Clock,
  Terminal,
  X,
  Play,
  CheckCircle,
  XCircle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface EventsTabProps {
  events: ErrorEvent[];
  selectedEvent: ErrorEvent | null;
  onSelectEvent: (event: ErrorEvent | null) => void;
  onNavigateToPipeline: (event: ErrorEvent) => void;
  onRunDiagnosis: (eventId: string) => Promise<void>;
  onRunPatchTest: (eventId: string) => Promise<void>;
  onApprovePR: (eventId: string) => Promise<void>;
  onReject: (eventId: string) => Promise<void>;
  isProcessingAction: boolean;
}

export const EventsTab: React.FC<EventsTabProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  onNavigateToPipeline,
  onRunDiagnosis,
  onRunPatchTest,
  onApprovePR,
  onReject,
  isProcessingAction,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [regressionOnly, setRegressionOnly] = useState(false);

  // Filtering
  const filteredEvents = events.filter((evt) => {
    if (regressionOnly && !evt.isRegression) return false;
    if (statusFilter !== 'all' && evt.status !== statusFilter) return false;
    if (sourceFilter !== 'all' && evt.source !== sourceFilter) return false;

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchType = evt.errorType.toLowerCase().includes(term);
      const matchMsg = evt.message.toLowerCase().includes(term);
      const matchFile = evt.normalizedFilePath.toLowerCase().includes(term);
      const matchSig = evt.signature.toLowerCase().includes(term);
      if (!matchType && !matchMsg && !matchFile && !matchSig) return false;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            id="event-search-input"
            type="text"
            placeholder="Search error type, file, message, signature..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <select
            id="filter-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Stages</option>
            <option value="ingested">Ingested</option>
            <option value="diagnosing">Diagnosing</option>
            <option value="diagnosed">Diagnosed</option>
            <option value="sandboxing">Sandboxing</option>
            <option value="review">Review</option>
            <option value="pr_created">PR Created</option>
            <option value="gated_notify_only">Gated (Blocked)</option>
            <option value="failed">Failed</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Source Filter */}
          <select
            id="filter-source-select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Sources</option>
            <option value="sentry">Sentry</option>
            <option value="github_actions">GitHub Actions</option>
            <option value="log_shipper">Log Shipper</option>
            <option value="manual">Manual / Simulator</option>
          </select>

          {/* Regression Toggle */}
          <button
            id="filter-regression-toggle"
            onClick={() => setRegressionOnly(!regressionOnly)}
            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer inline-flex items-center space-x-1.5 ${
              regressionOnly
                ? 'bg-orange-950 text-orange-300 border-orange-500/50'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span>Regressions Only</span>
          </button>
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-mono uppercase text-[10px]">
                <th className="py-3 px-4">Error Type & Details</th>
                <th className="py-3 px-4">Target File</th>
                <th className="py-3 px-4 text-center">Occurrences</th>
                <th className="py-3 px-4">Last Seen</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4 text-center">Pipeline Stage</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No error incidents match current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt) => {
                  const isSelected = selectedEvent?.id === evt.id;
                  return (
                    <tr
                      key={evt.id}
                      onClick={() => onSelectEvent(evt)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-950/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white font-mono truncate">{evt.errorType}</span>
                          {evt.isRegression && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-950 text-orange-400 border border-orange-500/40">
                              REGRESSION
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 text-[11px] truncate mt-0.5">{evt.message}</p>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div className="truncate max-w-[200px]">{evt.normalizedFilePath}</div>
                        <span className="text-slate-500 text-[11px]">line {evt.lineNumber ?? 'N/A'}</span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-semibold">
                          {evt.occurrenceCount}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(evt.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 uppercase">
                          {evt.source}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded text-[10px] font-mono font-semibold uppercase ${
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
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToPipeline(evt);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded text-xs font-semibold inline-flex items-center space-x-1 cursor-pointer transition-colors"
                        >
                          <span>Pipeline</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Detail Drawer / Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full p-6 overflow-y-auto flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-white font-mono">{selectedEvent.errorType}</h2>
                    {selectedEvent.isRegression && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-400 border border-orange-500/40">
                        REGRESSION REOPENED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1">ID: {selectedEvent.id}</p>
                </div>
                <button
                  id="close-drawer-btn"
                  onClick={() => onSelectEvent(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Banner */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Current Pipeline Stage:</span>
                  <div className="text-base font-bold text-indigo-400 uppercase font-mono mt-0.5">
                    {selectedEvent.status.replace(/_/g, ' ')}
                  </div>
                </div>
                <button
                  onClick={() => {
                    onNavigateToPipeline(selectedEvent);
                    onSelectEvent(null);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>Open in Pipeline Studio</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Gate Denial Warning if gated */}
              {selectedEvent.status === 'gated_notify_only' && selectedEvent.denialReason && (
                <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-200 space-y-1">
                  <div className="flex items-center space-x-2 font-semibold text-xs text-rose-400">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Guardrail Denial Reason:</span>
                  </div>
                  <p className="text-xs leading-relaxed font-mono">{selectedEvent.denialReason}</p>
                </div>
              )}

              {/* Message */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Message</h4>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono">
                  {selectedEvent.message}
                </div>
              </div>

              {/* Dedup Signature Engine Inspector */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Canonical Deduplication Signature
                </h4>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-indigo-300 break-all">
                  {selectedEvent.signature}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Computed via: <code className="text-slate-400">norm(errorType)::norm(filePath)::norm(line)</code>. Normalizes away machine-specific prefixes and Windows/Linux path differences.
                </p>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400 block text-[11px]">Repository</span>
                  <span className="font-mono text-slate-200 font-semibold">{selectedEvent.repository}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400 block text-[11px]">Target Branch</span>
                  <span className="font-mono text-slate-200 font-semibold">{selectedEvent.targetBranch}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400 block text-[11px]">Total Ingested Occurrences</span>
                  <span className="font-mono text-emerald-400 font-bold text-sm">{selectedEvent.occurrenceCount}</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-slate-400 block text-[11px]">Source Channel</span>
                  <span className="font-mono text-slate-200 uppercase">{selectedEvent.source}</span>
                </div>
              </div>

              {/* Stack Trace */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Stack Trace</h4>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                  {selectedEvent.stackTrace || 'No stack trace captured.'}
                </pre>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-6 mt-6 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                <span>First seen {new Date(selectedEvent.firstSeen).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-2">
                {selectedEvent.status === 'review' && (
                  <>
                    <button
                      disabled={isProcessingAction}
                      onClick={() => onApprovePR(selectedEvent.id)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Approve & Create PR</span>
                    </button>
                    <button
                      disabled={isProcessingAction}
                      onClick={() => onReject(selectedEvent.id)}
                      className="px-3.5 py-2 bg-rose-600/80 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </>
                )}

                {selectedEvent.status === 'ingested' && (
                  <button
                    disabled={isProcessingAction}
                    onClick={() => onRunDiagnosis(selectedEvent.id)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Gemini Diagnosis</span>
                  </button>
                )}

                {selectedEvent.status === 'diagnosed' && (
                  <button
                    disabled={isProcessingAction}
                    onClick={() => onRunPatchTest(selectedEvent.id)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Generate Patch & Run Sandbox</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
